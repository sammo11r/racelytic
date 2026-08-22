const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { chromium } = require('playwright-core');
const { findBrowserExecutable, formatMilliseconds } = require('./import-f2-results');

const ORIGIN = 'https://www.motorsportstats.com';
const SERIES = 'fia-formula-3-championship';
const DATA_DIR = path.join(__dirname, '../data');
const CACHE_DIR = path.join(DATA_DIR, '.f3-cache');
const CACHE_VERSION = 1;
const CHASSIS_SPECIFICATIONS = require('../data/f3-chassis-specifications.json');
const CHASSIS_BY_ID = new Map(CHASSIS_SPECIFICATIONS.map(chassis => [chassis.id, chassis]));
const ENTITY_KEYS = ['drivers', 'constructors', 'circuits', 'chassis', 'engines'];
const ROW_KEYS = ['seasons', 'races', 'sessions', 'entries', 'results', 'driverStandings', 'constructorStandings'];
const TEAM_COUNTRY_FALLBACKS = {
  'art-grand-prix': 'de', 'campos-racing': 'es', carlin: 'gb', dams: 'fr',
  'hitech-racing': 'gb', 'jenzer-motorsport': 'ch', 'mp-motorsport': 'nl',
  'phm-racing': 'de', 'prema-racing': 'it', 'rodin-motorsport': 'nz',
  'trident-motorsport': 'it', 'van-amersfoort-racing': 'nl'
};
const DRIVER_COUNTRY_FALLBACKS = {
  'alexander-smolyar': 'ru',
  'brando-badoer': 'it',
  'ivan-franco-domingues': 'pt',
  'james-wharton': 'au',
  'louis-sharp': 'nz',
  'michael-shin': 'kr',
  'nandhavud-bhirombhakdi': 'th',
  'nikita-johnson': 'us',
  'pedro-clerot': 'br',
  'ricardo-escotto': 'mx'
};
const FILES = {
  seasons: ['f3db-seasons.csv', ['year']],
  drivers: ['f3db-drivers.csv', ['id', 'name', 'firstName', 'lastName', 'abbreviation', 'countryCode', 'pictureUrl']],
  constructors: ['f3db-constructors.csv', ['id', 'name', 'abbreviation', 'countryCode', 'pictureUrl']],
  circuits: ['f3db-circuits.csv', ['id', 'name', 'type', 'direction', 'placeName', 'lengthMeters', 'turns', 'pictureUrl', 'mapUrl']],
  chassis: ['f3db-chassis.csv', Object.keys(CHASSIS_SPECIFICATIONS[0])],
  engines: ['f3db-engines.csv', ['id', 'name']],
  races: ['f3db-races.csv', ['id', 'year', 'round', 'date', 'endDate', 'name', 'code', 'circuitId', 'sourceUrl']],
  sessions: ['f3db-sessions.csv', ['id', 'raceId', 'year', 'round', 'sessionNumber', 'code', 'name', 'startTimeUtc', 'endTimeUtc', 'isRace', 'cancelled']],
  entries: ['f3db-entries.csv', ['raceId', 'year', 'round', 'driverNumber', 'driverId', 'constructorId', 'chassisId', 'engineId']],
  results: ['f3db-session-results.csv', [
    'sessionId', 'raceId', 'year', 'round', 'positionDisplayOrder', 'positionNumber', 'points', 'polePosition',
    'status', 'driverNumber', 'driverId', 'constructorId', 'laps', 'time', 'timeMillis', 'gapMillis', 'gapLaps',
    'fastestLap', 'fastestLapNumber', 'fastestLapTime', 'fastestLapTimeMillis', 'averageSpeed'
  ]],
  driverStandings: ['f3db-season-driver-standings.csv', [
    'year', 'positionNumber', 'driverId', 'constructorId', 'points', 'championshipWon',
    'starts', 'wins', 'podiums', 'poles', 'fastestLaps', 'retirements'
  ]],
  constructorStandings: ['f3db-season-constructor-standings.csv', [
    'year', 'positionNumber', 'constructorId', 'points', 'championshipWon'
  ]]
};

