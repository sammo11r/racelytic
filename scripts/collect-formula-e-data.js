const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { findBrowserExecutable } = require('./import-f2-results');
const { collectOfficialSeasonData, normalized } = require('./formula-e-official-data');

const CONTRACT = require('../data/formula-e-data-contract.json');
const ORIGIN = 'https://www.fiaformulae.com';
const DATA_DIR = path.join(__dirname, '../data');
const CACHE_DIR = path.join(DATA_DIR, '.formula-e-cache');
const CACHE_VERSION = 16;
const DEFAULT_SEASON = 12;
const ISO3_TO_ISO2 = Object.freeze({
  ARG: 'ar', AUS: 'au', AUT: 'at', BEL: 'be', BGR: 'bg', BRA: 'br', BRB: 'bb', CAN: 'ca',
  CHE: 'ch', CHL: 'cl', CHN: 'cn', COL: 'co', DEU: 'de', DNK: 'dk', EE: 'ee', EST: 'ee',
  ESP: 'es', FIN: 'fi', FRA: 'fr', GBR: 'gb', GER: 'de', IDN: 'id', IND: 'in', IRL: 'ie',
  ISR: 'il', ITA: 'it', JPN: 'jp', KOR: 'kr', MCO: 'mc', MEX: 'mx', NLD: 'nl', NOR: 'no',
  NZL: 'nz', POL: 'pl', PRT: 'pt', RUS: 'ru', SWE: 'se', THA: 'th', UAE: 'ae', USA: 'us', ZAF: 'za'
});
const FILE_NAMES = Object.freeze({
  seasons: 'fedb-seasons.csv', drivers: 'fedb-drivers.csv', constructors: 'fedb-constructors.csv',
  chassis: 'fedb-chassis.csv', engines: 'fedb-engines.csv', manufacturers: 'fedb-manufacturers.csv',
  circuits: 'fedb-circuits.csv', races: 'fedb-races.csv',
  sessions: 'fedb-sessions.csv', entries: 'fedb-entries.csv', results: 'fedb-session-results.csv',
  driverStandings: 'fedb-season-driver-standings.csv', constructorStandings: 'fedb-season-constructor-standings.csv',
  manufacturerStandings: 'fedb-season-manufacturer-standings.csv'
});
const ENTITY_KEYS = Object.freeze(['drivers', 'constructors', 'chassis', 'engines', 'manufacturers', 'circuits']);
const ROW_KEYS = Object.freeze(['seasons', 'races', 'sessions', 'entries', 'results', 'driverStandings', 'constructorStandings', 'manufacturerStandings']);
const TEAM_COUNTRY_FALLBACKS = Object.freeze({
  'abt-schaeffler-audi-sport': 'de', 'andretti-formula-e-race-team': 'us', 'andretti-formula-e-team': 'us',
  'ds-virgin-racing-formula-e-team': 'gb', 'faraday-future-dragon-racing': 'us',
  'mercedes-benz-eq-formula-e-team': 'de', 'nextev-nio': 'cn', 'nextev-tcr-formula-e-team': 'cn',
  'team-aguri': 'gb', 'venturi-formula-e': 'mc'
});
const CIRCUIT_COUNTRY_FALLBACKS = Object.freeze({ marrakesh: 'ma' });
const CIRCUIT_TIME_ZONES = Object.freeze({
  beijing: 'Asia/Shanghai', berlin: 'Europe/Berlin', bern: 'Europe/Zurich', 'buenos-aires': 'America/Argentina/Buenos_Aires',
  'cape-town': 'Africa/Johannesburg', 'ciudad-de-mexico': 'America/Mexico_City', diriyah: 'Asia/Riyadh',
  'hong-kong': 'Asia/Hong_Kong', hyderabad: 'Asia/Kolkata', jakarta: 'Asia/Jakarta', jeddah: 'Asia/Riyadh',
  london: 'Europe/London', 'long-beach': 'America/Los_Angeles', madrid: 'Europe/Madrid', marrakesh: 'Africa/Casablanca',
  'mexico-city': 'America/Mexico_City', miami: 'America/New_York', misano: 'Europe/Rome', monaco: 'Europe/Monaco',
  montreal: 'America/Toronto', moscow: 'Europe/Moscow', 'new-york': 'America/New_York', paris: 'Europe/Paris',
  portland: 'America/Los_Angeles', puebla: 'America/Mexico_City', 'punta-del-este': 'America/Montevideo',
  putrajaya: 'Asia/Kuala_Lumpur', rome: 'Europe/Rome', santiago: 'America/Santiago', sanya: 'Asia/Shanghai',
  'sanya-fenghuang-international-apt': 'Asia/Shanghai', 'sao-paulo': 'America/Sao_Paulo', seoul: 'Asia/Seoul',
  shanghai: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', valencia: 'Europe/Madrid', zurich: 'Europe/Zurich'
});
const CIRCUIT_TURNS = Object.freeze({ beijing: 17, berlin: 15, bern: 14, 'cape-town': 12, diriyah: 21, 'hong-kong': 10,
  hyderabad: 18, jakarta: 18, jeddah: 19, london: 20, madrid: 13, marrakesh: 12, 'mexico-city': 16,
  'ciudad-de-mexico': 16, miami: 14, misano: 14, monaco: 19, montreal: 14, moscow: 13, 'new-york': 14,
  paris: 14, portland: 12, puebla: 15, 'punta-del-este': 20, putrajaya: 12, rome: 19, santiago: 14, sanya: 11,
  'sanya-fenghuang-international-apt': 12, 'sao-paulo': 11, seoul: 22, shanghai: 12, tokyo: 18, valencia: 15, zurich: 11 });
