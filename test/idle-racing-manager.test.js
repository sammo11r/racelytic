const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../frontend/js/idle-racing-manager-engine');

test('idle manager starts with a circuit, driver, engineer and five-race sponsor deal', () => {
  const state = game.createInitialState(1000);
  const circuit = game.getCircuit(state.selectedCircuitId);
  assert.equal(state.money, 2000);
  assert.equal(circuit.id, 'industrial-park');
  assert.equal(state.sponsor.id, 'copper-kettle');
  assert.equal(state.sponsor.racesRemaining, 5);
  assert.ok(game.calculateRaceCosts(state, circuit).total < state.money);
});

test('circuit catalogue contains six fully configured venues', () => {
  assert.equal(game.circuits.length, 6);
  for (const circuit of game.circuits) {
    assert.ok(circuit.id && circuit.name && circuit.tier && circuit.description);
    assert.ok(circuit.length > 0 && circuit.laps > 0 && circuit.prizeFund > 0);
    assert.ok(circuit.entryCost >= 0 && circuit.fuelPerLap > 0);
    assert.ok(circuit.weights.engine > 0 && circuit.weights.aero > 0 && circuit.weights.chassis > 0);
  }
});

test('development starts at one central node in each of four departments', () => {
  const state = game.createInitialState();
  assert.deepEqual(game.developmentDepartments.map(department => department.id), [
    'aerodynamics', 'chassis', 'engine', 'durability'
  ]);
  assert.deepEqual(state.development.purchased, game.developmentDepartments.map(department => department.centralId));
  assert.equal(game.getUpgradeNode('front-wing-minor').departmentId, 'aerodynamics');
  assert.equal(game.getUpgradeNode('ice-turbo-lag').departmentId, 'engine');
  assert.equal(game.getUpgradeNode('structural-minor').departmentId, 'durability');
});

test('tree upgrades require their path, spend money and leave the original state unchanged', () => {
  const state = game.createInitialState();
  const locked = game.purchaseUpgrade(state, 'front-wing-major');
  assert.equal(locked.reason, 'PREREQUISITE');
  assert.deepEqual(locked.missing, ['front-wing-minor']);

  const node = game.getUpgradeNode('front-wing-minor');
  const upgraded = game.purchaseUpgrade(state, node.id);
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.state.car.aero, state.car.aero + node.effects.aero);
  assert.equal(upgraded.state.money, state.money - node.cost);
  assert.ok(upgraded.state.development.purchased.includes(node.id));
  assert.equal(state.car.aero, 10);
  assert.ok(!state.development.purchased.includes(node.id));
});

test('the starting engineer limits development until a stronger engineer is hired', () => {
  let state = game.createInitialState();
  state.money = 100000;
  state = game.purchaseUpgrade(state, 'battery-minor').state;
  state = game.purchaseUpgrade(state, 'fuel-minor').state;
  state = game.purchaseUpgrade(state, 'ice-spark-plug').state;
  assert.equal(state.car.engine, 16);
  const limited = game.purchaseUpgrade(state, 'battery-major');
  assert.equal(limited.reason, 'ENGINEER_LIMIT');
  assert.equal(limited.limit, 16);

  state.engineer = { ...game.getEngineer('jon-bellamy') };
  const upgraded = game.purchaseUpgrade(state, 'battery-major');
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.state.car.engine, 19);
});

test('engineers require reputation, research and a signing fee', () => {
  const state = game.createInitialState();
  assert.deepEqual(game.getAvailableEngineers(state).map(engineer => engineer.id), ['nia-calder']);
  assert.equal(game.signEngineer(state, 'jon-bellamy').reason, 'REPUTATION_REQUIRED');
  assert.equal(game.signEngineer({ ...state, reputation: 18 }, 'jon-bellamy').reason, 'RESEARCH_REQUIRED');
  assert.equal(game.signEngineer({ ...state, reputation: 18, researchPoints: 8, money: 3000 }, 'jon-bellamy').reason, 'INSUFFICIENT_FUNDS');

  const signed = game.signEngineer({ ...state, reputation: 18, researchPoints: 8, money: 4000 }, 'jon-bellamy');
  assert.equal(signed.ok, true);
  assert.equal(signed.state.money, 1500);
  assert.equal(signed.state.engineer.id, 'jon-bellamy');
  assert.equal(signed.state.researchPoints, 8);
});

test('driver and engineer fees are included in every circuit race budget', () => {
  const state = game.createInitialState();
  const circuit = game.getCircuit('industrial-park');
  const costs = game.calculateRaceCosts(state, circuit);
  assert.equal(costs.engineer, state.engineer.raceCost);
  assert.equal(costs.driver, state.driver.raceCost);
  assert.equal(costs.total, costs.entry + costs.driver + costs.engineer + costs.fuel + costs.maintenance);

  const seniorState = { ...state, engineer: { ...game.getEngineer('asha-vermeer') } };
  assert.ok(game.calculateRaceCosts(seniorState, circuit).total > costs.total);
});

