const authPanel = document.getElementById('account-auth');
const profilePanel = document.getElementById('account-profile');
const message = document.getElementById('account-message');
const systemManager = document.getElementById('points-system-manager');
const systemForm = document.getElementById('points-system-form');
const recordBook = document.getElementById('personal-record-book');
const championshipManager = document.getElementById('custom-championship-manager');
const communityLibrary = document.getElementById('community-library');
let ownedSystems = [];
let communitySystems = [];
let communityRecords = [];
let communityChampionships = [];
let communityType = 'all';

function syncCountingRuleInputs() {
  const whole = systemForm.elements.countBestRounds;
  const segmented = ['bestFirstRounds','firstRoundsWindow','bestLastRounds','lastRoundsWindow'].map(name => systemForm.elements[name]);
  const wholeActive = Boolean(whole.value);
  const segmentedActive = segmented.some(input => input.value);
  whole.disabled = segmentedActive;
  segmented.forEach(input => { input.disabled = wholeActive; });
}

function showTab(tab) {
  document.querySelectorAll('[data-account-tab]').forEach(button => {
    const active = button.dataset.accountTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.getElementById('login-form').hidden = tab !== 'login';
  document.getElementById('register-form').hidden = tab !== 'register';
  message.textContent = '';
}

function showUser(user) {
  authPanel.hidden = true;
  profilePanel.hidden = false;
  document.getElementById('account-name').textContent = user.displayName;
  document.getElementById('account-username').textContent = `@${user.username}`;
  document.getElementById('account-avatar').textContent = user.displayName.slice(0, 2).toUpperCase();
  systemManager.hidden = false;
  recordBook.hidden = false;
  championshipManager.hidden = false;
  communityLibrary.hidden = false;
  loadPointsSystems();
  loadSavedRecords();
  loadCustomChampionships();
}

async function loadCustomChampionships() {
  const championships = await getJSON('/api/custom-championships');
  const ownedChampionships = championships.filter(championship => championship.owned);
  communityChampionships = championships.filter(championship => !championship.owned && championship.visibility === 'public');
  const container = document.getElementById('saved-championships');
  container.innerHTML = ownedChampionships.length ? ownedChampionships.map(championship => `
    <article class="saved-record-card"><a href="${championship.configuration?.series==='f2'?'/f2/championship-builder':'/championship-builder'}?id=${encodeURIComponent(championship.id)}">
      <span>${esc(championship.visibility)} CHAMPIONSHIP</span><strong>${esc(championship.name)}</strong>
      <small>${fmtNumber(championship.configuration.raceIds.length)} races · ${fmtNumber(championship.configuration.driverIds.length)} drivers · ${esc(championship.configuration.pointsSystem.name)}</small>
    </a><button type="button" data-delete-championship="${esc(championship.id)}">Delete</button></article>`).join('')
    : '<div class="empty-state">You have not built a custom championship yet.</div>';
  container.querySelectorAll('[data-delete-championship]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Delete this custom championship?')) return;
    const response = await fetch(`/api/custom-championships/${encodeURIComponent(button.dataset.deleteChampionship)}`, { method: 'DELETE' });
    if (response.ok) loadCustomChampionships();
  }));
  renderCommunityLibrary();
}

function savedRecordUrl(configuration) {
  const query = new URLSearchParams();
  Object.entries(configuration || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '' && value !== false) query.set(key, String(value));
  });
  return `/records?${query}`;
}

async function loadSavedRecords() {
  const records = await getJSON('/api/records/saved');
  const ownedRecords = records.filter(record => record.owned);
  communityRecords = records.filter(record => !record.owned && record.visibility === 'public');
  const container = document.getElementById('saved-records');
  container.innerHTML = ownedRecords.length ? ownedRecords.map(record => {
    const config = record.configuration || {};
    const detail = [config.type === 'constructors' ? 'Constructors' : 'Drivers', config.category, config.fromYear || config.toYear ? `${config.fromYear || '1950'}–${config.toYear || 'present'}` : 'All-time', config.includeSprints ? 'Sprints included' : 'Grand Prix only'];
    return `<article class="saved-record-card"><a href="${esc(savedRecordUrl(config))}"><span>${esc(record.visibility)} RECORD</span><strong>${esc(record.name)}</strong><small>${esc(detail.join(' · '))}</small></a><button type="button" data-delete-record="${esc(record.id)}" aria-label="Delete ${esc(record.name)}">Delete</button></article>`;
  }).join('') : '<div class="empty-state">Your personal record book is empty. Save a result from the Records Explorer to add it here.</div>';
  container.querySelectorAll('[data-delete-record]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Remove this record from your personal record book?')) return;
    const response = await fetch(`/api/records/saved/${encodeURIComponent(button.dataset.deleteRecord)}`, { method: 'DELETE' });
    if (response.ok) loadSavedRecords();
  }));
  renderCommunityLibrary();
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