function argumentValue(name) {
  const argument = process.argv.slice(2).find(value => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : null;
}

const selectedYear = Number(argumentValue('year')) || null;
const fromYear = Number(argumentValue('from')) || 2019;
const toYear = Number(argumentValue('to')) || new Date().getFullYear();
const delayMilliseconds = Number(argumentValue('delay') || 250);
const headless = process.argv.includes('--headless');
const metadataOnly = process.argv.includes('--metadata-only');

function wait(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
function bool(value) { return value ? 'True' : 'False'; }
function slug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function canonicalChassisId(value) {
  const id = slug(value);
  return ['dallara-f3-2020', 'dallara-f3-2021'].includes(id) ? 'dallara-f3-2019' : id;
}
function countryCode(flag) {
  return String(flag || '').match(/\/([a-z]{2})\.svg(?:\?|$)/i)?.[1]?.toLowerCase() || '';
}
function dateValue(seconds) {
  return seconds ? new Date(Number(seconds) * 1000).toISOString().slice(0, 10) : '';
}
function dateTimeValue(seconds) {
  return seconds ? new Date(Number(seconds) * 1000).toISOString().replace('.000Z', 'Z') : '';
}
function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function writeCsv(key, rows) {
  const [filename, columns] = FILES[key];
  const content = [columns.join(','), ...rows.map(row => columns.map(column => csvValue(row[column])).join(','))].join('\n');
  fs.writeFileSync(path.join(DATA_DIR, filename), `${content}\n`);
}
function createDataset() {
  return {
    maps: Object.fromEntries(ENTITY_KEYS.map(key => [key, new Map()])),
    rows: Object.fromEntries(ROW_KEYS.map(key => [key, []]))
  };
}
function mergeDataset(target, source) {
  for (const key of ENTITY_KEYS) {
    for (const item of source.maps[key].values()) {
      if (key === 'chassis') {
        const id = canonicalChassisId(item.id || item.name);
        upsert(target.maps[key], id, CHASSIS_BY_ID.get(id) || { ...item, id });
      } else upsert(target.maps[key], item.id, item);
    }
  }
  for (const key of ROW_KEYS) {
    if (key === 'entries') {
      target.rows[key].push(...source.rows[key].map(entry => ({ ...entry, chassisId: canonicalChassisId(entry.chassisId) })));
    } else target.rows[key].push(...source.rows[key]);
  }
}
function checkpointPath(year) {
  return path.join(CACHE_DIR, `${year}-${metadataOnly ? 'metadata' : 'full'}-v${CACHE_VERSION}.json`);
}
function saveCheckpoint(year, dataset) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const entities = Object.fromEntries(ENTITY_KEYS.map(key => [key, [...dataset.maps[key].values()]]));
  fs.writeFileSync(checkpointPath(year), JSON.stringify({ version: CACHE_VERSION, year, entities, rows: dataset.rows }));
}
function loadCheckpoint(year) {
  const filePath = checkpointPath(year);
  if (!fs.existsSync(filePath)) return null;
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (payload.version !== CACHE_VERSION || payload.year !== year) return null;
  const dataset = createDataset();
  for (const key of ENTITY_KEYS) {
    for (const item of payload.entities?.[key] || []) upsert(dataset.maps[key], item.id, item);
  }
  for (const key of ROW_KEYS) dataset.rows[key].push(...(payload.rows?.[key] || []));
  validateCollectedSeason(year, dataset.rows);
  return dataset;
}
function readCsv(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath).pipe(csv()).on('data', row => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
  });
}
async function existingDriverCountries() {
  const countries = new Map(Object.entries(DRIVER_COUNTRY_FALLBACKS));
  for (const driver of await readCsv('f2db-drivers.csv')) {
    if (driver.id && /^[a-z]{2}$/i.test(driver.countryCode || '')) countries.set(driver.id, driver.countryCode.toLowerCase());
  }
  return countries;
}
function entityParts(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}
function upsert(map, id, value) {
  if (!id) return;
  const current = map.get(id) || {};
  map.set(id, Object.fromEntries(Object.entries({ ...current, ...value }).map(([key, item]) => [
    key, item === '' || item === null || item === undefined ? current[key] || '' : item
  ])));
}
function deepCountryFlag(value, entitySlug) {
  if (!value || typeof value !== 'object') return '';
  if (value.slug === entitySlug && value.countryFlag) return value.countryFlag;
  for (const nested of Object.values(value)) {
    const found = deepCountryFlag(nested, entitySlug);
    if (found) return found;
  }
  return '';
}

