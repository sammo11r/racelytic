(function idleRacingManagerEngineModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IdleRacingManagerEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIdleRacingManagerEngine() {
  const GRID_SIZE = 14;
  const SAVE_KEY = 'racelytic-idle-racing-manager-v1';
  const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
  const STAT_LABELS = { aero: 'Aerodynamics', chassis: 'Chassis', engine: 'Engine', durability: 'Durability' };
  const POSITION_PAYOUTS = [1, .78, .65, .55, .48, .42, .36, .31, .27, .23, .19, .16, .14, .12];

  const circuits = [
    {
      id: 'industrial-park', name: 'Industrial Park', tier: 'Amateur circuit', difficulty: 1,
      length: 2.4, laps: 8, corners: 'Low', straights: 'High', tyreWear: 'Low',
      unlockReputation: 0, prizeFund: 2400, entryCost: 160, fuelPerLap: 22,
      description: 'Wide exits and long acceleration zones make this a forgiving place to begin.',
      weights: { engine: .4, aero: .16, chassis: .14 }
    },
    {
      id: 'ridgeway', name: 'Ridgeway', tier: 'Regional circuit', difficulty: 3,
      length: 4.7, laps: 14, corners: 'Very high', straights: 'Low', tyreWear: 'Medium',
      unlockReputation: 25, prizeFund: 7500, entryCost: 650, fuelPerLap: 31,
      description: 'A technical climb where balance, grip and a composed driver matter more than power.',
      weights: { engine: .14, aero: .39, chassis: .17 }
    },
    {
      id: 'aurora-ring', name: 'Aurora Ring', tier: 'Premier circuit', difficulty: 5,
      length: 6.1, laps: 24, corners: 'High', straights: 'High', tyreWear: 'High',
      unlockReputation: 80, prizeFund: 22000, entryCost: 2300, fuelPerLap: 43,
      description: 'A complete test of speed, tyre life and reliability over a demanding lap.',
      weights: { engine: .27, aero: .25, chassis: .18 }
    }
  ];

  const developmentDepartments = [
    {
      id: 'aerodynamics', label: 'Aerodynamics', stat: 'aero', centralId: 'aero-platform',
      nodes: [
        { id: 'aero-platform', name: 'Aero platform', description: 'The baseline airflow concept for the car.', x: 50, y: 8, cost: 0, effects: {} },
        { id: 'front-wing-mainplane', name: 'Front wing mainplane', description: 'Reshape the mainplane for a stronger, cleaner front load.', x: 30, y: 34, cost: 650, requires: ['aero-platform'], effects: { aero: 4 } },
        { id: 'engine-cover-fin', name: 'Engine cover fin', description: 'Stabilise the rear airflow through high-speed direction changes.', x: 70, y: 34, cost: 700, requires: ['aero-platform'], effects: { aero: 4 } },
        { id: 'front-wing-endplates', name: 'Endplates', description: 'Control front-tyre wake and retain usable downforce.', x: 15, y: 70, cost: 1800, requires: ['front-wing-mainplane'], effects: { aero: 7 } },
        { id: 'front-wing-flaps', name: 'Adjustable flap profiles', description: 'Expand the setup window for every circuit type.', x: 40, y: 70, cost: 1950, requires: ['front-wing-mainplane'], effects: { aero: 7 } },
        { id: 'floor-edge-vanes', name: 'Floor edge vanes', description: 'Seal the floor more consistently through yaw.', x: 60, y: 70, cost: 2100, requires: ['engine-cover-fin'], effects: { aero: 7 } },
        { id: 'diffuser-strakes', name: 'Diffuser strakes', description: 'Improve rear load without adding excessive drag.', x: 85, y: 70, cost: 2250, requires: ['engine-cover-fin'], effects: { aero: 7 } }
      ]
    },
    {
      id: 'chassis', label: 'Chassis', stat: 'chassis', centralId: 'chassis-platform',
      nodes: [
        { id: 'chassis-platform', name: 'Chassis platform', description: 'The structural and mechanical baseline of the car.', x: 50, y: 8, cost: 0, effects: {} },
        { id: 'weight-distribution', name: 'Weight distribution', description: 'Repackage systems to improve the car balance.', x: 30, y: 34, cost: 600, requires: ['chassis-platform'], effects: { chassis: 4 } },
        { id: 'suspension-geometry', name: 'Suspension geometry', description: 'Rework the platform control through fast corners.', x: 70, y: 34, cost: 750, requires: ['chassis-platform'], effects: { chassis: 4 } },
        { id: 'ballast-weights', name: 'Ballast weights', description: 'Use denser movable weights to tune balance by circuit.', x: 15, y: 70, cost: 1700, requires: ['weight-distribution'], effects: { chassis: 7 } },
        { id: 'lightweight-fasteners', name: 'Lightweight fasteners', description: 'Remove mass while preserving structural stiffness.', x: 40, y: 70, cost: 1900, requires: ['weight-distribution'], effects: { chassis: 7 } },
        { id: 'heave-spring', name: 'Heave spring package', description: 'Hold a stable platform under heavy aerodynamic load.', x: 60, y: 70, cost: 2050, requires: ['suspension-geometry'], effects: { chassis: 7 } },
        { id: 'pushrod-pickup', name: 'Pushrod pickup points', description: 'Improve mechanical response and tyre contact.', x: 85, y: 70, cost: 2200, requires: ['suspension-geometry'], effects: { chassis: 7 } }
      ]
    },
    {
      id: 'engine', label: 'Engine', stat: 'engine', centralId: 'engine-platform',
      nodes: [
        { id: 'engine-platform', name: 'Power unit platform', description: 'The base combustion and forced-induction package.', x: 50, y: 8, cost: 0, effects: {} },
        { id: 'cylinder-head-redesign', name: 'Cylinder head redesign', description: 'Improve gas flow and combustion efficiency.', x: 30, y: 34, cost: 700, requires: ['engine-platform'], effects: { engine: 4 } },
        { id: 'turbo-compressor', name: 'Turbo compressor', description: 'Increase charge density while controlling response.', x: 70, y: 34, cost: 800, requires: ['engine-platform'], effects: { engine: 4 } },
        { id: 'combustion-chamber', name: 'Combustion chamber', description: 'Extract more energy from every ignition event.', x: 15, y: 70, cost: 1950, requires: ['cylinder-head-redesign'], effects: { engine: 7 } },
        { id: 'valvetrain-profile', name: 'Valvetrain profile', description: 'Extend the useful power band at high engine speed.', x: 40, y: 70, cost: 2100, requires: ['cylinder-head-redesign'], effects: { engine: 7 } },
        { id: 'compressor-wheel', name: 'Compressor wheel', description: 'Deliver greater airflow with lower rotational inertia.', x: 60, y: 70, cost: 2250, requires: ['turbo-compressor'], effects: { engine: 7 } },
        { id: 'intercooler-routing', name: 'Intercooler routing', description: 'Reduce pressure loss between turbo and intake.', x: 85, y: 70, cost: 2400, requires: ['turbo-compressor'], effects: { engine: 7 } }
      ]
    },
    {
      id: 'durability', label: 'Durability', stat: 'durability', centralId: 'durability-platform',
      nodes: [
        { id: 'durability-platform', name: 'Reliability programme', description: 'The inspection and life-management baseline.', x: 50, y: 8, cost: 0, effects: {} },
        { id: 'reinforced-crankshaft', name: 'Reinforced crankshaft', description: 'Increase fatigue resistance under peak cylinder load.', x: 30, y: 34, cost: 650, requires: ['durability-platform'], effects: { durability: 4 } },
        { id: 'thermal-management', name: 'Thermal management', description: 'Control component temperatures over long races.', x: 70, y: 34, cost: 700, requires: ['durability-platform'], effects: { durability: 4 } },
        { id: 'main-bearing-shells', name: 'Main bearing shells', description: 'Reduce wear around the crankshaft journals.', x: 15, y: 70, cost: 1750, requires: ['reinforced-crankshaft'], effects: { durability: 7 } },
        { id: 'fatigue-monitoring', name: 'Fatigue monitoring', description: 'Detect structural life loss before a failure occurs.', x: 40, y: 70, cost: 1900, requires: ['reinforced-crankshaft'], effects: { durability: 7 } },
        { id: 'cooling-pumps', name: 'High-flow cooling pumps', description: 'Maintain stable temperatures in traffic and hot races.', x: 60, y: 70, cost: 2050, requires: ['thermal-management'], effects: { durability: 7 } },
        { id: 'heat-shielding', name: 'Composite heat shielding', description: 'Protect wiring, hydraulics and bodywork from heat soak.', x: 85, y: 70, cost: 2200, requires: ['thermal-management'], effects: { durability: 7 } }
      ]
    }
  ];
  const upgradeNodes = developmentDepartments.flatMap(department => department.nodes.map(node => ({ ...node, departmentId: department.id })));
  const startingUpgradeIds = developmentDepartments.map(department => department.centralId);

  const sponsors = [
    { id: 'copper-kettle', name: 'Copper Kettle Café', target: 10, multiplier: 1.2, contractRaces: 5, reputationRequired: 0, tagline: 'A forgiving first deal for a new privateer.' },
    { id: 'rivetworks', name: 'RivetWorks', target: 8, multiplier: 1.35, contractRaces: 6, reputationRequired: 10, tagline: 'Solid finishes turn into dependable backing.' },
    { id: 'bluepeak', name: 'BluePeak Batteries', target: 7, multiplier: 1.45, contractRaces: 6, reputationRequired: 25, tagline: 'Consistent points-paying pace earns a stronger return.' },
    { id: 'orbital-fibre', name: 'Orbital Fibre', target: 6, multiplier: 1.55, contractRaces: 7, reputationRequired: 45, tagline: 'A demanding technology partner chasing the front.' },
    { id: 'northstar', name: 'Northstar Mutual', target: 5, multiplier: 1.7, contractRaces: 8, reputationRequired: 80, tagline: 'Top-five results unlock a major prize boost.' },
    { id: 'vanta-mobility', name: 'Vanta Mobility', target: 4, multiplier: 1.85, contractRaces: 8, reputationRequired: 140, tagline: 'A high-profile deal with little room for error.' },
    { id: 'helix-foundry', name: 'Helix Foundry', target: 3, multiplier: 2, contractRaces: 10, reputationRequired: 240, tagline: 'Podiums double every circuit payout.' },
    { id: 'axiom-industries', name: 'Axiom Industries', target: 1, multiplier: 2.5, contractRaces: 12, reputationRequired: 400, tagline: 'Victory is the only result that satisfies Axiom.' }
  ];

  const drivers = [
    { id: 'mara-voss', name: 'Mara Voss', pace: 32, consistency: 36, overtaking: 40, raceCost: 350, signingBonus: 0, reputationRequired: 0 },
    { id: 'theo-mercer', name: 'Theo Mercer', pace: 42, consistency: 34, overtaking: 47, raceCost: 525, signingBonus: 750, reputationRequired: 0 },
    { id: 'imani-okafor', name: 'Imani Okafor', pace: 49, consistency: 54, overtaking: 46, raceCost: 775, signingBonus: 4500, reputationRequired: 20 },
    { id: 'luca-ramires', name: 'Luca Ramires', pace: 62, consistency: 51, overtaking: 64, raceCost: 1200, signingBonus: 9000, reputationRequired: 50 },
    { id: 'anika-sato', name: 'Anika Sato', pace: 69, consistency: 76, overtaking: 65, raceCost: 1850, signingBonus: 18000, reputationRequired: 90 },
    { id: 'elias-novak', name: 'Elias Novak', pace: 80, consistency: 71, overtaking: 82, raceCost: 3100, signingBonus: 38000, reputationRequired: 160 },
    { id: 'sofia-laurent', name: 'Sofia Laurent', pace: 89, consistency: 91, overtaking: 85, raceCost: 5250, signingBonus: 80000, reputationRequired: 280 },
    { id: 'kian-varga', name: 'Kian Varga', pace: 96, consistency: 93, overtaking: 96, raceCost: 8500, signingBonus: 150000, reputationRequired: 450 }
  ];

  const engineers = [
    { id: 'nia-calder', name: 'Nia Calder', title: 'Garage engineer', upgradeCap: 24, raceCost: 125, signingBonus: 0, reputationRequired: 0, researchRequired: 0 },
    { id: 'jon-bellamy', name: 'Jon Bellamy', title: 'Development engineer', upgradeCap: 38, raceCost: 300, signingBonus: 2500, reputationRequired: 15, researchRequired: 8 },
    { id: 'asha-vermeer', name: 'Asha Vermeer', title: 'Vehicle dynamics lead', upgradeCap: 52, raceCost: 650, signingBonus: 8500, reputationRequired: 40, researchRequired: 20 },
    { id: 'mateo-kovac', name: 'Mateo Kovac', title: 'Technical director', upgradeCap: 68, raceCost: 1200, signingBonus: 22000, reputationRequired: 85, researchRequired: 45 },
    { id: 'elena-park', name: 'Elena Park', title: 'Chief designer', upgradeCap: 84, raceCost: 2200, signingBonus: 55000, reputationRequired: 160, researchRequired: 85 },
    { id: 'idris-laurent', name: 'Idris Laurent', title: 'Championship engineer', upgradeCap: 100, raceCost: 4000, signingBonus: 125000, reputationRequired: 280, researchRequired: 150 }
  ];

  const copy = value => value ? { ...value } : null;
  const getCircuit = id => circuits.find(circuit => circuit.id === id);
  const getSponsor = id => sponsors.find(sponsor => sponsor.id === id);
  const getDriver = id => drivers.find(driver => driver.id === id);
  const getEngineer = id => engineers.find(engineer => engineer.id === id);
  const getDevelopmentDepartment = id => developmentDepartments.find(department => department.id === id);
  const getUpgradeNode = id => upgradeNodes.find(node => node.id === id);
  const driverRating = driver => Math.round((driver.pace + driver.consistency + driver.overtaking) / 3);
  const roundCurrency = value => Math.max(0, Math.round(value / 50) * 50);

  function createSponsorContract(sponsorOrId) {
    const sponsor = getSponsor(typeof sponsorOrId === 'string' ? sponsorOrId : sponsorOrId?.id);
    return sponsor ? { ...sponsor, racesRemaining: sponsor.contractRaces } : null;
  }

  function createInitialState(now = Date.now()) {
    return {
      version: 3,
      money: 2000,
      reputation: 0,
      researchPoints: 0,
      car: { aero: 10, chassis: 10, engine: 10, durability: 10 },
      development: { purchased: [...startingUpgradeIds] },
      carCondition: 100,
      driver: copy(drivers[0]),
      engineer: copy(engineers[0]),
      sponsor: createSponsorContract(sponsors[0]),
      selectedCircuitId: circuits[0].id,
      currentRace: null,
      statistics: { races: 0, wins: 0, podiums: 0, bestFinish: null, earnings: 0 },
      lastActive: now
    };
  }

  function getAvailableCircuits(state) {
    return circuits.filter(circuit => state.reputation >= circuit.unlockReputation);
  }

  function getAvailableSponsors(state) {
    return sponsors.filter(sponsor => state.reputation >= sponsor.reputationRequired);
  }

  function purchaseUpgrade(state, nodeOrId) {
    const node = getUpgradeNode(typeof nodeOrId === 'string' ? nodeOrId : nodeOrId?.id);
    if (!node) return { ok: false, reason: 'UNKNOWN_UPGRADE', state };
    const purchased = new Set(state.development?.purchased || startingUpgradeIds);
    if (purchased.has(node.id)) return { ok: false, reason: 'PURCHASED', node, state };
    const missing = (node.requires || []).filter(requirement => !purchased.has(requirement));
    if (missing.length) return { ok: false, reason: 'PREREQUISITE', node, missing, state };
    const engineer = getEngineer(state.engineer?.id) || engineers[0];
    const exceedsLimit = Object.entries(node.effects || {}).some(([stat, gain]) => state.car[stat] + gain > engineer.upgradeCap);
    if (exceedsLimit) {
      return { ok: false, reason: 'ENGINEER_LIMIT', node, engineer, limit: engineer.upgradeCap, state };
    }
    if (state.money < node.cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS', node, cost: node.cost, state };
    const next = structuredClone(state);
    next.money -= node.cost;
    next.development.purchased.push(node.id);
    for (const [stat, gain] of Object.entries(node.effects || {})) next.car[stat] = Math.min(100, next.car[stat] + gain);
    return { ok: true, cost: node.cost, node, state: next };
  }

  function calculateServiceCost(state) {
    if (state.carCondition >= 99.5) return 0;
    return roundCurrency((100 - state.carCondition) * (15 + (100 - state.car.durability) * .08));
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

  function calculateRaceCosts(state, circuitOrId) {
    const circuit = typeof circuitOrId === 'string' ? getCircuit(circuitOrId) : circuitOrId;
    if (!circuit) throw new Error('Unknown circuit');
    const maintenance = roundCurrency(circuit.laps * (7 + (100 - state.car.durability) * .055));
    const fuel = roundCurrency(circuit.laps * circuit.fuelPerLap);
    const engineer = (getEngineer(state.engineer?.id) || engineers[0]).raceCost;
    return {
      entry: circuit.entryCost,
      driver: state.driver.raceCost,
      engineer,
      fuel,
      maintenance,
      total: circuit.entryCost + state.driver.raceCost + engineer + fuel + maintenance
    };
  }

  function getAvailableDrivers(state) {
    return drivers.filter(driver => state.reputation >= driver.reputationRequired);
  }

  function signDriver(state, driverOrId) {
    const driver = getDriver(typeof driverOrId === 'string' ? driverOrId : driverOrId?.id);
    if (!driver) return { ok: false, reason: 'UNKNOWN_DRIVER', state };
    if (state.driver.id === driver.id) return { ok: false, reason: 'CURRENT_DRIVER', driver, state };
    if (state.reputation < driver.reputationRequired) return { ok: false, reason: 'REPUTATION_REQUIRED', driver, required: driver.reputationRequired, state };
    if (state.money < driver.signingBonus) return { ok: false, reason: 'INSUFFICIENT_FUNDS', driver, cost: driver.signingBonus, state };
    const next = structuredClone(state);
    next.money -= driver.signingBonus;
    next.driver = copy(driver);
    return { ok: true, driver, cost: driver.signingBonus, state: next };
  }

  function getAvailableEngineers(state) {
    return engineers.filter(engineer => state.reputation >= engineer.reputationRequired && state.researchPoints >= engineer.researchRequired);
  }

  function signEngineer(state, engineerOrId) {
    const engineer = getEngineer(typeof engineerOrId === 'string' ? engineerOrId : engineerOrId?.id);
    if (!engineer) return { ok: false, reason: 'UNKNOWN_ENGINEER', state };
    if (state.engineer?.id === engineer.id) return { ok: false, reason: 'CURRENT_ENGINEER', engineer, state };
    if (state.reputation < engineer.reputationRequired) return { ok: false, reason: 'REPUTATION_REQUIRED', engineer, required: engineer.reputationRequired, state };
    if (state.researchPoints < engineer.researchRequired) return { ok: false, reason: 'RESEARCH_REQUIRED', engineer, required: engineer.researchRequired, state };
    if (state.money < engineer.signingBonus) return { ok: false, reason: 'INSUFFICIENT_FUNDS', engineer, cost: engineer.signingBonus, state };
    const next = structuredClone(state);
    next.money -= engineer.signingBonus;
    next.engineer = copy(engineer);
    return { ok: true, engineer, cost: engineer.signingBonus, state: next };
  }

  function hireSponsor(state, sponsorOrId) {
    const sponsor = getSponsor(typeof sponsorOrId === 'string' ? sponsorOrId : sponsorOrId?.id);
    if (!sponsor) return { ok: false, reason: 'UNKNOWN_SPONSOR', state };
    if (state.sponsor?.racesRemaining > 0) return { ok: false, reason: 'ACTIVE_SPONSOR', sponsor: state.sponsor, state };
    if (state.reputation < sponsor.reputationRequired) return { ok: false, reason: 'REPUTATION_REQUIRED', sponsor, required: sponsor.reputationRequired, state };
    const next = structuredClone(state);
    next.sponsor = createSponsorContract(sponsor);
    return { ok: true, sponsor: next.sponsor, state: next };
  }

  function calculateRacePerformance(state, circuitOrId, rng = Math.random) {
    const circuit = typeof circuitOrId === 'string' ? getCircuit(circuitOrId) : circuitOrId;
    if (!circuit) throw new Error('Unknown circuit');
    const car = state.car;
    const driverScore = state.driver.pace * .52 + state.driver.consistency * .28 + state.driver.overtaking * .2;
    const carScore = car.engine * circuit.weights.engine + car.aero * circuit.weights.aero
      + car.chassis * circuit.weights.chassis + car.durability * .05;
    const conditionFactor = .82 + Math.max(0, Math.min(100, state.carCondition)) * .0018;
    const researchBonus = Math.min(5, state.researchPoints * .02);
    const varianceRange = Math.max(1.1, 3.5 - state.driver.consistency * .022);
    const variance = (rng() * 2 - 1) * varianceRange;
    return (carScore + driverScore * .25) * conditionFactor + researchBonus + variance;
  }

  function reliabilityIssue(state, rng = Math.random) {
    const chance = Math.max(.008, .105 - state.car.durability * .0012);
    if (rng() >= chance) return null;
    const severe = rng() < Math.max(.015, .07 - state.car.durability * .00055);
    return severe
      ? { type: 'failure', penalty: 100, message: 'A mechanical failure ended the race.' }
      : { type: 'minor', penalty: 3.5 + rng() * 4, message: 'A minor mechanical issue cost valuable time.' };
  }

  function calculateRaceWinnings(circuitOrId, position, sponsor = null, failed = false) {
    const circuit = typeof circuitOrId === 'string' ? getCircuit(circuitOrId) : circuitOrId;
    if (!circuit) throw new Error('Unknown circuit');
    const safePosition = Math.max(1, Math.min(GRID_SIZE, Number(position) || GRID_SIZE));
    const base = failed ? 0 : roundCurrency(circuit.prizeFund * POSITION_PAYOUTS[safePosition - 1]);
    const targetMet = Boolean(sponsor && !failed && safePosition <= sponsor.target);
    const multiplier = targetMet ? sponsor.multiplier : 1;
    const total = roundCurrency(base * multiplier);
    return { base, multiplier, sponsorBonus: total - base, total, targetMet };
  }

  function reputationForResult(circuit, position, failed) {
    if (failed) return -Math.max(1, circuit.difficulty - 1);
    if (position === 1) return 10 + circuit.difficulty;
    if (position === 2) return 8 + circuit.difficulty;
    if (position === 3) return 6 + circuit.difficulty;
    if (position <= 5) return 5;
    if (position <= 7) return 3;
    if (position <= 10) return 1;
    return 0;
  }

  function simulateRace(state, circuitOrId, rng = Math.random) {
    const circuit = typeof circuitOrId === 'string' ? getCircuit(circuitOrId) : circuitOrId;
    if (!circuit) throw new Error('Unknown circuit');
    let playerPerformance = calculateRacePerformance(state, circuit, rng);
    const issue = reliabilityIssue(state, rng);
    if (issue) playerPerformance -= issue.penalty;
    const fieldBase = 11.5 + circuit.difficulty * 4.7 + circuit.unlockReputation * .018;
    const opponents = Array.from({ length: GRID_SIZE - 1 }, (_, index) => {
      const fieldSpread = (index / (GRID_SIZE - 2) - .5) * 13;
      return fieldBase + fieldSpread + (rng() * 2 - 1) * 2.2;
    });
    const finalPosition = issue?.type === 'failure' ? GRID_SIZE : 1 + opponents.filter(score => score > playerPerformance).length;
    const startPosition = Math.max(1, Math.min(GRID_SIZE,
      Math.round(GRID_SIZE / 2 + (rng() * 2 - 1) * (4.5 - state.driver.consistency * .025))
    ));
    const laps = [];
    let previousPosition = startPosition;
    for (let lap = 1; lap <= circuit.laps; lap += 1) {
      const progress = lap / circuit.laps;
      const noise = Math.round((rng() * 2 - 1) * Math.max(.35, 1.8 - state.driver.consistency * .014));
      let position = Math.round(startPosition + (finalPosition - startPosition) * Math.pow(progress, .8) + noise);
      position = Math.max(1, Math.min(GRID_SIZE, position));
      if (lap === circuit.laps) position = finalPosition;
      let event = '';
      if (lap === 1) event = `Settled into P${position} after the opening lap.`;
      else if (position < previousPosition) event = `Moved forward to P${position}.`;
      else if (position > previousPosition) event = `Dropped back to P${position}.`;
      else if (lap === Math.ceil(circuit.laps * .55) && state.car.chassis < 35) event = 'Chassis balance is beginning to increase tyre wear.';
      else if (issue && lap === Math.max(2, Math.floor(circuit.laps * .7))) event = issue.message;
      else if (lap === circuit.laps) event = `Took the flag in P${position}.`;
      else event = `Holding P${position}; the race remains stable.`;
      laps.push({ lap, position, event, performance: Math.round(playerPerformance * 10) / 10 });
      previousPosition = position;
    }
    const failed = issue?.type === 'failure';
    const winnings = calculateRaceWinnings(circuit, finalPosition, state.sponsor, failed);
    const researchGained = failed ? 1 : Math.max(1, Math.round(circuit.laps / 10 + Math.max(0, 7 - finalPosition) * .35));
    const wear = Math.min(28, circuit.laps * (.16 + circuit.difficulty * .025) * (1.15 - state.car.chassis * .003));
    return {
      circuitId: circuit.id,
      sponsorId: state.sponsor?.id || null,
      laps,
      startPosition,
      finalPosition,
      issue,
      targetMet: winnings.targetMet,
      sponsorMultiplier: winnings.multiplier,
      baseWinnings: winnings.base,
      sponsorBonus: winnings.sponsorBonus,
      reward: winnings.total,
      reputationDelta: reputationForResult(circuit, finalPosition, failed),
      researchGained,
      wear,
      performance: playerPerformance
    };
  }

  function applyRaceResult(state, result, costs = calculateRaceCosts(state, result.circuitId)) {
    const next = structuredClone(state);
    next.money = Math.max(0, next.money - costs.total) + result.reward;
    next.reputation = Math.max(0, next.reputation + result.reputationDelta);
    next.researchPoints += result.researchGained;
    next.carCondition = Math.max(0, next.carCondition - result.wear);
    next.statistics.races += 1;
    next.statistics.wins += result.finalPosition === 1 ? 1 : 0;
    next.statistics.podiums += result.finalPosition <= 3 ? 1 : 0;
    next.statistics.bestFinish = next.statistics.bestFinish === null ? result.finalPosition : Math.min(next.statistics.bestFinish, result.finalPosition);
    next.statistics.earnings += result.reward;
    if (next.sponsor && result.sponsorId === next.sponsor.id) {
      next.sponsor.racesRemaining -= 1;
      if (next.sponsor.racesRemaining <= 0) next.sponsor = null;
    }
    next.currentRace = null;
    return next;
  }

  function checkUnlocks(previousState, nextState) {
    const circuitsBefore = new Set(getAvailableCircuits(previousState).map(item => item.id));
    const sponsorsBefore = new Set(getAvailableSponsors(previousState).map(item => item.id));
    const driversBefore = new Set(getAvailableDrivers(previousState).map(item => item.id));
    const engineersBefore = new Set(getAvailableEngineers(previousState).map(item => item.id));
    return {
      circuits: getAvailableCircuits(nextState).filter(item => !circuitsBefore.has(item.id)),
      sponsors: getAvailableSponsors(nextState).filter(item => !sponsorsBefore.has(item.id)),
      drivers: getAvailableDrivers(nextState).filter(item => !driversBefore.has(item.id)),
      engineers: getAvailableEngineers(nextState).filter(item => !engineersBefore.has(item.id))
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
    const selected = getCircuit(next.selectedCircuitId) || getAvailableCircuits(next)[0];
    const cycleMs = Math.max(12 * 60 * 1000, selected.laps * 75 * 1000);
    const possibleRaces = Math.min(24, Math.floor(elapsedMs / cycleMs));
    const summary = { elapsedMs, races: 0, money: 0, reputation: 0, research: 0, results: [] };
    const rng = createSeededRandom(Number(state.lastActive || now));
    for (let race = 0; race < possibleRaces; race += 1) {
      const circuit = getAvailableCircuits(next).find(item => item.id === next.selectedCircuitId) || getAvailableCircuits(next)[0];
      const costs = calculateRaceCosts(next, circuit);
      if (next.money < costs.total) break;
      const before = structuredClone(next);
      const result = simulateRace(next, circuit, rng);
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
    const savedDriver = getDriver(saved.driver?.id) || drivers.find(driver => driver.name === saved.driver?.name) || drivers[0];
    const savedEngineer = getEngineer(saved.engineer?.id) || engineers.find(engineer => engineer.name === saved.engineer?.name) || engineers[0];
    const savedCar = saved.car || {};
    const normalizedCar = {
      aero: Number(savedCar.aero ?? initial.car.aero),
      chassis: Number(savedCar.chassis ?? savedCar.tyres ?? initial.car.chassis),
      engine: Number(savedCar.engine ?? initial.car.engine),
      durability: Number(savedCar.durability ?? savedCar.reliability ?? initial.car.durability)
    };
    const validUpgradeIds = new Set(upgradeNodes.map(node => node.id));
    const purchasedUpgrades = [...new Set([
      ...startingUpgradeIds,
      ...((saved.development?.purchased || []).filter(id => validUpgradeIds.has(id)))
    ])];
    const legacySponsorId = saved.selectedContractId && getSponsor(saved.selectedContractId) ? saved.selectedContractId : sponsors[0].id;
    const hasSponsorField = Object.prototype.hasOwnProperty.call(saved, 'sponsor');
    const savedSponsor = hasSponsorField
      ? (saved.sponsor ? createSponsorContract(saved.sponsor.id || saved.sponsor) : null)
      : createSponsorContract(legacySponsorId);
    if (savedSponsor && Number.isFinite(Number(saved.sponsor?.racesRemaining))) {
      savedSponsor.racesRemaining = Math.max(1, Math.min(savedSponsor.contractRaces, Number(saved.sponsor.racesRemaining)));
    }
    const legacyCircuit = saved.selectedContractId === 'bluepeak' || saved.selectedContractId === 'orbital-fibre'
      ? 'ridgeway'
      : ['northstar', 'vanta-mobility', 'helix-foundry', 'axiom-industries'].includes(saved.selectedContractId)
        ? 'aurora-ring'
        : 'industrial-park';
    const selectedCircuitId = getCircuit(saved.selectedCircuitId)?.id || legacyCircuit;
    return {
      ...initial,
      ...saved,
      version: 3,
      car: normalizedCar,
      development: { purchased: purchasedUpgrades },
      driver: copy(savedDriver),
      engineer: copy(savedEngineer),
      sponsor: savedSponsor,
      selectedCircuitId,
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
    GRID_SIZE, OFFLINE_CAP_MS, POSITION_PAYOUTS, SAVE_KEY, STAT_LABELS,
    applyRaceResult, calculateOfflineProgress, calculateRaceCosts, calculateRacePerformance,
    calculateRaceWinnings, calculateServiceCost, checkUnlocks, circuits, developmentDepartments,
    createInitialState, createSeededRandom, createSponsorContract, driverRating, drivers, engineers,
    getAvailableCircuits, getAvailableDrivers, getAvailableEngineers, getAvailableSponsors, getCircuit,
    getDevelopmentDepartment, getDriver, getEngineer, getSponsor, getUpgradeNode, hireSponsor, loadGame,
    normalizeState, purchaseUpgrade, saveGame, serviceCar, signDriver, signEngineer, simulateRace,
    sponsors, upgradeNodes
  };
});
