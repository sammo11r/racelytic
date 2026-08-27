const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

let pool;

function databasePool() {
  if (!pool) pool = require('../backend/db');
  return pool;
}

const YEAR = 2026;
const CSV_ONLY = process.argv.includes('--csv-only');
const APPLY = process.argv.includes('--apply') || CSV_ONLY;
const DATA_DIR = path.join(__dirname, '../data');
const CACHE_DIR = path.join(DATA_DIR, '.f3-cache');

const FILES = {
  races: path.join(DATA_DIR, 'f3db-races.csv'),
  entries: path.join(DATA_DIR, 'f3db-entries.csv'),
  drivers: path.join(DATA_DIR, 'f3db-drivers.csv'),
  constructors: path.join(DATA_DIR, 'f3db-constructors.csv'),
  sessions: path.join(DATA_DIR, 'f3db-sessions.csv'),
  results: path.join(DATA_DIR, 'f3db-session-results.csv'),
  driverStandings: path.join(DATA_DIR, 'f3db-season-driver-standings.csv'),
  constructorStandings: path.join(DATA_DIR, 'f3db-season-constructor-standings.csv')
};

const SESSION_COLUMNS = [
  'id', 'raceId', 'year', 'round', 'sessionNumber', 'code', 'name',
  'startTimeUtc', 'endTimeUtc', 'isRace', 'cancelled'
];
const RESULT_COLUMNS = [
  'sessionId', 'raceId', 'year', 'round', 'positionDisplayOrder',
  'positionNumber', 'points', 'polePosition', 'status', 'driverNumber', 'driverId',
  'constructorId', 'laps', 'time', 'timeMillis', 'gapMillis', 'gapLaps',
  'fastestLap', 'fastestLapNumber', 'fastestLapTime', 'fastestLapTimeMillis',
  'averageSpeed'
];
const DRIVER_STANDING_COLUMNS = [
  'year', 'positionNumber', 'driverId', 'constructorId', 'points',
  'championshipWon', 'starts', 'wins', 'podiums', 'poles', 'fastestLaps', 'retirements'
];
const CONSTRUCTOR_STANDING_COLUMNS = [
  'year', 'positionNumber', 'constructorId', 'points', 'championshipWon'
];
const RESULT_OVERRIDES = new Map([
  ['fia-formula-3-championship_2026_melbourne_race:louis-sharp', { points: 0, fastestLap: 'False' }],
  ['fia-formula-3-championship_2026_melbourne_race:james-wharton', { points: 1, fastestLap: 'True' }]
]);

function applyResultOverrides(rows) {
  rows.forEach(row => Object.assign(row, RESULT_OVERRIDES.get(`${row.sessionId}:${row.driverId}`) || {}));
  return rows;
}

const EVENTS = [
  { round: 1, slug: 'melbourne', idSlug: 'melbourne' },
  { round: 2, slug: 'monaco', idSlug: 'monaco' },
  { round: 3, slug: 'barcelona-catalunya', idSlug: 'catalunya' },
  { round: 4, slug: 'spielberg', idSlug: 'spielberg' },
  { round: 5, slug: 'silverstone', idSlug: 'silverstone' },
  { round: 6, slug: 'spa-francorchamps', idSlug: 'spa-francorchamps' },
  { round: 7, slug: 'budapest', idSlug: 'budapest' },
  { round: 8, slug: 'monza', idSlug: 'monza' },
  { round: 9, slug: 'madrid', idSlug: 'madrid' }
];

const SESSION_DEFINITIONS = [
  { path: 'session-classifications', suffix: 'free-practice', number: 1, name: 'Free Practice', isRace: false },
  { path: 'qualifying-classification', suffix: 'qualifying', number: 2, name: 'Qualifying', isRace: false },
  { path: 'sprint-race-classification', suffix: 'race', number: 4, name: 'Race', isRace: true },
  { path: 'feature-race-classification', suffix: 'race-2', number: 6, name: 'Race', isRace: true }
];

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

