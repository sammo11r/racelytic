const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const pool = require('../backend/db');
const DATA_DIR = path.join(__dirname, '../data');
const SERIES = process.argv.includes('--series=f2') ? 'f2' : 'f3';
const TABLE_PREFIX = `${SERIES}_`;

function readCsv(name) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(DATA_DIR, name))
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function numeric(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

async function main() {
  const [races, entries, sessions, results, drivers, constructors, chassis, engines, driverStandings, constructorStandings] = await Promise.all([
    readCsv(`${SERIES}db-races.csv`), readCsv(`${SERIES}db-entries.csv`), readCsv(`${SERIES}db-sessions.csv`),
    readCsv(`${SERIES}db-session-results.csv`), readCsv(`${SERIES}db-drivers.csv`), readCsv(`${SERIES}db-constructors.csv`),
    readCsv(`${SERIES}db-chassis.csv`), readCsv(`${SERIES}db-engines.csv`),
    readCsv(`${SERIES}db-season-driver-standings.csv`), readCsv(`${SERIES}db-season-constructor-standings.csv`)
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const raceById = new Map(races.map(race => [race.id, race]));
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  const driverIds = new Set(drivers.map(driver => driver.id));
  const constructorIds = new Set(constructors.map(constructor => constructor.id));
  const chassisIds = new Set(chassis.map(item => item.id));
  const engineIds = new Set(engines.map(item => item.id));
  const entriesByRace = new Map();
  const sessionsByRace = new Map();
  const resultSessions = new Set();
  const resultKeys = new Set();
  const duplicates = [];
  const entryCombinations = new Set();
  const orphans = {
    entryRaces: 0, entryDrivers: 0, entryConstructors: 0, entryChassis: 0, entryEngines: 0,
    sessions: 0, resultSessions: 0, resultDrivers: 0, resultConstructors: 0,
    standingDrivers: 0, standingConstructors: 0
  };
  let blankEntries = 0;

  for (const entry of entries) {
    if (!entry.raceId || !entry.driverId || !entry.constructorId) blankEntries += 1;
    if (!raceById.has(entry.raceId)) orphans.entryRaces += 1;
    if (!driverIds.has(entry.driverId)) orphans.entryDrivers += 1;
    if (!constructorIds.has(entry.constructorId)) orphans.entryConstructors += 1;
    if (entry.chassisId && !chassisIds.has(entry.chassisId)) orphans.entryChassis += 1;
    if (entry.engineId && !engineIds.has(entry.engineId)) orphans.entryEngines += 1;
    entryCombinations.add(`${entry.raceId}:${entry.driverId}:${entry.constructorId}`);
    increment(entriesByRace, entry.raceId);
  }
  for (const session of sessions) {
    if (!raceById.has(session.raceId)) orphans.sessions += 1;
    if (!sessionsByRace.has(session.raceId)) sessionsByRace.set(session.raceId, []);
    sessionsByRace.get(session.raceId).push(session);
  }
  for (const result of results) {
    if (!sessionById.has(result.sessionId)) orphans.resultSessions += 1;
    if (!driverIds.has(result.driverId)) orphans.resultDrivers += 1;
    if (!constructorIds.has(result.constructorId)) orphans.resultConstructors += 1;
    resultSessions.add(result.sessionId);
    const key = `${result.sessionId}:${result.driverId}`;
    if (resultKeys.has(key)) duplicates.push(key);
    resultKeys.add(key);
  }
  for (const standing of driverStandings) if (!driverIds.has(standing.driverId)) orphans.standingDrivers += 1;
  for (const standing of constructorStandings) if (!constructorIds.has(standing.constructorId)) orphans.standingConstructors += 1;

  const missingResultEntryCombinations = new Set(results.flatMap(result => {
    const key = `${result.raceId}:${result.driverId}:${result.constructorId}`;
    return entryCombinations.has(key) ? [] : [key];
  }));
  const duplicateDriverStandings = [...driverStandings.reduce((groups, standing) => {
    increment(groups, `${standing.year}:${standing.driverId}`);
    return groups;
  }, new Map()).entries()].filter(([, count]) => count > 1);

  const resultStats = new Map();
  for (const result of results) {
    const session = sessionById.get(result.sessionId);
    const key = `${result.year}:${result.driverId}`;
    if (!resultStats.has(key)) resultStats.set(key, { starts: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, retirements: 0 });
    const stats = resultStats.get(key);
    if (String(result.polePosition).toLowerCase() === 'true') stats.poles += 1;
    if (!session || String(session.isRace).toLowerCase() !== 'true' || String(session.cancelled).toLowerCase() === 'true') continue;
    const status = String(result.status || '').toUpperCase();
    const started = !['DNS', 'DNQ', 'DNPQ'].includes(status);
    if (started) stats.starts += 1;
    if (Number(result.positionNumber) === 1) stats.wins += 1;
    if (Number(result.positionNumber) >= 1 && Number(result.positionNumber) <= 3) stats.podiums += 1;
    if (String(result.fastestLap).toLowerCase() === 'true') stats.fastestLaps += 1;
    if (started && status && !['CLA', 'FINISHED'].includes(status)) stats.retirements += 1;
  }
  const metricFields = ['starts', 'wins', 'podiums', 'poles', 'fastestLaps', 'retirements'];
  const staleStandingMetrics = driverStandings.filter(standing => {
    const stats = resultStats.get(`${standing.year}:${standing.driverId}`) || Object.fromEntries(metricFields.map(field => [field, 0]));
    return metricFields.some(field => numeric(standing[field]) !== stats[field]);
  });

  const years = [...new Set(races.map(race => Number(race.year)))].sort((a, b) => a - b);
  const summary = years.map(year => {
    const yearRaces = races.filter(race => Number(race.year) === year);
    const yearSessions = sessions.filter(session => Number(session.year) === year);
    const yearResults = results.filter(result => Number(result.year) === year);
    const yearDriverStandings = driverStandings.filter(standing => Number(standing.year) === year);
    const row = {
      year,
      races: yearRaces.length,
      completed: yearRaces.filter(race => race.date && race.date <= today).length,
      racesWithEntries: yearRaces.filter(race => entriesByRace.has(race.id)).length,
      sessions: yearSessions.length,
      raceSessions: yearSessions.filter(session => String(session.isRace).toLowerCase() === 'true' && String(session.cancelled).toLowerCase() !== 'true').length,
      classifiedSessions: yearSessions.filter(session => resultSessions.has(session.id)).length,
      results: yearResults.length,
      standingDrivers: yearDriverStandings.length,
      standingPoints: yearDriverStandings.reduce((sum, standing) => sum + numeric(standing.points), 0),
      resultPoints: yearResults.reduce((sum, result) => sum + numeric(result.points), 0)
    };
    return { ...row, pointsDelta: row.standingPoints - row.resultPoints };
  });

  const missingCompletedRaceData = races.filter(race => race.date && race.date <= today).flatMap(race => {
    const scheduledRaceSessions = (sessionsByRace.get(race.id) || []).filter(session =>
      String(session.isRace).toLowerCase() === 'true'
    );
    const raceSessions = scheduledRaceSessions.filter(session => String(session.cancelled).toLowerCase() !== 'true');
    const classified = raceSessions.filter(session => resultSessions.has(session.id));
    const explicitlyCancelledWeekend = scheduledRaceSessions.length > 0 && raceSessions.length === 0;
    return (explicitlyCancelledWeekend || raceSessions.length > 0) && classified.length === raceSessions.length ? [] : [{
      year: race.year, round: race.round, name: race.name,
      raceSessions: raceSessions.length, classifiedRaceSessions: classified.length
    }];
  });
  const missingCompletedEntries = races
    .filter(race => race.date && race.date <= today && !entriesByRace.has(race.id))
    .map(race => ({ year: race.year, round: race.round, name: race.name }));
  const futureRacesWithoutEntries = races
    .filter(race => race.date && race.date > today && !entriesByRace.has(race.id))
    .map(race => ({ year: race.year, round: race.round, name: race.name }));
  const completeYears = new Set(years.filter(year => {
    const seasonRaces = races.filter(race => Number(race.year) === year);
    return seasonRaces.length && seasonRaces.every(race => race.date && race.date <= today) &&
      !missingCompletedRaceData.some(race => Number(race.year) === year);
  }));
  const championFlagErrors = [
    ...driverStandings.filter(standing => completeYears.has(Number(standing.year)) && Number(standing.positionNumber) === 1 && String(standing.championshipWon).toLowerCase() !== 'true'),
    ...constructorStandings.filter(standing => completeYears.has(Number(standing.year)) && Number(standing.positionNumber) === 1 && String(standing.championshipWon).toLowerCase() !== 'true')
  ];

  const databaseCounts = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM ${TABLE_PREFIX}sessions) AS sessions,
      (SELECT COUNT(*) FROM ${TABLE_PREFIX}session_results) AS results,
      (SELECT COUNT(*) FROM ${TABLE_PREFIX}season_driver_standings) AS driverStandings,
      (SELECT COUNT(*) FROM ${TABLE_PREFIX}season_constructor_standings) AS constructorStandings
  `);
  const expectedCounts = { sessions: sessions.length, results: results.length, driverStandings: driverStandings.length, constructorStandings: constructorStandings.length };
  const actualCounts = Object.fromEntries(Object.entries(databaseCounts[0]).map(([key, value]) => [key, Number(value)]));
  const databaseMatchesCsv = Object.keys(expectedCounts).every(key => expectedCounts[key] === actualCounts[key]);

  console.log(`${SERIES.toUpperCase()} data audit`);
  console.table(summary);
  console.log('Integrity:', { duplicateResults: duplicates.length, ...orphans });
  console.log('Entry coverage:', { blankEntries, missingResultEntryCombinations: missingResultEntryCombinations.size });
  console.log('Standings integrity:', {
    duplicateDriverSeasons: duplicateDriverStandings.length,
    staleMetricRows: staleStandingMetrics.length,
    missingChampionFlags: championFlagErrors.length
  });
  console.log('Completed races missing classifications:', missingCompletedRaceData);
  console.log('Completed races missing entries:', missingCompletedEntries);
  console.log('Future races awaiting entries:', futureRacesWithoutEntries);
  console.log('Database matches CSV row counts:', databaseMatchesCsv, { expected: expectedCounts, actual: actualCounts });

  const structuralErrors = duplicates.length || Object.values(orphans).some(Boolean) || blankEntries ||
    missingResultEntryCombinations.size || duplicateDriverStandings.length || staleStandingMetrics.length ||
    championFlagErrors.length || missingCompletedRaceData.length || missingCompletedEntries.length || !databaseMatchesCsv;
  if (structuralErrors) process.exitCode = 1;
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
