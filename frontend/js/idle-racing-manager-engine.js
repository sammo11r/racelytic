(function idleRacingManagerEngineModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IdleRacingManagerEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIdleRacingManagerEngine() {
  const GRID_SIZE = 14;
  const SAVE_KEY = 'racelytic-idle-racing-manager-v1';
  const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
  const UPGRADE_STEP = 2;
  const STAT_LABELS = { engine: 'Engine', aero: 'Aero', tyres: 'Tyres', reliability: 'Reliability' };

  const circuits = [
    {
      id: 'industrial-park', name: 'Industrial Park', tier: 'Amateur circuit', difficulty: 1,
      length: 2.4, corners: 'Low', straights: 'High', tyreWear: 'Low', unlockReputation: 0,
      description: 'Wide exits and long acceleration zones make this a forgiving place to begin.',
      weights: { engine: .4, aero: .16, tyres: .14 }
    },
    {
      id: 'ridgeway', name: 'Ridgeway', tier: 'Regional circuit', difficulty: 3,
      length: 4.7, corners: 'Very high', straights: 'Low', tyreWear: 'Medium', unlockReputation: 25,
      description: 'A technical climb where balance, grip and a composed driver matter more than power.',
      weights: { engine: .14, aero: .39, tyres: .17 }
    },
    {
      id: 'aurora-ring', name: 'Aurora Ring', tier: 'Premier circuit', difficulty: 5,
      length: 6.1, corners: 'High', straights: 'High', tyreWear: 'High', unlockReputation: 80,
      description: 'A complete test of speed, tyre life and reliability over a demanding lap.',
      weights: { engine: .27, aero: .25, tyres: .18 }
    }
  ];

  const sponsorContracts = [
    { id: 'copper-kettle', sponsor: 'Copper Kettle Café', circuitId: 'industrial-park', laps: 8, target: 10, baseReward: 2200, completionReward: 900, topFiveBonus: 700, podiumBonus: 1400, winBonus: 2800, entryCost: 160, fuelPerLap: 22, unlockReputation: 0, failurePenalty: 0, risk: 'Safe' },
    { id: 'rivetworks', sponsor: 'RivetWorks', circuitId: 'industrial-park', laps: 12, target: 8, baseReward: 3300, completionReward: 500, topFiveBonus: 1100, podiumBonus: 1900, winBonus: 3500, entryCost: 260, fuelPerLap: 24, unlockReputation: 0, failurePenalty: 1, risk: 'Balanced' },
    { id: 'bluepeak', sponsor: 'BluePeak Batteries', circuitId: 'ridgeway', laps: 14, target: 9, baseReward: 6800, topFiveBonus: 2100, podiumBonus: 3600, winBonus: 6500, entryCost: 650, fuelPerLap: 31, unlockReputation: 25, failurePenalty: 1, risk: 'Balanced' },
    { id: 'orbital-fibre', sponsor: 'Orbital Fibre', circuitId: 'ridgeway', laps: 20, target: 6, baseReward: 10500, topFiveBonus: 3500, podiumBonus: 6000, winBonus: 10500, entryCost: 1100, fuelPerLap: 34, unlockReputation: 45, failurePenalty: 2, risk: 'Bold' },
    { id: 'northstar', sponsor: 'Northstar Mutual', circuitId: 'aurora-ring', laps: 24, target: 7, baseReward: 19000, topFiveBonus: 6000, podiumBonus: 11000, winBonus: 19000, entryCost: 2300, fuelPerLap: 43, unlockReputation: 80, failurePenalty: 2, risk: 'Balanced' },
    { id: 'vanta-mobility', sponsor: 'Vanta Mobility', circuitId: 'aurora-ring', laps: 32, target: 4, baseReward: 32000, topFiveBonus: 9000, podiumBonus: 17000, winBonus: 30000, entryCost: 4100, fuelPerLap: 46, unlockReputation: 140, failurePenalty: 3, risk: 'High' },
    { id: 'helix-foundry', sponsor: 'Helix Foundry', circuitId: 'aurora-ring', laps: 50, target: 3, baseReward: 57000, topFiveBonus: 15000, podiumBonus: 27000, winBonus: 50000, entryCost: 7600, fuelPerLap: 50, unlockReputation: 240, failurePenalty: 4, risk: 'High' },
    { id: 'axiom-industries', sponsor: 'Axiom Industries', circuitId: 'aurora-ring', laps: 75, target: 1, baseReward: 110000, topFiveBonus: 25000, podiumBonus: 50000, winBonus: 100000, entryCost: 15000, fuelPerLap: 54, unlockReputation: 400, failurePenalty: 6, risk: 'Extreme' }
  ];

  function createInitialState(now = Date.now()) {
    return {
      version: 1,
      money: 2000,
      reputation: 0,
      researchPoints: 0,
      car: { engine: 10, aero: 10, tyres: 10, reliability: 10 },
      carCondition: 100,
      driver: { name: 'Mara Voss', pace: 32, consistency: 36, overtaking: 40, raceCost: 350 },
      selectedContractId: 'copper-kettle',
      currentRace: null,
      statistics: { races: 0, wins: 0, podiums: 0, bestFinish: null, earnings: 0 },
      lastActive: now
    };
  }

  function roundCurrency(value) {
    return Math.max(0, Math.round(value / 50) * 50);
  }

  function getCircuit(id) {
    return circuits.find(circuit => circuit.id === id);
  }

  function getContract(id) {
    return sponsorContracts.find(contract => contract.id === id);
  }

  function getAvailableCircuits(state) {
    return circuits.filter(circuit => state.reputation >= circuit.unlockReputation);
  }

  function generateSponsorContracts(state) {
    return sponsorContracts.filter(contract => (
      state.reputation >= contract.unlockReputation
      && state.reputation >= getCircuit(contract.circuitId).unlockReputation
    ));
  }

  function calculateUpgradeCost(state, category) {
    if (!STAT_LABELS[category]) return Infinity;
    const base = { engine: 600, aero: 550, tyres: 500, reliability: 575 }[category];
    return roundCurrency(base * Math.pow(1.145, Math.max(0, state.car[category] - 10) / UPGRADE_STEP));
  }

  function upgradeCar(state, category) {
    const cost = calculateUpgradeCost(state, category);
    if (!Number.isFinite(cost) || state.car[category] >= 100) return { ok: false, reason: 'MAX_LEVEL', state };
    if (state.money < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS', cost, state };
    const next = structuredClone(state);
    next.money -= cost;
    next.car[category] = Math.min(100, next.car[category] + UPGRADE_STEP);
    return { ok: true, cost, category, state: next };
  }

  function calculateServiceCost(state) {
    if (state.carCondition >= 99.5) return 0;
    return roundCurrency((100 - state.carCondition) * (15 + (100 - state.car.reliability) * .08));
  }

  function serviceCar(state) {
    const cost = calculateServiceCost(state);
    if (!cost) return { ok: false, reason: 'NOT_NEEDED', state };
    if (state.money < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS', cost, state };
    const next = structuredClone(state);
    next.money -= cost;
    next.carCondition = 100;
    return { ok: true, cost, state: next };
  }

  function calculateRaceCosts(state, contract) {
    const maintenance = roundCurrency(contract.laps * (7 + (100 - state.car.reliability) * .055));
    const fuel = roundCurrency(contract.laps * contract.fuelPerLap);
    return {
      entry: contract.entryCost,
      driver: state.driver.raceCost,
      fuel,
      maintenance,
      total: contract.entryCost + state.driver.raceCost + fuel + maintenance
    };
  }

  function calculateRacePerformance(state, contract, rng = Math.random) {
    const circuit = getCircuit(contract.circuitId);
    const car = state.car;
    const driverScore = state.driver.pace * .52 + state.driver.consistency * .28 + state.driver.overtaking * .2;
    const carScore = car.engine * circuit.weights.engine
      + car.aero * circuit.weights.aero
      + car.tyres * circuit.weights.tyres
      + car.reliability * .05;
    const conditionFactor = .82 + Math.max(0, Math.min(100, state.carCondition)) * .0018;
    const researchBonus = Math.min(5, state.researchPoints * .02);
    const varianceRange = Math.max(1.1, 3.5 - state.driver.consistency * .022);
    const variance = (rng() * 2 - 1) * varianceRange;
    return (carScore + driverScore * .25) * conditionFactor + researchBonus + variance;
  }

  function reliabilityIssue(state, rng = Math.random) {
    const chance = Math.max(.008, .105 - state.car.reliability * .0012);
    if (rng() >= chance) return null;
    const severe = rng() < Math.max(.015, .07 - state.car.reliability * .00055);
    return severe
      ? { type: 'failure', penalty: 100, message: 'A mechanical failure ended the race.' }
      : { type: 'minor', penalty: 3.5 + rng() * 4, message: 'A minor mechanical issue cost valuable time.' };
  }

  function calculateRaceReward(contract, position, failed = false) {
    if (failed) return contract.completionReward || 0;
    if (position > contract.target) return contract.completionReward || 0;
    let reward = contract.baseReward;
    if (position <= 5) reward += contract.topFiveBonus;
    if (position <= 3) reward += contract.podiumBonus;
    if (position === 1) reward += contract.winBonus;
    return reward;
  }

  function reputationForResult(contract, position, failed) {
    if (failed || position > contract.target) return -contract.failurePenalty;
    if (position === 1) return 15;
    if (position === 2) return 10;
    if (position === 3) return 8;
    if (position <= 5) return 5;
    if (position <= 7) return 3;
    return 1;
  }

  function simulateRace(state, contractOrId, rng = Math.random) {
    const contract = typeof contractOrId === 'string' ? getContract(contractOrId) : contractOrId;
    if (!contract) throw new Error('Unknown sponsor contract');
    const circuit = getCircuit(contract.circuitId);
    let playerPerformance = calculateRacePerformance(state, contract, rng);
    const issue = reliabilityIssue(state, rng);
    if (issue) playerPerformance -= issue.penalty;
    const fieldBase = 11.5 + circuit.difficulty * 4.7 + contract.unlockReputation * .018;
    const opponents = Array.from({ length: GRID_SIZE - 1 }, (_, index) => {
      const fieldSpread = (index / (GRID_SIZE - 2) - .5) * 13;
      return fieldBase + fieldSpread + (rng() * 2 - 1) * 2.2;
    });
    const finalPosition = issue?.type === 'failure'
      ? GRID_SIZE
      : 1 + opponents.filter(score => score > playerPerformance).length;
    const startPosition = Math.max(1, Math.min(GRID_SIZE,
      Math.round(GRID_SIZE / 2 + (rng() * 2 - 1) * (4.5 - state.driver.consistency * .025))
    ));
    const laps = [];
    let previousPosition = startPosition;
    for (let lap = 1; lap <= contract.laps; lap += 1) {
      const progress = lap / contract.laps;
      const noise = Math.round((rng() * 2 - 1) * Math.max(.35, 1.8 - state.driver.consistency * .014));
      let position = Math.round(startPosition + (finalPosition - startPosition) * Math.pow(progress, .8) + noise);
      position = Math.max(1, Math.min(GRID_SIZE, position));
      if (lap === contract.laps) position = finalPosition;
      let event = '';
      if (lap === 1) event = `Settled into P${position} after the opening lap.`;
      else if (position < previousPosition) event = `Moved forward to P${position}.`;
      else if (position > previousPosition) event = `Dropped back to P${position}.`;
      else if (lap === Math.ceil(contract.laps * .55) && state.car.tyres < 35) event = 'Tyre wear is beginning to affect the pace.';
      else if (issue && lap === Math.max(2, Math.floor(contract.laps * .7))) event = issue.message;
      else if (lap === contract.laps) event = `Took the flag in P${position}.`;
      else event = `Holding P${position}; the race remains stable.`;
      laps.push({ lap, position, event, performance: Math.round(playerPerformance * 10) / 10 });
      previousPosition = position;
    }
    const targetMet = issue?.type !== 'failure' && finalPosition <= contract.target;
    const reward = calculateRaceReward(contract, finalPosition, issue?.type === 'failure');
    const reputationDelta = reputationForResult(contract, finalPosition, issue?.type === 'failure');
    const researchGained = issue?.type === 'failure' ? 1 : Math.max(1, Math.round(contract.laps / 10 + Math.max(0, 7 - finalPosition) * .35));
    const wear = Math.min(28, contract.laps * (.16 + circuit.difficulty * .025) * (1.15 - state.car.tyres * .003));
    return { contractId: contract.id, circuitId: circuit.id, laps, finalPosition, issue, targetMet, reward, reputationDelta, researchGained, wear, performance: playerPerformance };
  }

  function applyRaceResult(state, result, costs = calculateRaceCosts(state, getContract(result.contractId))) {
    const next = structuredClone(state);
    next.money = Math.max(0, next.money - costs.total) + result.reward;
    next.reputation = Math.max(0, next.reputation + result.reputationDelta);
    next.researchPoints += result.researchGained;
    next.carCondition = Math.max(0, next.carCondition - result.wear);
    next.statistics.races += 1;
    next.statistics.wins += result.finalPosition === 1 ? 1 : 0;
    next.statistics.podiums += result.finalPosition <= 3 ? 1 : 0;
    next.statistics.bestFinish = next.statistics.bestFinish === null
      ? result.finalPosition
      : Math.min(next.statistics.bestFinish, result.finalPosition);
    next.statistics.earnings += result.reward;
    next.currentRace = null;
    return next;
  }

  function checkUnlocks(previousState, nextState) {
    const contractsBefore = new Set(generateSponsorContracts(previousState).map(contract => contract.id));
    const circuitsBefore = new Set(getAvailableCircuits(previousState).map(circuit => circuit.id));
    return {
      contracts: generateSponsorContracts(nextState).filter(contract => !contractsBefore.has(contract.id)),
      circuits: getAvailableCircuits(nextState).filter(circuit => !circuitsBefore.has(circuit.id))
    };
  }

  function createSeededRandom(seed) {
    let value = Math.abs(Number(seed) || 1) % 2147483647;
    return () => {
      value = value * 16807 % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function calculateOfflineProgress(state, now = Date.now()) {
    const next = structuredClone(state);
    const elapsedMs = Math.max(0, Math.min(OFFLINE_CAP_MS, now - Number(state.lastActive || now)));
    const contract = getContract(state.selectedContractId) || generateSponsorContracts(state)[0];
    const cycleMs = Math.max(12 * 60 * 1000, contract.laps * 75 * 1000);
    const possibleRaces = Math.min(24, Math.floor(elapsedMs / cycleMs));
    const summary = { elapsedMs, races: 0, money: 0, reputation: 0, research: 0, results: [] };
    const rng = createSeededRandom(Number(state.lastActive || now));
    for (let race = 0; race < possibleRaces; race += 1) {
      const available = generateSponsorContracts(next);
      const selected = available.find(item => item.id === next.selectedContractId) || available[0];
      const costs = calculateRaceCosts(next, selected);
      if (next.money < costs.total) break;
      const before = structuredClone(next);
      const result = simulateRace(next, selected, rng);
      Object.assign(next, applyRaceResult(next, result, costs));
      summary.races += 1;
      summary.money += next.money - before.money;
      summary.reputation += next.reputation - before.reputation;
      summary.research += next.researchPoints - before.researchPoints;
      summary.results.push(result.finalPosition);
    }
    next.lastActive = now;
    return { state: next, summary };
  }

  function normalizeState(saved, now = Date.now()) {
    const initial = createInitialState(now);
    if (!saved || typeof saved !== 'object') return initial;
    return {
      ...initial,
      ...saved,
      car: { ...initial.car, ...(saved.car || {}) },
      driver: { ...initial.driver, ...(saved.driver || {}) },
      statistics: { ...initial.statistics, ...(saved.statistics || {}) },
      currentRace: null
    };
  }

  function saveGame(state, storage, now = Date.now(), key = SAVE_KEY) {
    const saved = { ...state, currentRace: null, lastActive: now };
    storage.setItem(key, JSON.stringify(saved));
    return saved;
  }

  function loadGame(storage, now = Date.now(), key = SAVE_KEY) {
    try {
      return normalizeState(JSON.parse(storage.getItem(key)), now);
    } catch {
      return createInitialState(now);
    }
  }

  return {
    GRID_SIZE, OFFLINE_CAP_MS, SAVE_KEY, STAT_LABELS, UPGRADE_STEP,
    applyRaceResult, calculateOfflineProgress, calculateRaceCosts, calculateRacePerformance,
    calculateRaceReward, calculateServiceCost, calculateUpgradeCost, checkUnlocks,
    circuits, createInitialState, createSeededRandom, generateSponsorContracts,
    getAvailableCircuits, getCircuit, getContract, loadGame, normalizeState,
    saveGame, serviceCar, simulateRace, sponsorContracts, upgradeCar
  };
});
