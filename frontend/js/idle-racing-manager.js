(() => {
  const engine = window.IdleRacingManagerEngine;
  const byId = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(value);
  const signed = value => `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;
  let state = engine.loadGame(localStorage);
  let activeRace = null;

  const path = window.location.pathname;
  if (path.startsWith('/f2/')) byId('irm-games-link').href = '/f2/games';
  else if (path.startsWith('/f3/')) byId('irm-games-link').href = '/f3/games';
  else if (path.startsWith('/academy/')) byId('irm-games-link').href = '/academy/games';

  const offline = engine.calculateOfflineProgress(state);
  state = offline.state;

  function selectedContract() {
    const available = engine.generateSponsorContracts(state);
    let contract = available.find(item => item.id === state.selectedContractId);
    if (!contract) {
      contract = available[0];
      state.selectedContractId = contract.id;
    }
    return contract;
  }

  function maximumReward(contract) {
    return engine.calculateRaceReward(contract, 1);
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

  function renderCar() {
    const stats = byId('irm-car-stats');
    stats.replaceChildren(...Object.entries(engine.STAT_LABELS).map(([category, label]) => {
      const level = state.car[category];
      const cost = engine.calculateUpgradeCost(state, category);
      const row = document.createElement('div');
      row.className = 'irm-car-stat';
      row.innerHTML = `<div><span>${label}</span><strong>${level}</strong></div><div class="irm-stat-meter"><i style="width:${level}%"></i></div>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.upgrade = category;
      button.disabled = Boolean(activeRace) || state.money < cost || level >= 100;
      button.innerHTML = level >= 100 ? '<b>MAX</b>' : `<b>+${engine.UPGRADE_STEP}</b><small>${money(cost)}</small>`;
      row.append(button);
      return row;
    }));
    const average = Object.values(state.car).reduce((sum, value) => sum + value, 0) / 4;
    byId('irm-car-rating').textContent = average.toFixed(1);
    byId('irm-condition').textContent = `${Math.round(state.carCondition)}%`;
    byId('irm-condition-bar').style.width = `${state.carCondition}%`;
    byId('irm-condition-bar').classList.toggle('warning', state.carCondition < 45);
    const serviceCost = engine.calculateServiceCost(state);
    byId('irm-service-cost').textContent = serviceCost ? money(serviceCost) : 'Ready';
    byId('irm-service').disabled = Boolean(activeRace) || !serviceCost || state.money < serviceCost;
  }

  function renderDriver() {
    byId('irm-driver-name').textContent = state.driver.name;
    const rating = Math.round((state.driver.pace + state.driver.consistency + state.driver.overtaking) / 3);
    byId('irm-driver-rating').textContent = rating;
    byId('irm-driver-cost').textContent = money(state.driver.raceCost);
    byId('irm-driver-stats').innerHTML = [
      ['Pace', state.driver.pace], ['Consistency', state.driver.consistency], ['Overtaking', state.driver.overtaking]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function renderContracts() {
    const available = engine.generateSponsorContracts(state);
    const availableIds = new Set(available.map(contract => contract.id));
    const nextLocked = engine.sponsorContracts.find(contract => !availableIds.has(contract.id));
    const shown = nextLocked ? [...available, nextLocked] : available;
    byId('irm-contract-count').textContent = `${available.length} available`;
    byId('irm-contract-list').replaceChildren(...shown.map(contract => {
      const circuit = engine.getCircuit(contract.circuitId);
      const unlocked = availableIds.has(contract.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `irm-contract-card${contract.id === state.selectedContractId ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      button.dataset.contract = contract.id;
      button.disabled = !unlocked || Boolean(activeRace);
      button.innerHTML = unlocked
        ? `<span>${contract.risk} contract</span><strong>${contract.sponsor}</strong><small>${circuit.name} · ${contract.laps} laps</small><b>P${contract.target} · ${money(contract.baseReward)}</b>`
        : `<span>Unlock at ${contract.unlockReputation} reputation</span><strong>${contract.sponsor}</strong><small>${circuit.name}</small><b>LOCKED</b>`;
      return button;
    }));
  }

  function renderRaceBrief() {
    const contract = selectedContract();
    const circuit = engine.getCircuit(contract.circuitId);
    const costs = engine.calculateRaceCosts(state, contract);
    byId('irm-circuit-tier').textContent = circuit.tier.toUpperCase();
    byId('irm-circuit-name').textContent = circuit.name;
    byId('irm-circuit-description').textContent = circuit.description;
    byId('irm-circuit-facts').innerHTML = [
      ['Length', `${circuit.length} km`], ['Difficulty', `${circuit.difficulty}/5`],
      ['Corners', circuit.corners], ['Tyre wear', circuit.tyreWear]
    ].map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('');
    byId('irm-entry-cost').textContent = money(costs.total);
    byId('irm-target').textContent = `Finish P${contract.target}`;
    byId('irm-max-reward').textContent = money(maximumReward(contract));
    byId('irm-start-detail').textContent = `${contract.laps} laps · ${circuit.name}`;
    byId('irm-start-race').disabled = Boolean(activeRace) || state.money < costs.total || state.carCondition < 15;
    byId('irm-start-race').title = state.money < costs.total
      ? `You need ${money(costs.total)} to enter`
      : state.carCondition < 15 ? 'Service the car before racing' : '';
  }

  function renderResources() {
    byId('irm-money').textContent = money(state.money);
    byId('irm-reputation').textContent = state.reputation.toLocaleString();
    byId('irm-research').textContent = `${state.researchPoints} RP`;
  }

  function render() {
    renderResources();
    renderCar();
    renderDriver();
    renderContracts();
    renderRaceBrief();
  }

  function save() {
    engine.saveGame(state, localStorage);
  }

  function showResult(result, costs, unlocks) {
    const contract = engine.getContract(result.contractId);
    const metTarget = result.targetMet;
    const net = result.reward - costs.total;
    const content = byId('irm-result-content');
    content.innerHTML = `
      <span class="irm-dialog-kicker">${metTarget ? 'CONTRACT COMPLETE' : 'TARGET MISSED'}</span>
      <strong class="irm-dialog-position">P${result.finalPosition}</strong>
      <h2>${metTarget ? `${contract.sponsor} pays out.` : 'The sponsor target was missed.'}</h2>
      <p>${result.issue ? result.issue.message : `Target: P${contract.target} or better.`}</p>
      <dl>
        <div><dt>Sponsor reward</dt><dd class="positive">${money(result.reward)}</dd></div>
        <div><dt>Running costs</dt><dd>−${money(costs.total)}</dd></div>
        <div><dt>Net result</dt><dd class="${net >= 0 ? 'positive' : 'negative'}">${signed(net)}</dd></div>
        <div><dt>Reputation</dt><dd>${result.reputationDelta >= 0 ? '+' : ''}${result.reputationDelta}</dd></div>
        <div><dt>Research</dt><dd>+${result.researchGained} RP</dd></div>
        <div><dt>Car wear</dt><dd>−${Math.round(result.wear)}%</dd></div>
      </dl>
      ${unlocks.circuits.length || unlocks.contracts.length ? `<p class="irm-unlock">Unlocked: ${[...unlocks.circuits.map(item => item.name), ...unlocks.contracts.map(item => item.sponsor)].join(', ')}</p>` : ''}
      <button type="button" data-close-dialog>Return to headquarters</button>`;
    byId('irm-result-dialog').showModal();
  }

  function completeRace() {
    if (!activeRace) return;
    clearTimeout(activeRace.timer);
    const { result, costs } = activeRace;
    const previous = state;
    state = engine.applyRaceResult(state, result, costs);
    const unlocks = engine.checkUnlocks(previous, state);
    activeRace = null;
    byId('irm-live-label').textContent = 'COMPLETE';
    byId('irm-race-status').textContent = 'Race complete';
    byId('irm-finish-race').disabled = true;
    save();
    render();
    showResult(result, costs, unlocks);
  }

  function showLap(lapData, totalLaps) {
    byId('irm-lap-label').textContent = `LAP ${lapData.lap} / ${totalLaps}`;
    byId('irm-position').textContent = `P${lapData.position}`;
    byId('irm-performance').textContent = `Performance ${lapData.performance}`;
    byId('irm-race-progress').style.width = `${lapData.lap / totalLaps * 100}%`;
    addLog(`L${lapData.lap}`, lapData.event,
      /failure|issue|dropped|wear/i.test(lapData.event) ? 'warning' : /forward|flag/i.test(lapData.event) ? 'positive' : '');
  }

  function advanceRace() {
    if (!activeRace) return;
    const lapData = activeRace.result.laps[activeRace.index];
    showLap(lapData, activeRace.result.laps.length);
    activeRace.index += 1;
    if (activeRace.index >= activeRace.result.laps.length) {
      activeRace.timer = setTimeout(completeRace, 350);
      return;
    }
    const speed = Number(byId('irm-race-speed').value) || 1;
    activeRace.timer = setTimeout(advanceRace, 420 / speed);
  }

  function startRace() {
    if (activeRace) return;
    const contract = selectedContract();
    const costs = engine.calculateRaceCosts(state, contract);
    if (state.money < costs.total || state.carCondition < 15) return;
    const result = engine.simulateRace(state, contract);
    activeRace = { result, costs, index: 0, timer: null };
    byId('irm-race-log').replaceChildren();
    byId('irm-race-status').textContent = engine.getCircuit(contract.circuitId).name;
    byId('irm-live-label').textContent = 'LIVE';
    byId('irm-lap-label').textContent = `LAP 0 / ${contract.laps}`;
    byId('irm-position').textContent = 'P—';
    byId('irm-performance').textContent = `${contract.sponsor} contract underway`;
    byId('irm-race-progress').style.width = '0%';
    byId('irm-finish-race').disabled = false;
    addLog('GRID', `The team has entered ${contract.laps} laps at ${engine.getCircuit(contract.circuitId).name}.`);
    render();
    activeRace.timer = setTimeout(advanceRace, 300);
  }

  function finishInstantly() {
    if (!activeRace) return;
    clearTimeout(activeRace.timer);
    const finalLap = activeRace.result.laps.at(-1);
    showLap(finalLap, activeRace.result.laps.length);
    completeRace();
  }

  function showOfflineSummary(summary) {
    if (!summary.races) return;
    const hours = Math.floor(summary.elapsedMs / 3600000);
    const minutes = Math.floor(summary.elapsedMs % 3600000 / 60000);
    byId('irm-offline-content').innerHTML = `
      <span class="irm-dialog-kicker">WELCOME BACK</span>
      <h2>Your team kept working.</h2>
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

  byId('irm-contract-list').addEventListener('click', event => {
    const contractButton = event.target.closest('[data-contract]');
    if (!contractButton || contractButton.disabled || activeRace) return;
    state.selectedContractId = contractButton.dataset.contract;
    save();
    render();
  });
  byId('irm-car-stats').addEventListener('click', event => {
    const button = event.target.closest('[data-upgrade]');
    if (!button || activeRace) return;
    const result = engine.upgradeCar(state, button.dataset.upgrade);
    if (!result.ok) return;
    state = result.state;
    addLog('HQ', `${engine.STAT_LABELS[result.category]} improved by ${engine.UPGRADE_STEP}.`, 'positive');
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
  byId('irm-start-race').addEventListener('click', startRace);
  byId('irm-finish-race').addEventListener('click', finishInstantly);
  document.querySelectorAll('.irm-dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target.matches('[data-close-dialog]')) dialog.close();
  }));
  byId('irm-reset').addEventListener('click', () => {
    if (!window.confirm('Reset all Idle Racing Manager progress? This cannot be undone.')) return;
    localStorage.removeItem(engine.SAVE_KEY);
    state = engine.createInitialState();
    activeRace = null;
    byId('irm-race-log').innerHTML = '<li><time>HQ</time><span>A new privateer team is ready for its first contract.</span></li>';
    render();
    save();
  });

  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  setInterval(save, 30000);
  render();
  save();
  showOfflineSummary(offline.summary);
})();
