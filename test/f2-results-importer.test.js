const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyExistingAwards,
  classificationUrl,
  findBrowserExecutable,
  formatMilliseconds,
  parsePageData,
  resultRow,
  selectClassificationSessions,
  sessionKind
} = require('../scripts/import-f2-results');
const { databaseValue } = require('../scripts/import-f2-standings');

test('serializes imported standings booleans for MariaDB', () => {
  assert.equal(databaseValue('True'), 1);
  assert.equal(databaseValue('False'), 0);
  assert.equal(databaseValue('288.5'), '288.5');
  assert.equal(databaseValue(''), null);
});

test('preserves source fastest-lap data when no prior result exists', () => {
  const row = { points: '0', polePosition: 'False', fastestLap: 'True' };

  assert.deepEqual(applyExistingAwards(row, undefined), {
    points: '',
    polePosition: '',
    fastestLap: 'True'
  });
});

test('restores existing official awards when a prior result exists', () => {
  const row = { points: '', polePosition: '', fastestLap: 'True' };

  assert.deepEqual(applyExistingAwards(row, {
    points: '2',
    polePosition: 'True',
    fastestLap: 'False'
  }), {
    points: '2',
    polePosition: 'True',
    fastestLap: 'False'
  });
});

test('selects the first available browser executable', () => {
  assert.equal(findBrowserExecutable(['missing-browser', __filename]), __filename);
});

test('selects active race, qualifying, grid, and practice classifications', () => {
  const sessions = [
    { id: 'race', year: '2025', name: 'Race', isRace: 'True' },
    { id: 'qualifying', year: '2025', name: 'Qualifying', isRace: 'False' },
    { id: 'split', year: '2025', name: '1st Qualifying', isRace: 'False' },
    { id: 'grid', year: '2025', name: 'Starting Grid', isRace: 'False' },
    { id: 'cancelled', year: '2025', name: 'Race', isRace: 'True', cancelled: 'True' },
    { id: 'practice', year: '2025', name: 'Free Practice', isRace: 'False' },
    { id: 'other-year', year: '2024', name: 'Qualifying', isRace: 'False' }
  ];

  assert.equal(sessionKind(sessions[0]), 'race');
  assert.equal(sessionKind(sessions[1]), 'qualifying');
  assert.equal(sessionKind(sessions[3]), 'grid');
  assert.equal(sessionKind(sessions[5]), 'practice');
  assert.deepEqual(
    selectClassificationSessions(sessions, '2025', new Set(['race', 'qualifying'])).map(row => row.id),
    ['race', 'qualifying', 'split']
  );
  assert.deepEqual(
    selectClassificationSessions(sessions, '2025', new Set(['race', 'qualifying', 'grid', 'practice'])).map(row => row.id),
    ['race', 'qualifying', 'split', 'grid', 'practice']
  );
  assert.deepEqual(
    selectClassificationSessions(sessions, '2025', new Set(['qualifying'])).map(row => row.id),
    ['qualifying', 'split']
  );
  assert.deepEqual(
    selectClassificationSessions(sessions, '2025', new Set(['practice'])).map(row => row.id),
    ['practice']
  );
});

test('builds Motorsport Stats URLs for regular and split qualifying sessions', () => {
  const race = {
    sourceUrl: 'https://www.motorsportstats.com/results/fia-formula-2-championship/2017/monaco/info'
  };
  assert.equal(
    classificationUrl({
      id: 'fia-formula-2-championship_2017_monaco_1st-qualifying',
      year: '2017'
    }, race),
    'https://www.motorsportstats.com/results/fia-formula-2-championship/2017/monaco/classification/1st-qualifying'
  );
});

test('parses embedded classifications and maps qualifying rows', () => {
  const details = [{
    finishPosition: 4,
    classifiedStatus: 'CLA',
    carNumber: '7',
    drivers: [{ slug: 'test-driver' }],
    team: { slug: 'test-team' },
    laps: 12,
    time: 91234,
    gap: { timeToLead: 1234, lapsToLead: 0 },
    bestLap: { fastest: false, lap: 9, time: 90123 },
    avgLapSpeed: 180.5
  }];
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { sessionAllClassification: { details } } }
  })}</script>`;

  const parsed = parsePageData(html, 'https://example.test/classification');
  const row = resultRow(
    { id: 'qualifying', year: '2025', round: '1' },
    { id: 'race-id' },
    parsed[0],
    4,
    { driverNumber: '7', driverId: 'local-driver', constructorId: 'local-team' }
  );

  assert.equal(row.positionNumber, 4);
  assert.equal(row.driverId, 'local-driver');
  assert.equal(row.constructorId, 'local-team');
  assert.equal(row.time, '1:31.234');
  assert.equal(formatMilliseconds(3684429), '1:01:24.429');
});
