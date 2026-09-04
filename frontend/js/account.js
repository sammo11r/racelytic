const accountById = id => document.getElementById(id);
const accountSeries = (() => {
  const requested = new URLSearchParams(location.search).get('series');
  if (['f1', 'f2', 'f3', 'academy'].includes(requested)) return requested;
  if (document.body.classList.contains('academy-mode')) return 'academy';
  if (document.body.classList.contains('f3-mode')) return 'f3';
  if (document.body.classList.contains('f2-mode')) return 'f2';
  return 'f1';
})();
const accountBase = accountSeries === 'f1' ? '' : `/${accountSeries}`;

let communitySystems = [];
let communityRecords = [];
let communityChampionships = [];
let communityType = 'all';

function pointsUrl() { return `${accountBase}/points-systems`; }
function recordsUrl() { return `${accountBase}/records`; }
function builderUrl(series = accountSeries) {
  return series === 'f1' ? '/championship-builder' : `/${series}/championship-builder`;
}

function configureAccountLinks() {
  ['points-library-link', 'manage-points-link'].forEach(id => { accountById(id).href = pointsUrl(); });
  ['records-library-link', 'explore-records-link'].forEach(id => { accountById(id).href = recordsUrl(); });
  ['championship-library-link', 'new-championship-link'].forEach(id => { accountById(id).href = builderUrl(); });
  accountById('community-page-link').href = `/community?series=${encodeURIComponent(accountSeries)}`;
}

function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach(error => { error.textContent = ''; });
}

function fieldError(form, name, text) {
  const error = form.querySelector(`[data-error-for="${name}"]`);
  if (error) error.textContent = text;
}

