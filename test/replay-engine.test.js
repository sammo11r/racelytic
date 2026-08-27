const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createOrderStabilizer, formatTime, isClassifiedStatus, latestValue, stateAt
} = require('../frontend/js/replay-engine');

test('replay engine interpolates telemetry coordinates while keeping recorded position', () => {
  const data = {
    mode: 'telemetry', duration: 10,
    drivers: [{ id: '1', code: 'ONE' }],
    samples: { 1: [[0, 0, 0], [10, 1, .5]] },
    positionEvents: { 1: [[0, 2], [8, 1]] },
    lapEvents: { 1: [[0, 1]] }
  };
  const state = stateAt(data, 5).drivers[0];
  assert.equal(state.x, .5);
  assert.equal(state.y, .25);
  assert.equal(state.position, 2);
});

test('replay helpers handle event lookup and race-time formatting', () => {
  assert.equal(latestValue([[0, 4], [3, 2]], 2), 4);
  assert.equal(latestValue([[0, 4], [3, 2]], 4), 2);
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3661), '1:01:01');
});

test('pit-lane starters sort behind drivers with valid grid positions', () => {
  const data = {
    duration: 10,
    drivers: [
      { id: '1', code: 'POLE', grid: 1, status: 'Finished' },
      { id: '2', code: 'PIT', grid: 0, status: 'Finished' }
    ],
    samples: { 1: [[0, 0, 0]], 2: [[0, 1, 1]] },
    positionEvents: { 1: [[0, 1]], 2: [[0, 0]] },
    lapEvents: { 1: [[0, 1]], 2: [[0, 1]] }
  };
  const state = stateAt(data, 0);
  assert.deepEqual(state.drivers.map(driver => driver.code), ['POLE', 'PIT']);
  assert.equal(state.drivers[1].position, 2);
});

test('retired drivers leave the track and official classification wins at race end', () => {
  const data = {
    duration: 10,
    totalLaps: 5,
    drivers: [
      { id: '1', code: 'PEN', grid: 1, finalPosition: 2, status: 'Finished' },
      { id: '2', code: 'WIN', grid: 2, finalPosition: 1, status: 'Finished' },
      { id: '3', code: 'DNF', grid: 3, finalPosition: 3, status: 'Collision' }
    ],
    samples: { 1: [[0, 0, 0]], 2: [[0, 1, 1]], 3: [[0, .5, .5], [10, .6, .6]] },
    positionEvents: { 1: [[0, 1]], 2: [[0, 2]], 3: [[0, 3]] },
    lapEvents: { 1: [[0, 1], [9, 5]], 2: [[0, 1], [9, 5]], 3: [[0, 1], [4, 3]] }
  };

  assert.equal(stateAt(data, 3).drivers.find(driver => driver.id === '3').statusText, 'RUNNING');
  assert.equal(stateAt(data, 5).drivers.find(driver => driver.id === '3').statusText, 'OUT');
  const finish = stateAt(data, 10);
  assert.deepEqual(finish.drivers.map(driver => driver.code), ['WIN', 'PEN', 'DNF']);
  assert.deepEqual(finish.drivers.map(driver => driver.statusText), ['FINISHED', 'FINISHED', 'OUT']);
  assert.equal(finish.totalLaps, 5);
});

test('classification status recognises finishers and lapped classified cars', () => {
  assert.equal(isClassifiedStatus('Finished'), true);
  assert.equal(isClassifiedStatus('+1 Lap'), true);
  assert.equal(isClassifiedStatus('+2 Laps'), true);
  assert.equal(isClassifiedStatus('Power Unit'), false);
});

test('a retired driver with a frozen coordinate stream is a non-starter', () => {
  const data = {
    duration: 100,
    drivers: [
      { id: '1', code: 'RUN', grid: 1, finalPosition: 1, status: 'Finished' },
      { id: '2', code: 'DNS', grid: 2, finalPosition: 2, status: 'Retired' }
    ],
    samples: {
      1: [[0, 0, 0], [100, 1, 1]],
      2: [[0, .5, .25], [100, .5, .25]]
    },
    positionEvents: { 1: [[0, 1]], 2: [[0, 2], [20, 2]] },
    lapEvents: { 1: [[0, 1]], 2: [[0, 1], [20, 2]] }
  };

  const state = stateAt(data, 0);
  assert.deepEqual(state.drivers.map(driver => driver.code), ['RUN', 'DNS']);
  assert.equal(state.drivers[1].statusText, 'DNS');
});

test('pit-lane starters follow grid starters and retain their pit-out order', () => {
  const drivers = [
    { id: '6', code: 'DNS', grid: 11, status: 'Retired' },
    { id: '30', code: 'LAW', grid: 18, status: 'Retired', pitLaneStart: true, pitLaneOrder: 1 },
    { id: '31', code: 'OCO', grid: 19, status: 'Finished' },
    { id: '87', code: 'BEA', grid: 20, status: 'Finished', pitLaneStart: true, pitLaneOrder: 2 }
  ];
  const data = {
    duration: 100,
    drivers,
    samples: {
      6: [[0, .5, .5], [100, .5, .5]],
      30: [[0, 0, 0], [100, 1, 1]],
      31: [[0, 0, 0], [100, 1, 1]],
      87: [[0, 0, 0], [100, 1, 1]]
    },
    positionEvents: { 6: [[0, 11]], 30: [[0, 18]], 31: [[0, 19]], 87: [[0, 20]] },
    lapEvents: { 6: [[0, 1]], 30: [[0, 1]], 31: [[0, 1]], 87: [[0, 1]] }
  };

  const state = stateAt(data, 0);
  assert.deepEqual(state.drivers.map(driver => driver.code), ['OCO', 'LAW', 'BEA', 'DNS']);
  assert.deepEqual(state.drivers.map(driver => driver.position), [1, 2, 3, 4]);
  assert.deepEqual(state.drivers.map(driver => driver.statusText), ['RUNNING', 'RUNNING', 'RUNNING', 'DNS']);
});