test('driver market gates stronger drivers by reputation and signing budget', () => {
  const state = game.createInitialState();
  assert.deepEqual(game.getAvailableDrivers(state).map(driver => driver.id), ['mara-voss']);
  assert.equal(game.signDriver(state, 'imani-okafor').reason, 'REPUTATION_REQUIRED');
  assert.equal(game.signDriver({ ...state, reputation: 30, money: 4000 }, 'imani-okafor').reason, 'INSUFFICIENT_FUNDS');
  const signed = game.signDriver({ ...state, reputation: 30, money: 5000 }, 'imani-okafor');
  assert.equal(signed.ok, true);
  assert.equal(signed.state.money, 1500);
  assert.equal(signed.state.driver.id, 'imani-okafor');
});

test('better drivers cost more and improve expected race performance', () => {
  for (let index = 1; index < game.drivers.length; index += 1) {
    assert.ok(game.driverRating(game.drivers[index]) > game.driverRating(game.drivers[index - 1]));
    assert.ok(game.drivers[index].raceCost > game.drivers[index - 1].raceCost);
  }
  const circuit = game.getCircuit('industrial-park');
  const starter = game.createInitialState();
  const elite = { ...starter, driver: { ...game.getDriver('kian-varga') } };
  assert.ok(game.calculateRacePerformance(elite, circuit, () => .5) > game.calculateRacePerformance(starter, circuit, () => .5));
});

test('circuit winnings vary by venue and sponsors multiply them only when the target is met', () => {
  const sponsor = game.createSponsorContract('rivetworks');
  const industrial = game.getCircuit('industrial-park');
  const ridgeway = game.getCircuit('ridgeway');
  const met = game.calculateRaceWinnings(industrial, 12, sponsor);
  const missed = game.calculateRaceWinnings(industrial, 13, sponsor);
  const harderCircuit = game.calculateRaceWinnings(ridgeway, 12, sponsor);

  assert.equal(met.targetMet, true);
  assert.equal(met.multiplier, sponsor.multiplier);
  assert.ok(met.total > met.base);
  assert.equal(missed.targetMet, false);
  assert.equal(missed.total, missed.base);
  assert.ok(harderCircuit.base > met.base);
});

test('one sponsor works at every circuit and expires after its contracted races', () => {
  let state = game.createInitialState();
  state.money = 100000;
  state.sponsor.racesRemaining = 2;
  const makeResult = circuitId => ({
    circuitId, sponsorId: state.sponsor?.id || null, finalPosition: 8, reward: 1000,
    reputationDelta: 1, researchGained: 1, wear: 1
  });
  const zeroCosts = { total: 0 };

  state = game.applyRaceResult(state, makeResult('industrial-park'), zeroCosts);
  assert.equal(state.sponsor.racesRemaining, 1);
  state = game.applyRaceResult(state, makeResult('ridgeway'), zeroCosts);
  assert.equal(state.sponsor, null);
});

test('a new sponsor can only be hired after the current deal ends and reputation requirements apply', () => {
  const state = game.createInitialState();
  assert.equal(game.hireSponsor(state, 'rivetworks').reason, 'ACTIVE_SPONSOR');
  const free = { ...state, sponsor: null };
  assert.equal(game.hireSponsor(free, 'rivetworks').reason, 'REPUTATION_REQUIRED');
  assert.equal(game.hireSponsor({ ...free, reputation: 8 }, 'rivetworks').reason, 'CAR_RATING_REQUIRED');
  const hired = game.hireSponsor({ ...free, reputation: 8, car: { aero: 12, chassis: 12, engine: 12, durability: 12 } }, 'rivetworks');
  assert.equal(hired.ok, true);
  assert.equal(hired.state.sponsor.racesRemaining, game.getSponsor('rivetworks').contractRaces);
});

test('legacy contract saves migrate to an independent sponsor and circuit selection', () => {
  const legacy = game.createInitialState(1);
  legacy.version = 1;
  legacy.selectedContractId = 'orbital-fibre';
  delete legacy.selectedCircuitId;
  delete legacy.sponsor;
  const normalized = game.normalizeState(legacy, 2);
  assert.equal(normalized.version, 3);
  assert.equal(normalized.sponsor.id, 'orbital-fibre');
  assert.equal(normalized.selectedCircuitId, 'ridgeway');
});

test('legacy car stats migrate to chassis and durability with central tree nodes installed', () => {
  const normalized = game.normalizeState({
    version: 2,
    car: { aero: 14, engine: 12, tyres: 16, reliability: 18 }
  }, 2);
  assert.deepEqual(normalized.car, { aero: 14, chassis: 16, engine: 12, durability: 18 });
  assert.deepEqual(normalized.development.purchased, game.developmentDepartments.map(department => department.centralId));
});