function editSystem(system = null) {
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

function renderSystems() {
  const container = document.getElementById('saved-systems');
  container.innerHTML = ownedSystems.length ? ownedSystems.map(system => `
    <button type="button" class="saved-system-card" data-system-id="${esc(system.id)}">
      <span class="system-visibility">${esc(system.visibility)}</span>
      <strong>${esc(system.name)}</strong>
      <small>${esc(system.racePoints.join('–'))} · ${system.countBestRounds ? `best ${system.countBestRounds}` : system.bestFirstRounds || system.bestLastRounds ? 'segmented best results' : 'all rounds'}${system.qualifyingPoints.length ? ' · qualifying points' : ''}</small>
    </button>`).join('') : '<div class="empty-state">You have not created a custom points system yet.</div>';
  container.querySelectorAll('[data-system-id]').forEach(button => button.addEventListener('click', () => editSystem(ownedSystems.find(system => system.id === button.dataset.systemId))));
}

async function loadPointsSystems() {
  const systems = await getJSON('/api/points-systems');
  ownedSystems = systems.filter(system => system.owned);
  communitySystems = systems.filter(system => !system.owned && system.visibility === 'public');
  renderSystems();
  renderCommunityLibrary();
}

function recordDetail(record) {
  const config = record.configuration || {};
  return [
    config.type === 'constructors' ? 'Constructors' : 'Drivers',
    config.category || 'wins',
    config.fromYear || config.toYear ? `${config.fromYear || '1950'}–${config.toYear || 'present'}` : 'All-time'
  ].join(' · ');
}

function communityItems() {
  return [
    ...communitySystems.map(system => ({
      type: 'points', label: 'Points system', name: system.name, owner: system.ownerName,
      detail: `${system.racePoints.join('–')} · ${system.qualifyingPoints.length ? 'qualifying points' : 'race and sprint scoring'}`,
      url: '/points-systems'
    })),
    ...communityRecords.map(record => ({
      type: 'records', label: 'Record', name: record.name, owner: record.ownerName,
      detail: recordDetail(record), url: savedRecordUrl(record.configuration)
    })),
    ...communityChampionships.map(championship => ({
      type: 'championships', label: 'Championship', name: championship.name, owner: championship.ownerName,
      detail: `${championship.configuration.raceIds.length} races · ${championship.configuration.driverIds.length} drivers · ${championship.configuration.pointsSystem.name}`,
      url: `${championship.configuration?.series==='f2'?'/f2/championship-builder':'/championship-builder'}?id=${encodeURIComponent(championship.id)}`
    }))
  ];
}

function renderCommunityLibrary() {
  const container = document.getElementById('community-results');
  if (!container) return;
  const query = document.getElementById('community-search')?.value.trim().toLocaleLowerCase() || '';
  const items = communityItems().filter(item =>
    (communityType === 'all' || item.type === communityType) &&
    (!query || `${item.name} ${item.owner} ${item.detail}`.toLocaleLowerCase().includes(query))
  );
  document.getElementById('community-results-summary').textContent = `${fmtNumber(items.length)} shared ${items.length === 1 ? 'creation' : 'creations'}`;
  container.innerHTML = items.length ? items.map(item => `
    <a class="community-card" href="${esc(item.url)}">
      <span>${esc(item.label)}</span>
      <strong>${esc(item.name)}</strong>
      <small>By ${esc(item.owner)}</small>
      <p>${esc(item.detail)}</p>
      <b>Open →</b>
    </a>
  `).join('') : '<div class="empty-state">No public creations match your search.</div>';
}

async function submitAccount(form, action) {
  const button = form.querySelector('button[type="submit"]');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = action === 'login' ? 'Signing in…' : 'Creating account…';
  message.textContent = '';
  try {
    const payload = Object.fromEntries(new FormData(form));
    if (action === 'register') payload.legalAccepted = form.elements.legalAccepted.checked;
    const response = await fetch(`/api/account/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    showUser(data.user);
    window.dispatchEvent(new CustomEvent('account-changed', { detail: data.user }));
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

document.querySelectorAll('[data-account-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.accountTab)));
document.getElementById('login-form').addEventListener('submit', event => { event.preventDefault(); submitAccount(event.currentTarget, 'login'); });
document.getElementById('register-form').addEventListener('submit', event => { event.preventDefault(); submitAccount(event.currentTarget, 'register'); });
document.getElementById('logout-button').addEventListener('click', async () => {
  await fetch('/api/account/logout', { method: 'POST' });
  profilePanel.hidden = true;
  authPanel.hidden = false;
  systemManager.hidden = true;
  recordBook.hidden = true;
  championshipManager.hidden = true;
  communityLibrary.hidden = true;
  systemForm.hidden = true;
  showTab('login');
  window.dispatchEvent(new CustomEvent('account-changed', { detail: null }));
});

document.getElementById('new-system-button').addEventListener('click', () => editSystem());
['countBestRounds','bestFirstRounds','firstRoundsWindow','bestLastRounds','lastRoundsWindow'].forEach(name => systemForm.elements[name].addEventListener('input', syncCountingRuleInputs));
document.getElementById('cancel-system-button').addEventListener('click', () => { systemForm.hidden = true; });
systemForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = systemForm.elements.id.value;
  const systemMessage = document.getElementById('points-system-message');
  try {
    const response = await fetch(id ? `/api/points-systems/${encodeURIComponent(id)}` : '/api/points-systems', {
      method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(systemPayload())
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save points system.');
    systemForm.hidden = true;
    await loadPointsSystems();
  } catch (error) { systemMessage.textContent = error.message; }
});
document.getElementById('delete-system-button').addEventListener('click', async () => {
  const id = systemForm.elements.id.value;
  if (!id || !window.confirm('Delete this points system?')) return;
  const response = await fetch(`/api/points-systems/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (response.ok) { systemForm.hidden = true; await loadPointsSystems(); }
});

document.getElementById('community-search').addEventListener('input', renderCommunityLibrary);
document.querySelectorAll('[data-community-type]').forEach(button => button.addEventListener('click', () => {
  communityType = button.dataset.communityType;
  document.querySelectorAll('[data-community-type]').forEach(item => item.classList.toggle('active', item === button));
  renderCommunityLibrary();
}));

getJSON('/api/account').then(data => data.user && showUser(data.user)).catch(() => {});