function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filePath, columns, rows) {
  const content = [
    columns.join(','),
    ...rows.map(row => columns.map(column => csvValue(row[column])).join(','))
  ].join('\n');
  fs.writeFileSync(filePath, `${content}\n`);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, number) => String.fromCodePoint(Number(number)))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[øØ]/g, 'o')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseNumber(value) {
  const number = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(number) ? number : '';
}

function timeToMilliseconds(value) {
  const parts = String(value || '').trim().split(':').map(Number);
  if (!parts.length || parts.some(part => !Number.isFinite(part))) return '';
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return Math.round(seconds * 1000);
}

function gapToMilliseconds(value) {
  const text = String(value || '').trim();
  if (!text || /lap/i.test(text)) return 0;
  const number = Number(text.replace(/^\+/, '').replace(',', '.'));
  return Number.isFinite(number) ? Math.round(number * 1000) : 0;
}

function gapLaps(value) {
  const match = String(value || '').match(/(\d+)\s*lap/i);
  return match ? Number(match[1]) : 0;
}

function parseClassificationTables(html, url) {
  const tables = [];
  for (const tableMatch of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const tableHtml = tableMatch[1];
    const headerMatch = tableHtml.match(/<tr[^>]*class="[^"]*table-header[^"]*"[^>]*>([\s\S]*?)<\/tr>/i);
    if (!headerMatch) continue;
    const headers = [...headerMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => decodeHtml(match[1]));
    if (!headers.some(header => /^(pos|position)$/i.test(header)) || !headers.some(header => /^(nr|no|number)$/i.test(header))) continue;
    const rows = [];
    for (const rowMatch of tableHtml.matchAll(/<tr[^>]*class="[^"]*competitor[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cellHtml = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
      const values = cellHtml.map(decodeHtml);
      const row = {};
      headers.forEach((header, index) => { row[header] = values[index] || ''; });
      const driverCell = cellHtml[headers.findIndex(header => /^driver$/i.test(header))] || '';
      const driverName = driverCell.match(/class="name"[^>]*>([\s\S]*?)<\/div>/i);
      row.Driver = driverName ? decodeHtml(driverName[1]) : row.Driver;
      rows.push(row);
    }
    if (rows.length) tables.push({ headers, rows });
  }
  if (!tables.length) throw new Error(`No classification table found at ${url}`);
  return tables;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Racelytic F3 FIA importer/1.0' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${url}: ${lastError.message}`);
}

function classificationUrl(event, session) {
  return `https://www.fia.com/events/fia-formula-3-championship/season-${YEAR}/${event.slug}/${session.path}`;
}

function resultFromOfficial(row, displayOrder, session, race, entry) {
  const positionText = row.Pos || row.Position || '';
  const positionNumber = /^\d+$/.test(positionText) ? Number(positionText) : '';
  const driverNumber = String(row.Nr || row.No || row.Number || '').replace(/\D/g, '');
  const bestLapTime = row['Best lap'] || row['Best Lap'] || '';
  const gapFirst = row['Gap first'] || row['Gap First'] || '';
  const officialPoints = parseNumber(row.Points);
  const isQualifying = session.isQualifying;
  return {
    sessionId: session.id,
    raceId: race.id,
    year: YEAR,
    round: race.round,
    positionDisplayOrder: displayOrder,
    positionNumber,
    points: officialPoints === '' && isQualifying && positionNumber === 1 ? 2 : officialPoints,
    polePosition: isQualifying && positionNumber === 1 ? 'True' : 'False',
    status: positionNumber ? 'CLA' : (positionText || 'NC').toUpperCase(),
    driverNumber,
    driverId: entry?.driverId || '',
    constructorId: entry?.constructorId || '',
    laps: parseNumber(row.Laps),
    time: row.Time || '',
    timeMillis: displayOrder === 1 ? timeToMilliseconds(row.Time) : '',
    gapMillis: gapToMilliseconds(gapFirst),
    gapLaps: gapLaps(gapFirst),
    fastestLap: 'False',
    fastestLapNumber: parseNumber(row['Best lap lap'] || row['Best Lap Lap']),
    fastestLapTime: bestLapTime,
    fastestLapTimeMillis: timeToMilliseconds(bestLapTime),
    averageSpeed: parseNumber(row.Kph)
  };
}

function markFastestLap(results) {
  const candidates = results.filter(result =>
    result.fastestLapTimeMillis !== '' &&
    Number(result.positionNumber) >= 1 &&
    Number(result.positionNumber) <= 10 &&
    String(result.status || '').toUpperCase() !== 'DSQ'
  );
  if (!candidates.length) return;
  const fastest = candidates.reduce((best, result) => result.fastestLapTimeMillis < best.fastestLapTimeMillis ? result : best);
  fastest.fastestLap = 'True';
}

function parseStandingsRows(html) {
  const table = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!table) throw new Error('Official standings table was not found.');
  const rows = [];
  for (const match of table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(cell => decodeHtml(cell[1]));
    if (cells.length >= 2 && /^\d+/.test(cells[0])) rows.push(cells);
  }
  return rows;
}