test('legacy saves map named staff and missing engineers onto current catalogues', () => {
  const legacy = game.createInitialState(1);
  legacy.driver = { name: 'Mara Voss', pace: 1 };
  delete legacy.engineer;
  const normalized = game.normalizeState(legacy, 2);
  assert.deepEqual(normalized.driver, game.getDriver('mara-voss'));
  assert.deepEqual(normalized.engineer, game.getEngineer('nia-calder'));
});

test('circuit characteristics make specialized builds perform differently', () => {
  const engineBuild = game.createInitialState();
  engineBuild.car.engine = 70;
  const aeroBuild = game.createInitialState();
  aeroBuild.car.aero = 70;
  const fixedRandom = () => .5;
  assert.ok(game.calculateRacePerformance(engineBuild, 'industrial-park', fixedRandom)
    > game.calculateRacePerformance(aeroBuild, 'industrial-park', fixedRandom));
  assert.ok(game.calculateRacePerformance(aeroBuild, 'ridgeway', fixedRandom)
    > game.calculateRacePerformance(engineBuild, 'ridgeway', fixedRandom));
});

test('race simulation is deterministic and applies all economy values only with its result', () => {
  const state = game.createInitialState();
  const circuit = game.getCircuit('industrial-park');
  const first = game.simulateRace(state, circuit, game.createSeededRandom(42));
  const second = game.simulateRace(state, circuit, game.createSeededRandom(42));
  assert.deepEqual(first, second);
  assert.equal(first.startPosition, game.GRID_SIZE);
  assert.equal(first.laps.length, circuit.laps);
  assert.equal(first.laps.at(-1).position, first.finalPosition);
  assert.equal(state.statistics.races, 0);

  const costs = game.calculateRaceCosts(state, circuit);
  const next = game.applyRaceResult(state, first, costs);
  assert.equal(next.money, state.money - costs.total + first.reward);
  assert.equal(next.statistics.races, 1);
  assert.ok(next.carCondition < state.carCondition);
});

test('reputation plus car and driver quality unlock the next commercial and racing tiers', () => {
  const state = game.createInitialState();
  const progressed = {
    ...state,
    reputation: 100,
    researchPoints: 45,
    car: { aero: 25, chassis: 25, engine: 25, durability: 25 },
    driver: { ...game.getDriver('luca-ramires') }
  };
  const championshipReady = {
    ...state,
    reputation: 520,
    researchPoints: 160,
    car: { aero: 46, chassis: 46, engine: 46, durability: 46 },
    driver: { ...game.getDriver('kian-varga') }
  };
  assert.deepEqual(game.getAvailableCircuits(state).map(circuit => circuit.id), ['industrial-park']);
  assert.deepEqual(game.getAvailableCircuits(progressed).map(circuit => circuit.id), ['industrial-park', 'ridgeway', 'aurora-ring']);
  assert.deepEqual(game.getAvailableCircuits(championshipReady).map(circuit => circuit.id), [
    'industrial-park', 'ridgeway', 'aurora-ring', 'ember-coast', 'blackstone-pass', 'halcyon-circuit'
  ]);
  assert.ok(game.getAvailableSponsors(progressed).length > game.getAvailableSponsors(state).length);
  assert.deepEqual(game.checkUnlocks(state, progressed).circuits.map(circuit => circuit.id), ['ridgeway', 'aurora-ring']);
  assert.ok(game.checkUnlocks(state, progressed).sponsors.some(sponsor => sponsor.id === 'northstar'));
});

test('engineer ceilings and race bonuses rise at every market tier', () => {
  for (let index = 1; index < game.engineers.length; index += 1) {
    assert.ok(game.engineers[index].upgradeCap > game.engineers[index - 1].upgradeCap);
    assert.ok(game.engineers[index].performanceBonus > game.engineers[index - 1].performanceBonus);
    assert.ok(game.engineers[index].raceCost > game.engineers[index - 1].raceCost);
  }
});

test('spending preserves enough cash to enter another race', () => {
  const state = game.createInitialState();
  const first = game.purchaseUpgrade(state, 'front-wing-minor');
  assert.equal(first.ok, true);
  const second = game.purchaseUpgrade(first.state, 'rear-wing-minor');
  assert.equal(second.reason, 'INSUFFICIENT_FUNDS');
  assert.ok(second.required > second.node.cost);
  assert.ok(first.state.money >= game.calculateOperatingReserve(first.state));
});

test('starter races earn money and reputation on average', () => {
  const state = game.createInitialState();
  const circuit = game.getCircuit('industrial-park');
  const costs = game.calculateRaceCosts(state, circuit);
  const rng = game.createSeededRandom(24680);
  let rewards = 0;
  let reputation = 0;
  for (let race = 0; race < 500; race += 1) {
    const result = game.simulateRace(state, circuit, rng);
    rewards += result.reward;
    reputation += result.reputationDelta;
  }
  assert.ok(rewards / 500 > costs.total);
  assert.ok(reputation / 500 >= 2);
  assert.ok(game.calculateRaceWinnings(circuit, 20, null, true).total >= costs.total);
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
