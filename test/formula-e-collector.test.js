const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../data/formula-e-data-contract.json');
const { buildDataset, chassisForSeason, chronologicalSessions, csvValue, driverNameParts, enrichDataset, fillDerivedGaps, mergeDatasets,
  normalizePosition, parseGapLaps, parseTimeMillis, seasonIdentity, slug, validateDataset, zonedLocalToUtc } = require('../scripts/collect-formula-e-data');
const { archiveSessionCode, parseClassificationCsv, parseDelimited, parseQualifyingCsv, roundNumber, timeMillis } = require('../scripts/formula-e-official-data');

test('Formula E contract preserves two-year season identity and separate championships', () => {
  const identity = seasonIdentity(11, ['2024-12-07', '2025-07-27']);
  assert.deepEqual(identity, { seasonKey: '2024-25', seasonNumber: 11, year: 2025, label: '2024–25', startYear: 2024, endYear: 2025 });
  assert.deepEqual(seasonIdentity(10, ['2024-01-13', '2024-07-21']), { seasonKey: '2023-24', seasonNumber: 10, year: 2024, label: '2023–24', startYear: 2023, endYear: 2024 });
  assert.equal(contract.seasonIdentity.primaryKey, 'seasonKey');
  assert.ok(contract.files.constructorStandings.includes('constructorId'));
  assert.ok(contract.files.manufacturerStandings.includes('manufacturerId'));
  assert.ok(contract.files.entries.includes('chassisId'));
  assert.ok(contract.files.entries.includes('engineId'));
});

test('Formula E collector helpers normalize official classification values safely', () => {
  assert.equal(slug('São Paulo'), 'sao-paulo');
  assert.equal(normalizePosition('12 Places gained'), 12);
  assert.equal(normalizePosition('—'), '');
  assert.equal(parseTimeMillis('1:02:03.125'), 3723125);
  assert.equal(parseTimeMillis('+4.798'), 4798);
  assert.equal(parseTimeMillis('DNF'), '');
  assert.equal(parseGapLaps('1 Lap'), 1);
  assert.equal(parseGapLaps('2 Laps'), 2);
  assert.equal(parseGapLaps('+4.798'), '');
  assert.deepEqual(chronologicalSessions([
    { key: 'race' }, { key: 'qualifying' }, { key: 'fp2' }, { key: 'fp1' }
  ]).map(row => row.key), ['fp1', 'fp2', 'qualifying', 'race']);
  assert.deepEqual(chronologicalSessions([
    { key: 'free-practice-2' }, { key: 'race' }, { key: 'free-practice-1' }, { key: 'grid' }, { key: 'qualifying' }
  ]).map(row => row.key), ['free-practice-1', 'free-practice-2', 'qualifying', 'grid', 'race']);
  assert.deepEqual(driverNameParts('Jean-Eric Vergne'), { firstName: 'Jean-Eric', lastName: 'Vergne' });
  assert.equal(csvValue('DS, Penske'), '"DS, Penske"');
  assert.equal(archiveSessionCode('Non Qualifying Practice'), 'free-practice');
  assert.equal(archiveSessionCode('Qualifying Group A'), 'qualifying');
  assert.equal(zonedLocalToUtc('2025-05-03T15:05:00', 'Europe/Monaco'), '2025-05-03T13:05:00Z');
  assert.equal(chassisForSeason(11).id, 'spark-gen3-evo');
});

