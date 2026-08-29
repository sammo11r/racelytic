(() => {
  const engine = window.IdleRacingManagerEngine;
  const byId = id => document.getElementById(id);
  const TEST_RESOURCE_THRESHOLD = Number.MAX_SAFE_INTEGER / 2;
  // Temporary design-preview switch. Circuit requirements remain configured in
  // the engine so progression can be restored by changing this single value.
  const UNLOCK_ALL_CIRCUITS_FOR_PREVIEW = false;
  const money = value => new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(value);
  const signed = value => `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;
  const restoreNormalResources = current => {
    const initial = engine.createInitialState();
    return {
      ...current,
      money: current.money >= TEST_RESOURCE_THRESHOLD ? initial.money : current.money,
      reputation: current.reputation >= TEST_RESOURCE_THRESHOLD ? initial.reputation : current.reputation,
      researchPoints: current.researchPoints >= TEST_RESOURCE_THRESHOLD ? initial.researchPoints : current.researchPoints
    };
  };
  const RACE_LAP_MS = 5000;
  const gameRoot = document.querySelector('.irm-game');
  let state = restoreNormalResources(engine.loadGame(localStorage));
  let activeRace = null;
  let activeView = 'race';
  let activeDepartmentId = 'aerodynamics';
  let selectedUpgradeNodeId = null;
  let readyVisualCircuitId = null;
  let preparedRace = null;
  let upgradeTreeResizeObserver = null;
  const raceVisual = window.IdleRacingManagerVisual.create(byId('irm-race-canvas'), { getSpeed: () => 1 });

  const path = window.location.pathname;
  if (path.startsWith('/f2/')) byId('irm-games-link').href = '/f2/games';
  else if (path.startsWith('/f3/')) byId('irm-games-link').href = '/f3/games';
  else if (path.startsWith('/academy/')) byId('irm-games-link').href = '/academy/games';

  const offline = engine.calculateOfflineProgress(state);
  state = offline.state;

  function selectableCircuits() {
    return UNLOCK_ALL_CIRCUITS_FOR_PREVIEW ? engine.circuits : engine.getAvailableCircuits(state);
  }

  function selectedCircuit() {
    const available = selectableCircuits();
    let circuit = available.find(item => item.id === state.selectedCircuitId);
    if (!circuit) {
      circuit = available[0];
      state.selectedCircuitId = circuit.id;
    }
    return circuit;
  }

  function racePreparationKey(circuit) {
    return JSON.stringify({
      circuit: circuit.id,
      car: state.car,
      condition: state.carCondition,
      research: state.researchPoints,
      driver: state.driver,
      sponsor: state.sponsor
    });
  }

  function prepareRace(circuit) {
    const key = racePreparationKey(circuit);
    if (!preparedRace || preparedRace.key !== key) {
      preparedRace = { key, result: engine.simulateRace(state, circuit) };
    }
    return preparedRace.result;
  }

  function carRating() {
    return engine.carRating(state);
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
    if (view === 'development') requestAnimationFrame(renderDevelopmentConnections);
  }

  function renderResources() {
    byId('irm-money').textContent = money(state.money);
    byId('irm-reputation').textContent = state.reputation.toLocaleString();
    byId('irm-research').textContent = `${state.researchPoints} RP`;
  }

  function renderCar() {
    const rating = carRating().toFixed(1);
    byId('irm-race-car-rating').textContent = rating;
    byId('irm-race-car-detail').textContent = `${Math.round(state.carCondition)}% condition · L${state.engineer.upgradeCap} ceiling`;
    byId('irm-development-rating').textContent = rating;
    byId('irm-development-condition').textContent = `${Math.round(state.carCondition)}%`;
    byId('irm-development-ceiling').textContent = `L${state.engineer.upgradeCap}`;
    const serviceCost = engine.calculateServiceCost(state);
    byId('irm-service-cost').textContent = serviceCost ? money(serviceCost) : 'Ready';
    byId('irm-service').disabled = Boolean(activeRace) || !serviceCost || state.money < serviceCost;
    renderDevelopmentTabs();
    renderDevelopmentTree();
    renderUpgradeDetail();
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
      button.innerHTML = `<span>${department.label}</span><strong>${state.car[department.stat]}</strong><small>${installed}/${department.nodes.length} installed</small><i><b style="width:${installed / department.nodes.length * 100}%"></b></i>`;
      return button;
    }));
  }

  function renderDevelopmentConnections() {
    const tree = byId('irm-upgrade-tree');
    const svg = tree?.querySelector('svg');
    if (!tree || !svg) return;
    const treeRect = tree.getBoundingClientRect();
    if (!treeRect.width || !treeRect.height) return;
    const department = engine.getDevelopmentDepartment(activeDepartmentId) || engine.developmentDepartments[0];
    const purchased = new Set(state.development.purchased);
    const elements = new Map([...tree.querySelectorAll('[data-upgrade-node]')].map(element => [element.dataset.upgradeNode, element]));
    const paths = [];
    department.nodes.forEach(node => (node.requires || []).forEach(requirement => {
      const parentElement = elements.get(requirement);
      const nodeElement = elements.get(node.id);
      if (!parentElement || !nodeElement) return;
      const parentRect = parentElement.querySelector('.irm-node-symbol')?.getBoundingClientRect();
      const nodeRect = nodeElement.querySelector('.irm-node-symbol')?.getBoundingClientRect();
      if (!parentRect || !nodeRect) return;
      const x1 = parentRect.left - treeRect.left + parentRect.width / 2;
      const y1 = parentRect.top - treeRect.top + parentRect.height / 2;
      const x2 = nodeRect.left - treeRect.left + nodeRect.width / 2;
      const y2 = nodeRect.top - treeRect.top + nodeRect.height / 2;
      const midX = (x1 + x2) / 2;
      const stateClass = purchased.has(node.id) ? 'installed' : purchased.has(requirement) ? 'available' : '';
      paths.push(`<path class="${stateClass}" d="M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}"></path>`);
    }));
    svg.setAttribute('viewBox', `0 0 ${treeRect.width} ${treeRect.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = paths.join('');
  }

  function renderDevelopmentTree() {
    const department = engine.getDevelopmentDepartment(activeDepartmentId) || engine.developmentDepartments[0];
    const purchased = new Set(state.development.purchased);
    const nodeById = new Map(department.nodes.map(node => [node.id, node]));
    const installed = department.nodes.filter(node => purchased.has(node.id)).length;
    if (!nodeById.has(selectedUpgradeNodeId)) {
      selectedUpgradeNodeId = department.nodes.find(node => (
        !purchased.has(node.id) && (node.requires || []).every(requirement => purchased.has(requirement))
      ))?.id || department.nodes[0]?.id || null;
    }
    byId('irm-tree-title').textContent = department.label;
    byId('irm-tree-progress').textContent = `${installed} / ${department.nodes.length} installed`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const stages = document.createElement('div');
    stages.className = 'irm-tree-stages';
    stages.setAttribute('aria-hidden', 'true');
    stages.innerHTML = [
      ['Foundation', 12.2], ['Phase 1', 31.1], ['Phase 2', 50], ['Phase 3', 68.9], ['Innovation', 87.8]
    ].map(([label, position]) => `<span style="left:${position}%">${label}</span>`).join('');
    const nodes = department.nodes.map(node => {
      const isPurchased = purchased.has(node.id);
      const prerequisitesMet = (node.requires || []).every(requirement => purchased.has(requirement));
      const exceedsLimit = Object.entries(node.effects || {}).some(([stat, gain]) => state.car[stat] + gain > state.engineer.upgradeCap);
      const isLimited = !isPurchased && prerequisitesMet && exceedsLimit;
      const shape = node.tier ? node.tier.toLowerCase() : node.cost ? 'special' : 'foundation';
      const typeLabel = node.tier || (node.cost ? 'Special' : 'Foundation');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `irm-upgrade-node irm-upgrade-node-${shape}${isPurchased ? ' installed' : prerequisitesMet ? ' available' : ' locked'}${isLimited ? ' limited' : ''}${node.id === selectedUpgradeNodeId ? ' selected' : ''}`;
      button.style.left = `${5 + node.x * .9}%`;
      button.style.top = `${8 + node.y * .88}%`;
      button.dataset.upgradeNode = node.id;
      button.disabled = Boolean(activeRace);
      button.setAttribute('aria-label', `${typeLabel} upgrade: ${node.name}`);
      button.innerHTML = `<span class="irm-node-symbol" aria-hidden="true">${shape === 'special' ? isPurchased ? '★' : '☆' : ''}</span><span class="irm-node-name">${node.branch || node.name}</span>`;
      return button;
    });
    byId('irm-upgrade-tree').replaceChildren(stages, svg, ...nodes);
    requestAnimationFrame(renderDevelopmentConnections);
  }

  function renderUpgradeDetail() {
    const panel = byId('irm-upgrade-detail');
    const node = selectedUpgradeNodeId ? engine.getUpgradeNode(selectedUpgradeNodeId) : null;
    if (!node) {
      panel.innerHTML = `<div class="irm-upgrade-detail-empty"><span>NO UPGRADE SELECTED</span><p>Choose a symbol from the tree to see its details.</p></div>`;
      return;
    }
    const probe = engine.purchaseUpgrade(state, node.id);
    const isPurchased = probe.reason === 'PURCHASED';
    const missingNames = (probe.missing || []).map(id => engine.getUpgradeNode(id)?.name || id);
    const gain = Object.entries(node.effects || {}).map(([stat, value]) => `+${value} ${engine.STAT_LABELS[stat]}`).join(' · ') || 'No stat change';
    let statusLabel = 'Available';
    let statusTone = 'available';
    if (isPurchased) { statusLabel = 'Installed'; statusTone = 'installed'; }
    else if (probe.reason === 'PREREQUISITE') { statusLabel = 'Locked'; statusTone = 'locked'; }
    else if (probe.reason === 'ENGINEER_LIMIT') { statusLabel = `Engineer limit L${probe.limit}`; statusTone = 'limited'; }
    else if (probe.reason === 'INSUFFICIENT_FUNDS') { statusLabel = 'Insufficient funds'; statusTone = 'locked'; }
    const canBuy = probe.ok && !activeRace;
    const buyLabel = isPurchased ? 'Installed' : probe.reason === 'PREREQUISITE' ? 'Locked' : probe.reason === 'ENGINEER_LIMIT' ? `Requires engineer L${probe.limit}` : probe.reason === 'INSUFFICIENT_FUNDS' ? `Need ${money(probe.required || node.cost)}` : `Buy for ${node.cost ? money(node.cost) : 'free'}`;
    const typeLabel = node.tier || (node.cost ? 'Special upgrade' : 'Foundation');
    panel.innerHTML = `
      <div class="irm-upgrade-detail-head">
        <span class="irm-dialog-kicker">${typeLabel.toUpperCase()}${node.branch ? ` · ${node.branch.toUpperCase()}` : ''}</span>
        <h3>${node.branch || node.name}</h3>
        ${node.branch ? `<small>${node.name}</small>` : ''}
      </div>
      <p class="irm-upgrade-detail-copy">${node.description}</p>
      <dl class="irm-upgrade-detail-stats">
        <div><dt>Status</dt><dd class="irm-status-${statusTone}">${statusLabel}</dd></div>
        <div><dt>Cost</dt><dd>${node.cost ? money(node.cost) : 'Included'}</dd></div>
        <div><dt>Effect</dt><dd>${gain}</dd></div>
        ${missingNames.length ? `<div><dt>Requires</dt><dd>${missingNames.join(', ')}</dd></div>` : ''}
      </dl>
      <button type="button" class="irm-upgrade-buy" data-buy-node="${node.id}" ${canBuy ? '' : 'disabled'}>${buyLabel}</button>`;
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
    byId('irm-engineer-bonus').textContent = `+${state.engineer.performanceBonus.toFixed(1)}`;
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
    const available = selectableCircuits();
    const availableIds = new Set(available.map(circuit => circuit.id));
    const currentDriverRating = engine.driverRating(state.driver);
    byId('irm-circuit-count').textContent = `${available.length} available`;
    byId('irm-circuit-list').replaceChildren(...engine.circuits.map((circuit, index) => {
      const unlocked = availableIds.has(circuit.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `irm-circuit-card${circuit.id === state.selectedCircuitId ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      button.dataset.circuit = circuit.id;
      button.disabled = !unlocked || Boolean(activeRace);
      const unlockLabel = state.reputation < circuit.unlockReputation
        ? `Requires ${circuit.unlockReputation} reputation`
        : currentDriverRating < circuit.driverRatingRequired
          ? `Requires driver rating ${circuit.driverRatingRequired}`
          : circuit.tier;
      button.innerHTML = `<i>${String(index + 1).padStart(2, '0')}</i><span>${unlocked ? circuit.tier : unlockLabel}</span><strong>${circuit.name}</strong><small>${circuit.laps} laps · ${money(circuit.prizeFund)} winner's purse</small>`;
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
    byId('irm-nav-circuit').textContent = circuit.name;
    byId('irm-nav-race-meta').textContent = `${circuit.laps} laps · ${money(circuit.prizeFund)} purse`;
    if (!activeRace) {
      const preparation = prepareRace(circuit);
      byId('irm-lap-label').textContent = `LAP 0 / ${circuit.laps}`;
      byId('irm-position').textContent = `POS ${preparation.startPosition}`;
      byId('irm-race-progress').style.width = '0%';
    }
    if (!activeRace && readyVisualCircuitId !== circuit.id) {
      raceVisual.reset(circuit.id, engine.GRID_SIZE);
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
      const signingProbe = current || lockText ? null : engine.signEngineer(state, candidate.id);
      const unaffordable = signingProbe?.reason === 'INSUFFICIENT_FUNDS';
      const card = document.createElement('article');
      card.className = `irm-market-card${current ? ' current' : ''}${lockText ? ' locked' : ''}`;
      card.innerHTML = `
        <div class="irm-market-head"><div><span>${current ? 'CURRENT ENGINEER' : lockText ? lockText.toUpperCase() : 'AVAILABLE'}</span><h3>${candidate.name}</h3><p>${candidate.title} · +${candidate.performanceBonus.toFixed(1)} race pace</p></div><strong>L${candidate.upgradeCap}</strong></div>
        <dl><div><dt>Ceiling</dt><dd>Level ${candidate.upgradeCap}</dd></div><div><dt>Signing</dt><dd>${candidate.signingBonus ? money(candidate.signingBonus) : 'Founder'}</dd></div><div><dt>Per race</dt><dd>${money(candidate.raceCost)}</dd></div></dl>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.signEngineer = candidate.id;
      button.disabled = current || Boolean(lockText) || unaffordable || Boolean(activeRace);
      button.textContent = current ? 'Current engineer' : lockText || (unaffordable ? `Need ${money(signingProbe.required)}` : `Hire ${candidate.name}`);
      card.append(button);
      return card;
    }));
  }

  function renderDriverMarket() {
    byId('irm-driver-market-list').replaceChildren(...engine.drivers.map(driver => {
      const current = state.driver.id === driver.id;
      const locked = state.reputation < driver.reputationRequired;
      const signingProbe = current || locked ? null : engine.signDriver(state, driver.id);
      const unaffordable = signingProbe?.reason === 'INSUFFICIENT_FUNDS';
      const card = document.createElement('article');
      card.className = `irm-market-card${current ? ' current' : ''}${locked ? ' locked' : ''}`;
      card.innerHTML = `
        <div class="irm-market-head"><div><span>${current ? 'CURRENT DRIVER' : locked ? `REQUIRES ${driver.reputationRequired} REPUTATION` : 'AVAILABLE'}</span><h3>${driver.name}</h3><p>Pace ${driver.pace} · Consistency ${driver.consistency} · Overtaking ${driver.overtaking}</p></div><strong>${engine.driverRating(driver)}</strong></div>
        <dl><div><dt>Signing</dt><dd>${driver.signingBonus ? money(driver.signingBonus) : 'Academy'}</dd></div><div><dt>Per race</dt><dd>${money(driver.raceCost)}</dd></div><div><dt>Reputation</dt><dd>${driver.reputationRequired}</dd></div></dl>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.signDriver = driver.id;
      button.disabled = current || locked || unaffordable || Boolean(activeRace);
      button.textContent = current ? 'Current driver' : locked ? `Requires ${driver.reputationRequired} reputation` : unaffordable ? `Need ${money(signingProbe.required)}` : `Sign ${driver.name}`;
      card.append(button);
      return card;
    }));
  }

  function renderSponsorMarket() {
    const activeContract = Boolean(state.sponsor?.racesRemaining);
    const currentCarRating = carRating();
    byId('irm-sponsor-list').replaceChildren(...engine.sponsors.map(sponsor => {
      const current = state.sponsor?.id === sponsor.id;
      const reputationLocked = state.reputation < sponsor.reputationRequired;
      const carLocked = currentCarRating < sponsor.carRatingRequired;
      const locked = reputationLocked || carLocked;
      const requirement = reputationLocked
        ? `${sponsor.reputationRequired} reputation`
        : `${sponsor.carRatingRequired} car rating`;
      const card = document.createElement('article');
      card.className = `irm-sponsor-card${current ? ' current' : ''}${locked ? ' locked' : ''}`;
      card.innerHTML = `
        <div><span>${current ? 'ACTIVE CONTRACT' : locked ? `REQUIRES ${requirement.toUpperCase()}` : 'AVAILABLE'}</span><h3>${sponsor.name}</h3><p>${sponsor.tagline}</p></div>
        <dl><div><dt>Target</dt><dd>P${sponsor.target}</dd></div><div><dt>Multiplier</dt><dd>${sponsor.multiplier.toFixed(2)}×</dd></div><div><dt>Term</dt><dd>${sponsor.contractRaces} races</dd></div></dl>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.hireSponsor = sponsor.id;
      button.disabled = activeContract || locked || Boolean(activeRace);
      button.textContent = current ? `${state.sponsor.racesRemaining} races remaining` : activeContract ? 'Complete current contract first' : locked ? `Requires ${requirement}` : `Sign ${sponsor.contractRaces}-race contract`;
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
    byId('irm-fullscreen').setAttribute('aria-checked', String(fullscreen));
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
    byId('irm-race-stage').classList.remove('racing');
    save();
    render();
    showResult(result, costs, unlocks, expiredSponsor);
  }

  function showLap(lapData, totalLaps) {
    byId('irm-lap-label').textContent = `LAP ${lapData.lap} / ${totalLaps}`;
    byId('irm-position').textContent = `POS ${lapData.position}`;
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
    const result = prepareRace(circuit);
    activeRace = { result, costs, index: 0, timer: null };
    activeView = 'race';
    raceVisual.start({ circuitId: circuit.id, startPosition: result.startPosition, totalLaps: result.laps.length, fieldSize: engine.GRID_SIZE, lapDurationMs: RACE_LAP_MS });
    readyVisualCircuitId = circuit.id;
    byId('irm-race-log').replaceChildren();
    byId('irm-live-label').textContent = 'LIVE';
    byId('irm-lap-label').textContent = `LAP 0 / ${circuit.laps}`;
    byId('irm-position').textContent = `POS ${result.startPosition}`;
    byId('irm-race-progress').style.width = '0%';
    byId('irm-race-stage').classList.add('racing');
    addLog('GRID', `The team has entered the ${circuit.laps}-lap race at ${circuit.name}.`);
    render();
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
    selectedUpgradeNodeId = null;
    renderDevelopmentTabs();
    renderDevelopmentTree();
    renderUpgradeDetail();
  });
  byId('irm-upgrade-tree').addEventListener('click', event => {
    const button = event.target.closest('[data-upgrade-node]');
    if (!button || button.disabled) return;
    selectedUpgradeNodeId = button.dataset.upgradeNode;
    renderDevelopmentTree();
    renderUpgradeDetail();
  });
  byId('irm-upgrade-detail').addEventListener('click', event => {
    const button = event.target.closest('[data-buy-node]');
    if (!button || button.disabled || activeRace) return;
    const result = engine.purchaseUpgrade(state, button.dataset.buyNode);
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
    preparedRace = null;
    activeView = 'race';
    const circuit = selectedCircuit();
    raceVisual.reset(circuit.id, engine.GRID_SIZE);
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
  if (typeof ResizeObserver === 'function') {
    upgradeTreeResizeObserver = new ResizeObserver(renderDevelopmentConnections);
    upgradeTreeResizeObserver.observe(byId('irm-upgrade-tree'));
  } else {
    window.addEventListener('resize', renderDevelopmentConnections);
  }
  updateFullscreenButton();
  render();
  save();
  showOfflineSummary(offline.summary);
})();