const PERMANENT_CIRCUITS = new Set(['ciudad-de-mexico', 'jeddah', 'madrid', 'mexico-city', 'misano', 'portland', 'puebla', 'shanghai', 'valencia']);
const CIRCUIT_METADATA_FALLBACKS = Object.freeze({
  beijing: { lengthMeters: 3439, turns: 17, sourceUrl: 'https://www.fiaformulae.com/en/news/6888' },
  'buenos-aires': { lengthMeters: 2480, turns: 12, direction: 'Anti-clockwise', sourceUrl: 'https://www.fiaformulae.com/en/news/6590' },
  'long-beach': { lengthMeters: 2100, turns: 7, sourceUrl: 'https://www.fiaformulae.com/en/news/culture/long-beach-track-guide' },
  marrakesh: { lengthMeters: 2971, turns: 12, sourceUrl: 'https://www.fiaformulae.com/en/news/2154' },
  montreal: { lengthMeters: 2750, turns: 14, sourceUrl: 'https://www.fiaformulae.com/en/news/6431/location-revealed-for-montreal-eprix' },
  moscow: { lengthMeters: 2390, turns: 13, sourceUrl: 'https://www.fia.com/news/fe-2015-moscow-eprix-preview' },
  paris: { lengthMeters: 1930, turns: 14, direction: 'Clockwise', sourceUrl: 'https://www.fiaformulae.com/en/news/6784/qatar-airways-paris-eprix-race-preview' },
  'punta-del-este': { lengthMeters: 2785, turns: 20, sourceUrl: 'https://www.fiaformulae.com/en/news/5930' },
  putrajaya: { lengthMeters: 2560, turns: 12, sourceUrl: 'https://www.fiaformulae.com/en/news/5418' },
  zurich: { lengthMeters: 2460, sourceUrl: 'https://www.fiaformulae.com/en/news/7642/guide-welcome-to-the-2018-julius-baer-zurich-e-prix' }
});
const DRIVER_ID_ALIASES = Object.freeze({ 'qing-hua-ma': 'ma-qinghua' });
const CHASSIS_COLUMNS = CONTRACT.files.chassis;
const CHASSIS_SOURCE = 'https://www.fiaformulae.com/en/news/evs/formula-es-cutting-edge-electric-race-car-gen3-explained';
const EVO_SOURCE = 'https://www.fiaformulae.com/en/news/496038';
const CHASSIS_GENERATIONS = Object.freeze([
  { id: 'spark-renault-srt-01e', name: 'Spark-Renault SRT_01E', generation: 1, manufacturer: 'Spark Racing Technology',
    successor: 'spark-srt05e', introducedYear: 2014, retiredYear: 2018, lengthMm: 5000, widthMm: 1780, heightMm: 1050,
    wheelbaseMm: 3100, powerHp: 270, powerKw: 200, weightKg: 900, weightIncludesDriver: 'True', tyres: 'Michelin', sourceUrl: CHASSIS_SOURCE },
  { id: 'spark-srt05e', name: 'Spark SRT05e', generation: 2, manufacturer: 'Spark Racing Technology',
    predecessor: 'spark-renault-srt-01e', successor: 'spark-gen3', introducedYear: 2018, retiredYear: 2022, lengthMm: 5200,
    widthMm: 1800, heightMm: 1063.5, wheelbaseMm: 3100, powerHp: 335, powerKw: 250, weightKg: 900,
    weightIncludesDriver: 'True', tyres: 'Michelin', sourceUrl: CHASSIS_SOURCE },
  { id: 'spark-gen3', name: 'Spark Gen3', generation: 3, manufacturer: 'Spark Racing Technology', predecessor: 'spark-srt05e',
    successor: 'spark-gen3-evo', introducedYear: 2022, retiredYear: 2024, lengthMm: 5016.2, widthMm: 1700, heightMm: 1023.4,
    wheelbaseMm: 2970.5, powerHp: 470, powerKw: 350, weightKg: 840, weightIncludesDriver: 'True', tyres: 'Hankook', sourceUrl: CHASSIS_SOURCE },
  { id: 'spark-gen3-evo', name: 'Spark Gen3 Evo', generation: 4, manufacturer: 'Spark Racing Technology', predecessor: 'spark-gen3',
    introducedYear: 2024, powerHp: 470, powerKw: 350, tyres: 'Hankook', sourceUrl: EVO_SOURCE }
]);

function chassisForSeason(seasonNumber) {
  const generation = Number(seasonNumber) <= 4 ? 1 : Number(seasonNumber) <= 8 ? 2 : Number(seasonNumber) <= 10 ? 3 : 4;
  const source = CHASSIS_GENERATIONS[generation - 1];
  return Object.fromEntries(CHASSIS_COLUMNS.map(column => [column, source[column] ?? '']));
}

function zonedLocalToUtc(localDateTime, timeZone) {
  const match = String(localDateTime || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match || !timeZone) return '';
  const intended = Date.UTC(...match.slice(1).map(Number).map((value, index) => index === 1 ? value - 1 : value));
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let guess = intended;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
    guess += intended - represented;
  }
  return new Date(guess).toISOString().replace('.000Z', 'Z');
}

function argumentValue(name) {
  const argument = process.argv.slice(2).find(value => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : '';
}

function seasonNumbersFromArguments() {
  const single = argumentValue('season');
  const range = argumentValue('seasons');
  if (single && range) throw new Error('Use either --season or --seasons, not both.');
  if (!range) {
    const season = Number(single || DEFAULT_SEASON);
    if (!Number.isInteger(season) || season < 1 || season > 99) throw new Error('Use --season=<official Formula E season number>.');
    return [season];
  }
  const selected = new Set();
  for (const part of range.split(',')) {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error('Use --seasons=<number,number-range>, for example --seasons=10-11.');
    const from = Number(match[1]), to = Number(match[2] || match[1]);
    if (from < 1 || to > 99 || to < from) throw new Error(`Invalid Formula E season range: ${part}.`);
    for (let season = from; season <= to; season += 1) selected.add(season);
  }
  return [...selected].sort((a, b) => a - b);
}

function slug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function humanize(value) {
  return String(value || '').split('-').filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseTimeMillis(value) {
  const text = String(value || '').trim().replace(/^\+/, '');
  if (!/^\d+(?::\d+){0,2}(?:\.\d+)?$/.test(text)) return '';
  const parts = text.split(':').map(Number);
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0) * 1000);
}

function parseGapLaps(value) {
  const match = String(value || '').match(/(\d+)\s*LAPS?/i);
  return match ? Number(match[1]) : '';
}

function chronologicalSessions(sessions) {
  const rank = session => {
    const key = `${session.key || ''} ${session.name || ''}`.toLowerCase();
    const practice = key.match(/(?:fp|practice)[\s_-]*(\d+)?/);
    if (practice) return 10 + Number(practice[1] || 0);
    if (/qualif/.test(key)) return 100;
    if (/grid/.test(key)) return 190;
    if (/race/.test(key)) return 200;
    return 150;
  };
  return sessions.map((session, index) => ({ session, index }))
    .sort((first, second) => rank(first.session) - rank(second.session) || first.index - second.index)
    .map(item => item.session);
}

function seasonIdentity(seasonNumber, dates) {
  const years = dates.map(value => Number(String(value).slice(0, 4))).filter(Number.isInteger);
  if (!years.length) throw new Error('Formula E season has no valid round dates.');
  const startYear = 2013 + Number(seasonNumber), endYear = startYear + 1;
  if (years.some(year => year < startYear || year > endYear)) throw new Error(`Formula E Season ${seasonNumber} contains a date outside ${startYear}–${endYear}.`);
  return { seasonKey: `${startYear}-${String(endYear).slice(-2)}`, seasonNumber, year: endYear, label: `${startYear}–${String(endYear).slice(-2)}`, startYear, endYear };
}

function normalizePosition(value) {
  const match = String(value || '').trim().match(/^\d+/);
  return match ? Number(match[0]) : '';
}

function unique(rows, key) {
  return [...new Map(rows.map(row => [key(row), row])).values()];
}

function mergeEntities(rows, columns) {
  const merged = new Map();
  for (const row of rows) {
    const current = merged.get(row.id) || {};
    merged.set(row.id, Object.fromEntries(columns.map(column => [
      column, row[column] !== '' && row[column] != null ? row[column] : current[column] || ''
    ])));
  }
  return [...merged.values()];
}

function driverNameParts(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) || '' };
}

function writeCsv(key, rows, outputDirectory = DATA_DIR) {
  const columns = CONTRACT.files[key];
  if (!columns) throw new Error(`Unknown Formula E contract file: ${key}`);
  const content = [columns.join(','), ...rows.map(row => columns.map(column => csvValue(row[column])).join(','))].join('\n');
  fs.writeFileSync(path.join(outputDirectory, FILE_NAMES[key]), `${content}\n`);
}

function checkpointPath(seasonNumber, version = CACHE_VERSION) {
  return path.join(CACHE_DIR, `season-${seasonNumber}-v${version}.json`);
}