function driverForStanding(label, drivers) {
  const match = label.match(/^(\d+)\s*(.+)$/);
  if (!match) return null;
  const position = Number(match[1]);
  const displayName = match[2].trim();
  const aliases = {
    gxie: 'wing-lam-gerrard-xie',
    wshin: 'michael-shin'
  };
  const aliasedId = aliases[normalized(displayName)];
  if (aliasedId) {
    const driver = drivers.find(candidate => candidate.id === aliasedId);
    if (!driver) throw new Error(`Mapped official driver was not found: ${displayName}`);
    return { position, driver };
  }
  const nameParts = displayName.split(/\s+/);
  const firstInitial = normalized(nameParts[0]).charAt(0);
  const lastName = normalized(nameParts.slice(1).join(' '));
  const candidates = drivers.filter(driver =>
    normalized(driver.lastName) === lastName && normalized(driver.firstName).charAt(0) === firstInitial
  );
  if (candidates.length !== 1) throw new Error(`Could not uniquely map official driver standing: ${displayName}`);
  return { position, driver: candidates[0] };
}

function constructorIdForStanding(label, constructors) {
  const match = label.match(/^(\d+)\s*(.+)$/);
  if (!match) return null;
  const position = Number(match[1]);
  const displayName = match[2].trim();
  const aliases = {
    trident: 'trident-motorsport',
    hitech: 'hitech-racing',
    damslucasoil: 'dams',
    aixracing: 'phm-racing'
  };
  const key = normalized(displayName);
  const exact = constructors.find(constructor => normalized(constructor.name) === key);
  const constructorId = exact?.id || aliases[key];
  if (!constructorId) throw new Error(`Could not map official constructor standing: ${displayName}`);
  return { position, constructorId };
}

function latestConstructor(driverId, entries) {
  return entries
    .filter(entry => entry.year === String(YEAR) && entry.driverId === driverId)
    .sort((a, b) => Number(b.round) - Number(a.round))[0]?.constructorId || '';
}

function careerStats(driverId, allResults) {
  const driverResults = allResults.filter(result => result.year === String(YEAR) && result.driverId === driverId);
  const raceResults = driverResults.filter(result => /_race(?:-2)?$/.test(result.sessionId));
  const qualifying = driverResults.filter(result => /_qualifying$/.test(result.sessionId));
  return {
    starts: raceResults.length,
    wins: raceResults.filter(result => Number(result.positionNumber) === 1).length,
    podiums: raceResults.filter(result => Number(result.positionNumber) >= 1 && Number(result.positionNumber) <= 3).length,
    poles: qualifying.filter(result => Number(result.positionNumber) === 1).length,
    fastestLaps: raceResults.filter(result => String(result.fastestLap).toLowerCase() === 'true').length,
    retirements: raceResults.filter(result => result.status && !['CLA', 'FINISHED'].includes(String(result.status).toUpperCase())).length
  };
}

function databaseValue(value) {
  if (value === '') return null;
  if (value === 'True') return 1;
  if (value === 'False') return 0;
  return value;
}

async function replaceDatabaseRows(table, columns, year, rows, connection) {
  await connection.query(`DELETE FROM ${table} WHERE year = ?`, [year]);
  if (!rows.length) return;
  const columnSql = columns.map(column => `\`${column}\``).join(',');
  const placeholders = columns.map(() => '?').join(',');
  const values = rows.map(row => columns.map(column => databaseValue(row[column])));
  await connection.batch(`INSERT INTO ${table} (${columnSql}) VALUES (${placeholders})`, values);
}

