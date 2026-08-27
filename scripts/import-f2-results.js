const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

let pool;

function databasePool() {
  if (!pool) pool = require('../backend/db');
  return pool;
}

const DATA_DIR = path.join(__dirname, '../data');
const RESULTS_PATH = path.join(DATA_DIR, 'f2db-session-results.csv');
const SESSIONS_PATH = path.join(DATA_DIR, 'f2db-sessions.csv');
const RACES_PATH = path.join(DATA_DIR, 'f2db-races.csv');
const ENTRIES_PATH = path.join(DATA_DIR, 'f2db-entries.csv');
const COLUMNS = [
  'sessionId', 'raceId', 'year', 'round', 'positionDisplayOrder',
  'positionNumber', 'points', 'polePosition', 'status', 'driverNumber', 'driverId', 'constructorId',
  'laps', 'time', 'timeMillis', 'gapMillis', 'gapLaps', 'fastestLap',
  'fastestLapNumber', 'fastestLapTime', 'fastestLapTimeMillis', 'averageSpeed'
];

function argumentValue(name) {
  const argument = process.argv.slice(2).find(value => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : null;
}

const selectedYear = argumentValue('year');
const delayMilliseconds = Number(argumentValue('delay') || 350);
const csvOnly = process.argv.includes('--csv-only');
const manifestOnly = process.argv.includes('--manifest-only');
const cachePath = argumentValue('cache');
const transportMode = (argumentValue('transport') || 'auto').toLowerCase();
const configuredBrowserPath = argumentValue('browser-path') || process.env.MOTORSPORTSTATS_BROWSER;
const headlessBrowser = process.argv.includes('--headless');
const requestedSessionKinds = new Set(
  (argumentValue('sessions') || 'race,qualifying,grid,practice')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);

for (const kind of requestedSessionKinds) {
  if (!['race', 'qualifying', 'grid', 'practice'].includes(kind)) {
    throw new Error(`Unsupported session kind: ${kind}`);
  }
}

if (!['auto', 'browser', 'http'].includes(transportMode)) {
  throw new Error(`Unsupported transport: ${transportMode}`);
}

let browser;
let browserPage;

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filePath, rows) {
  const content = [
    COLUMNS.join(','),
    ...rows.map(row => COLUMNS.map(column => csvValue(row[column])).join(','))
  ].join('\n');
  fs.writeFileSync(filePath, `${content}\n`);
}

function formatMilliseconds(value) {
  const milliseconds = Number(value || 0);
  if (!milliseconds) return '';
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const remainder = milliseconds % 1000;
  const secondsText = `${String(seconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secondsText}` : `${minutes}:${secondsText}`;
}

function classificationUrl(session, race) {
  const eventUrl = new URL(race.sourceUrl);
  const segments = eventUrl.pathname.split('/').filter(Boolean);
  const eventSlug = segments[3];
  const sessionPrefix = `fia-formula-2-championship_${session.year}_${eventSlug}_`;
  if (!session.id.startsWith(sessionPrefix)) {
    throw new Error(`Cannot map session slug for ${session.id}`);
  }
  return `${eventUrl.origin}/${segments.slice(0, 4).join('/')}/classification/${session.id.slice(sessionPrefix.length)}`;
}

function sessionKind(session) {
  if (['1', 'true'].includes(String(session.isRace).toLowerCase())) return 'race';
  if (['1', 'true'].includes(String(session.cancelled).toLowerCase()) && /race/i.test(String(session.name || ''))) {
    return 'race';
  }
  if (/qualif/i.test(String(session.name || ''))) return 'qualifying';
  if (/starting grid/i.test(String(session.name || ''))) return 'grid';
  if (/practice/i.test(String(session.name || ''))) return 'practice';
  return null;
}

function selectClassificationSessions(sessions, year, sessionKinds = requestedSessionKinds) {
  return sessions.filter(session =>
    sessionKinds.has(sessionKind(session)) &&
    (!year || session.year === year) &&
    !['1', 'true'].includes(String(session.cancelled).toLowerCase())
  );
}

function parsePageData(html, url) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`No page data found at ${url}`);
  const pageData = JSON.parse(match[1]);
  const classification = pageData.props?.pageProps?.sessionAllClassification;
  if (!classification?.details?.length) throw new Error(`No classification found at ${url}`);
  return classification.details;
}

async function fetchClassification(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'Racelytic F2 results importer/1.0'
        }
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return parsePageData(await response.text(), url);
    } catch (error) {
      lastError = error;
      if ([401, 403, 429].includes(error.status)) break;
      if (attempt < 3) await wait(1000 * attempt);
    }
  }
  throw new Error(`${url}: ${lastError.message}`);
}