function loadCheckpoint(seasonNumber) {
  if (process.argv.includes('--refresh')) return null;
  for (const version of [CACHE_VERSION, CACHE_VERSION - 1, CACHE_VERSION - 2]) {
    const file = checkpointPath(seasonNumber, version);
    if (!fs.existsSync(file)) continue;
    try {
      const checkpoint = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (checkpoint.version !== version || Number(checkpoint.seasonNumber) !== seasonNumber) continue;
      const identity = seasonIdentity(seasonNumber, checkpoint.dataset.races.map(race => race.date));
      if (checkpoint.dataset.seasons[0]?.seasonKey === identity.seasonKey) return { dataset: checkpoint.dataset, version };
    } catch { /* Try the previous cache version. */ }
  }
  return null;
}

function saveCheckpoint(seasonNumber, dataset) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(checkpointPath(seasonNumber), JSON.stringify({ version: CACHE_VERSION, seasonNumber, dataset }));
}

async function preparePage(browser) {
  const page = await browser.newPage({ locale: 'en-GB' });
  await page.route('**/*', route => ['font', 'image', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue());
  return page;
}

async function visit(page, url, selector) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (response && !response.ok()) throw new Error(`${url}: HTTP ${response.status()}`);
  await page.waitForSelector(selector, { timeout: 30000 });
}

async function collectRoundIndex(page, seasonNumber) {
  const url = `${ORIGIN}/en/results-and-standings?season=${seasonNumber}`;
  await visit(page, url, '[data-testid^="round-selector-tile-"]');
  return page.locator('[data-testid^="round-selector-tile-"]').evaluateAll(tiles => tiles.map(tile => {
    const href = tile.getAttribute('href') || '';
    const round = Number(tile.getAttribute('data-testid')?.match(/(\d+)$/)?.[1]);
    const route = new URL(href, window.location.origin).searchParams.get('round') || '';
    const venueSlug = route.replace(/^\d+-/, '');
    const dateText = tile.textContent.match(/\d{2}\s+[A-Z]{3}\s+\d{4}/i)?.[0] || '';
    const parsedDate = dateText ? new Date(`${dateText} UTC`) : null;
    return { round, route, venueSlug, date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString().slice(0, 10) : '', href: new URL(href, window.location.origin).href };
  })).then(rows => rows.filter(row => row.round && row.route && row.date));
}

async function collectRoundSessions(page, seasonNumber, round) {
  await visit(page, round.href, '[data-testid="standings-round-filter-block"]');
  const context = await page.locator('[data-testid="standings-round-filter-block"]').evaluate(element => {
    const country = element.querySelector('[data-testid="country-flag"]')?.getAttribute('aria-label')?.match(/:\s*([A-Z]{2})$/)?.[1]?.toLowerCase() || '';
    const sessions = [...element.querySelectorAll('a[data-testid^="session-"]')].map((link, index) => ({
      key: link.getAttribute('data-testid').replace(/^session-/, ''), name: link.textContent.trim(), href: new URL(link.getAttribute('href'), window.location.origin).href, order: index + 1
    }));
    return { country, sessions };
  });
  return { ...round, ...context, seasonNumber };
}

async function collectClassification(page, round, session, identity) {
  await visit(page, session.href, '[data-testid^="results-full-grid-"]');
  const rows = await page.locator('[data-testid^="results-row-"]').evaluateAll(elements => elements.map((row, index) => {
    const text = selector => row.querySelector(selector)?.textContent?.trim() || '';
    const driverLink = row.querySelector('a[href*="/drivers/"]');
    const driverName = driverLink?.textContent?.trim() || text('[class*="nameLabel"]');
    const driverId = driverLink?.getAttribute('href')?.split('/').filter(Boolean).at(-1) || '';
    const teamLink = row.querySelector('a[href*="/teams/"]');
    const teamCell = row.querySelector('td[class*="team__"]');
    const teamName = teamLink?.textContent?.trim() || teamCell?.textContent?.trim() || text('[class*="teamLine"]');
    const abbreviation = text('[class*="nation__"] span:last-child');
    const positionText = text('[class*="positionInner"]') || row.children[0]?.textContent?.trim() || '';
    return {
      displayOrder: index + 1, positionText, driverId, driverName, abbreviation, teamName,
      constructorId: teamLink?.getAttribute('href')?.split('/').filter(Boolean).at(-1) || '',
      grid: text('[class*="value--grid"]'), time: text('[class*="value--time"]'), points: text('[class*="value--points"][class*="desktop"]')
    };
  }));
  const raceId = `fe-${identity.seasonKey}-r${round.round}-${round.venueSlug}`;
  const sessionId = `${raceId}-${session.key}`;
  return rows.filter(row => row.driverId && row.driverName).map(row => {
    const positionNumber = normalizePosition(row.positionText);
    const statusText = String(row.time || '').toUpperCase();
    const status = positionNumber ? '' : /DNF|DNS|DSQ|NC|RET/.test(statusText) ? statusText : 'NC';
    const timing = parseTimeMillis(row.time);
    return {
      sessionId, raceId, seasonKey: identity.seasonKey, year: identity.year, round: round.round,
      positionDisplayOrder: row.displayOrder, positionNumber, points: Number(row.points || 0),
      polePosition: session.key === 'qualifying' && positionNumber === 1 ? 'True' : 'False', status,
      driverNumber: '', driverId: row.driverId, constructorId: row.constructorId || slug(row.teamName), laps: '',
      time: row.time, timeMillis: row.time.startsWith('+') ? '' : timing, gapMillis: row.time.startsWith('+') ? timing : '',
      gapLaps: parseGapLaps(row.time), fastestLap: 'False', fastestLapNumber: '', fastestLapTime: '', fastestLapTimeMillis: '', averageSpeed: '',
      gridPositionNumber: normalizePosition(row.grid),
      driverName: row.driverName, abbreviation: row.abbreviation, teamName: row.teamName
    };
  });
}

async function collectStandings(page, seasonNumber, type, required = true) {
  const singular = type === 'drivers' ? 'driver' : type === 'teams' ? 'team' : 'manufacturer';
  const url = `${ORIGIN}/en/results-and-standings?tab=${type}&season=${seasonNumber}`;
  const selector = `[data-testid="standings-row-${singular}"]`;
  if (required) await visit(page, url, selector);
  else {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (response && !response.ok()) throw new Error(`${url}: HTTP ${response.status()}`);
    try { await page.waitForSelector(selector, { timeout: 5000 }); }
    catch { return []; }
  }
  return page.locator(selector).evaluateAll((rows, entityType) => rows.map(row => {
    const text = selector => row.querySelector(selector)?.textContent?.trim() || '';
    const entityLink = entityType === 'driver' ? row.querySelector('a[href*="/drivers/"]') : row.querySelector('a[href*="/teams/"]');
    const name = entityLink?.textContent?.trim() || text('[class*="nameLabel"]');
    const id = entityLink?.getAttribute('href')?.split('/').filter(Boolean).at(-1) || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const teamLink = row.querySelector('td[class*="team__"] a[href*="/teams/"]');
    const nation = text('[class*="nationCode"]');
    return {
      positionNumber: Number(row.querySelector('th')?.textContent?.trim() || 0), id, name,
      points: Number(text('[class*="points__"]') || 0), constructorId: teamLink?.getAttribute('href')?.split('/').filter(Boolean).at(-1) || '',
      teamName: teamLink?.textContent?.trim() || text('[class*="teamLine"]'), nationalityCode: nation,
      pictureUrl: row.querySelector('img')?.getAttribute('src') || ''
    };
  }), singular);
}

