const systemForm = document.getElementById('points-system-form');
let systems = [];
let currentUser = null;

function syncCountingRuleInputs() {
  const whole = systemForm.elements.countBestRounds;
  const segmented = ['bestFirstRounds','firstRoundsWindow','bestLastRounds','lastRoundsWindow'].map(name => systemForm.elements[name]);
  const wholeActive = Boolean(whole.value);
  const segmentedActive = segmented.some(input => input.value);
  whole.disabled = segmentedActive;
  segmented.forEach(input => { input.disabled = wholeActive; });
}

function parsePointsInput(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean).map(Number);
}

function systemPayload() {
  const values = Object.fromEntries(new FormData(systemForm));
  return {
    name: values.name,
    racePoints: parsePointsInput(values.racePoints),
    sprintPoints: parsePointsInput(values.sprintPoints),
    qualifyingPoints: parsePointsInput(values.qualifyingPoints),
    poleBonus: Number(values.poleBonus || 0),
    fastestLapBonus: Number(values.fastestLapBonus || 0),
    fastestLapMaxPosition: values.fastestLapMaxPosition || null,
    countBestRounds: values.countBestRounds || null,
    bestFirstRounds: values.bestFirstRounds || null,
    firstRoundsWindow: values.firstRoundsWindow || null,
    bestLastRounds: values.bestLastRounds || null,
    lastRoundsWindow: values.lastRoundsWindow || null,
    sprintCountsTowardRound: systemForm.elements.sprintCountsTowardRound.checked,
    visibility: values.visibility
  };
}

function systemDetails(system) {
  const bonuses = [];
  if (Number(system.poleBonus)) bonuses.push(`${fmtNumber(system.poleBonus)} pole`);
  if (Number(system.fastestLapBonus)) bonuses.push(`${fmtNumber(system.fastestLapBonus)} fastest lap`);
  const counting = system.countBestRounds ? `best ${system.countBestRounds}` : system.bestFirstRounds || system.bestLastRounds ? 'segmented best results' : 'all rounds';
  return `${esc(system.racePoints.join('–'))} · ${counting}${system.qualifyingPoints.length ? ' · qualifying points' : ''}${bonuses.length ? ` · ${esc(bonuses.join(', '))}` : ''}`;
}

function systemCard(system, editable = false) {
  const content = `<span class="system-visibility">${esc(system.visibility)}${!editable ? ` · ${esc(system.ownerName)}` : ''}</span><strong>${esc(system.name)}</strong><small>${systemDetails(system)}</small>`;
  return editable
    ? `<button type="button" class="saved-system-card" data-system-id="${esc(system.id)}">${content}</button>`
    : `<article class="saved-system-card public-system-card">${content}</article>`;
}

function renderSystems() {
  const owned = systems.filter(system => system.owned);
  const published = systems.filter(system => !system.owned);
  document.getElementById('saved-systems').innerHTML = currentUser
    ? (owned.length ? owned.map(system => systemCard(system, true)).join('') : '<div class="empty-state">You have not created a custom points system yet.</div>')
    : '<div class="empty-state">Sign in to view and manage your private points systems.</div>';
  document.getElementById('public-systems').innerHTML = published.length
    ? published.map(system => systemCard(system)).join('')
    : '<div class="empty-state">No public points systems have been shared yet.</div>';
  document.querySelectorAll('[data-system-id]').forEach(button => button.addEventListener('click', () => editSystem(systems.find(system => system.id === button.dataset.systemId))));
}

function editSystem(system = null) {
  if (!currentUser) return;
  systemForm.reset();
  systemForm.hidden = false;
  systemForm.elements.id.value = system?.id || '';
  systemForm.elements.name.value = system?.name || '';
  systemForm.elements.racePoints.value = system?.racePoints?.join(', ') || '25, 18, 15, 12, 10, 8, 6, 4, 2, 1';
  systemForm.elements.sprintPoints.value = system?.sprintPoints?.join(', ') || '';
  systemForm.elements.qualifyingPoints.value = system?.qualifyingPoints?.join(', ') || '';
  systemForm.elements.poleBonus.value = system?.poleBonus || 0;
  systemForm.elements.fastestLapBonus.value = system?.fastestLapBonus || 0;
  systemForm.elements.fastestLapMaxPosition.value = system?.fastestLapMaxPosition || '';
  systemForm.elements.countBestRounds.value = system?.countBestRounds || '';
  systemForm.elements.bestFirstRounds.value = system?.bestFirstRounds || '';
  systemForm.elements.firstRoundsWindow.value = system?.firstRoundsWindow || '';
  systemForm.elements.bestLastRounds.value = system?.bestLastRounds || '';
  systemForm.elements.lastRoundsWindow.value = system?.lastRoundsWindow || '';
  syncCountingRuleInputs();
  systemForm.elements.visibility.value = system?.visibility || 'private';
  systemForm.elements.sprintCountsTowardRound.checked = system?.sprintCountsTowardRound ?? true;
  document.getElementById('points-form-kicker').textContent = system ? 'EDIT RULESET' : 'NEW RULESET';
  document.getElementById('points-form-title').textContent = system ? system.name : 'Create points system';
  document.getElementById('delete-system-button').hidden = !system;
  document.getElementById('points-system-message').textContent = '';
  systemForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadSystems() {
  systems = await getJSON('/api/points-systems');
  renderSystems();
}

async function initialise() {
  try {
    const account = await getJSON('/api/account');
    currentUser = account.user;
    document.getElementById('points-login-prompt').hidden = Boolean(currentUser);
    document.getElementById('new-system-button').hidden = !currentUser;
    await loadSystems();
  } catch (error) {
    setError('saved-systems', error.message);
  }
}

document.getElementById('new-system-button').addEventListener('click', () => editSystem());
['countBestRounds','bestFirstRounds','firstRoundsWindow','bestLastRounds','lastRoundsWindow'].forEach(name => systemForm.elements[name].addEventListener('input', syncCountingRuleInputs));
document.getElementById('cancel-system-button').addEventListener('click', () => { systemForm.hidden = true; });
systemForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = systemForm.elements.id.value;
  const message = document.getElementById('points-system-message');
  try {
    const response = await fetch(id ? `/api/points-systems/${encodeURIComponent(id)}` : '/api/points-systems', {
      method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(systemPayload())
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save points system.');
    systemForm.hidden = true;
    await loadSystems();
  } catch (error) { message.textContent = error.message; }
});
document.getElementById('delete-system-button').addEventListener('click', async () => {
  const id = systemForm.elements.id.value;
  if (!id || !window.confirm('Delete this points system?')) return;
  const response = await fetch(`/api/points-systems/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (response.ok) { systemForm.hidden = true; await loadSystems(); }
});

initialise();
