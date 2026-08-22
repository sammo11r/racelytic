const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_DIR = path.join(__dirname, '../data');
const ENTRY_COLUMNS = ['raceId', 'year', 'round', 'driverNumber', 'driverId', 'constructorId', 'chassisId', 'engineId'];
const RESULT_COLUMNS = [
  'sessionId', 'raceId', 'year', 'round', 'positionDisplayOrder', 'positionNumber',
  'points', 'polePosition', 'status', 'driverNumber', 'driverId', 'constructorId',
  'laps', 'time', 'timeMillis', 'gapMillis', 'gapLaps', 'fastestLap',
  'fastestLapNumber', 'fastestLapTime', 'fastestLapTimeMillis', 'averageSpeed'
];
const DRIVER_STANDING_COLUMNS = [
  'year', 'positionNumber', 'driverId', 'constructorId', 'points',
  'championshipWon', 'starts', 'wins', 'podiums', 'poles', 'fastestLaps', 'retirements'
];
const CONSTRUCTOR_STANDING_COLUMNS = ['year', 'positionNumber', 'constructorId', 'points', 'championshipWon'];

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

function truthy(value) {
  return ['1', 'true'].includes(String(value || '').toLowerCase());
}

function numeric(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function mode(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[field];
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
}

function repairEntries(entries, results) {
  const repaired = entries.filter(entry => entry.raceId && entry.driverId && entry.constructorId);
  const existing = new Set(repaired.map(entry => `${entry.raceId}:${entry.driverId}:${entry.constructorId}`));
  const resultsByCombination = new Map();
  for (const result of results) {
    if (!result.raceId || !result.driverId || !result.constructorId) continue;
    const key = `${result.raceId}:${result.driverId}:${result.constructorId}`;
    if (!resultsByCombination.has(key)) resultsByCombination.set(key, []);
    resultsByCombination.get(key).push(result);
  }

  let added = 0;
  for (const [key, combinationResults] of resultsByCombination) {
    if (existing.has(key)) continue;
    const sample = combinationResults[0];
    const templates = repaired.filter(entry =>
      entry.year === sample.year && entry.constructorId === sample.constructorId
    );
    const seasonTemplates = repaired.filter(entry => entry.year === sample.year);
    repaired.push({
      raceId: sample.raceId,
      year: sample.year,
      round: sample.round,
      driverNumber: mode(combinationResults, 'driverNumber'),
      driverId: sample.driverId,
      constructorId: sample.constructorId,
      chassisId: mode(templates, 'chassisId') || mode(seasonTemplates, 'chassisId'),
      engineId: mode(templates, 'engineId') || mode(seasonTemplates, 'engineId')
    });
    existing.add(key);
    added += 1;
  }

  repaired.sort((a, b) =>
    numeric(a.year) - numeric(b.year) || numeric(a.round) - numeric(b.round) ||
    numeric(a.driverNumber) - numeric(b.driverNumber) || a.driverId.localeCompare(b.driverId)
  );
  return { rows: repaired, added, removedBlank: entries.length - repaired.length + added };
}

function correctF2Montreal(results) {
  const sessionId = 'fia-formula-2-championship_2026_montreal_race-2';
  const finalOrder = [
    ['martinius-stenshorne', 1, 25], ['alex-dunne', 2, 18], ['gabriele-mini', 3, 15],
    ['sebastian-montoya', 4, 12], ['cian-shields', 5, 10], ['nicolas-varrone', 6, 8],
    ['colton-herta', 7, 6], ['mari-boya', 8, 4], ['kush-maini', 9, 2],
    ['noel-leon', 10, 1], ['joshua-durksen', 11, 0], ['nikola-tsolov', 12, 0],
    ['roman-bilinski', 13, 0]
  ];
  const awards = new Map(finalOrder.map(([driverId, positionNumber, points]) => [driverId, { positionNumber, points }]));
  for (const result of results) {
    if (result.sessionId !== sessionId) continue;
    const final = awards.get(result.driverId);
    if (final) {
      result.positionDisplayOrder = String(final.positionNumber);
      result.positionNumber = String(final.positionNumber);
      result.points = String(final.points);
    }
    if (result.driverId === 'nikola-tsolov') {
      result.time = '1:03:19.882';
      result.gapMillis = '11859';
    }
    if (result.driverId === 'ritomo-miyata') result.time = '55:47.074';
  }
}

function correctF3MelbourneFastestLap(results) {
  const sessionId = 'fia-formula-3-championship_2026_melbourne_race';
  for (const result of results) {
    if (result.sessionId !== sessionId) continue;
    if (result.driverId === 'louis-sharp') {
      result.points = '0';
      result.fastestLap = 'False';
    }
    if (result.driverId === 'james-wharton') {
      result.points = '1';
      result.fastestLap = 'True';
    }
  }
}

function latestConstructor(year, driverId, results, entries) {
  const result = results
    .filter(row => row.year === year && row.driverId === driverId && row.constructorId)
    .sort((a, b) => numeric(b.round) - numeric(a.round))[0];
  if (result) return result.constructorId;
  return entries
    .filter(row => row.year === year && row.driverId === driverId && row.constructorId)
    .sort((a, b) => numeric(b.round) - numeric(a.round))[0]?.constructorId || '';
}

function seasonComplete(year, races, sessions, results) {
  const today = new Date().toISOString().slice(0, 10);
  const seasonRaces = races.filter(race => race.year === year);
  if (!seasonRaces.length || seasonRaces.some(race => !race.date || race.date > today)) return false;
  const raceSessions = sessions.filter(session =>
    session.year === year && truthy(session.isRace) && !truthy(session.cancelled)
  );
  const classifiedSessions = new Set(results.map(result => result.sessionId));
  return raceSessions.length > 0 && raceSessions.every(session => classifiedSessions.has(session.id));
}

function derivedStats(year, driverId, sessionsById, results) {
  const raceResults = results.filter(result => {
    const session = sessionsById.get(result.sessionId);
    return result.year === year && result.driverId === driverId && session && truthy(session.isRace) && !truthy(session.cancelled);
  });
  const didStart = result => !['DNS', 'DNQ', 'DNPQ'].includes(String(result.status || '').toUpperCase());
  return {
    starts: raceResults.filter(didStart).length,
    wins: raceResults.filter(result => numeric(result.positionNumber) === 1).length,
    podiums: raceResults.filter(result => numeric(result.positionNumber) >= 1 && numeric(result.positionNumber) <= 3).length,
    poles: results.filter(result =>
      result.year === year && result.driverId === driverId && truthy(result.polePosition)
    ).length,
    fastestLaps: raceResults.filter(result => truthy(result.fastestLap)).length,
    retirements: raceResults.filter(result => {
      const status = String(result.status || '').toUpperCase();
      return didStart(result) && status && !['CLA', 'FINISHED'].includes(status);
    }).length
  };
}

function repairDriverStandings(standings, races, sessions, results, entries, identityFixes = new Map()) {
  const sessionsById = new Map(sessions.map(session => [session.id, session]));
  const grouped = new Map();
  for (const original of standings) {
    const identity = identityFixes.get(`${original.year}:${original.driverId}`) || original.driverId;
    const row = { ...original, driverId: identity };
    const key = `${row.year}:${row.driverId}`;
    if (!grouped.has(key)) {
      grouped.set(key, row);
      continue;
    }
    const existing = grouped.get(key);
    existing.points = String(numeric(existing.points) + numeric(row.points));
    existing.positionNumber ||= row.positionNumber;
    existing.championshipWon = truthy(existing.championshipWon) || truthy(row.championshipWon) ? 'True' : 'False';
  }

  const rows = [...grouped.values()];
  for (const row of rows) {
    row.constructorId = latestConstructor(row.year, row.driverId, results, entries);
    row.championshipWon = seasonComplete(row.year, races, sessions, results) && numeric(row.positionNumber) === 1 ? 'True' : 'False';
    Object.assign(row, derivedStats(row.year, row.driverId, sessionsById, results));
  }
  rows.sort((a, b) =>
    numeric(a.year) - numeric(b.year) ||
    (numeric(a.positionNumber) || Number.MAX_SAFE_INTEGER) - (numeric(b.positionNumber) || Number.MAX_SAFE_INTEGER) ||
    a.driverId.localeCompare(b.driverId)
  );
  return rows;
}

function repairConstructorStandings(standings, races, sessions, results) {
  return standings.map(row => ({
    ...row,
    championshipWon: seasonComplete(row.year, races, sessions, results) && numeric(row.positionNumber) === 1 ? 'True' : 'False'
  }));
}

async function repairSeries(series) {
  const file = suffix => path.join(DATA_DIR, `${series}db-${suffix}.csv`);
  const [races, entries, sessions, results, driverStandings, constructorStandings] = await Promise.all([
    readCsv(file('races')), readCsv(file('entries')), readCsv(file('sessions')), readCsv(file('session-results')),
    readCsv(file('season-driver-standings')), readCsv(file('season-constructor-standings'))
  ]);

  if (series === 'f3') {
    entries.forEach(entry => {
      if (['dallara-f3-2020', 'dallara-f3-2021'].includes(entry.chassisId)) entry.chassisId = 'dallara-f3-2019';
    });
    correctF3MelbourneFastestLap(results);
  } else {
    correctF2Montreal(results);
  }

  const repairedEntries = repairEntries(entries, results);
  const identityFixes = series === 'f2'
    ? new Map([['2026:enzo-fittipaldi', 'emerson-fanucchi-fittipaldi-jr']])
    : new Map();
  const repairedDriverStandings = repairDriverStandings(
    driverStandings, races, sessions, results, repairedEntries.rows, identityFixes
  );
  const repairedConstructorStandings = repairConstructorStandings(constructorStandings, races, sessions, results);

  const sessionOrder = new Map(sessions.map((session, index) => [session.id, index]));
  results.sort((a, b) =>
    (sessionOrder.get(a.sessionId) ?? Number.MAX_SAFE_INTEGER) -
      (sessionOrder.get(b.sessionId) ?? Number.MAX_SAFE_INTEGER) ||
    numeric(a.positionDisplayOrder) - numeric(b.positionDisplayOrder)
  );
  writeCsv(file('entries'), ENTRY_COLUMNS, repairedEntries.rows);
  writeCsv(file('session-results'), RESULT_COLUMNS, results);
  writeCsv(file('season-driver-standings'), DRIVER_STANDING_COLUMNS, repairedDriverStandings);
  writeCsv(file('season-constructor-standings'), CONSTRUCTOR_STANDING_COLUMNS, repairedConstructorStandings);
  console.log(`${series.toUpperCase()}: added ${repairedEntries.added} entries, removed ${repairedEntries.removedBlank} blank entries, wrote ${repairedDriverStandings.length} driver standings.`);
}

async function main() {
  await repairSeries('f2');
  await repairSeries('f3');
}

if (require.main === module) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = {
  correctF2Montreal,
  correctF3MelbourneFastestLap,
  derivedStats,
  repairDriverStandings,
  repairEntries
};