function showTab(tab) {
  document.querySelectorAll('[data-account-tab]').forEach(button => {
    const active = button.dataset.accountTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  accountById('login-form').hidden = tab !== 'login';
  accountById('register-form').hidden = tab !== 'register';
  clearFieldErrors(accountById('login-form'));
  clearFieldErrors(accountById('register-form'));
  accountById('account-message').textContent = '';
}

function showSignedOut(error = '') {
  accountById('account-loading').hidden = true;
  accountById('account-dashboard').hidden = true;
  accountById('account-auth-layout').hidden = false;
  accountById('account-message').textContent = error;
  document.title = 'Sign in · Racelytic';
}

function showUser(user) {
  accountById('account-loading').hidden = true;
  accountById('account-auth-layout').hidden = true;
  accountById('account-dashboard').hidden = false;
  accountById('account-name').textContent = user.displayName;
  accountById('account-username').textContent = `@${user.username}`;
  accountById('account-avatar').textContent = user.displayName.slice(0, 2).toUpperCase();
  document.title = 'Your account · Racelytic';
  loadDashboard();
}

function loadingState(container) {
  container.innerHTML = '<div class="account-empty-state"><span>Loading saved items…</span></div>';
}

function errorState(container, retry) {
  container.innerHTML = `<div class="account-error-state"><span>We could not load this part of your library.</span><button type="button">Try again</button></div>`;
  container.querySelector('button').addEventListener('click', retry);
}

function emptyState(container, text, href, action) {
  container.innerHTML = `<div class="account-empty-state"><span>${esc(text)}</span><a href="${esc(href)}">${esc(action)} →</a></div>`;
}

function savedRecordFormat(config) {
  if (config.category === 'championships') return 'Season titles';
  if (['f2', 'f3', 'academy'].includes(config.series)) {
    const format = config.raceFormat || (config.includeSprints ? 'all' : 'F');
    return format === 'all' ? 'All race formats' : format === 'F' ? (config.series === 'academy' ? 'Standard races' : 'Feature races') : (config.series === 'academy' ? 'Reverse-grid races' : 'Sprint races');
  }
  return config.includeSprints ? 'Grand Prix + sprint' : 'Grand Prix only';
}

function savedRecordUrl(configuration) {
  configuration = configuration || {};
  if (['f2', 'f3', 'academy'].includes(configuration.series) && !configuration.raceFormat) {
    configuration = { ...configuration, raceFormat: configuration.category === 'championships' ? 'all' : configuration.category === 'poles' ? 'F' : configuration.includeSprints ? 'all' : 'F' };
  }
  const query = new URLSearchParams();
  Object.entries(configuration).forEach(([key, value]) => {
    if (key !== 'series' && value !== null && value !== undefined && value !== '' && value !== false) query.set(key, String(value));
  });
  const series = ['f2', 'f3', 'academy'].includes(configuration.series) ? `/${configuration.series}` : '';
  return `${series}/records?${query}`;
}

function renderPoints(systems) {
  const container = accountById('saved-systems');
  accountById('points-system-count').textContent = fmtNumber(systems.length);
  if (!systems.length) return emptyState(container, 'You have not created a custom points system yet.', pointsUrl(), 'Create one');
  container.innerHTML = systems.slice(0, 6).map(system => `<a class="account-item-card" href="${esc(pointsUrl())}"><span>${esc(system.visibility)} POINTS SYSTEM</span><strong>${esc(system.name)}</strong><small>${esc(system.racePoints.join('–'))}${system.qualifyingPoints?.length ? ' · qualifying points' : ''}</small><b>Manage →</b></a>`).join('');
}

function renderRecords(records) {
  const container = accountById('saved-records');
  accountById('saved-record-count').textContent = fmtNumber(records.length);
  if (!records.length) return emptyState(container, 'Your personal record book is empty.', recordsUrl(), 'Explore records');
  container.innerHTML = records.slice(0, 6).map(record => {
    const config = record.configuration || {};
    const detail = `${config.type === 'constructors' ? (['f3', 'academy'].includes(config.series) ? 'Teams' : 'Constructors') : 'Drivers'} · ${config.category || 'wins'} · ${savedRecordFormat(config)}`;
    return `<a class="account-item-card" href="${esc(savedRecordUrl(config))}"><span>${esc(record.visibility)} RECORD</span><strong>${esc(record.name)}</strong><small>${esc(detail)}</small><b>Open →</b></a>`;
  }).join('');
}

function renderChampionships(championships) {
  const container = accountById('saved-championships');
  accountById('championship-count').textContent = fmtNumber(championships.length);
  if (!championships.length) return emptyState(container, 'You have not built a custom championship yet.', builderUrl(), 'Build one');
  container.innerHTML = championships.slice(0, 6).map(championship => {
    const config = championship.configuration || {};
    return `<a class="account-item-card" href="${esc(builderUrl(config.series))}?id=${encodeURIComponent(championship.id)}"><span>${esc(championship.visibility)} CHAMPIONSHIP</span><strong>${esc(championship.name)}</strong><small>${fmtNumber(config.raceIds?.length || 0)} races · ${fmtNumber(config.driverIds?.length || 0)} drivers · ${esc(config.pointsSystem?.name || 'Custom scoring')}</small><b>Continue →</b></a>`;
  }).join('');
}

function recordDetail(record) {
  const config = record.configuration || {};
  return [config.type === 'constructors' ? (['f3', 'academy'].includes(config.series) ? 'Teams' : 'Constructors') : 'Drivers', config.category || 'wins', savedRecordFormat(config)].join(' · ');
}

function communityItems() {
  return [
    ...communitySystems.map(system => ({ type: 'points', label: 'Points system', name: system.name, owner: system.ownerName, detail: `${system.racePoints.join('–')} · scoring rules`, url: pointsUrl() })),
    ...communityRecords.map(record => ({ type: 'records', label: 'Record', name: record.name, owner: record.ownerName, detail: recordDetail(record), url: savedRecordUrl(record.configuration) })),
    ...communityChampionships.map(championship => ({ type: 'championships', label: 'Championship', name: championship.name, owner: championship.ownerName, detail: `${championship.configuration.raceIds.length} races · ${championship.configuration.driverIds.length} drivers`, url: `${builderUrl(championship.configuration.series)}?id=${encodeURIComponent(championship.id)}` }))
  ];
}

function renderCommunityLibrary() {
  const query = accountById('community-search').value.trim().toLocaleLowerCase();
  const items = communityItems().filter(item => (communityType === 'all' || item.type === communityType) && (!query || `${item.name} ${item.owner} ${item.detail}`.toLocaleLowerCase().includes(query)));
  accountById('community-results-summary').textContent = `${fmtNumber(items.length)} shared ${items.length === 1 ? 'creation' : 'creations'}`;
  accountById('community-results').innerHTML = items.length ? items.slice(0, 9).map(item => `<a class="community-card" href="${esc(item.url)}"><span>${esc(item.label)}</span><strong>${esc(item.name)}</strong><small>By ${esc(item.owner)}</small><p>${esc(item.detail)}</p><b>Open →</b></a>`).join('') : '<div class="account-empty-state"><span>No public creations match your search.</span></div>';
}

async function loadPoints() {
  const container = accountById('saved-systems'); loadingState(container);
  try { const all = await getJSON('/api/points-systems'); communitySystems = all.filter(item => !item.owned && item.visibility === 'public'); renderPoints(all.filter(item => item.owned)); }
  catch { accountById('points-system-count').textContent = '—'; errorState(container, loadPoints); }
  renderCommunityLibrary();
}
async function loadRecords() {
  const container = accountById('saved-records'); loadingState(container);
  try { const all = await getJSON('/api/records/saved'); communityRecords = all.filter(item => !item.owned && item.visibility === 'public'); renderRecords(all.filter(item => item.owned)); }
  catch { accountById('saved-record-count').textContent = '—'; errorState(container, loadRecords); }
  renderCommunityLibrary();
}
async function loadChampionships() {
  const container = accountById('saved-championships'); loadingState(container);
  try { const all = await getJSON('/api/custom-championships'); communityChampionships = all.filter(item => !item.owned && item.visibility === 'public'); renderChampionships(all.filter(item => item.owned)); }
  catch { accountById('championship-count').textContent = '—'; errorState(container, loadChampionships); }
  renderCommunityLibrary();
}
function loadDashboard() { loadPoints(); loadRecords(); loadChampionships(); }

function validateAuthForm(form, action) {
  clearFieldErrors(form);
  const username = form.elements.username.value.trim();
  const password = form.elements.password.value;
  let valid = true;
  if (!username) { fieldError(form, 'username', 'Enter your username.'); valid = false; }
  else if (action === 'register' && !/^[A-Za-z0-9_.-]{3,30}$/.test(username)) { fieldError(form, 'username', 'Use 3–30 permitted characters.'); valid = false; }
  if (!password) { fieldError(form, 'password', 'Enter your password.'); valid = false; }
  else if (action === 'register' && password.length < 10) { fieldError(form, 'password', 'Use at least 10 characters.'); valid = false; }
  if (action === 'register' && !form.elements.confirmPassword.value) { fieldError(form, 'confirmPassword', 'Confirm your password.'); valid = false; }
  else if (action === 'register' && form.elements.confirmPassword.value !== password) { fieldError(form, 'confirmPassword', 'Passwords do not match.'); valid = false; }
  if (action === 'register' && !form.elements.legalAccepted.checked) { accountById('account-message').textContent = 'Confirm your age and acceptance of the Terms and Privacy Notice.'; valid = false; }
  return valid;
}

async function submitAccount(form, action) {
  accountById('account-message').textContent = '';
  if (!validateAuthForm(form, action)) return;
  const button = form.querySelector('button[type="submit"]');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = action === 'login' ? 'Signing in…' : 'Creating account…';
  try {
    const payload = { username: form.elements.username.value.trim(), password: form.elements.password.value };
    if (action === 'register') payload.legalAccepted = form.elements.legalAccepted.checked;
    const response = await fetch(`/api/account/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    form.reset();
    showUser(data.user);
    window.dispatchEvent(new CustomEvent('account-changed', { detail: data.user }));
  } catch (error) { accountById('account-message').textContent = error.message; }
  finally { button.disabled = false; button.textContent = original; }
}

document.querySelectorAll('[data-account-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.accountTab)));
document.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', () => {
  const input = button.closest('.password-field').querySelector('input');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  button.textContent = showing ? 'Show' : 'Hide';
  button.setAttribute('aria-label', `${showing ? 'Show' : 'Hide'} password`);
}));
showTab(new URLSearchParams(location.search).get('tab') === 'register' ? 'register' : 'login');
configureAccountLinks();
accountById('login-form').addEventListener('submit', event => { event.preventDefault(); submitAccount(event.currentTarget, 'login'); });
accountById('register-form').addEventListener('submit', event => { event.preventDefault(); submitAccount(event.currentTarget, 'register'); });
accountById('logout-button').addEventListener('click', async () => {
  const response = await fetch('/api/account/logout', { method: 'POST' });
  if (!response.ok) return;
  showSignedOut();
  showTab('login');
  window.dispatchEvent(new CustomEvent('account-changed', { detail: null }));
});
accountById('community-search').addEventListener('input', renderCommunityLibrary);
document.querySelectorAll('[data-community-type]').forEach(button => button.addEventListener('click', () => {
  communityType = button.dataset.communityType;
  document.querySelectorAll('[data-community-type]').forEach(item => item.classList.toggle('active', item === button));
  renderCommunityLibrary();
}));
accountById('password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = accountById('password-message');
  const button = form.querySelector('button[type="submit"]');
  status.className = 'account-inline-message'; status.textContent = '';
  if (form.elements.newPassword.value.length < 10) { status.classList.add('error'); status.textContent = 'Use at least 10 characters.'; return; }
  if (form.elements.newPassword.value !== form.elements.confirmPassword.value) { status.classList.add('error'); status.textContent = 'New passwords do not match.'; return; }
  button.disabled = true; button.textContent = 'Updating…';
  try {
    const response = await fetch('/api/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: form.elements.currentPassword.value, newPassword: form.elements.newPassword.value }) });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update password.');
    form.reset(); status.classList.add('success'); status.textContent = 'Password updated.';
  } catch (error) { status.classList.add('error'); status.textContent = error.message; }
  finally { button.disabled = false; button.textContent = 'Update password'; }
});

getJSON('/api/account').then(data => data.user ? showUser(data.user) : showSignedOut()).catch(() => showSignedOut('We could not check your session. You can still try to sign in.'));