test('Formula E prototype dataset builds normalized races, entries and standings', () => {
  const identity = seasonIdentity(11, ['2024-12-07']);
  const round = { round: 1, venueSlug: 'sao-paulo', date: '2024-12-07', country: 'br', href: 'https://example.test/round-1',
    sessions: [{ key: 'race', name: 'Race', href: 'https://example.test/race', order: 1 }, { key: 'qualifying', name: 'Qualifying', href: 'https://example.test/qualifying', order: 2 }] };
  const base = { raceId: 'fe-2024-25-r1-sao-paulo', seasonKey: '2024-25', year: 2025, round: 1, points: 25, status: '', driverNumber: '',
    laps: '', time: '1:00:00.000', timeMillis: 3600000, gapMillis: '', fastestLap: 'False', fastestLapNumber: '', fastestLapTime: '', fastestLapTimeMillis: '', averageSpeed: '' };
  const classifications = [[
    { ...base, sessionId: `${base.raceId}-race`, positionDisplayOrder: 1, positionNumber: 1, gridPositionNumber: 2, polePosition: 'False', driverId: 'test-driver', driverName: 'Test Driver', abbreviation: 'TES', constructorId: 'test-team', teamName: 'Test Team' },
    { ...base, sessionId: `${base.raceId}-qualifying`, positionDisplayOrder: 1, positionNumber: 1, points: 0, polePosition: 'True', driverId: 'test-driver', driverName: 'Test Driver', abbreviation: 'TES', constructorId: '', teamName: '' }
  ]];
  const standings = {
    drivers: [{ positionNumber: 1, id: 'test-driver', name: 'Test Driver', points: 25, constructorId: 'test-team', teamName: 'Test Team', nationalityCode: 'GBR', pictureUrl: '' }],
    teams: [{ positionNumber: 1, id: 'test-team', name: 'Test Team', points: 25, pictureUrl: '' }],
    manufacturers: [{ positionNumber: 1, id: 'test-powertrain', name: 'Test Powertrain', points: 25, pictureUrl: '' }]
  };
  const dataset = buildDataset(identity, [round], classifications, standings);
  assert.equal(dataset.seasons[0].seasonKey, '2024-25');
  assert.equal(dataset.races[0].name, 'Sao Paulo E-Prix');
  assert.equal(dataset.entries.length, 1);
  assert.equal(dataset.driverStandings[0].wins, 1);
  assert.equal(dataset.driverStandings[0].poles, 1);
  assert.equal(dataset.results[1].constructorId, 'test-team');
  assert.equal(dataset.sessions.find(row => row.name === 'Starting Grid').sessionNumber, 2);
  assert.equal(dataset.results.find(row => row.sessionId.endsWith('-starting-grid')).positionNumber, 2);
  assert.equal(dataset.manufacturerStandings[0].manufacturerId, 'test-powertrain');
  assert.doesNotThrow(() => validateDataset(dataset));
});

test('Formula E validation rejects orphaned result rows', () => {
  const dataset = { races: [{ id: 'race' }], sessions: [{ id: 'session' }], drivers: [], constructors: [],
    manufacturers: [], circuits: [], entries: [], results: [{ sessionId: 'missing', driverId: 'missing', constructorId: 'missing' }],
    driverStandings: [{}], constructorStandings: [{}], manufacturerStandings: [] };
  assert.throws(() => validateDataset(dataset), /missing session|missing driver|missing team/);
});

test('Formula E season datasets merge without duplicating shared entities', () => {
  const empty = () => ({ seasons: [], drivers: [], constructors: [], manufacturers: [], circuits: [], races: [], sessions: [], entries: [], results: [], driverStandings: [], constructorStandings: [], manufacturerStandings: [] });
  const first = empty(), second = empty();
  first.seasons.push({ seasonKey: '2023-24' });
  first.drivers.push({ id: 'shared-driver', name: 'Shared Driver', abbreviation: '', countryCode: '', nationalityCode: '', pictureUrl: '' });
  second.seasons.push({ seasonKey: '2024-25' });
  second.drivers.push({ id: 'shared-driver', name: 'Shared Driver', abbreviation: 'SHA', countryCode: 'gb', nationalityCode: 'GBR', pictureUrl: 'driver.png' });
  const merged = mergeDatasets([first, second]);
  assert.deepEqual(merged.seasons.map(row => row.seasonKey), ['2023-24', '2024-25']);
  assert.equal(merged.drivers.length, 1);
  assert.equal(merged.drivers[0].abbreviation, 'SHA');
});

