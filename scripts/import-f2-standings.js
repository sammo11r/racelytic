const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { chromium } = require('playwright-core');
const { findBrowserExecutable } = require('./import-f2-results');

let pool;

function databasePool() {
  if (!pool) pool = require('../backend/db');
  return pool;
}

const DATA_DIR = path.join(__dirname, '../data');
const DRIVER_PATH = path.join(DATA_DIR, 'f2db-season-driver-standings.csv');
const CONSTRUCTOR_PATH = path.join(DATA_DIR, 'f2db-season-constructor-standings.csv');
const RESULTS_PATH = path.join(DATA_DIR, 'f2db-session-results.csv');
const DRIVER_COLUMNS = [
  'year', 'positionNumber', 'driverId', 'constructorId', 'points',
  'championshipWon', 'starts', 'wins', 'podiums', 'poles', 'fastestLaps', 'retirements'
];
const CONSTRUCTOR_COLUMNS = [
  'year', 'positionNumber', 'constructorId', 'points', 'championshipWon'
];
const RESULT_COLUMNS = [
  'sessionId', 'raceId', 'year', 'round', 'positionDisplayOrder', 'positionNumber',
  'points', 'polePosition', 'status', 'driverNumber', 'driverId', 'constructorId', 'laps', 'time',
  'timeMillis', 'gapMillis', 'gapLaps', 'fastestLap', 'fastestLapNumber',
  'fastestLapTime', 'fastestLapTimeMillis', 'averageSpeed'
];

function argumentValue(name) {
  const argument = process.argv.slice(2).find(value => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : null;
}

const selectedYear = argumentValue('year');
const delayMilliseconds = Number(argumentValue('delay') || 500);
const csvOnly = process.argv.includes('--csv-only');
const headless = process.argv.includes('--headless');

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

function slugFromHref(href, type) {
  const match = String(href || '').match(new RegExp(`/${type}/([^/]+)/`));
  return match?.[1] || null;
}

function validateStandings(rows, year, type) {
  if (!rows.length) throw new Error(`No ${type} standings found for ${year}.`);
  const ids = new Set(rows.map(row => row.id));
  const positions = new Set(rows.map(row => Number(row.positionNumber)));
  if (ids.size !== rows.length) throw new Error(`Duplicate ${type} in ${year} standings.`);
  if (positions.size !== rows.length) throw new Error(`Duplicate position in ${year} ${type} standings.`);
  for (let position = 1; position <= rows.length; position += 1) {
    if (!positions.has(position)) throw new Error(`Missing position ${position} in ${year} ${type} standings.`);
  }
  return rows;
}

function latestCompletedEvents(races, sessions, results) {
  const sessionsById = new Map(sessions.map(session => [session.id, session]));
  const completedRaceIds = new Set();
  for (const result of results) {
    const session = sessionsById.get(result.sessionId);
    if (!session) continue;
    if (!['1', 'true'].includes(String(session.isRace).toLowerCase())) continue;
    if (['1', 'true'].includes(String(session.cancelled).toLowerCase())) continue;
    completedRaceIds.add(session.raceId);
  }
  const latestByYear = new Map();
  for (const race of races) {
    if (!completedRaceIds.has(race.id)) continue;
    if (selectedYear && race.year !== selectedYear) continue;
    const current = latestByYear.get(race.year);
    if (!current || Number(race.round) > Number(current.round)) latestByYear.set(race.year, race);
  }
  return [...latestByYear.values()].sort((first, second) => Number(first.year) - Number(second.year));
}

function standingsStats(driverId, year, sessions, results) {
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  const driverResults = results.filter(result => result.year === year && result.driverId === driverId);
  const raceResults = driverResults.filter(result => {
    const session = sessionById.get(result.sessionId);
    return session && ['1', 'true'].includes(String(session.isRace).toLowerCase()) &&
      !['1', 'true'].includes(String(session.cancelled).toLowerCase());
  });
  const started = result => !['DNS', 'DNQ', 'DNPQ'].includes(String(result.status || '').toUpperCase());
  return {
    starts: raceResults.filter(started).length,
    wins: raceResults.filter(result => Number(result.positionNumber) === 1).length,
    podiums: raceResults.filter(result => Number(result.positionNumber) >= 1 && Number(result.positionNumber) <= 3).length,
    poles: driverResults.filter(result => ['1', 'true'].includes(String(result.polePosition).toLowerCase())).length,
    fastestLaps: raceResults.filter(result => ['1', 'true'].includes(String(result.fastestLap).toLowerCase())).length,
    retirements: raceResults.filter(result => {
      const status = String(result.status || '').toUpperCase();
      return started(result) && status && !['CLA', 'FINISHED'].includes(status);
    }).length
  };
}

async function extractStandings(page, type) {
  if (type === 'team') {
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('div')].find(element =>
        element.textContent.trim().toLowerCase() === 'team' &&
        String(element.className).includes('Tab-')
      );
      if (!tab) throw new Error('Team standings tab not found.');
      tab.click();
    });
    await page.waitForTimeout(1500);
  }
  return page.evaluate(entityType => {
    return [...document.querySelectorAll('table tbody tr')].flatMap(row => {
      const cells = [...row.cells];
      const positionNumber = Number(cells[0]?.innerText.trim());
      const driverLink = row.querySelector('a[href^="/driver/"]');
      const teamLink = row.querySelector('a[href^="/team/"]');
      if (!positionNumber || !teamLink || (entityType === 'driver' && !driverLink)) return [];
      if (entityType === 'team' && driverLink) return [];
      return [{
        positionNumber,
        id: (entityType === 'driver' ? driverLink : teamLink).getAttribute('href'),
        constructorHref: teamLink.getAttribute('href'),
        points: Number(cells.at(-2)?.innerText.trim() || 0),
        racePoints: cells.slice(2, -2).map(cell => {
          const match = cell.innerText.trim().match(/^-?\d+(?:\.\d+)?/);
          return match ? Number(match[0]) : null;
        }),
        racePoles: cells.slice(2, -2).map(cell => /\bPP\b/i.test(cell.innerText)),
        raceFastestLaps: cells.slice(2, -2).map(cell => /\bFL\b/i.test(cell.innerText))
      }];
    });
  }, type);
}