async function updateDatabase(sessions, results, driverStandings, constructorStandings) {
  const connection = await databasePool().getConnection();
  try {
    await connection.beginTransaction();
    const ids = sessions.map(session => session.id);
    await connection.query(`DELETE FROM f3_session_results WHERE sessionId IN (${ids.map(() => '?').join(',')})`, ids);
    await connection.query(`DELETE FROM f3_sessions WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    await connection.batch(
      `INSERT INTO f3_sessions (${SESSION_COLUMNS.map(column => `\`${column}\``).join(',')}) VALUES (${SESSION_COLUMNS.map(() => '?').join(',')})`,
      sessions.map(row => SESSION_COLUMNS.map(column => databaseValue(row[column])))
    );
    await connection.batch(
      `INSERT INTO f3_session_results (${RESULT_COLUMNS.map(column => `\`${column}\``).join(',')}) VALUES (${RESULT_COLUMNS.map(() => '?').join(',')})`,
      results.map(row => RESULT_COLUMNS.map(column => databaseValue(row[column])))
    );
    await replaceDatabaseRows('f3_season_driver_standings', DRIVER_STANDING_COLUMNS, YEAR, driverStandings, connection);
    await replaceDatabaseRows('f3_season_constructor_standings', CONSTRUCTOR_STANDING_COLUMNS, YEAR, constructorStandings, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const [races, entries, drivers, constructors, existingSessions, existingResults, existingDriverStandings, existingConstructorStandings] = await Promise.all([
    readCsv(FILES.races), readCsv(FILES.entries), readCsv(FILES.drivers), readCsv(FILES.constructors),
    readCsv(FILES.sessions), readCsv(FILES.results), readCsv(FILES.driverStandings), readCsv(FILES.constructorStandings)
  ]);
  const racesByRound = new Map(races.filter(race => race.year === String(YEAR)).map(race => [Number(race.round), race]));
  const entriesByRaceAndNumber = new Map(entries.map(entry => [`${entry.raceId}:${entry.driverNumber}`, entry]));
  const importedSessions = [];
  const importedResults = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const event of EVENTS) {
    const race = racesByRound.get(event.round);
    if (!race) throw new Error(`2026 race round ${event.round} was not found.`);
    if ((race.endDate || race.date) >= today) continue;
    for (const definition of SESSION_DEFINITIONS) {
      const id = `fia-formula-3-championship_${YEAR}_${event.idSlug}_${definition.suffix}`;
      const session = {
        id, raceId: race.id, year: YEAR, round: race.round, sessionNumber: definition.number,
        code: '', name: definition.name, startTimeUtc: '', endTimeUtc: '',
        isRace: definition.isRace ? 'True' : 'False', cancelled: 'False',
        isQualifying: definition.suffix === 'qualifying'
      };
      const url = classificationUrl(event, definition);
      const tables = parseClassificationTables(await fetchText(url), url);
      const officialRows = tables.reduce((largest, table) => table.rows.length > largest.length ? table.rows : largest, []);
      if (officialRows.length < 20) throw new Error(`Suspiciously short classification (${officialRows.length}) at ${url}`);
      const results = officialRows.map((row, index) => {
        const number = String(row.Nr || row.No || row.Number || '').replace(/\D/g, '');
        const entry = entriesByRaceAndNumber.get(`${race.id}:${number}`);
        if (!entry) throw new Error(`No round ${race.round} entry for car ${number} (${row.Driver}).`);
        return resultFromOfficial(row, index + 1, session, race, entry);
      });
      if (definition.isRace) markFastestLap(results);
      applyResultOverrides(results);
      importedSessions.push(session);
      importedResults.push(...results);
      console.log(`${YEAR} round ${race.round} ${definition.name}${definition.suffix === 'race-2' ? ' 2' : ''}: ${results.length} results`);
    }
  }

  const importedSessionIds = new Set(importedSessions.map(session => session.id));
  const mergedSessions = existingSessions.filter(session => !importedSessionIds.has(session.id)).concat(importedSessions);
  const mergedResults = existingResults.filter(result => !importedSessionIds.has(result.sessionId)).concat(importedResults);
  mergedSessions.sort((a, b) => Number(a.year) - Number(b.year) || Number(a.round) - Number(b.round) || Number(a.sessionNumber) - Number(b.sessionNumber));
  const sessionOrder = new Map(mergedSessions.map((session, index) => [session.id, index]));
  mergedResults.sort((a, b) => (sessionOrder.get(a.sessionId) ?? 999999) - (sessionOrder.get(b.sessionId) ?? 999999) || Number(a.positionDisplayOrder) - Number(b.positionDisplayOrder));

  const [driverStandingsHtml, constructorStandingsHtml] = await Promise.all([
    fetchText('https://www.fiaformula3.com/en/standings/2026/drivers'),
    fetchText('https://www.fiaformula3.com/en/standings/2026/teams')
  ]);
  const driverStandings = parseStandingsRows(driverStandingsHtml).map(cells => {
    const mapped = driverForStanding(cells[0], drivers);
    const points = parseNumber(cells.at(-1));
    const stats = careerStats(mapped.driver.id, mergedResults);
    return {
      year: YEAR, positionNumber: mapped.position, driverId: mapped.driver.id,
      constructorId: latestConstructor(mapped.driver.id, entries), points,
      championshipWon: 'False', ...stats
    };
  });
  const constructorStandings = parseStandingsRows(constructorStandingsHtml).map(cells => {
    const mapped = constructorIdForStanding(cells[0], constructors);
    return {
      year: YEAR, positionNumber: mapped.position, constructorId: mapped.constructorId,
      points: parseNumber(cells.at(-1)), championshipWon: 'False'
    };
  });

  const officialDriverPoints = driverStandings.reduce((sum, row) => sum + Number(row.points), 0);
  const importedPoints = mergedResults
    .filter(result => result.year === String(YEAR) || result.year === YEAR)
    .reduce((sum, row) => sum + Number(row.points || 0), 0);
  console.log(`Official driver standings: ${driverStandings.length} drivers, ${officialDriverPoints} points.`);
  console.log(`Session-result awards: ${importedPoints} points (differences can be post-event standings adjustments).`);
  console.log(`Official constructor standings: ${constructorStandings.length} teams.`);

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to update the F3 CSV files and database.');
    return;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(CACHE_DIR, `fia-2026-import-backup-${timestamp}.json`);
  fs.writeFileSync(backupPath, `${JSON.stringify({
    sessions: existingSessions.filter(row => row.year === String(YEAR)),
    results: existingResults.filter(row => row.year === String(YEAR)),
    driverStandings: existingDriverStandings.filter(row => row.year === String(YEAR)),
    constructorStandings: existingConstructorStandings.filter(row => row.year === String(YEAR))
  }, null, 2)}\n`);

  writeCsv(FILES.sessions, SESSION_COLUMNS, mergedSessions);
  writeCsv(FILES.results, RESULT_COLUMNS, mergedResults);
  writeCsv(
    FILES.driverStandings,
    DRIVER_STANDING_COLUMNS,
    existingDriverStandings.filter(row => row.year !== String(YEAR)).concat(driverStandings)
  );
  writeCsv(
    FILES.constructorStandings,
    CONSTRUCTOR_STANDING_COLUMNS,
    existingConstructorStandings.filter(row => row.year !== String(YEAR)).concat(constructorStandings)
  );
  if (!CSV_ONLY) await updateDatabase(importedSessions, importedResults, driverStandings, constructorStandings);
  console.log(`Updated F3 CSV data${CSV_ONLY ? '' : ' and database'}. Backup: ${backupPath}`);
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (pool) await pool.end();
    });
}

module.exports = {
  databaseValue,
  fetchText,
  gapLaps,
  gapToMilliseconds,
  markFastestLap,
  normalized,
  parseClassificationTables,
  parseNumber,
  parseStandingsRows,
  readCsv,
  timeToMilliseconds,
  writeCsv
};