async function createPage(browser) {
  const page = await browser.newPage();
  await page.route('**/*', route => ['font', 'image', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue());
  return page;
}
async function pageData(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (response && !response.ok()) throw new Error(`${url}: HTTP ${response.status()}`);
  await page.waitForTimeout(800);
  return JSON.parse(await page.locator('#__NEXT_DATA__').textContent()).props.pageProps;
}
async function siteJson(page, url) {
  return page.evaluate(async target => {
    const response = await fetch(target);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, url);
}
async function completeEntries(page, seasonSlug, pageType) {
  return siteJson(page, `/api/entry-list?seasonUuid=${encodeURIComponent(seasonSlug)}&pageType=${pageType}&size=10000`);
}
async function completeSummary(page, year) {
  const stats = 'championshipWin,championshipRank,starts,wins,podiums,poles,fastestLaps,bestFinishPosition,bestGridPosition,avgFinishPosition,avgGridPosition,retirements,points';
  return siteJson(page, `/api/results-summary?seasonSlug=${SERIES}_${year}&seriesSlug=${SERIES}&stats=${stats}&size=10000`);
}

function addDriver(maps, driver) {
  if (!driver?.slug) return;
  const names = entityParts(driver.name);
  upsert(maps.drivers, driver.slug, {
    id: driver.slug, name: driver.name, firstName: driver.firstName || names.firstName,
    lastName: driver.surname || names.lastName, abbreviation: driver.code || '',
    countryCode: countryCode(driver.countryFlag), pictureUrl: driver.picture || ''
  });
}
function addConstructor(maps, team) {
  if (!team?.slug) return;
  upsert(maps.constructors, team.slug, {
    id: team.slug, name: team.name, abbreviation: String(team.code || '').trim(),
    countryCode: countryCode(team.countryFlag) || TEAM_COUNTRY_FALLBACKS[team.slug] || '',
    pictureUrl: team.picture || ''
  });
}
function resultRow(session, race, result, order, awards) {
  const driver = result.drivers?.[0] || {};
  const bestLap = result.bestLap || {};
  const sourcePosition = Number(result.finishPosition);
  const classifiedPosition = sourcePosition > 0 && sourcePosition < 1000 ? sourcePosition : '';
  const pole = awards?.poleDrivers?.some(item => item.slug === driver.slug) || false;
  const fastest = awards?.fastestLapDrivers?.some(item => item.slug === driver.slug) || bestLap.fastest || false;
  return {
    sessionId: session.session.slug, raceId: race.id, year: race.year, round: race.round,
    positionDisplayOrder: order, positionNumber: classifiedPosition, points: '',
    polePosition: bool(pole), status: result.classifiedStatus || (sourcePosition >= 1000 ? 'NC' : ''), driverNumber: result.carNumber || '',
    driverId: driver.slug || '', constructorId: result.team?.slug || '', laps: result.laps ?? '',
    time: formatMilliseconds(result.time), timeMillis: result.time || '', gapMillis: result.gap?.timeToLead || 0,
    gapLaps: result.gap?.lapsToLead || 0, fastestLap: bool(fastest), fastestLapNumber: bestLap.lap || '',
    fastestLapTime: formatMilliseconds(bestLap.time), fastestLapTimeMillis: bestLap.time || '', averageSpeed: result.avgLapSpeed || ''
  };
}

async function extractStandings(page, type) {
  if (type === 'team') {
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('div')].find(element =>
        element.textContent.trim().toLowerCase() === 'team' && String(element.className).includes('Tab-')
      );
      if (!tab) throw new Error('Team standings tab not found.');
      tab.click();
    });
    await page.waitForTimeout(1000);
  }
  const select = page.locator('select#itemsAtPage').last();
  if (await select.count()) { await select.selectOption('10000'); await page.waitForTimeout(800); }
  return page.evaluate(entityType => [...document.querySelectorAll('table tbody tr')].flatMap(row => {
    const cells = [...row.cells];
    const positionNumber = Number(cells[0]?.innerText.trim());
    const driverLink = row.querySelector('a[href^="/driver/"]');
    const teamLink = row.querySelector('a[href^="/team/"]');
    if (!positionNumber || !teamLink || (entityType === 'driver' && !driverLink)) return [];
    if (entityType === 'team' && driverLink) return [];
    const href = (entityType === 'driver' ? driverLink : teamLink).getAttribute('href');
    return [{
      positionNumber, href, constructorHref: teamLink.getAttribute('href'),
      points: Number(cells.at(-2)?.innerText.trim() || 0),
      racePoints: cells.slice(2, -2).map(cell => Number(cell.innerText.trim().match(/^-?\d+(?:\.\d+)?/)?.[0] || NaN)),
      racePoles: cells.slice(2, -2).map(cell => /\bPP\b/i.test(cell.innerText)),
      raceFastestLaps: cells.slice(2, -2).map(cell => /\bFL\b/i.test(cell.innerText))
    }];
  }), type);
}
function hrefSlug(href, type) { return String(href || '').match(new RegExp(`/${type}/([^/]+)`))?.[1] || ''; }