function browserCandidates() {
  return [
    configuredBrowserPath,
    path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe')
  ].filter(Boolean);
}

function findBrowserExecutable(candidates = browserCandidates()) {
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (executable) return executable;
  throw new Error(
    'Chrome or Edge was not found. Set MOTORSPORTSTATS_BROWSER or pass --browser-path=C:\\path\\to\\browser.exe.'
  );
}

async function ensureBrowserPage() {
  if (browserPage) return browserPage;
  const { chromium } = require('playwright-core');
  browser = await chromium.launch({
    executablePath: findBrowserExecutable(),
    headless: headlessBrowser
  });
  browserPage = await browser.newPage();
  await browserPage.route('**/*', route => {
    const resourceType = route.request().resourceType();
    return ['font', 'image', 'media'].includes(resourceType) ? route.abort() : route.continue();
  });
  return browserPage;
}

async function fetchClassificationWithBrowser(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const page = await ensureBrowserPage();
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      if (response && !response.ok()) throw new Error(`HTTP ${response.status()}`);
      return parsePageData(await page.content(), url);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(1000 * attempt);
    }
  }
  throw new Error(`${url}: browser load failed: ${lastError.message}`);
}

async function loadClassification(url) {
  if (transportMode === 'browser') return fetchClassificationWithBrowser(url);
  if (transportMode === 'http') return fetchClassification(url);
  try {
    return await fetchClassification(url);
  } catch (error) {
    if (!browserPage) console.log(`HTTP access unavailable (${error.message}); switching to installed browser.`);
    return fetchClassificationWithBrowser(url);
  }
}

async function closeBrowser() {
  if (!browser) return;
  await browser.close();
  browser = null;
  browserPage = null;
}

function resultRow(session, race, result, displayOrder, entry) {
  const bestLap = result.bestLap || {};
  const sourcePosition = Number(result.finishPosition);
  const classifiedPosition = sourcePosition > 0 && sourcePosition < 1000 ? sourcePosition : '';
  return {
    sessionId: session.id,
    raceId: race.id,
    year: session.year,
    round: session.round,
    positionDisplayOrder: displayOrder,
    positionNumber: classifiedPosition,
    status: result.classifiedStatus || (sourcePosition >= 1000 ? 'NC' : ''),
    driverNumber: result.carNumber || entry?.driverNumber || '',
    driverId: entry?.driverId || result.drivers?.[0]?.slug || '',
    constructorId: entry?.constructorId || result.team?.slug || '',
    laps: result.laps ?? '',
    time: formatMilliseconds(result.time),
    timeMillis: result.time || '',
    gapMillis: result.gap?.timeToLead || 0,
    gapLaps: result.gap?.lapsToLead || 0,
    fastestLap: bestLap.fastest ? 'True' : 'False',
    fastestLapNumber: bestLap.lap || '',
    fastestLapTime: formatMilliseconds(bestLap.time),
    fastestLapTimeMillis: bestLap.time || '',
    averageSpeed: result.avgLapSpeed || ''
  };
}

function applyExistingAwards(row, awards) {
  row.points = awards?.points || '';
  row.polePosition = awards?.polePosition || '';
  if (awards && awards.fastestLap !== '') row.fastestLap = awards.fastestLap;
  return row;
}

function databaseValue(value) {
  if (value === '') return null;
  if (value === 'True') return 1;
  if (value === 'False') return 0;
  return value;
}