test('Formula E deterministic gaps canonicalize driver aliases and standing teams', () => {
  const dataset = {
    drivers: [
      { id: 'ma-qinghua', name: 'Ma Qinghua', abbreviation: 'QMA', countryCode: 'cn', nationalityCode: 'CHN', pictureUrl: '' },
      { id: 'qing-hua-ma', name: 'Qing Hua MA', abbreviation: '', countryCode: 'cn', nationalityCode: 'CHN', pictureUrl: '' }
    ],
    constructors: [{ id: 'team-aguri' }], circuits: [{ id: 'marrakesh', countryCode: '' }],
    entries: [{ seasonKey: '2015-16', year: 2016, round: 4, driverId: 'qing-hua-ma', constructorId: 'team-aguri' }],
    results: [{ driverId: 'qing-hua-ma' }],
    driverStandings: [{ seasonKey: '2015-16', year: 2016, driverId: 'ma-qinghua', constructorId: '' }]
  };
  assert.deepEqual(fillDerivedGaps(dataset), { driverAliases: 2, circuitCountries: 1, standingTeams: 1 });
  assert.equal(dataset.drivers.length, 1);
  assert.equal(dataset.entries[0].driverId, 'ma-qinghua');
  assert.equal(dataset.driverStandings[0].constructorId, 'team-aguri');
  assert.equal(dataset.circuits[0].countryCode, 'ma');
});

test('official Formula E CSV parser preserves classification enrichment fields', () => {
  const text = '\uFEFFPOSITION;NUMBER;STATUS;LAPS;TOTAL_TIME;FL_LAPNUM;FL_TIME;FL_KPH;TEAM;VEHICLE;DRIVER_FIRSTNAME;DRIVER_SECONDNAME;DRIVER_COUNTRY;DRIVER_SHORTNAME;\r\n'
    + '1;13;Classified;35;1:45:15.142;18;1:13.261;144.1;TAG Heuer Porsche Formula E Team;Porsche 99X Electric;António Félix;DA COSTA;PRT;DAC;\r\n';
  assert.equal(parseDelimited('name;note\nDriver;"DS; Penske"\n')[0].note, 'DS; Penske');
  assert.equal(timeMillis('1:13.261'), 73261);
  assert.equal(roundNumber('01_R01 São Paulo/202412071405_Race'), 1);
  assert.deepEqual(parseClassificationCsv(text)[0], {
    positionNumber: 1, driverNumber: '13', status: 'Classified', laps: 35,
    time: '1:45:15.142', gap: '', fastestLapNumber: 18, fastestLapTime: '1:13.261',
    fastestLapTimeMillis: 73261, averageSpeed: 144.1, teamName: 'TAG Heuer Porsche Formula E Team',
    vehicle: 'Porsche 99X Electric', firstName: 'António Félix', lastName: 'DA COSTA',
    name: 'António Félix DA COSTA', abbreviation: 'DAC', nationalityCode: 'PRT'
  });
});

test('official Formula E qualifying CSV parser preserves pole classification fields', () => {
  const text = 'POS;NUMBER;LAP;TIME;GAP_FIRST;KPH; LAPS;TEAM;VEHICLE;DRIVER_FIRSTNAME;DRIVER_SECONDNAME;DRIVER_COUNTRY;DRIVER_SHORTNAME;\n'
    + '1;8;3;1:42.200;-;121.6;4;Team e.dams Renault;Spark;Nicolas;Prost;FRA;PRO;\n';
  assert.deepEqual(parseQualifyingCsv(text)[0], {
    positionNumber: 1, driverNumber: '8', laps: 4, fastestLapNumber: 3,
    time: '1:42.200', timeMillis: 102200, gap: '-', averageSpeed: 121.6,
    teamName: 'Team e.dams Renault', vehicle: 'Spark', firstName: 'Nicolas', lastName: 'Prost',
    name: 'Nicolas Prost', abbreviation: 'PRO', nationalityCode: 'FRA'
  });
});