async function dismissConsent(page) {
  await page.evaluate(() => {
    const consentButton = [...document.querySelectorAll('button')].find(button =>
      /^(do not consent|reject all|reject|decline)$/i.test(button.textContent.trim())
    );
    consentButton?.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const overlay = document.querySelector('.fc-consent-root');
    if (overlay && getComputedStyle(overlay).display !== 'none') overlay.remove();
  });
}

async function collectYear(page, year, maps, rows) {
  process.stdout.write(`\n${year}: loading season... `);
  const summaryUrl = `${ORIGIN}/series/${SERIES}/summary/${year}`;
  const summaryData = await pageData(page, summaryUrl);
  const summary = await completeSummary(page, year);
  const resultPage = await pageData(page, `${ORIGIN}/series/${SERIES}/results/${year}`);
  const resultAwards = new Map((resultPage.results || []).map(item => [item.sessionSlug, item]));
  const firstEvent = resultPage.results?.[0]?.event?.slug;
  if (!firstEvent) throw new Error(`No event found for ${year}.`);
  const firstEventName = firstEvent.replace(`${SERIES}_${year}_`, '');
  const firstInfo = await pageData(page, `${ORIGIN}/results/${SERIES}/${year}/${firstEventName}/info`);
  const eventSlugs = firstInfo.seasonEvents.map(item => item.event.slug.replace(`${SERIES}_${year}_`, ''));
  rows.seasons.push({ year });

  for (const item of summary.content) {
    addDriver(maps, item.driver); addConstructor(maps, item.team);
    const stats = item.stats || {};
    rows.driverStandings.push({
      year, positionNumber: stats.championshipRank || '', driverId: item.driver.slug,
      constructorId: item.team?.slug || '', points: stats.points || 0, championshipWon: bool(stats.championshipWin),
      starts: stats.starts || 0, wins: stats.wins || 0, podiums: stats.podiums || 0,
      poles: stats.poles || 0, fastestLaps: stats.fastestLaps || 0, retirements: stats.retirements || 0
    });
  }

  const raceSessions = [];
  for (const [eventIndex, eventName] of eventSlugs.entries()) {
    const sourceUrl = `${ORIGIN}/results/${SERIES}/${year}/${eventName}/info`;
    const info = eventIndex === 0 ? firstInfo : await pageData(page, sourceUrl);
    const event = info.shortInfo;
    const race = {
      id: event.uuid, year, round: event.round, date: dateValue(event.startDate), endDate: dateValue(event.endDate),
      name: event.name, code: event.code || '', circuitId: event.circuit.slug, sourceUrl
    };
    rows.races.push(race);
    upsert(maps.circuits, event.circuit.slug, {
      id: event.circuit.slug, name: event.circuit.name, type: event.circuit.type || event.venue?.type || '',
      direction: event.circuit.direction || '', placeName: event.venue?.address || '', lengthMeters: event.circuit.length || '',
      turns: event.circuit.corners?.total || '', pictureUrl: event.venue?.picture || '', mapUrl: event.circuit.picture || ''
    });
    const eventEntries = await completeEntries(page, event.slug, 'events');
    for (const entry of eventEntries.content) {
      addDriver(maps, entry.driver); addConstructor(maps, entry.team);
      const chassisId = canonicalChassisId(entry.chassis?.name); const engineId = slug(entry.engine?.name);
      if (chassisId) upsert(maps.chassis, chassisId, CHASSIS_BY_ID.get(chassisId) || { id: chassisId, name: entry.chassis.name });
      if (engineId) upsert(maps.engines, engineId, { id: engineId, name: entry.engine.name });
      rows.entries.push({ raceId: race.id, year, round: race.round, driverNumber: entry.carNumber || '',
        driverId: entry.driver?.slug || '', constructorId: entry.team?.slug || '', chassisId, engineId });
    }
    for (const session of info.sessions) {
      rows.sessions.push({
        id: session.session.slug, raceId: race.id, year, round: race.round, sessionNumber: session.sessionNumber,
        code: session.session.code || '', name: session.session.name, startTimeUtc: dateTimeValue(session.startTimeUtc),
        endTimeUtc: dateTimeValue(session.endTimeUtc), isRace: bool(session.isRace), cancelled: bool(session.cancelled)
      });
      if (session.isRace || (session.cancelled && /race/i.test(session.session.name))) raceSessions.push(session.session.slug);
      if (metadataOnly || !session.hasResults || session.cancelled) continue;
      const prefix = `${SERIES}_${year}_${eventName}_`;
      const classificationName = session.session.slug.startsWith(prefix) ? session.session.slug.slice(prefix.length) : '';
      if (!classificationName) throw new Error(`Cannot map session ${session.session.slug}.`);
      const classification = await pageData(page, `${ORIGIN}/results/${SERIES}/${year}/${eventName}/classification/${classificationName}`);
      const details = classification.sessionAllClassification?.details || classification.sessionClassification?.details || [];
      details.forEach((result, index) => {
        addDriver(maps, result.drivers?.[0]); addConstructor(maps, result.team);
        rows.results.push(resultRow(session, race, result, index + 1, resultAwards.get(session.session.slug)));
      });
      await wait(delayMilliseconds);
    }
    process.stdout.write(`${eventIndex + 1}/${eventSlugs.length} `);
  }

  if (!metadataOnly) {
    const latestCompletedSlug = resultPage.results?.at(-1)?.event?.slug || '';
    const latestCompletedName = latestCompletedSlug.replace(`${SERIES}_${year}_`, '');
    const latestCompletedEvent = rows.races.find(race => race.year === year && race.sourceUrl.endsWith(`/${latestCompletedName}/info`));
    if (!latestCompletedEvent) throw new Error(`Cannot identify the latest completed event for ${year}.`);
    await pageData(page, latestCompletedEvent.sourceUrl.replace(/\/info$/, '/standings'));
    await dismissConsent(page);
    const driverRows = await extractStandings(page, 'driver');
    const teamRows = await extractStandings(page, 'team');
    const resultMap = new Map(rows.results.filter(row => row.year === year).map(row => [`${row.sessionId}:${row.driverId}`, row]));
    driverRows.forEach(driver => driver.racePoints.forEach((points, index) => {
      if (!Number.isFinite(points) || !raceSessions[index]) return;
      const row = resultMap.get(`${raceSessions[index]}:${hrefSlug(driver.href, 'driver')}`);
      if (row) { row.points = points; row.polePosition = bool(driver.racePoles[index] || row.polePosition === 'True'); row.fastestLap = bool(driver.raceFastestLaps[index] || row.fastestLap === 'True'); }
    }));
    const championTeam = summaryData.lastChampions?.season?.year === year ? summaryData.lastChampions.team?.slug : '';
    teamRows.forEach(team => rows.constructorStandings.push({
      year, positionNumber: team.positionNumber, constructorId: hrefSlug(team.href, 'team'), points: team.points,
      championshipWon: bool(hrefSlug(team.href, 'team') === championTeam)
    }));
  }
  console.log(`${eventSlugs.length} events, ${summary.content.length} drivers`);
}