async function collectSeasonImages(browser, seasonNumber) {
  const collect = async (type, selector) => {
    const page = await preparePage(browser);
    try {
      const url = `${ORIGIN}/en/results-and-standings?tab=${type}&season=${seasonNumber}`;
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (response && !response.ok()) return new Map();
      try { await page.waitForSelector(selector, { timeout: 15000 }); } catch { return new Map(); }
      const rows = await page.locator(selector).evaluateAll((elements, entityType) => elements.map(row => {
        const link = entityType === 'drivers' ? row.querySelector('a[href*="/drivers/"]') : row.querySelector('a[href*="/teams/"]');
        const name = link?.textContent?.trim() || row.querySelector('[class*="nameLabel"]')?.textContent?.trim() || '';
        const id = link?.getAttribute('href')?.split('/').filter(Boolean).at(-1)
          || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const image = entityType === 'drivers' ? row.querySelector('img[alt^="Profile Image:"]') : row.querySelector('img[alt*="Logo"]');
        return [id, image?.getAttribute('src') || ''];
      }), type);
      return new Map(rows.filter(([id]) => id));
    } finally { await page.close(); }
  };
  const [drivers, constructors, manufacturers] = await Promise.all([
    collect('drivers', '[data-testid="standings-row-driver"]'), collect('teams', '[data-testid="standings-row-team"]'),
    collect('manufacturers', '[data-testid="standings-row-manufacturer"]')
  ]);
  const fillPageImages = async (entities, route) => {
    const missing = [...entities].filter(([, url]) => !url);
    for (let offset = 0; offset < missing.length; offset += 6) {
      await Promise.all(missing.slice(offset, offset + 6).map(async ([id]) => {
        try {
          const response = await fetch(`${ORIGIN}/en/${route}/${encodeURIComponent(id)}`, { headers: { 'user-agent': 'Racelytic Formula E importer/1.0' } });
          if (!response.ok) return;
          const html = await response.text();
          const image = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1]
            || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)?.[1];
          if (image) entities.set(id, image.replaceAll('&amp;', '&'));
        } catch { /* An unavailable historical profile remains blank. */ }
      }));
    }
  };
  await Promise.all([fillPageImages(drivers, 'drivers'), fillPageImages(constructors, 'teams')]);
  return { drivers, constructors, manufacturers };
}

function applySeasonImages(dataset, images) {
  for (const key of ['drivers', 'constructors', 'manufacturers']) {
    for (const entity of dataset[key]) entity.pictureUrl = images[key]?.get(entity.id) || '';
  }
}