test('starting metadata scans each telemetry stream only once per replay', () => {
  let scans = 0;
  const samples = [[0, 0, 0], [10, 1, 1]];
  samples[Symbol.iterator] = function* telemetryIterator() {
    scans += 1;
    for (let index = 0; index < this.length; index += 1) yield this[index];
  };
  const data = {
    duration: 10,
    drivers: [{ id: '1', code: 'ONE', grid: 1, status: 'Retired' }],
    samples: { 1: samples },
    positionEvents: { 1: [[0, 1]] },
    lapEvents: { 1: [[0, 1]] }
  };

  stateAt(data, 0);
  stateAt(data, 1);
  assert.equal(scans, 1);
});

test('missing leading coordinates use timed circuit progress until telemetry resumes', () => {
  const data = {
    duration: 20,
    track: { trace: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    drivers: [{ id: '1', code: 'ONE', grid: 1, status: 'Finished' }],
    samples: { 1: [[0, .5, .5], [7.5, .5, .5], [8, .9, .9], [20, 0, 0]] },
    positionEvents: { 1: [[0, 1]] },
    lapEvents: { 1: [[0, 1], [10, 2]] }
  };

  const estimated = stateAt(data, 4).drivers[0];
  assert.notDeepEqual([estimated.x, estimated.y], [.5, .5]);
  const resumed = stateAt(data, 8).drivers[0];
  assert.deepEqual([resumed.x, resumed.y], [.9, .9]);
});

test('missing coordinates follow the nearest tracked car ahead without overtaking it', () => {
  const data = {
    duration: 20,
    track: { trace: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    drivers: [
      { id: '1', code: 'AHEAD', grid: 1, status: 'Finished' },
      { id: '2', code: 'MISSING', grid: 2, status: 'Finished' }
    ],
    samples: {
      1: [[0, 0, 0], [1, .1, 0], [10, 1, 0], [20, 0, 1]],
      2: [[0, .5, .5], [7.5, .5, .5], [8, .9, .9], [20, 0, 0]]
    },
    positionEvents: { 1: [[0, 1]], 2: [[0, 2]] },
    lapEvents: { 1: [[0, 1], [10, 2]], 2: [[0, 1], [10, 2]] }
  };

  const state = stateAt(data, 4);
  const ahead = state.drivers.find(driver => driver.id === '1');
  const missing = state.drivers.find(driver => driver.id === '2');
  assert.ok(missing.x < ahead.x);
  assert.equal(missing.y, ahead.y);
});

test('running order reacts to on-track progress between lap timing updates', () => {
  const data = {
    duration: 20,
    totalLaps: 2,
    track: { trace: [[0, 0], [.25, 0], [.5, 0], [.75, 0], [1, 0], [1, 1], [0, 1]] },
    drivers: [
      { id: '1', code: 'ONE', grid: 1 },
      { id: '2', code: 'TWO', grid: 2 }
    ],
    samples: {
      1: [[0, .05, 0], [1, .1, 0], [10, .4, 0]],
      2: [[0, .04, 0], [1, .09, 0], [10, .5, 0]]
    },
    positionEvents: { 1: [[0, 1]], 2: [[0, 2]] },
    lapEvents: { 1: [[0, 1]], 2: [[0, 1]] }
  };

  assert.deepEqual(stateAt(data, 0).drivers.map(driver => driver.code), ['ONE', 'TWO']);
  assert.deepEqual(stateAt(data, 10).drivers.map(driver => driver.code), ['TWO', 'ONE']);
});

test('running order only commits an overtake after it remains stable', () => {
  const stabilize = createOrderStabilizer(1);
  const one = { id: '1', code: 'ONE', lap: 1, statusText: 'RUNNING' };
  const two = { id: '2', code: 'TWO', lap: 1, statusText: 'RUNNING' };
  const codes = (drivers, time) => stabilize(drivers, time).map(driver => driver.code);

  assert.deepEqual(codes([one, two], 0), ['ONE', 'TWO']);
  assert.deepEqual(codes([two, one], .2), ['ONE', 'TWO']);
  assert.deepEqual(codes([one, two], .8), ['ONE', 'TWO']);
  assert.deepEqual(codes([two, one], 1), ['ONE', 'TWO']);
  assert.deepEqual(codes([two, one], 1.9), ['ONE', 'TWO']);
  assert.deepEqual(codes([two, one], 2), ['TWO', 'ONE']);
});

test('running order applies status and lap changes immediately', () => {
  const stabilize = createOrderStabilizer(1);
  const one = { id: '1', code: 'ONE', lap: 1, statusText: 'RUNNING' };
  const two = { id: '2', code: 'TWO', lap: 1, statusText: 'RUNNING' };
  stabilize([one, two], 0);

  assert.deepEqual(stabilize([{ ...two, lap: 2 }, one], .2).map(driver => driver.code), ['TWO', 'ONE']);
  assert.deepEqual(stabilize([one, { ...two, lap: 2, statusText: 'OUT' }], .3).map(driver => driver.code), ['ONE', 'TWO']);
});
