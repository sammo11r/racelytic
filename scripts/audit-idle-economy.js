'use strict';

const game = require('../frontend/js/idle-racing-manager-engine');

function bestAffordableStaff(state, catalogue, available, sign) {
  const currentIndex = catalogue.findIndex(item => item.id === (sign === game.signDriver ? state.driver.id : state.engineer.id));
  for (let index = catalogue.length - 1; index > currentIndex; index -= 1) {
    const candidate = catalogue[index];
    if (!available(state).some(item => item.id === candidate.id)) continue;
    const result = sign(state, candidate.id);
    if (!result.ok) continue;
    const minimumRaceCost = game.calculateRaceCosts(result.state, game.circuits[0]).total;
    if (result.state.money >= minimumRaceCost) return result.state;
  }
  return state;
}

function buyAvailableUpgrades(state) {
  let next = state;
  let purchased = true;
  while (purchased) {
    purchased = false;
    const owned = new Set(next.development.purchased);
    const candidates = game.upgradeNodes
      .filter(node => !owned.has(node.id) && (node.requires || []).every(id => owned.has(id)))
      .sort((first, second) => first.cost - second.cost);
    for (const node of candidates) {
      const result = game.purchaseUpgrade(next, node.id);
      if (!result.ok) continue;
      const reserve = game.calculateRaceCosts(result.state, game.circuits[0]).total;
      if (result.state.money < reserve) continue;
      next = result.state;
      purchased = true;
      break;
    }
  }
  return next;
}

function bestAffordableCircuit(state) {
  return [...game.getAvailableCircuits(state)].reverse()
    .find(circuit => game.calculateRaceCosts(state, circuit).total <= state.money);
}

function runAudit(raceLimit = 160) {
  let state = game.createInitialState(0);
  const rng = game.createSeededRandom(8675309);
  const milestones = [];
  let previous = {
    circuit: state.selectedCircuitId,
    driver: state.driver.id,
    engineer: state.engineer.id,
    sponsor: state.sponsor.id
  };

  for (let race = 1; race <= raceLimit; race += 1) {
    state = bestAffordableStaff(state, game.engineers, game.getAvailableEngineers, game.signEngineer);
    state = bestAffordableStaff(state, game.drivers, game.getAvailableDrivers, game.signDriver);
    state = buyAvailableUpgrades(state);

    if (!state.sponsor) {
      const sponsor = [...game.getAvailableSponsors(state)].reverse()[0];
      if (sponsor) state = game.hireSponsor(state, sponsor.id).state;
    }

    if (state.carCondition < 45) {
      const serviced = game.serviceCar(state);
      if (serviced.ok && serviced.state.money >= game.calculateRaceCosts(serviced.state, game.circuits[0]).total) {
        state = serviced.state;
      }
    }

    const circuit = bestAffordableCircuit(state);
    if (!circuit) throw new Error(`Economy stalled before race ${race} with €${state.money}.`);
    state.selectedCircuitId = circuit.id;

    const current = {
      circuit: circuit.id,
      driver: state.driver.id,
      engineer: state.engineer.id,
      sponsor: state.sponsor?.id || 'none'
    };
    for (const key of Object.keys(current)) {
      if (current[key] !== previous[key]) milestones.push({
        race,
        type: key,
        value: current[key],
        money: state.money,
        reputation: state.reputation,
        researchPoints: state.researchPoints,
        carRating: Number(game.carRating(state).toFixed(1))
      });
    }
    previous = current;

    const costs = game.calculateRaceCosts(state, circuit);
    const result = game.simulateRace(state, circuit, rng);
    state = game.applyRaceResult(state, result, costs);
  }

  return {
    races: state.statistics.races,
    money: state.money,
    reputation: state.reputation,
    researchPoints: state.researchPoints,
    carRating: Number(game.carRating(state).toFixed(1)),
    upgrades: state.development.purchased.length,
    bestFinish: state.statistics.bestFinish,
    milestones
  };
}

if (require.main === module) console.log(JSON.stringify(runAudit(), null, 2));

module.exports = { runAudit };