function mergeDatasets(datasets) {
  const merged = Object.fromEntries([...ENTITY_KEYS, ...ROW_KEYS].map(key => [key, []]));
  for (const key of ENTITY_KEYS) {
    const byId = new Map();
    for (const row of datasets.flatMap(dataset => dataset[key] || [])) {
      const current = byId.get(row.id) || {};
      byId.set(row.id, Object.fromEntries(CONTRACT.files[key].map(column => [column, row[column] !== '' && row[column] != null ? row[column] : current[column] || ''])));
    }
    merged[key] = [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  const rowKeys = {
    seasons: row => row.seasonKey,
    races: row => row.id,
    sessions: row => row.id,
    entries: row => `${row.raceId}:${row.driverId}`,
    results: row => `${row.sessionId}:${row.driverId}`,
    driverStandings: row => `${row.seasonKey}:${row.driverId}`,
    constructorStandings: row => `${row.seasonKey}:${row.constructorId}`,
    manufacturerStandings: row => `${row.seasonKey}:${row.manufacturerId}`
  };
  for (const key of ROW_KEYS) merged[key] = unique(datasets.flatMap(dataset => dataset[key]), rowKeys[key]);
  return merged;
}

function buildDataset(identity, rounds, classifications, standings) {
  const rawResults = classifications.flat();
  const standingByDriver = new Map(standings.drivers.map(row => [row.id, row]));
  const teamByRaceDriver = new Map(rawResults.filter(row => row.teamName).map(row => [`${row.raceId}:${row.driverId}`, { constructorId: row.constructorId || slug(row.teamName), teamName: row.teamName }]));
  const results = rawResults.map(row => {
    const weekendTeam = teamByRaceDriver.get(`${row.raceId}:${row.driverId}`);
    const standing = standingByDriver.get(row.driverId);
    const teamName = row.teamName || weekendTeam?.teamName || standing?.teamName || '';
    return { ...row, teamName, constructorId: row.constructorId || weekendTeam?.constructorId || standing?.constructorId || slug(teamName) };
  });
  const driverRows = [...results.map(row => ({ id: row.driverId, name: row.driverName, abbreviation: row.abbreviation })), ...standings.drivers];
  const constructorRows = [...results.map(row => ({ id: row.constructorId, name: row.teamName })), ...standings.teams];
  const raceResults = results.filter(row => row.sessionId.endsWith('-race'));
  const stats = new Map();
  for (const result of raceResults) {
    if (!stats.has(result.driverId)) stats.set(result.driverId, { starts: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, retirements: 0 });
    const row = stats.get(result.driverId);
    if (result.status !== 'DNS') row.starts += 1;
    if (result.positionNumber === 1) row.wins += 1;
    if (result.positionNumber >= 1 && result.positionNumber <= 3) row.podiums += 1;
    if (result.status && result.status !== 'DNS') row.retirements += 1;
  }
  for (const result of results.filter(row => row.polePosition === 'True')) {
    if (!stats.has(result.driverId)) stats.set(result.driverId, { starts: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, retirements: 0 });
    stats.get(result.driverId).poles += 1;
  }
  const races = rounds.map(round => {
    const raceId = `fe-${identity.seasonKey}-r${round.round}-${round.venueSlug}`;
    return { id: raceId, seasonKey: identity.seasonKey, year: identity.year, round: round.round, date: round.date,
      name: `${humanize(round.venueSlug)} E-Prix`, code: `R${round.round}`, circuitId: round.venueSlug, sourceUrl: round.href };
  });
  const sessions = rounds.flatMap(round => {
    const raceId = `fe-${identity.seasonKey}-r${round.round}-${round.venueSlug}`;
    const hasOfficialGrid = raceResults.some(result => result.raceId === raceId && Number(result.gridPositionNumber) > 0);
    const rows = [];
    for (const session of chronologicalSessions(round.sessions)) {
      if (session.key === 'race' && hasOfficialGrid) {
        rows.push({ id: `${raceId}-starting-grid`, raceId, seasonKey: identity.seasonKey, year: identity.year,
          round: round.round, sessionNumber: rows.length + 1, code: 'grid', name: 'Starting Grid',
          isRace: 'False', cancelled: 'False', sourceUrl: session.href });
      }
      rows.push({ id: `${raceId}-${session.key}`, raceId, seasonKey: identity.seasonKey, year: identity.year,
        round: round.round, sessionNumber: rows.length + 1, code: session.key, name: session.name,
        isRace: session.key === 'race' ? 'True' : 'False', cancelled: 'False', sourceUrl: session.href });
    }
    return rows;
  });
  const gridResults = raceResults.filter(result => Number(result.gridPositionNumber) > 0).map(result => ({
    ...result, sessionId: `${result.raceId}-starting-grid`, positionDisplayOrder: Number(result.gridPositionNumber),
    positionNumber: Number(result.gridPositionNumber), points: '', polePosition: 'False', status: '', laps: '', time: '',
    timeMillis: '', gapMillis: '', gapLaps: '', fastestLap: 'False', fastestLapNumber: '', fastestLapTime: '',
    fastestLapTimeMillis: '', averageSpeed: ''
  }));
  const entries = unique(raceResults.map(result => ({ raceId: result.raceId, seasonKey: identity.seasonKey, year: identity.year,
    round: result.round, driverNumber: result.driverNumber, driverId: result.driverId, constructorId: result.constructorId,
    chassisId: chassisForSeason(identity.seasonNumber).id, engineId: '' })), row => `${row.raceId}:${row.driverId}`);
  const drivers = mergeEntities(driverRows.filter(row => row.id).map(row => ({ id: row.id, name: row.name, ...driverNameParts(row.name),
    abbreviation: row.abbreviation || '', countryCode: ISO3_TO_ISO2[row.nationalityCode] || '',
    nationalityCode: row.nationalityCode || '', pictureUrl: row.pictureUrl || '' })), CONTRACT.files.drivers);
  const constructors = mergeEntities(constructorRows.filter(row => row.id).map(row => ({ id: row.id, name: row.name,
    abbreviation: row.abbreviation || '', countryCode: row.countryCode || '', pictureUrl: row.pictureUrl || '' })), CONTRACT.files.constructors);
  const driverStandings = standings.drivers.map(row => ({ seasonKey: identity.seasonKey, year: identity.year, positionNumber: row.positionNumber,
    driverId: row.id, constructorId: row.constructorId, points: row.points, championshipWon: row.positionNumber === 1 ? 'True' : 'False',
    ...(stats.get(row.id) || { starts: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, retirements: 0 }) }));
  return {
    seasons: [{ ...identity, sourceUrl: `${ORIGIN}/en/results-and-standings?season=${identity.seasonNumber}` }], drivers, constructors,
    manufacturers: standings.manufacturers.map(row => ({ id: row.id, name: row.name, pictureUrl: row.pictureUrl || '' })),
    chassis: [chassisForSeason(identity.seasonNumber)], engines: [],
    circuits: unique(rounds.map(round => ({ id: round.venueSlug, name: humanize(round.venueSlug), countryCode: round.country,
      placeName: humanize(round.venueSlug), type: '', direction: '', lengthMeters: '', turns: '', layoutUrl: '', sourceUrl: round.href })), row => row.id), races, sessions, entries,
    results: [...results, ...gridResults].map(({ driverName, abbreviation, teamName, gridPositionNumber, ...row }) => row), driverStandings,
    constructorStandings: standings.teams.map(row => ({ seasonKey: identity.seasonKey, year: identity.year, positionNumber: row.positionNumber,
      constructorId: row.id, points: row.points, championshipWon: row.positionNumber === 1 ? 'True' : 'False' })),
    manufacturerStandings: standings.manufacturers.map(row => ({ seasonKey: identity.seasonKey, year: identity.year, positionNumber: row.positionNumber,
      manufacturerId: row.id, points: row.points, championshipWon: row.positionNumber === 1 ? 'True' : 'False' }))
  };
}

function driverMatch(official, candidates, driversById) {
  const nameKey = normalized(official.name);
  let matches = candidates.filter(result => normalized(driversById.get(result.driverId)?.name) === nameKey);
  if (matches.length === 1) return matches[0];
  if (official.abbreviation) {
    matches = candidates.filter(result => String(driversById.get(result.driverId)?.abbreviation || '').toUpperCase() === official.abbreviation.toUpperCase());
    if (matches.length === 1) return matches[0];
  }
  const lastName = normalized(official.lastName).replace(/(?:jr|sr)$/, '');
  matches = candidates.filter(result => normalized(driversById.get(result.driverId)?.lastName).replace(/(?:jr|sr)$/, '') === lastName);
  return matches.length === 1 ? matches[0] : null;
}

function entityMatch(official, entities) {
  const nameKey = normalized(official.name);
  let matches = [...entities.values()].filter(entity => normalized(entity.name) === nameKey);
  if (matches.length === 1) return matches[0];
  const lastName = normalized(official.lastName).replace(/(?:jr|sr)$/, '');
  matches = [...entities.values()].filter(entity =>
    normalized(entity.lastName).replace(/(?:jr|sr)$/, '') === lastName &&
    normalized(entity.firstName).charAt(0) === normalized(official.firstName).charAt(0));
  return matches.length === 1 ? matches[0] : null;
}

function officialStatus(value, hasPosition) {
  if (hasPosition) return '';
  const status = String(value || '').toUpperCase();
  if (/NOT STARTED|DNS/.test(status)) return 'DNS';
  if (/DISQUAL|DSQ|EXCLUDED/.test(status)) return 'DSQ';
  return 'NC';
}

function racePoints(position) {
  return [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][Number(position) - 1] || 0;
}

function enrichDataset(dataset, officialData) {
  dataset.chassis ||= [chassisForSeason(dataset.seasons[0]?.seasonNumber)];
  dataset.engines ||= [];
  const driversById = new Map(dataset.drivers.map(driver => [driver.id, driver]));
  const constructorsById = new Map(dataset.constructors.map(constructor => [constructor.id, constructor]));
  const racesByRound = new Map(dataset.races.map(race => [Number(race.round), race]));
  const entryCountryByTeam = new Map((officialData.entries || []).map(entry => [normalized(entry.teamName), entry.teamNationalityCode]));
  for (const constructor of dataset.constructors) {
    const nationalityCode = entryCountryByTeam.get(normalized(constructor.name));
    if (nationalityCode) constructor.countryCode = ISO3_TO_ISO2[nationalityCode] || constructor.countryCode;
    constructor.countryCode ||= TEAM_COUNTRY_FALLBACKS[constructor.id] || TEAM_COUNTRY_FALLBACKS[slug(constructor.name)] || '';
  }
  let matchedResults = 0, fastestLaps = 0, qualifyingResults = 0, polePositions = 0;
  for (const [round, officialRows] of officialData.classifications) {
    const race = racesByRound.get(Number(round));
    if (!race) continue;
    const raceSession = dataset.sessions.find(session => session.raceId === race.id && session.isRace === 'True');
    if (!raceSession) continue;
    const raceResults = dataset.results.filter(result => result.raceId === race.id && result.sessionId === raceSession.id);
    const matches = [];
    for (const [officialIndex, official] of officialRows.entries()) {
      let result = driverMatch(official, raceResults, driversById);
      if (!result) {
        let driver = entityMatch(official, driversById) || driversById.get(DRIVER_ID_ALIASES[slug(official.name)]);
        if (!driver) {
          let id = slug(official.name), suffix = 2;
          while (driversById.has(id)) id = `${slug(official.name)}-${suffix++}`;
          driver = { id, name: official.name, ...driverNameParts(official.name), abbreviation: official.abbreviation || '',
            countryCode: ISO3_TO_ISO2[official.nationalityCode] || '', nationalityCode: official.nationalityCode || '', pictureUrl: '' };
          dataset.drivers.push(driver);
          driversById.set(driver.id, driver);
        }
        let constructor = [...constructorsById.values()].find(item => normalized(item.name) === normalized(official.teamName));
        if (!constructor) {
          let id = slug(official.teamName), suffix = 2;
          while (constructorsById.has(id)) id = `${slug(official.teamName)}-${suffix++}`;
          constructor = { id, name: official.teamName, abbreviation: '',
            countryCode: ISO3_TO_ISO2[official.teamNationalityCode] || '', pictureUrl: '' };
          dataset.constructors.push(constructor);
          constructorsById.set(constructor.id, constructor);
        }
        result = {
          sessionId: raceSession.id, raceId: race.id, seasonKey: race.seasonKey, year: race.year, round: race.round,
          positionDisplayOrder: officialIndex + 1, positionNumber: official.positionNumber,
          points: racePoints(official.positionNumber), polePosition: 'False',
          status: officialStatus(official.status, official.positionNumber), driverNumber: official.driverNumber,
          driverId: driver.id, constructorId: constructor.id, laps: official.laps,
          time: official.positionNumber === 1 ? official.time : official.gap || official.time,
          timeMillis: official.positionNumber === 1 ? parseTimeMillis(official.time) : '',
          gapMillis: /^\+/.test(official.gap) ? parseTimeMillis(official.gap) : '', gapLaps: parseGapLaps(official.gap),
          fastestLap: 'False', fastestLapNumber: official.fastestLapNumber, fastestLapTime: official.fastestLapTime,
          fastestLapTimeMillis: official.fastestLapTimeMillis, averageSpeed: official.averageSpeed
        };
        dataset.results.push(result);
        raceResults.push(result);
        dataset.entries.push({ raceId: race.id, seasonKey: race.seasonKey, year: race.year, round: race.round,
          driverNumber: official.driverNumber, driverId: driver.id, constructorId: constructor.id,
          chassisId: chassisForSeason(dataset.seasons[0]?.seasonNumber).id, engineId: official.vehicle ? slug(official.vehicle) : '' });
      }
      matches.push({ official, result });
      result.positionDisplayOrder = officialIndex + 1;
      result.positionNumber = official.positionNumber;
      result.status = officialStatus(official.status, official.positionNumber);
      result.driverNumber = official.driverNumber;
      result.laps = official.laps;
      result.time = official.positionNumber === 1 ? official.time : official.gap || official.time;
      result.timeMillis = official.positionNumber === 1 ? parseTimeMillis(official.time) : '';
      result.gapMillis = /^\+/.test(official.gap) ? parseTimeMillis(official.gap) : '';
      result.gapLaps = parseGapLaps(official.gap);
      result.fastestLapNumber = official.fastestLapNumber;
      result.fastestLapTime = official.fastestLapTime;
      result.fastestLapTimeMillis = official.fastestLapTimeMillis;
      result.averageSpeed = official.averageSpeed;
      const driver = driversById.get(result.driverId);
      if (driver) {
        driver.abbreviation ||= official.abbreviation;
        driver.nationalityCode = official.nationalityCode || driver.nationalityCode;
        driver.countryCode = ISO3_TO_ISO2[driver.nationalityCode] || driver.countryCode;
      }
      const constructor = constructorsById.get(result.constructorId);
      if (constructor && official.teamNationalityCode) {
        constructor.countryCode = ISO3_TO_ISO2[official.teamNationalityCode] || constructor.countryCode;
      }
      const engineId = official.vehicle ? slug(official.vehicle) : '';
      if (engineId && !dataset.engines.some(engine => engine.id === engineId)) dataset.engines.push({ id: engineId, name: official.vehicle });
      const entry = dataset.entries.find(candidate => candidate.raceId === race.id && candidate.driverId === result.driverId);
      if (entry) {
        entry.chassisId = chassisForSeason(dataset.seasons[0]?.seasonNumber).id;
        entry.engineId = engineId || entry.engineId || '';
      }
      matchedResults += 1;
    }
    const matchedRaceResults = new Set(matches.map(({ result }) => result));
    const unmatchedRaceResults = raceResults.filter(result => !matchedRaceResults.has(result))
      .sort((first, second) => Number(second.laps || 0) - Number(first.laps || 0)
        || Number(first.positionDisplayOrder || Infinity) - Number(second.positionDisplayOrder || Infinity)
        || String(first.driverId).localeCompare(String(second.driverId)));
    unmatchedRaceResults.forEach((result, index) => {
      result.positionDisplayOrder = officialRows.length + index + 1;
    });
    raceResults.forEach(result => { result.fastestLap = 'False'; });
    const eligible = matches.filter(({ official }) => official.fastestLapTimeMillis !== '' && !/disqual/i.test(official.status));
    if (eligible.length) {
      const fastest = eligible.reduce((best, item) => item.official.fastestLapTimeMillis < best.official.fastestLapTimeMillis ? item : best);
      fastest.result.fastestLap = 'True';
      fastestLaps += 1;
    }
    const seasonNumber = Number(dataset.seasons[0]?.seasonNumber);
    const pointEligible = seasonNumber <= 3 ? eligible : eligible.filter(({ official }) => official.positionNumber >= 1 && official.positionNumber <= 10);
    if (pointEligible.length) {
      const awarded = pointEligible.reduce((best, item) => item.official.fastestLapTimeMillis < best.official.fastestLapTimeMillis ? item : best);
      if (!awarded.result.points) awarded.result.points = racePoints(awarded.result.positionNumber);
      if (!dataset.results.some(result => result === awarded.result && result.points > racePoints(result.positionNumber))) {
        awarded.result.points = Number(awarded.result.points || 0) + (seasonNumber <= 2 ? 2 : 1);
      }
    }
    const numberByDriver = new Map(matches.map(({ official, result }) => [result.driverId, official.driverNumber]));
    for (const result of dataset.results.filter(result => result.raceId === race.id)) {
      result.driverNumber ||= numberByDriver.get(result.driverId) || '';
    }
    for (const entry of dataset.entries.filter(entry => entry.raceId === race.id)) {
      entry.driverNumber ||= numberByDriver.get(entry.driverId) || '';
    }
  }
  for (const [round, metadata] of (officialData.circuits || new Map())) {
    const race = racesByRound.get(Number(round));
    const circuit = race && dataset.circuits.find(candidate => candidate.id === race.circuitId);
    if (!circuit) continue;
    circuit.lengthMeters = metadata.lengthMeters || circuit.lengthMeters || '';
    circuit.turns = metadata.turns || CIRCUIT_TURNS[circuit.id] || circuit.turns || '';
    circuit.type = PERMANENT_CIRCUITS.has(circuit.id) ? 'Race Circuit' : 'Street Circuit';
    circuit.direction = metadata.direction || circuit.direction || '';
    circuit.layoutUrl = metadata.layoutUrl || circuit.layoutUrl || '';
  }
  const chassisId = chassisForSeason(dataset.seasons[0]?.seasonNumber).id;
  for (const entry of dataset.entries) entry.chassisId ||= chassisId;
  for (const [round, officialRows] of (officialData.qualifying || new Map())) {
    const race = racesByRound.get(Number(round));
    if (!race) continue;
    let qualifyingSession = dataset.sessions.find(session => session.raceId === race.id && /^qualifying(?: session)?$/i.test(session.name))
      || dataset.sessions.find(session => session.raceId === race.id && /qualif/i.test(session.name));
    const raceSession = dataset.sessions.find(session => session.raceId === race.id && session.isRace === 'True');
    if (!raceSession) continue;
    if (!qualifyingSession) {
      const raceSessions = dataset.sessions.filter(session => session.raceId === race.id);
      const nextSession = chronologicalSessions(raceSessions).find(session => /grid|race/i.test(`${session.code} ${session.name}`));
      const sessionNumber = Number(nextSession?.sessionNumber) || raceSessions.length + 1;
      for (const session of raceSessions) {
        if (Number(session.sessionNumber) >= sessionNumber) session.sessionNumber = Number(session.sessionNumber) + 1;
      }
      qualifyingSession = {
        id: `${race.id}-qualifying`, raceId: race.id, seasonKey: race.seasonKey, year: race.year, round: race.round,
        sessionNumber, code: 'qualifying', name: 'Qualifying', startTimeUtc: '', endTimeUtc: '', isRace: 'False',
        cancelled: 'False', sourceUrl: `${race.sourceUrl}&session=qualifying`
      };
      dataset.sessions.push(qualifyingSession);
    }
    const raceResults = dataset.results.filter(result => result.sessionId === raceSession.id);
    const existing = dataset.results.filter(result => result.sessionId === qualifyingSession.id);
    existing.forEach(result => { result.polePosition = 'False'; });
    for (const [officialIndex, official] of officialRows.entries()) {
      const raceResult = driverMatch(official, raceResults, driversById);
      if (!raceResult) continue;
      let result = existing.find(candidate => candidate.driverId === raceResult.driverId);
      if (!result) {
        result = {
          sessionId: qualifyingSession.id, raceId: race.id, seasonKey: race.seasonKey, year: race.year, round: race.round,
          positionDisplayOrder: officialIndex + 1, positionNumber: official.positionNumber, points: '', polePosition: 'False',
          status: officialStatus('', official.positionNumber), driverNumber: official.driverNumber || raceResult.driverNumber,
          driverId: raceResult.driverId, constructorId: raceResult.constructorId, laps: official.laps,
          time: official.time, timeMillis: official.timeMillis, gapMillis: /^\+/.test(official.gap) ? parseTimeMillis(official.gap) : '',
          gapLaps: '', fastestLap: 'False', fastestLapNumber: official.fastestLapNumber,
          fastestLapTime: official.time, fastestLapTimeMillis: official.timeMillis, averageSpeed: official.averageSpeed
        };
        dataset.results.push(result);
        existing.push(result);
      } else {
        result.positionDisplayOrder = officialIndex + 1;
        result.positionNumber = official.positionNumber;
        result.driverNumber ||= official.driverNumber || raceResult.driverNumber;
        result.laps = official.laps;
        result.time = official.time;
        result.timeMillis = official.timeMillis;
        result.gapMillis = /^\+/.test(official.gap) ? parseTimeMillis(official.gap) : '';
        result.gapLaps = parseGapLaps(official.gap);
        result.fastestLapNumber = official.fastestLapNumber;
        result.fastestLapTime = official.time;
        result.fastestLapTimeMillis = official.timeMillis;
        result.averageSpeed = official.averageSpeed;
      }
      if (Number(official.positionNumber) === 1) {
        result.polePosition = 'True';
        polePositions += 1;
      }
      qualifyingResults += 1;
    }
  }
  for (const [round, archivedSessions] of (officialData.schedule || new Map())) {
    const race = racesByRound.get(Number(round));
    const timeZone = race && CIRCUIT_TIME_ZONES[race.circuitId];
    if (!race || !timeZone) continue;
    for (const archived of archivedSessions) {
      const session = dataset.sessions.find(candidate => candidate.raceId === race.id && candidate.code === archived.code)
        || (archived.code === 'qualifying' ? dataset.sessions.find(candidate => candidate.raceId === race.id && /qualif/i.test(candidate.name)) : null)
        || (archived.code.startsWith('free-practice-')
          ? dataset.sessions.find(candidate => candidate.raceId === race.id && candidate.code === 'free-practice') : null);
      if (session) session.startTimeUtc = zonedLocalToUtc(archived.localDateTime, timeZone);
    }
  }
  const fastestByDriver = new Map();
  for (const result of dataset.results.filter(result => result.fastestLap === 'True' && result.sessionId.endsWith('-race'))) {
    fastestByDriver.set(result.driverId, (fastestByDriver.get(result.driverId) || 0) + 1);
  }
  const polesByDriver = new Map();
  for (const result of dataset.results.filter(result => result.polePosition === 'True')) {
    polesByDriver.set(result.driverId, (polesByDriver.get(result.driverId) || 0) + 1);
  }
  const raceResults = dataset.results.filter(result => dataset.sessions.some(session => session.id === result.sessionId && session.isRace === 'True'));
  const statsByDriver = new Map();
  for (const result of raceResults) {
    if (!statsByDriver.has(result.driverId)) statsByDriver.set(result.driverId, { starts: 0, wins: 0, podiums: 0, retirements: 0 });
    const stats = statsByDriver.get(result.driverId);
    if (result.status !== 'DNS') stats.starts += 1;
    if (Number(result.positionNumber) === 1) stats.wins += 1;
    if (Number(result.positionNumber) >= 1 && Number(result.positionNumber) <= 3) stats.podiums += 1;
    if (result.status && result.status !== 'DNS') stats.retirements += 1;
  }
  for (const standing of dataset.driverStandings) {
    Object.assign(standing, statsByDriver.get(standing.driverId) || { starts: 0, wins: 0, podiums: 0, retirements: 0 });
    standing.fastestLaps = fastestByDriver.get(standing.driverId) || 0;
    standing.poles = polesByDriver.get(standing.driverId) || 0;
  }
  const numberByDriver = new Map(dataset.results.filter(result => result.driverNumber)
    .map(result => [result.driverId, result.driverNumber]));
  for (const result of dataset.results) result.driverNumber ||= numberByDriver.get(result.driverId) || '';
  for (const entry of dataset.entries) entry.driverNumber ||= numberByDriver.get(entry.driverId) || '';
  return { officialRounds: officialData.classifications.size, matchedResults, fastestLaps, qualifyingResults, polePositions };
}

function fillDerivedGaps(dataset) {
  let driverAliases = 0;
  for (const key of ['entries', 'results', 'driverStandings']) {
    for (const row of dataset[key]) {
      const canonicalId = DRIVER_ID_ALIASES[row.driverId];
      if (canonicalId) {
        row.driverId = canonicalId;
        driverAliases += 1;
      }
    }
  }
  dataset.drivers = mergeEntities(dataset.drivers.map(driver => ({ ...driver, id: DRIVER_ID_ALIASES[driver.id] || driver.id })), CONTRACT.files.drivers);
  let circuitCountries = 0;
  for (const circuit of dataset.circuits) {
    if (!circuit.countryCode && CIRCUIT_COUNTRY_FALLBACKS[circuit.id]) {
      circuit.countryCode = CIRCUIT_COUNTRY_FALLBACKS[circuit.id];
      circuitCountries += 1;
    }
    const metadata = CIRCUIT_METADATA_FALLBACKS[circuit.id];
    if (metadata) {
      circuit.lengthMeters ||= metadata.lengthMeters || '';
      circuit.turns ||= metadata.turns || '';
      circuit.direction ||= metadata.direction || '';
      if (!circuit.layoutUrl) circuit.sourceUrl = metadata.sourceUrl || circuit.sourceUrl;
    }
    circuit.turns ||= CIRCUIT_TURNS[circuit.id] || '';
    circuit.type ||= PERMANENT_CIRCUITS.has(circuit.id) ? 'Race Circuit' : 'Street Circuit';
  }
  const engineCountsByTeamSeason = new Map();
  for (const entry of dataset.entries.filter(row => row.engineId)) {
    const key = `${entry.seasonKey}:${entry.constructorId}`;
    if (!engineCountsByTeamSeason.has(key)) engineCountsByTeamSeason.set(key, new Map());
    const counts = engineCountsByTeamSeason.get(key);
    counts.set(entry.engineId, (counts.get(entry.engineId) || 0) + 1);
  }
  for (const entry of dataset.entries.filter(row => !row.engineId)) {
    const counts = engineCountsByTeamSeason.get(`${entry.seasonKey}:${entry.constructorId}`);
    if (counts) entry.engineId = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }
  const latestEntryByDriverSeason = new Map();
  for (const entry of dataset.entries) {
    if (!entry.constructorId) continue;
    const key = `${entry.seasonKey || entry.year}:${entry.driverId}`;
    const current = latestEntryByDriverSeason.get(key);
    if (!current || Number(entry.round) >= Number(current.round)) latestEntryByDriverSeason.set(key, entry);
  }
  let standingTeams = 0;
  for (const standing of dataset.driverStandings) {
    if (standing.constructorId) continue;
    const entry = latestEntryByDriverSeason.get(`${standing.seasonKey || standing.year}:${standing.driverId}`);
    if (entry?.constructorId) {
      standing.constructorId = entry.constructorId;
      standingTeams += 1;
    }
  }
  return { driverAliases, circuitCountries, standingTeams };
}

function validateDataset(dataset) {
  const errors = [];
  const ids = key => new Set((dataset[key] || []).map(row => row.id));
  const driverIds = ids('drivers'), constructorIds = ids('constructors'), chassisIds = ids('chassis'), engineIds = ids('engines'),
    raceIds = ids('races'), sessionIds = ids('sessions');
  const duplicate = (key, values) => values.length - new Set(values).size && errors.push(`Duplicate ${key}.`);
  duplicate('driver IDs', dataset.drivers.map(row => row.id));
  duplicate('constructor IDs', dataset.constructors.map(row => row.id));
  duplicate('race IDs', dataset.races.map(row => row.id));
  duplicate('session IDs', dataset.sessions.map(row => row.id));
  duplicate('session/driver results', dataset.results.map(row => `${row.sessionId}:${row.driverId}`));
  for (const row of dataset.entries) {
    if (!raceIds.has(row.raceId)) errors.push(`Entry ${row.raceId}/${row.driverId} references missing race ${row.raceId}.`);
    if (!driverIds.has(row.driverId)) errors.push(`Entry ${row.raceId}/${row.driverId} references missing driver ${row.driverId}.`);
    if (!constructorIds.has(row.constructorId)) errors.push(`Entry ${row.raceId}/${row.driverId} references missing team ${row.constructorId || '(blank)'}.`);
    if (row.chassisId && !chassisIds.has(row.chassisId)) errors.push(`Entry ${row.raceId}/${row.driverId} references missing chassis ${row.chassisId}.`);
    if (row.engineId && !engineIds.has(row.engineId)) errors.push(`Entry ${row.raceId}/${row.driverId} references missing powertrain ${row.engineId}.`);
  }
  for (const row of dataset.results) {
    if (!sessionIds.has(row.sessionId)) errors.push(`Result ${row.sessionId}/${row.driverId} references missing session ${row.sessionId}.`);
    if (!driverIds.has(row.driverId)) errors.push(`Result ${row.sessionId}/${row.driverId} references missing driver ${row.driverId}.`);
    if (!constructorIds.has(row.constructorId)) errors.push(`Result ${row.sessionId}/${row.driverId} references missing team ${row.constructorId || '(blank)'}.`);
  }
  if (!dataset.races.length || !dataset.results.length || !dataset.driverStandings.length || !dataset.constructorStandings.length) errors.push('Required Formula E collections are empty.');
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  return { races: dataset.races.length, sessions: dataset.sessions.length, results: dataset.results.length, drivers: dataset.drivers.length,
    teams: dataset.constructors.length, chassis: (dataset.chassis || []).length, engines: (dataset.engines || []).length, manufacturers: dataset.manufacturers.length };
}

async function collectSeason(browser, seasonNumber) {
  const indexPage = await preparePage(browser);
  const indexedRounds = await collectRoundIndex(indexPage, seasonNumber);
  await indexPage.close();
  const roundPages = await Promise.all(indexedRounds.map(async round => {
    const page = await preparePage(browser);
    try { return await collectRoundSessions(page, seasonNumber, round); } finally { await page.close(); }
  }));
  const identity = seasonIdentity(seasonNumber, roundPages.map(round => round.date));
  const work = roundPages.flatMap(round => round.sessions.map(session => ({ round, session })));
  const classifications = [];
  for (let offset = 0; offset < work.length; offset += 4) {
    const batch = await Promise.all(work.slice(offset, offset + 4).map(async ({ round, session }) => {
      const page = await preparePage(browser);
      try {
        return await collectClassification(page, round, session, identity);
      } catch (error) {
        throw new Error(`Failed to collect round ${round.round} ${session.name} (${session.href}): ${error.message}`, { cause: error });
      } finally { await page.close(); }
    }));
    classifications.push(...batch);
    console.log(`Season ${seasonNumber}: collected ${Math.min(offset + 4, work.length)}/${work.length} classifications.`);
  }
  const standings = {};
  for (const type of ['drivers', 'teams', 'manufacturers']) {
    const page = await preparePage(browser);
    try { standings[type] = await collectStandings(page, seasonNumber, type, type !== 'manufacturers' || seasonNumber === 11); } finally { await page.close(); }
  }
  const dataset = buildDataset(identity, roundPages, classifications, standings);
  console.log(`${identity.label} Formula E: ${JSON.stringify(validateDataset(dataset))}`);
  return dataset;
}

async function main() {
  const seasonNumbers = seasonNumbersFromArguments();
  const outputDirectory = argumentValue('output') ? path.resolve(argumentValue('output')) : DATA_DIR;
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed'), executablePath: findBrowserExecutable() });
  let dataset;
  try {
    const seasons = [];
    for (const seasonNumber of seasonNumbers) {
      const checkpoint = loadCheckpoint(seasonNumber);
      let season = checkpoint?.dataset;
      if (season) console.log(`Season ${seasonNumber}: loaded checkpoint v${checkpoint.version}.`);
      else {
        season = await collectSeason(browser, seasonNumber);
      }
      if (checkpoint?.version !== CACHE_VERSION || !season.results.some(result => result.driverNumber && result.fastestLapTimeMillis)) {
        const [officialData, images] = await Promise.all([collectOfficialSeasonData(seasonNumber), collectSeasonImages(browser, seasonNumber)]);
        const enrichment = enrichDataset(season, officialData);
        applySeasonImages(season, images);
        console.log(`Season ${seasonNumber}: official FIA enrichment ${JSON.stringify(enrichment)}.`);
        validateDataset(season);
        saveCheckpoint(seasonNumber, season);
      }
      const derived = fillDerivedGaps(season);
      if (derived.circuitCountries || derived.standingTeams) console.log(`Season ${seasonNumber}: filled deterministic gaps ${JSON.stringify(derived)}.`);
      seasons.push(season);
    }
    dataset = mergeDatasets(seasons);
    fillDerivedGaps(dataset);
    validateDataset(dataset);
  } finally {
    await browser.close();
  }
  if (!process.argv.includes('--dry-run')) {
    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const [key, rows] of Object.entries(dataset)) writeCsv(key, rows, outputDirectory);
  }
  console.log(`Wrote ${dataset.seasons.length} Formula E season${dataset.seasons.length === 1 ? '' : 's'}${process.argv.includes('--dry-run') ? ' (dry run)' : ''}.`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });

module.exports = { applySeasonImages, buildDataset, chassisForSeason, chronologicalSessions, collectSeason, csvValue, driverNameParts,
  enrichDataset, fillDerivedGaps, mergeDatasets, mergeEntities, normalizePosition, parseGapLaps, parseTimeMillis, seasonIdentity,
  seasonNumbersFromArguments, slug, validateDataset, zonedLocalToUtc };