async function updateDatabase(sessionIds, rows, cancelledSessionIds = []) {
  const connection = await databasePool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('ALTER TABLE f2_session_results ADD COLUMN IF NOT EXISTS points DECIMAL(20,6) NULL');
    await connection.query('ALTER TABLE f2_session_results ADD COLUMN IF NOT EXISTS polePosition TINYINT(1) NULL');
    for (let offset = 0; offset < sessionIds.length; offset += 100) {
      const batch = sessionIds.slice(offset, offset + 100);
      await connection.query(
        `DELETE FROM f2_session_results WHERE sessionId IN (${batch.map(() => '?').join(',')})`,
        batch
      );
    }
    if (cancelledSessionIds.length) {
      await connection.query(
        `UPDATE f2_sessions SET cancelled = 1 WHERE id IN (${cancelledSessionIds.map(() => '?').join(',')})`,
        cancelledSessionIds
      );
    }
    const columnsSql = COLUMNS.map(column => `\`${column}\``).join(',');
    const placeholders = COLUMNS.map(() => '?').join(',');
    const values = rows.map(row => COLUMNS.map(column => databaseValue(row[column])));
    for (let offset = 0; offset < values.length; offset += 1000) {
      await connection.batch(
        `INSERT INTO f2_session_results (${columnsSql}) VALUES (${placeholders})`,
        values.slice(offset, offset + 1000)
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const [existingResults, sessions, races, entries] = await Promise.all([
    readCsv(RESULTS_PATH), readCsv(SESSIONS_PATH), readCsv(RACES_PATH), readCsv(ENTRIES_PATH)
  ]);
  const racesById = new Map(races.map(race => [race.id, race]));
  const entriesByRaceAndNumber = new Map(entries.map(entry => [`${entry.raceId}:${entry.driverNumber}`, entry]));
  const today = new Date().toISOString().slice(0, 10);
  const completedWeekend = session => {
    const race = racesById.get(session.raceId);
    const completedOn = race?.endDate || race?.date;
    return completedOn && completedOn < today;
  };
  const matchingSessions = sessions.filter(session =>
    requestedSessionKinds.has(sessionKind(session)) &&
    (!selectedYear || session.year === selectedYear) &&
    completedWeekend(session)
  );
  const classificationSessions = selectClassificationSessions(
    sessions,
    selectedYear,
    requestedSessionKinds
  ).filter(completedWeekend);
  if (!matchingSessions.length) throw new Error('No matching F2 classification sessions found.');

  if (manifestOnly) {
    const manifest = classificationSessions.map(session => {
      const race = racesById.get(session.raceId);
      if (!race) throw new Error(`Race not found for ${session.id}`);
      return { sessionId: session.id, url: classificationUrl(session, race) };
    });
    const manifestPath = path.join(DATA_DIR, 'f2-results-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${manifest.length} sessions to ${manifestPath}.`);
    return;
  }

  const classificationCache = cachePath
    ? JSON.parse(fs.readFileSync(path.resolve(cachePath), 'utf8'))
    : null;

  const importedRows = [];
  const existingAwards = new Map(
    existingResults.map(row => [`${row.sessionId}:${row.driverId}`, {
      points: row.points || '',
      polePosition: row.polePosition || '',
      fastestLap: row.fastestLap || ''
    }])
  );
  for (const [index, session] of classificationSessions.entries()) {
    const race = racesById.get(session.raceId);
    if (!race) throw new Error(`Race not found for ${session.id}`);
    const url = classificationUrl(session, race);
    process.stdout.write(`[${index + 1}/${classificationSessions.length}] ${session.year} round ${session.round} ${session.name}... `);
    const classification = classificationCache?.[session.id] || await loadClassification(url);
    if (!classification?.length) throw new Error(`No cached classification found for ${session.id}`);
    classification.forEach((result, resultIndex) => {
      const entry = entriesByRaceAndNumber.get(`${race.id}:${result.carNumber}`);
      const row = resultRow(session, race, result, resultIndex + 1, entry);
      const awards = existingAwards.get(`${row.sessionId}:${row.driverId}`);
      importedRows.push(applyExistingAwards(row, awards));
    });
    console.log(`${classification.length} drivers`);
    if (!classificationCache && index < classificationSessions.length - 1) await wait(delayMilliseconds);
  }

  const replacedSessionIds = new Set(matchingSessions.map(session => session.id));
  const cancelledSessionIds = matchingSessions
    .filter(session => ['1', 'true'].includes(String(session.cancelled).toLowerCase()))
    .map(session => session.id);
  const mergedRows = existingResults
    .filter(row => !replacedSessionIds.has(row.sessionId))
    .concat(importedRows);
  const sessionOrder = new Map(sessions.map((session, index) => [session.id, index]));
  mergedRows.sort((first, second) =>
    (sessionOrder.get(first.sessionId) ?? Number.MAX_SAFE_INTEGER) -
      (sessionOrder.get(second.sessionId) ?? Number.MAX_SAFE_INTEGER) ||
    Number(first.positionDisplayOrder) - Number(second.positionDisplayOrder)
  );
  writeCsv(RESULTS_PATH, mergedRows);

  if (!csvOnly) await updateDatabase([...replacedSessionIds], importedRows, cancelledSessionIds);
  console.log(`Imported ${importedRows.length} complete results across ${classificationSessions.length} sessions.`);
  console.log(csvOnly ? 'CSV updated; database update skipped.' : 'CSV and database updated.');
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeBrowser();
      if (pool) await pool.end();
    });
}

module.exports = {
  applyExistingAwards,
  classificationUrl,
  closeBrowser,
  findBrowserExecutable,
  formatMilliseconds,
  loadClassification,
  parsePageData,
  resultRow,
  selectClassificationSessions,
  sessionKind
};
