(() => {
  const engine = window.IdleRacingManagerEngine;
  const byId = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(value);
  const signed = value => `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;
  const RACE_LAP_MS = 520;
  const gameRoot = document.querySelector('.irm-game');
  let state = engine.loadGame(localStorage);
  let activeRace = null;
  let activeView = 'race';
  let activeDepartmentId = 'aerodynamics';
  let readyVisualCircuitId = null;
  const raceVisual = window.IdleRacingManagerVisual.create(byId('irm-race-canvas'), { getSpeed: () => 1 });

  const path = window.location.pathname;
  if (path.startsWith('/f2/')) byId('irm-games-link').href = '/f2/games';
  else if (path.startsWith('/f3/')) byId('irm-games-link').href = '/f3/games';
  else if (path.startsWith('/academy/')) byId('irm-games-link').href = '/academy/games';

  const offline = engine.calculateOfflineProgress(state);
  state = offline.state;

  function selectedCircuit() {
    const available = engine.getAvailableCircuits(state);
    let circuit = available.find(item => item.id === state.selectedCircuitId);
    if (!circuit) {
      circuit = available[0];
      state.selectedCircuitId = circuit.id;
    }
    return circuit;
  }

  function carRating() {
    return Object.values(state.car).reduce((sum, value) => sum + value, 0) / 4;
  }

  function addLog(label, text, tone = '') {
    const item = document.createElement('li');
    if (tone) item.className = tone;
    const time = document.createElement('time');
    time.textContent = label;
    const copy = document.createElement('span');
    copy.textContent = text;
    item.append(time, copy);
    byId('irm-race-log').append(item);
    byId('irm-race-log').scrollTop = byId('irm-race-log').scrollHeight;
  }

  function showView(view) {
    if (activeRace && view !== 'race') return;
    activeView = view;
    document.querySelectorAll('[data-view]').forEach(button => {
      const current = button.dataset.view === view;
      button.classList.toggle('active', current);
      if (current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-view-panel]').forEach(panel => {
      const current = panel.dataset.viewPanel === view;
      panel.hidden = !current;
      panel.classList.toggle('active', current);
    });
  }

  function renderResources() {
    byId('irm-money').textContent = money(state.money);
    byId('irm-reputation').textContent = state.reputation.toLocaleString();
    byId('irm-research').textContent = `${state.researchPoints} RP`;
  }

  function renderCar() {
    const rating = carRating().toFixed(1);
    byId('irm-car-rating').textContent = rating;
    byId('irm-race-car-rating').textContent = rating;
    byId('irm-race-car-detail').textContent = `${Math.round(state.carCondition)}% condition · L${state.engineer.upgradeCap} ceiling`;
    byId('irm-condition').textContent = `${Math.round(state.carCondition)}%`;
    byId('irm-condition-bar').style.width = `${state.carCondition}%`;
    byId('irm-condition-bar').classList.toggle('warning', state.carCondition < 45);
    byId('irm-development-limit').textContent = `Level ${state.engineer.upgradeCap}`;
    byId('irm-development-engineer').textContent = `${state.engineer.name} can develop every department to level ${state.engineer.upgradeCap}.`;
    byId('irm-department-summary').innerHTML = Object.entries(engine.STAT_LABELS).map(([stat, label]) => `
      <div><span>${label}</span><strong>${state.car[stat]}</strong><i><b style="width:${state.car[stat]}%"></b></i></div>`).join('');
    const serviceCost = engine.calculateServiceCost(state);
    byId('irm-service-cost').textContent = serviceCost ? money(serviceCost) : 'Ready';
    byId('irm-service').disabled = Boolean(activeRace) || !serviceCost || state.money < serviceCost;
    renderDevelopmentTabs();
    renderDevelopmentTree();
  }

  function renderDevelopmentTabs() {
    const purchased = new Set(state.development.purchased);
    byId('irm-department-tabs').replaceChildren(...engine.developmentDepartments.map(department => {
      const installed = department.nodes.filter(node => purchased.has(node.id)).length;
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'tab';
      button.dataset.department = department.id;
      button.className = department.id === activeDepartmentId ? 'active' : '';
      button.setAttribute('aria-selected', String(department.id === activeDepartmentId));
      button.innerHTML = `<span>${department.label}</span><strong>${state.car[department.stat]}</strong><small>${installed}/${department.nodes.length} installed</small>`;
      return button;
    }));
  }

  function renderDevelopmentTree() {
    const department = engine.getDevelopmentDepartment(activeDepartmentId) || engine.developmentDepartments[0];
    const purchased = new Set(state.development.purchased);
    const nodeById = new Map(department.nodes.map(node => [node.id, node]));
    const installed = department.nodes.filter(node => purchased.has(node.id)).length;
    byId('irm-tree-title').textContent = department.label;
    byId('irm-tree-progress').textContent = `${installed} / ${department.nodes.length} installed`;
    const lines = department.nodes.flatMap(node => (node.requires || []).map(requirement => {
      const parent = nodeById.get(requirement);
      if (!parent) return '';
      const stateClass = purchased.has(node.id) ? 'installed' : purchased.has(parent.id) ? 'available' : '';
      return `<path class="${stateClass}" d="M ${parent.x * 10} ${parent.y * 5.2 + 48} C ${parent.x * 10} ${node.y * 5.2 - 18}, ${node.x * 10} ${parent.y * 5.2 + 48}, ${node.x * 10} ${node.y * 5.2 - 18}"></path>`;
    })).join('');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 1000 520');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = lines;
    const nodes = department.nodes.map(node => {
      const isPurchased = purchased.has(node.id);
      const prerequisitesMet = (node.requires || []).every(requirement => purchased.has(requirement));
      const exceedsLimit = Object.entries(node.effects || {}).some(([stat, gain]) => state.car[stat] + gain > state.engineer.upgradeCap);
      const unaffordable = state.money < node.cost;
      const effects = Object.entries(node.effects || {}).map(([stat, gain]) => `+${gain} ${engine.STAT_LABELS[stat]}`).join(' · ');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `irm-upgrade-node${isPurchased ? ' installed' : prerequisitesMet ? ' available' : ' locked'}${exceedsLimit ? ' limited' : ''}`;
      button.style.left = `${node.x}%`;
      button.style.top = `${node.y}%`;
      button.dataset.upgradeNode = node.id;
      button.disabled = Boolean(activeRace) || isPurchased || !prerequisitesMet || exceedsLimit || unaffordable;
      const status = isPurchased ? 'INSTALLED' : !prerequisitesMet ? 'PATH LOCKED' : exceedsLimit ? `ENGINEER LIMIT ${state.engineer.upgradeCap}` : unaffordable ? `NEED ${money(node.cost)}` : node.cost ? money(node.cost) : 'FOUNDATION';
      button.innerHTML = `<span>${status}</span><strong>${node.name}</strong><p>${node.description}</p><small>${effects || 'Central node'}</small>`;
      return button;
    });
    byId('irm-upgrade-tree').replaceChildren(svg, ...nodes);
  }

  function renderDriver() {
    const rating = engine.driverRating(state.driver);
    byId('irm-driver-name').textContent = state.driver.name;
    byId('irm-driver-rating').textContent = rating;
    byId('irm-driver-cost').textContent = money(state.driver.raceCost);
    byId('irm-race-driver-name').textContent = state.driver.name;
    byId('irm-race-driver-detail').textContent = `Rating ${rating} · ${money(state.driver.raceCost)} per race`;
    byId('irm-driver-stats').innerHTML = [
      ['Pace', state.driver.pace], ['Consistency', state.driver.consistency], ['Overtaking', state.driver.overtaking]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function renderEngineer() {
    byId('irm-engineer-name').textContent = state.engineer.name;
    byId('irm-engineer-role').textContent = state.engineer.title;
    byId('irm-engineer-limit').textContent = `Level ${state.engineer.upgradeCap}`;
    byId('irm-engineer-cost').textContent = money(state.engineer.raceCost);
  }

  function renderSponsorSummary() {
    if (state.sponsor) {
      byId('irm-race-sponsor-name').textContent = state.sponsor.name;
      byId('irm-race-sponsor-detail').textContent = `P${state.sponsor.target} · ${state.sponsor.multiplier.toFixed(2)}× · ${state.sponsor.racesRemaining} race${state.sponsor.racesRemaining === 1 ? '' : 's'} left`;
      byId('irm-current-sponsor').className = 'irm-current-sponsor';
      byId('irm-current-sponsor').innerHTML = `
        <div><span>ACTIVE SPONSOR</span><h3>${state.sponsor.name}</h3><p>${state.sponsor.tagline}</p></div>
        <dl><div><dt>Target</dt><dd>Finish P${state.sponsor.target}</dd></div><div><dt>Multiplier</dt><dd>${state.sponsor.multiplier.toFixed(2)}×</dd></div><div><dt>Remaining</dt><dd>${state.sponsor.racesRemaining} races</dd></div></dl>`;
    } else {
      byId('irm-race-sponsor-name').textContent = 'No active sponsor';
      byId('irm-race-sponsor-detail').textContent = 'Race winnings will not receive a multiplier';
      byId('irm-current-sponsor').className = 'irm-current-sponsor empty';
      byId('irm-current-sponsor').innerHTML = '<div><span>NO ACTIVE CONTRACT</span><h3>Choose your next sponsor</h3><p>You can keep racing without backing, but your circuit winnings will not be multiplied.</p></div>';
    }
  }

  function renderCircuitPicker() {
    const available = engine.getAvailableCircuits(state);
    const availableIds = new Set(available.map(circuit => circuit.id));
    byId('irm-circuit-count').textContent = `${available.length} available`;
    byId('irm-circuit-list').replaceChildren(...engine.circuits.map((circuit, index) => {
      const unlocked = availableIds.has(circuit.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `irm-circuit-card${circuit.id === state.selectedCircuitId ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      button.dataset.circuit = circuit.id;
      button.disabled = !unlocked || Boolean(activeRace);
      button.innerHTML = `<i>${String(index + 1).padStart(2, '0')}</i><span>${unlocked ? circuit.tier : `Unlock at ${circuit.unlockReputation} reputation`}</span><strong>${circuit.name}</strong><small>${circuit.laps} laps · ${money(circuit.prizeFund)} winner's purse</small>`;
      return button;
    }));
  }

  function renderRaceBrief() {
    const circuit = selectedCircuit();
    const costs = engine.calculateRaceCosts(state, circuit);
    const sponsoredWin = engine.calculateRaceWinnings(circuit, 1, state.sponsor);
    const circuitIndex = engine.circuits.findIndex(item => item.id === circuit.id) + 1;
    byId('irm-circuit-number').textContent = String(circuitIndex).padStart(2, '0');
    byId('irm-circuit-tier').textContent = circuit.tier.toUpperCase();
    byId('irm-circuit-name').textContent = circuit.name;
    byId('irm-circuit-description').textContent = circuit.description;
    byId('irm-circuit-facts').innerHTML = [
      ['Length', `${circuit.length} km`], ['Laps', circuit.laps], ['Difficulty', `${circuit.difficulty}/5`], ['Tyre wear', circuit.tyreWear]
    ].map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('');
    byId('irm-entry-cost').textContent = money(costs.total);
    byId('irm-base-prize').textContent = money(circuit.prizeFund);
    byId('irm-sponsor-target').textContent = state.sponsor ? `Finish P${state.sponsor.target}` : 'No sponsor';
    byId('irm-sponsored-prize').textContent = money(sponsoredWin.total);
    byId('irm-start-detail').textContent = `${circuit.laps} laps · full race playback`;
    byId('irm-start-race').disabled = Boolean(activeRace) || state.money < costs.total || state.carCondition < 15;
    byId('irm-start-race').title = state.money < costs.total
      ? `You need ${money(costs.total)} to enter`
      : state.carCondition < 15 ? 'Service the car before racing' : '';
    byId('irm-race-readiness').textContent = activeRace ? 'RACING' : state.carCondition < 15 ? 'SERVICE REQUIRED' : state.money < costs.total ? 'FUNDS REQUIRED' : 'READY';
    byId('irm-nav-circuit').textContent = circuit.name;
    byId('irm-nav-race-meta').textContent = `${circuit.laps} laps · ${money(circuit.prizeFund)} purse`;
    if (!activeRace && readyVisualCircuitId !== circuit.id) {
      raceVisual.reset(circuit.id);
      readyVisualCircuitId = circuit.id;
    }
  }

  function engineerLockText(candidate) {
    const needs = [];
    if (state.reputation < candidate.reputationRequired) needs.push(`${candidate.reputationRequired} reputation`);
    if (state.researchPoints < candidate.researchRequired) needs.push(`${candidate.researchRequired} RP`);
    return needs.length ? `Requires ${needs.join(' + ')}` : '';
  }

  function renderEngineerMarket() {
    byId('irm-engineer-market-list').replaceChildren(...engine.engineers.map(candidate => {
      const current = state.engineer.id === candidate.id;
      const lockText = engineerLockText(candidate);
      const unaffordable = state.money < candidate.signingBonus;
      const card = document.createElement('article');
      card.className = `irm-market-card${current ? ' current' : ''}${lockText ? ' locked' : ''}`;
      card.innerHTML = `
        <div class="irm-market-head"><div><span>${current ? 'CURRENT ENGINEER' : lockText ? lockText.toUpperCase() : 'AVAILABLE'}</span><h3>${candidate.name}</h3><p>${candidate.title}</p></div><strong>L${candidate.upgradeCap}</strong></div>
        <dl><div><dt>Ceiling</dt><dd>Level ${candidate.upgradeCap}</dd></div><div><dt>Signing</dt><dd>${candidate.signingBonus ? money(candidate.signingBonus) : 'Founder'}</dd></div><div><dt>Per race</dt><dd>${money(candidate.raceCost)}</dd></div></dl>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.signEngineer = candidate.id;
      button.disabled = current || Boolean(lockText) || unaffordable || Boolean(activeRace);
      button.textContent = current ? 'Current engineer' : lockText || (unaffordable ? `Need ${money(candidate.signingBonus)}` : `Hire ${candidate.name}`);
      card.append(button);
      return card;
    }));
  }

  function renderDriverMarket() {
    byId('irm-driver-market-list').replaceChildren(...engine.drivers.map(driver => {
      const current = state.driver.id === driver.id;
      const locked = state.reputation < driver.reputationRequired;
      const unaffordable = state.money < driver.signingBonus;
      const card = document.createElement('article');
      card.className = `irm-market-card${current ? ' current' : ''}${locked ? ' locked' : ''}`;
      card.innerHTML = `
        <div class="irm-market-head"><div><span>${current ? 'CURRENT DRIVER' : locked ? `REQUIRES ${driver.reputationRequired} REPUTATION` : 'AVAILABLE'}</span><h3>${driver.name}</h3><p>Pace ${driver.pace} · Consistency ${driver.consistency} · Overtaking ${driver.overtaking}</p></div><strong>${engine.driverRating(driver)}</strong></div>
        <dl><div><dt>Signing</dt><dd>${driver.signingBonus ? money(driver.signingBonus) : 'Academy'}</dd></div><div><dt>Per race</dt><dd>${money(driver.raceCost)}</dd></div><div><dt>Reputation</dt><dd>${driver.reputationRequired}</dd></div></dl>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.signDriver = driver.id;
      button.disabled = current || locked || unaffordable || Boolean(activeRace);
      button.textContent = current ? 'Current driver' : locked ? `Requires ${driver.reputationRequired} reputation` : unaffordable ? `Need ${money(driver.signingBonus)}` : `Sign ${driver.name}`;
      card.append(button);
      return card;
    }));
  }

  function renderSponsorMarket() {
    const activeContract = Boolean(state.sponsor?.racesRemaining);
    byId('irm-sponsor-list').replaceChildren(...engine.sponsors.map(sponsor => {
      const current = state.sponsor?.id === sponsor.id;
      const locked = state.reputation < sponsor.reputationRequired;
      const card = document.createElement('article');
      card.className = `irm-sponsor-card${current ? ' current' : ''}${locked ? ' locked' : ''}`;
      card.innerHTML = `
        <div><span>${current ? 'ACTIVE CONTRACT' : locked ? `REQUIRES ${sponsor.reputationRequired} REPUTATION` : 'AVAILABLE'}</span><h3>${sponsor.name}</h3><p>${sponsor.tagline}</p></div>
        <dl><div><dt>Target</dt><dd>P${sponsor.target}</dd></div><div><dt>Multiplier</dt><dd>${sponsor.multiplier.toFixed(2)}×</dd></div><div><dt>Term</dt><dd>${sponsor.contractRaces} races</dd></div></dl>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.hireSponsor = sponsor.id;
      button.disabled = activeContract || locked || Boolean(activeRace);
      button.textContent = current ? `${state.sponsor.racesRemaining} races remaining` : activeContract ? 'Complete current contract first' : locked ? `Requires ${sponsor.reputationRequired} reputation` : `Sign ${sponsor.contractRaces}-race contract`;
      card.append(button);
      return card;
    }));
  }

  function renderNavigation() {
    document.querySelectorAll('[data-view]').forEach(button => {
      button.disabled = Boolean(activeRace) && button.dataset.view !== 'race';
    });
  }

  function render() {
    renderResources();
    renderCar();
    renderDriver();
    renderEngineer();
    renderSponsorSummary();
    renderCircuitPicker();
    renderRaceBrief();
    renderEngineerMarket();
    renderDriverMarket();
    renderSponsorMarket();
    renderNavigation();
    showView(activeRace ? 'race' : activeView);
  }

  function save() {
    engine.saveGame(state, localStorage);
  }

  function updateFullscreenButton() {
    const fullscreen = document.fullscreenElement === gameRoot;
    byId('irm-fullscreen').setAttribute('aria-pressed', String(fullscreen));
    byId('irm-fullscreen-label').textContent = fullscreen ? 'Exit fullscreen' : 'Fullscreen';
    byId('irm-fullscreen').title = fullscreen ? 'Exit fullscreen' : 'Open game in fullscreen';
  }

  async function toggleFullscreen() {
    if (!document.fullscreenEnabled || !gameRoot.requestFullscreen) return;
    try {
      if (document.fullscreenElement === gameRoot) await document.exitFullscreen();
      else await gameRoot.requestFullscreen();
    } catch {
      byId('irm-fullscreen').title = 'Fullscreen is unavailable in this browser';
    }
  }

  function showResult(result, costs, unlocks, expiredSponsor) {
    const circuit = engine.getCircuit(result.circuitId);
    const net = result.reward - costs.total;
    const sponsorCopy = result.sponsorId ? engine.getSponsor(result.sponsorId) : null;
    const unlocked = [
      ...unlocks.circuits.map(item => item.name),
      ...unlocks.sponsors.map(item => `${item.name} sponsor offer`),
      ...unlocks.drivers.map(item => `${item.name} in Drivers`),
      ...unlocks.engineers.map(item => `${item.name} in Engineers`)
    ];
    byId('irm-result-content').innerHTML = `
      <span class="irm-dialog-kicker">RACE COMPLETE · ${circuit.name.toUpperCase()}</span>
      <strong class="irm-dialog-position">P${result.finalPosition}</strong>
      <h2>${result.issue?.type === 'failure' ? 'A difficult day at the circuit.' : 'The team has banked the result.'}</h2>
      <p>${result.issue ? result.issue.message : sponsorCopy ? result.targetMet ? `${sponsorCopy.name}'s P${sponsorCopy.target} target was met.` : `${sponsorCopy.name}'s P${sponsorCopy.target} target was missed.` : 'The team raced without an active sponsor.'}</p>
      <dl>
        <div><dt>Circuit winnings</dt><dd>${money(result.baseWinnings)}</dd></div>
        <div><dt>Sponsor bonus</dt><dd class="${result.sponsorBonus ? 'positive' : ''}">${result.sponsorBonus ? `+${money(result.sponsorBonus)}` : money(0)}</dd></div>
        <div><dt>Running costs</dt><dd>−${money(costs.total)}</dd></div>
        <div><dt>Net result</dt><dd class="${net >= 0 ? 'positive' : 'negative'}">${signed(net)}</dd></div>
        <div><dt>Reputation</dt><dd>${result.reputationDelta >= 0 ? '+' : ''}${result.reputationDelta}</dd></div>
        <div><dt>Research</dt><dd>+${result.researchGained} RP</dd></div>
      </dl>
      ${expiredSponsor ? `<p class="irm-contract-ended">${expiredSponsor.name}'s contract has ended. Choose a new sponsor before the next race.</p>` : ''}
      ${unlocked.length ? `<p class="irm-unlock">Unlocked: ${unlocked.join(', ')}</p>` : ''}
      <button type="button" data-close-dialog>Return to headquarters</button>`;
    byId('irm-result-dialog').showModal();
  }

  function completeRace() {
    if (!activeRace) return;
    clearTimeout(activeRace.timer);
    const { result, costs } = activeRace;
    raceVisual.finish(result.finalPosition);
    const previous = state;
    state = engine.applyRaceResult(state, result, costs);
    const unlocks = engine.checkUnlocks(previous, state);
    const expiredSponsor = previous.sponsor && !state.sponsor ? previous.sponsor : null;
    activeRace = null;
    byId('irm-live-label').textContent = 'COMPLETE';
    byId('irm-race-status').textContent = 'Race complete';
    byId('irm-race-stage').classList.remove('racing');
    save();
    render();
    showResult(result, costs, unlocks, expiredSponsor);
  }

  function showLap(lapData, totalLaps) {
    byId('irm-lap-label').textContent = `LAP ${lapData.lap} / ${totalLaps}`;
    byId('irm-position').textContent = `P${lapData.position}`;
    byId('irm-performance').textContent = `Performance ${lapData.performance}`;
    byId('irm-race-progress').style.width = `${lapData.lap / totalLaps * 100}%`;
    raceVisual.updateLap(lapData);
    addLog(`L${lapData.lap}`, lapData.event,
      /failure|issue|dropped|wear/i.test(lapData.event) ? 'warning' : /forward|flag/i.test(lapData.event) ? 'positive' : '');
  }

  function advanceRace() {
    if (!activeRace) return;
    const lapData = activeRace.result.laps[activeRace.index];
    showLap(lapData, activeRace.result.laps.length);
    activeRace.index += 1;
    if (activeRace.index >= activeRace.result.laps.length) {
      activeRace.timer = setTimeout(completeRace, RACE_LAP_MS);
      return;
    }
    activeRace.timer = setTimeout(advanceRace, RACE_LAP_MS);
  }

  function startRace() {
    if (activeRace) return;
    const circuit = selectedCircuit();
    const costs = engine.calculateRaceCosts(state, circuit);
    if (state.money < costs.total || state.carCondition < 15) return;
    const result = engine.simulateRace(state, circuit);
    activeRace = { result, costs, index: 0, timer: null };
    activeView = 'race';
    raceVisual.start({ circuitId: circuit.id, startPosition: result.startPosition, totalLaps: result.laps.length });
    readyVisualCircuitId = circuit.id;
    byId('irm-race-log').replaceChildren();
    byId('irm-race-status').textContent = circuit.name;
    byId('irm-live-label').textContent = 'LIVE';
    byId('irm-lap-label').textContent = `LAP 0 / ${circuit.laps}`;
    byId('irm-position').textContent = 'P—';
    byId('irm-performance').textContent = `${money(circuit.prizeFund)} circuit purse`;
    byId('irm-race-progress').style.width = '0%';
    byId('irm-race-stage').classList.add('racing');
    addLog('GRID', `The team has entered the ${circuit.laps}-lap race at ${circuit.name}.`);
    render();
    byId('irm-race-stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
    activeRace.timer = setTimeout(advanceRace, RACE_LAP_MS);
  }

  function showOfflineSummary(summary) {
    if (!summary.races) return;
    const hours = Math.floor(summary.elapsedMs / 3600000);
    const minutes = Math.floor(summary.elapsedMs % 3600000 / 60000);
    byId('irm-offline-content').innerHTML = `
      <span class="irm-dialog-kicker">WELCOME BACK</span>
      <h2>Your team kept racing.</h2>
      <p>You were away for ${hours ? `${hours}h ` : ''}${minutes}m. Offline progress is capped at eight hours.</p>
      <dl>
        <div><dt>Races completed</dt><dd>${summary.races}</dd></div>
        <div><dt>Balance change</dt><dd class="${summary.money >= 0 ? 'positive' : 'negative'}">${signed(summary.money)}</dd></div>
        <div><dt>Reputation</dt><dd>${summary.reputation >= 0 ? '+' : ''}${summary.reputation}</dd></div>
        <div><dt>Research</dt><dd>+${summary.research} RP</dd></div>
      </dl>
      <button type="button" data-close-dialog>Continue</button>`;
    byId('irm-offline-dialog').showModal();
  }

  document.querySelector('.irm-game-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (!button || button.disabled) return;
    showView(button.dataset.view);
  });
  document.querySelector('.irm-workspace').addEventListener('click', event => {
    const jump = event.target.closest('[data-jump-view]');
    if (jump && !activeRace) showView(jump.dataset.jumpView);
  });
  byId('irm-circuit-list').addEventListener('click', event => {
    const button = event.target.closest('[data-circuit]');
    if (!button || button.disabled || activeRace) return;
    state.selectedCircuitId = button.dataset.circuit;
    save();
    render();
  });
  byId('irm-department-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-department]');
    if (!button || activeRace) return;
    activeDepartmentId = button.dataset.department;
    renderDevelopmentTabs();
    renderDevelopmentTree();
  });
  byId('irm-upgrade-tree').addEventListener('click', event => {
    const button = event.target.closest('[data-upgrade-node]');
    if (!button || button.disabled || activeRace) return;
    const result = engine.purchaseUpgrade(state, button.dataset.upgradeNode);
    if (!result.ok) return;
    state = result.state;
    const department = engine.developmentDepartments.find(item => item.stat in result.node.effects);
    addLog('HQ', `${result.node.name} installed${department ? ` by ${department.label}` : ''} for ${money(result.node.cost)}.`, 'positive');
    save();
    render();
  });
  byId('irm-service').addEventListener('click', () => {
    const result = engine.serviceCar(state);
    if (!result.ok || activeRace) return;
    state = result.state;
    addLog('HQ', `The car was fully serviced for ${money(result.cost)}.`, 'positive');
    save();
    render();
  });
  byId('irm-engineer-market-list').addEventListener('click', event => {
    const button = event.target.closest('[data-sign-engineer]');
    if (!button || button.disabled || activeRace) return;
    const result = engine.signEngineer(state, button.dataset.signEngineer);
    if (!result.ok) return;
    state = result.state;
    addLog('HQ', `${result.engineer.name} joined the team. Development can now reach level ${result.engineer.upgradeCap}.`, 'positive');
    save();
    render();
  });
  byId('irm-driver-market-list').addEventListener('click', event => {
    const button = event.target.closest('[data-sign-driver]');
    if (!button || button.disabled || activeRace) return;
    const result = engine.signDriver(state, button.dataset.signDriver);
    if (!result.ok) return;
    state = result.state;
    addLog('HQ', `${result.driver.name} joined the team for ${money(result.cost)}.`, 'positive');
    save();
    render();
  });
  byId('irm-sponsor-list').addEventListener('click', event => {
    const button = event.target.closest('[data-hire-sponsor]');
    if (!button || button.disabled || activeRace) return;
    const result = engine.hireSponsor(state, button.dataset.hireSponsor);
    if (!result.ok) return;
    state = result.state;
    addLog('HQ', `${result.sponsor.name} signed a ${result.sponsor.contractRaces}-race sponsorship deal.`, 'positive');
    save();
    render();
  });
  byId('irm-start-race').addEventListener('click', startRace);
  byId('irm-fullscreen').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.querySelectorAll('.irm-dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target.matches('[data-close-dialog]')) dialog.close();
  }));
  byId('irm-reset').addEventListener('click', () => {
    if (!window.confirm('Reset all Idle Racing Manager progress? This cannot be undone.')) return;
    localStorage.removeItem(engine.SAVE_KEY);
    state = engine.createInitialState();
    activeRace = null;
    activeView = 'race';
    const circuit = selectedCircuit();
    raceVisual.reset(circuit.id);
    readyVisualCircuitId = circuit.id;
    byId('irm-race-stage').classList.remove('racing');
    byId('irm-race-log').innerHTML = '<li><time>HQ</time><span>A new privateer team is ready for its first race.</span></li>';
    render();
    save();
  });

  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  setInterval(save, 30000);
  if (!document.fullscreenEnabled || !gameRoot.requestFullscreen) {
    byId('irm-fullscreen').disabled = true;
    byId('irm-fullscreen').title = 'Fullscreen is unavailable in this browser';
  }
  updateFullscreenButton();
  render();
  save();
  showOfflineSummary(offline.summary);
})();
