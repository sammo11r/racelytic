const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../frontend/js/idle-racing-manager-engine');

test('idle manager starts with an affordable choice and two sponsor contracts', () => {
  const state = game.createInitialState(1000);
  const contracts = game.generateSponsorContracts(state);
  assert.equal(state.money, 2000);
  assert.deepEqual(contracts.map(contract => contract.id), ['copper-kettle', 'rivetworks']);
  assert.ok(game.calculateRaceCosts(state, contracts[0]).total < state.money);
});

test('car upgrades spend money, improve the chosen area and scale in cost', () => {
  const state = game.createInitialState();
  const firstCost = game.calculateUpgradeCost(state, 'engine');
  const upgraded = game.upgradeCar(state, 'engine');
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.state.car.engine, state.car.engine + game.UPGRADE_STEP);
  assert.equal(upgraded.state.money, state.money - firstCost);
  assert.ok(game.calculateUpgradeCost(upgraded.state, 'engine') > firstCost);
  assert.equal(state.car.engine, 10);
});

test('circuit characteristics make specialized builds perform differently', () => {
  const engineBuild = game.createInitialState();
  engineBuild.car.engine = 70;
  const aeroBuild = game.createInitialState();
  aeroBuild.car.aero = 70;
  const fixedRandom = () => .5;
  const fastContract = game.getContract('copper-kettle');
  const technicalContract = game.getContract('bluepeak');
  assert.ok(game.calculateRacePerformance(engineBuild, fastContract, fixedRandom)
    > game.calculateRacePerformance(aeroBuild, fastContract, fixedRandom));
  assert.ok(game.calculateRacePerformance(aeroBuild, technicalContract, fixedRandom)
    > game.calculateRacePerformance(engineBuild, technicalContract, fixedRandom));
});

test('race simulation is deterministic for a seed and applies its economy result', () => {
  const state = game.createInitialState();
  const contract = game.getContract('copper-kettle');
  const first = game.simulateRace(state, contract, game.createSeededRandom(42));
  const second = game.simulateRace(state, contract, game.createSeededRandom(42));
  assert.deepEqual(first, second);
  assert.equal(first.laps.length, contract.laps);
  assert.equal(first.laps.at(-1).position, first.finalPosition);
  const costs = game.calculateRaceCosts(state, contract);
  const next = game.applyRaceResult(state, first, costs);
  assert.equal(next.money, state.money - costs.total + first.reward);
  assert.equal(next.statistics.races, 1);
  assert.ok(next.carCondition < state.carCondition);
});

test('reputation unlocks harder fictional circuits and contracts', () => {
  const state = game.createInitialState();
  const progressed = { ...state, reputation: 80 };
  assert.deepEqual(game.getAvailableCircuits(state).map(circuit => circuit.id), ['industrial-park']);
  assert.deepEqual(game.getAvailableCircuits(progressed).map(circuit => circuit.id),
    ['industrial-park', 'ridgeway', 'aurora-ring']);
  assert.ok(game.generateSponsorContracts(progressed).length > game.generateSponsorContracts(state).length);
});

test('offline progression is capped at eight hours and auto-races only while affordable', () => {
  const now = 10 * 60 * 60 * 1000;
  const state = game.createInitialState(0);
  state.money = 100000;
  state.lastActive = 1;
  const { state: progressed, summary } = game.calculateOfflineProgress(state, now);
  assert.equal(summary.elapsedMs, game.OFFLINE_CAP_MS);
  assert.ok(summary.races > 0);
  assert.equal(progressed.statistics.races, summary.races);
  assert.equal(progressed.lastActive, now);
});

test('saved games normalize missing fields and recover from invalid data', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const state = game.createInitialState(10);
  state.money = 4321;
  game.saveGame(state, storage, 20);
  assert.equal(game.loadGame(storage, 30).money, 4321);
  storage.setItem(game.SAVE_KEY, '{broken');
  assert.equal(game.loadGame(storage, 40).money, 2000);
});
