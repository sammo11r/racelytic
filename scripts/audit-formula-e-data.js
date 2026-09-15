const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const contract = require('../data/formula-e-data-contract.json');
const { validateDataset } = require('./collect-formula-e-data');

const DATA_DIR = path.join(__dirname, '../data');
const FILE_NAMES = Object.freeze({
  seasons: 'fedb-seasons.csv', drivers: 'fedb-drivers.csv', constructors: 'fedb-constructors.csv',
  chassis: 'fedb-chassis.csv', engines: 'fedb-engines.csv', manufacturers: 'fedb-manufacturers.csv',
  circuits: 'fedb-circuits.csv', races: 'fedb-races.csv',
  sessions: 'fedb-sessions.csv', entries: 'fedb-entries.csv', results: 'fedb-session-results.csv',
  driverStandings: 'fedb-season-driver-standings.csv', constructorStandings: 'fedb-season-constructor-standings.csv',
  manufacturerStandings: 'fedb-season-manufacturer-standings.csv'
});

function readCsv(filename) {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) throw new Error(`Missing Formula E dataset file: ${filename}`);
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(file).pipe(csv()).on('data', row => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
  });
}

function assertColumns(key, rows) {
  if (!rows.length) return;
  const missing = contract.files[key].filter(column => !(column in rows[0]));
  if (missing.length) throw new Error(`${FILE_NAMES[key]} is missing columns: ${missing.join(', ')}`);
}

async function audit() {
  const dataset = Object.fromEntries(await Promise.all(Object.entries(FILE_NAMES).map(async ([key, filename]) => [key, await readCsv(filename)])));
  for (const [key, rows] of Object.entries(dataset)) assertColumns(key, rows);
  const summary = validateDataset(dataset);
  const seasonKeys = new Set(dataset.seasons.map(row => row.seasonKey));
  for (const key of ['races', 'sessions', 'entries', 'results', 'driverStandings', 'constructorStandings', 'manufacturerStandings']) {
    if (dataset[key].some(row => !seasonKeys.has(row.seasonKey))) throw new Error(`${FILE_NAMES[key]} contains an unknown seasonKey.`);
  }
  for (const season of dataset.seasons) {
    const rounds = dataset.races.filter(row => row.seasonKey === season.seasonKey).map(row => Number(row.round)).sort((a, b) => a - b);
    if (rounds.some((round, index) => round !== index + 1)) throw new Error(`${season.label} Formula E rounds are incomplete or non-contiguous: ${rounds.join(', ')}`);
    const manufacturerRows = dataset.manufacturerStandings.filter(row => row.seasonKey === season.seasonKey);
    if (Number(season.seasonNumber) >= 11 && !manufacturerRows.length) throw new Error(`${season.label} Formula E manufacturer standings are empty.`);
  }
  const raceSessionIds = new Set(dataset.sessions.filter(row => row.isRace === 'True').map(row => row.id));
  const raceResults = dataset.results.filter(row => raceSessionIds.has(row.sessionId));
  const missingNumbers = [...dataset.entries, ...raceResults].filter(row => !String(row.driverNumber || '').trim());
  if (missingNumbers.length) throw new Error(`${missingNumbers.length} Formula E race entries/results have no car number.`);
  const invalidCountries = [...dataset.drivers, ...dataset.constructors]
    .filter(row => !/^[a-z]{2}$/.test(String(row.countryCode || '')));
  if (invalidCountries.length) throw new Error(`Formula E entities without a valid nationality: ${invalidCountries.map(row => row.name).join(', ')}`);
  const circuitsWithoutCountries = dataset.circuits.filter(row => !/^[a-z]{2}$/.test(String(row.countryCode || '')));
  if (circuitsWithoutCountries.length) throw new Error(`Formula E circuits without a valid country: ${circuitsWithoutCountries.map(row => row.name).join(', ')}`);
  const incompleteCircuits = dataset.circuits.filter(row => !row.type || !row.lengthMeters || !row.turns);
  if (incompleteCircuits.length) throw new Error(`Formula E circuits without dimensions/layout metadata: ${incompleteCircuits.map(row => row.name).join(', ')}`);
  const untimedSessions = dataset.sessions.filter(row => row.code !== 'grid' && !row.startTimeUtc);
  if (untimedSessions.length) throw new Error(`${untimedSessions.length} Formula E track sessions have no UTC start time.`);
  const invalidSessionTimes = dataset.sessions.filter(row => row.startTimeUtc && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(row.startTimeUtc));
  if (invalidSessionTimes.length) throw new Error(`${invalidSessionTimes.length} Formula E session timestamps are not UTC ISO values.`);
  const mislabeledDriverImages = dataset.drivers.filter(row => /(?:^|[_/-])logo(?:[_./?-]|$)/i.test(row.pictureUrl || ''));
  if (mislabeledDriverImages.length) throw new Error(`Formula E driver images point to logos: ${mislabeledDriverImages.map(row => row.name).join(', ')}`);
  const standingsWithoutTeams = dataset.driverStandings.filter(row => !row.constructorId);
  if (standingsWithoutTeams.length) throw new Error(`${standingsWithoutTeams.length} Formula E driver standings rows have no team.`);
  const chassisIds = new Set(dataset.chassis.map(row => row.id));
  const engineIds = new Set(dataset.engines.map(row => row.id));
  const incompleteVehicles = dataset.entries.filter(row => !chassisIds.has(row.chassisId) || !engineIds.has(row.engineId));
  if (incompleteVehicles.length) throw new Error(`${incompleteVehicles.length} Formula E entries have no valid chassis or powertrain.`);
  for (const race of dataset.races) {
    const session = dataset.sessions.find(row => row.raceId === race.id && row.isRace === 'True');
    const qualifyingSession = dataset.sessions.find(row => row.raceId === race.id && /qualif/i.test(`${row.code} ${row.name}`));
    const results = raceResults.filter(row => row.raceId === race.id);
    const entries = dataset.entries.filter(row => row.raceId === race.id);
    if (!session || !results.length) throw new Error(`${race.id} has no race classification.`);
    if (results.length !== entries.length) throw new Error(`${race.id} has ${results.length} race results but ${entries.length} entries.`);
    const fastest = results.filter(row => row.fastestLap === 'True');
    if (fastest.length !== 1) throw new Error(`${race.id} has ${fastest.length} fastest-lap markers.`);
    if (!fastest[0].fastestLapTimeMillis || !fastest[0].fastestLapNumber) throw new Error(`${race.id} fastest lap is missing time or lap detail.`);
    const poles = dataset.results.filter(row => row.raceId === race.id && row.polePosition === 'True');
    if (poles.length > 1 || (qualifyingSession && poles.length !== 1)) {
      throw new Error(`${race.id} has ${poles.length} pole-position markers${qualifyingSession ? ' despite having qualifying data' : ''}.`);
    }
  }
  console.log(`${dataset.seasons.length} Formula E season${dataset.seasons.length === 1 ? '' : 's'} audited: ${JSON.stringify(summary)}`);
  return summary;
}

if (require.main === module) audit().catch(error => { console.error(error); process.exit(1); });

module.exports = { audit };