async function enrichNationalities(page, maps, countryFallbacks) {
  const missing = [...maps.drivers.values()].filter(driver => !driver.countryCode);
  for (const [index, driver] of missing.entries()) {
    try {
      const data = await pageData(page, `${ORIGIN}/driver/${driver.id}/summary/series/${SERIES}`);
      driver.countryCode = countryCode(deepCountryFlag(data, driver.id));
    } catch (error) {
      console.warn(`Nationality lookup failed for ${driver.name}: ${error.message}`);
    }
    driver.countryCode ||= countryFallbacks.get(driver.id) || '';
    process.stdout.write(`\rNationalities ${index + 1}/${missing.length}`);
  }
  if (missing.length) process.stdout.write('\n');
}

function validate(maps, rows) {
  const missingDrivers = [...maps.drivers.values()].filter(driver => !driver.countryCode);
  const missingTeams = [...maps.constructors.values()].filter(team => !team.countryCode);
  if (missingDrivers.length) throw new Error(`Drivers without nationality: ${missingDrivers.map(item => item.name).join(', ')}`);
  if (missingTeams.length) throw new Error(`Teams without nationality: ${missingTeams.map(item => item.name).join(', ')}`);
  for (const season of rows.seasons) {
    if (!rows.races.some(race => race.year === season.year)) throw new Error(`No races for ${season.year}.`);
    if (!rows.driverStandings.some(item => item.year === season.year)) throw new Error(`No driver standings for ${season.year}.`);
    if (!metadataOnly && !rows.constructorStandings.some(item => item.year === season.year)) throw new Error(`No constructor standings for ${season.year}.`);
  }
  const duplicateResults = new Set();
  for (const row of rows.results) {
    const key = `${row.sessionId}:${row.driverId}`;
    if (duplicateResults.has(key)) throw new Error(`Duplicate result ${key}.`);
    duplicateResults.add(key);
  }
}