async function scrapeEvent(page, race, raceSessions) {
  const standingsUrl = race.sourceUrl.replace(/\/info\/?$/, '/standings');
  await page.goto(standingsUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const rejectConsent = page.getByRole('button', { name: 'Do not consent' });
  if (await rejectConsent.isVisible()) await rejectConsent.click();
  await page.waitForTimeout(5000);
  const driverRows = validateStandings(
    (await extractStandings(page, 'driver')).map(row => ({
      ...row,
      id: slugFromHref(row.id, 'driver'),
      constructorId: slugFromHref(row.constructorHref, 'team')
    })),
    race.year,
    'driver'
  );
  for (const row of driverRows) {
    if (row.racePoints.length < raceSessions.length) {
      throw new Error(
        `${race.year} ${row.id} has ${row.racePoints.length} points cells for ${raceSessions.length} race sessions.`
      );
    }
    row.racePoints = row.racePoints.slice(0, raceSessions.length);
    row.racePoles = row.racePoles.slice(0, raceSessions.length);
    row.raceFastestLaps = row.raceFastestLaps.slice(0, raceSessions.length);
  }
  const constructorRows = validateStandings(
    (await extractStandings(page, 'team')).map(row => ({
      ...row,
      id: slugFromHref(row.id, 'team')
    })),
    race.year,
    'team'
  );
  return { driverRows, constructorRows };
}

async function replaceDatabaseRows(table, columns, years, rows) {
  const connection = await databasePool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `DELETE FROM \`${table}\` WHERE year IN (${years.map(() => '?').join(',')})`,
      years
    );
    const sql = `INSERT INTO \`${table}\` (${columns.map(column => `\`${column}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
    await connection.batch(sql, rows.map(row => columns.map(column => databaseValue(row[column]))));
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function databaseValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (String(value).toLowerCase() === 'true') return 1;
  if (String(value).toLowerCase() === 'false') return 0;
  return value;
}

async function updateDatabasePoints(pointRows) {
  if (!pointRows.length) return;
  const connection = await databasePool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('ALTER TABLE f2_session_results ADD COLUMN IF NOT EXISTS points DECIMAL(20,6) NULL');
    await connection.query('ALTER TABLE f2_session_results ADD COLUMN IF NOT EXISTS polePosition TINYINT(1) NULL');
    await connection.batch(
      'UPDATE f2_session_results SET points = ?, polePosition = ?, fastestLap = ? WHERE sessionId = ? AND driverId = ?',
      pointRows.map(row => [row.points, row.polePosition, row.fastestLap, row.sessionId, row.driverId])
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const [existingDrivers, existingConstructors, races, sessions, results] = await Promise.all([
    readCsv(DRIVER_PATH), readCsv(CONSTRUCTOR_PATH), readCsv(path.join(DATA_DIR, 'f2db-races.csv')),
    readCsv(path.join(DATA_DIR, 'f2db-sessions.csv')), readCsv(RESULTS_PATH)
  ]);
  const events = latestCompletedEvents(races, sessions, results);
  if (!events.length) throw new Error('No completed F2 seasons or rounds found.');
  const importedDrivers = [];
  const importedConstructors = [];
  const importedPoints = [];
  const racesById = new Map(races.map(race => [race.id, race]));
  const finalRoundByYear = new Map();
  races.forEach(race => finalRoundByYear.set(
    race.year,
    Math.max(Number(finalRoundByYear.get(race.year) || 0), Number(race.round))
  ));
  const browser = await chromium.launch({
    executablePath: findBrowserExecutable(),
    headless
  });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route =>
      ['font', 'image', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue()
    );
    for (const [index, race] of events.entries()) {
      process.stdout.write(`[${index + 1}/${events.length}] ${race.year} round ${race.round} standings... `);
      const raceSessions = sessions
        .filter(session => {
          const sessionRace = racesById.get(session.raceId);
          return session.year === race.year &&
            (
              ['1', 'true'].includes(String(session.isRace).toLowerCase()) ||
              (
                ['1', 'true'].includes(String(session.cancelled).toLowerCase()) &&
                /race/i.test(String(session.name || ''))
              )
            ) &&
            sessionRace && Number(sessionRace.round) <= Number(race.round);
        })
        .sort((first, second) =>
          Number(first.round) - Number(second.round) || Number(first.sessionNumber) - Number(second.sessionNumber)
        );
      const standings = await scrapeEvent(page, race, raceSessions);
      const seasonComplete = Number(race.round) === Number(finalRoundByYear.get(race.year));
      standings.driverRows.forEach(row => {
        const stats = standingsStats(row.id, race.year, sessions, results);
        importedDrivers.push({
          year: race.year,
          positionNumber: row.positionNumber,
          driverId: row.id,
          constructorId: row.constructorId,
          points: row.points,
          championshipWon: seasonComplete && row.positionNumber === 1 ? 'True' : 'False',
          ...stats
        });
        row.racePoints.forEach((points, index) => {
          if (points === null) return;
          importedPoints.push({
            sessionId: raceSessions[index].id,
            driverId: row.id,
            points,
            polePosition: row.racePoles[index] ? 1 : 0,
            fastestLap: row.raceFastestLaps[index] ? 1 : 0
          });
        });
      });
      standings.constructorRows.forEach(row => importedConstructors.push({
        year: race.year,
        positionNumber: row.positionNumber,
        constructorId: row.id,
        points: row.points,
        championshipWon: seasonComplete && row.positionNumber === 1 ? 'True' : 'False'
      }));
      console.log(`${standings.driverRows.length} drivers, ${standings.constructorRows.length} teams`);
      if (index < events.length - 1) await new Promise(resolve => setTimeout(resolve, delayMilliseconds));
    }
  } finally {
    await browser.close();
  }

  const importedYears = new Set(events.map(race => race.year));
  const driverRows = existingDrivers.filter(row => !importedYears.has(row.year)).concat(importedDrivers);
  const constructorRows = existingConstructors.filter(row => !importedYears.has(row.year)).concat(importedConstructors);
  const importedPointMap = new Map(
    importedPoints.map(row => [`${row.sessionId}:${row.driverId}`, row])
  );
  const resultRows = results.map(row => {
    const awards = importedPointMap.get(`${row.sessionId}:${row.driverId}`);
    return {
      ...row,
      points: awards ? awards.points : (row.points || ''),
      polePosition: awards ? (awards.polePosition ? 'True' : 'False') : (row.polePosition || ''),
      fastestLap: awards ? (awards.fastestLap ? 'True' : 'False') : (row.fastestLap || '')
    };
  });
  writeCsv(DRIVER_PATH, DRIVER_COLUMNS, driverRows);
  writeCsv(CONSTRUCTOR_PATH, CONSTRUCTOR_COLUMNS, constructorRows);
  writeCsv(RESULTS_PATH, RESULT_COLUMNS, resultRows);
  if (!csvOnly) {
    const years = [...importedYears];
    await replaceDatabaseRows('f2_season_driver_standings', DRIVER_COLUMNS, years, importedDrivers);
    await replaceDatabaseRows('f2_season_constructor_standings', CONSTRUCTOR_COLUMNS, years, importedConstructors);
    await updateDatabasePoints(importedPoints);
  }
  console.log(`Imported complete standings for ${importedYears.size} F2 seasons.`);
  console.log(csvOnly ? 'CSV updated; database update skipped.' : 'CSV and database updated.');
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

module.exports = { databaseValue, latestCompletedEvents, slugFromHref, standingsStats, validateStandings };