test('official Formula E data enriches car numbers, fastest laps and nationalities', () => {
  const identity = seasonIdentity(11, ['2024-12-07']);
  const round = { round: 1, venueSlug: 'sao-paulo', date: '2024-12-07', country: 'br', href: 'https://example.test/round-1',
    sessions: [{ key: 'race', name: 'Race', href: 'https://example.test/race', order: 1 }] };
  const base = { raceId: 'fe-2024-25-r1-sao-paulo', seasonKey: '2024-25', year: 2025, round: 1, points: 25, status: '', driverNumber: '',
    laps: '', time: '', timeMillis: '', gapMillis: '', fastestLap: 'False', fastestLapNumber: '', fastestLapTime: '', fastestLapTimeMillis: '', averageSpeed: '' };
  const classifications = [[
    { ...base, sessionId: `${base.raceId}-race`, positionDisplayOrder: 5, positionNumber: 5, gridPositionNumber: 1, polePosition: 'False', driverId: 'test-driver', driverName: 'Test Driver', abbreviation: 'TES', constructorId: 'test-team', teamName: 'Test Team' },
    { ...base, sessionId: `${base.raceId}-race`, positionDisplayOrder: 1, positionNumber: '', points: 0, status: 'DNS', gridPositionNumber: 2, polePosition: 'False', driverId: 'withdrawn-driver', driverName: 'Withdrawn Driver', abbreviation: 'WDR', constructorId: 'test-team', teamName: 'Test Team' }
  ]];
  const standings = { drivers: [{ positionNumber: 1, id: 'test-driver', name: 'Test Driver', points: 25, constructorId: 'test-team', teamName: 'Test Team' }],
    teams: [{ positionNumber: 1, id: 'test-team', name: 'Test Team', points: 25 }], manufacturers: [] };
  const dataset = buildDataset(identity, [round], classifications, standings);
  const official = { classifications: new Map([[1, [{ name: 'Test Driver', firstName: 'Test', lastName: 'Driver', abbreviation: 'TES', positionNumber: 1,
    nationalityCode: 'GBR', driverNumber: '27', laps: 35, fastestLapNumber: 12, fastestLapTime: '1:10.000',
    fastestLapTimeMillis: 70000, averageSpeed: 150, status: 'Classified', teamNationalityCode: 'USA', vehicle: 'Test 99X Electric' }]]]),
    qualifying: new Map([[1, [{ name: 'Test Driver', firstName: 'Test', lastName: 'Driver', abbreviation: 'TES',
      nationalityCode: 'GBR', driverNumber: '27', positionNumber: 1, laps: 4, fastestLapNumber: 4,
      time: '1:08.000', timeMillis: 68000, averageSpeed: 154 }]]]),
    schedule: new Map([[1, [{ code: 'race', localDateTime: '2024-12-07T14:05:00' }]]]),
    circuits: new Map([[1, { lengthMeters: 2933, layoutUrl: 'https://example.test/circuit-map.pdf' }]]) };
  assert.deepEqual(enrichDataset(dataset, official), { officialRounds: 1, matchedResults: 1, fastestLaps: 1, qualifyingResults: 1, polePositions: 1 });
  assert.equal(dataset.entries[0].driverNumber, '27');
  const raceResult = dataset.results.find(row => row.sessionId.endsWith('-race'));
  assert.equal(raceResult.fastestLap, 'True');
  assert.equal(raceResult.positionDisplayOrder, 1);
  assert.equal(raceResult.positionNumber, 1);
  assert.equal(dataset.results.find(row => row.driverId === 'withdrawn-driver' && row.sessionId.endsWith('-race')).positionDisplayOrder, 2);
  assert.equal(dataset.sessions.find(row => row.id.endsWith('-qualifying')).name, 'Qualifying');
  assert.equal(dataset.results.find(row => row.sessionId.endsWith('-qualifying')).polePosition, 'True');
  assert.equal(dataset.entries[0].engineId, 'test-99x-electric');
  assert.equal(dataset.sessions.find(row => row.isRace === 'True').startTimeUtc, '2024-12-07T17:05:00Z');
  assert.equal(dataset.drivers[0].countryCode, 'gb');
  assert.equal(dataset.constructors[0].countryCode, 'us');
  assert.equal(dataset.driverStandings[0].fastestLaps, 1);
});