function validateCollectedSeason(year, rows) {
  if (!rows.seasons.some(season => season.year === year)) throw new Error(`Checkpoint has no season ${year}.`);
  if (!rows.races.some(race => race.year === year)) throw new Error(`No races for ${year}.`);
  if (!rows.driverStandings.some(item => item.year === year)) throw new Error(`No driver standings for ${year}.`);
  if (!metadataOnly && !rows.constructorStandings.some(item => item.year === year)) throw new Error(`No constructor standings for ${year}.`);
  const results = new Set();
  for (const row of rows.results.filter(item => item.year === year)) {
    const key = `${row.sessionId}:${row.driverId}`;
    if (results.has(key)) throw new Error(`Duplicate result ${key}.`);
    results.add(key);
  }
}

function consolidateDriverStandings(standings, entries) {
  const grouped = new Map();
  const additiveFields = ['points', 'starts', 'wins', 'podiums', 'poles', 'fastestLaps', 'retirements'];
  for (const row of standings) {
    const key = `${row.year}:${row.driverId}`;
    if (!grouped.has(key)) {
      grouped.set(key, { ...row });
      continue;
    }
    const existing = grouped.get(key);
    for (const field of additiveFields) existing[field] = Number(existing[field] || 0) + Number(row[field] || 0);
    existing.positionNumber ||= row.positionNumber;
    existing.championshipWon = bool(existing.championshipWon === 'True' || row.championshipWon === 'True');
  }
  for (const row of grouped.values()) {
    row.constructorId = entries
      .filter(entry => entry.year === String(row.year) && entry.driverId === row.driverId)
      .sort((a, b) => Number(b.round) - Number(a.round))[0]?.constructorId || row.constructorId;
  }
  return [...grouped.values()];
}

function markCompletedSeasonChampions(rows) {
  const today = new Date().toISOString().slice(0, 10);
  const years = new Set(rows.races.map(race => race.year));
  for (const year of years) {
    const races = rows.races.filter(race => race.year === year);
    const complete = races.length > 0 && races.every(race => (race.endDate || race.date) <= today);
    if (!complete) continue;
    rows.driverStandings
      .filter(row => row.year === year)
      .forEach(row => { row.championshipWon = bool(Number(row.positionNumber) === 1); });
    rows.constructorStandings
      .filter(row => row.year === year)
      .forEach(row => { row.championshipWon = bool(Number(row.positionNumber) === 1); });
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const years = selectedYear ? [selectedYear] : Array.from({ length: toYear - fromYear + 1 }, (_, index) => fromYear + index);
  const dataset = createDataset();
  const countryFallbacks = await existingDriverCountries();
  const browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless });
  try {
    const page = await createPage(browser);
    for (const year of years) {
      const cached = loadCheckpoint(year);
      if (cached) {
        console.log(`\n${year}: loaded checkpoint`);
        mergeDataset(dataset, cached);
        continue;
      }
      const seasonDataset = createDataset();
      await collectYear(page, year, seasonDataset.maps, seasonDataset.rows);
      validateCollectedSeason(year, seasonDataset.rows);
      saveCheckpoint(year, seasonDataset);
      mergeDataset(dataset, seasonDataset);
    }
    await enrichNationalities(page, dataset.maps, countryFallbacks);
  } finally { await browser.close(); }
  dataset.rows.driverStandings = consolidateDriverStandings(dataset.rows.driverStandings, dataset.rows.entries);
  markCompletedSeasonChampions(dataset.rows);
  validate(dataset.maps, dataset.rows);
  for (const key of ENTITY_KEYS) writeCsv(key, [...dataset.maps[key].values()].sort((a, b) => a.name.localeCompare(b.name)));
  for (const key of ROW_KEYS) writeCsv(key, dataset.rows[key]);
  console.log(`Wrote complete Formula 3 dataset for ${years[0]}–${years.at(-1)}.`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = {
  canonicalChassisId,
  consolidateDriverStandings,
  countryCode,
  createDataset,
  dateTimeValue,
  dateValue,
  markCompletedSeasonChampions,
  mergeDataset,
  resultRow,
  slug
};
