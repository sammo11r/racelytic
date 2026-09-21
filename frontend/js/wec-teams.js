let wecTeams = [];
let latestWecTeamSeason = null;
let wecTeamState = { view: 'current', q: '', season: 'all', classCode: 'all', manufacturer: 'all', country: 'all', achievement: 'all', sort: 'recent', page: 1 };
const WEC_TEAM_PAGE_SIZE = 24;
const WEC_TEAM_CACHE_KEY = 'racelytic:wec:teams:v2';

function normalizeWecTeamText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function wecTeamClassLabel(code) { return String(code || '').replace(/-/g, ' '); }
function readWecTeamState() {
  const query = params();
  wecTeamState.view = query.get('view') === 'all' ? 'all' : 'current';
  wecTeamState.q = String(query.get('q') || '').trim();
  wecTeamState.season = /^\d{4}$/.test(query.get('season') || '') ? query.get('season') : 'all';
  if (wecTeamState.season !== 'all') wecTeamState.view = 'all';
  wecTeamState.classCode = query.get('class') || 'all';
  wecTeamState.manufacturer = query.get('manufacturer') || 'all';
  wecTeamState.country = query.get('country') || 'all';
  wecTeamState.achievement = ['champions', 'overall-winners', 'class-winners', 'podiums'].includes(query.get('achievement')) ? query.get('achievement') : 'all';
  wecTeamState.sort = ['name', 'starts', 'wins', 'podiums', 'titles'].includes(query.get('sort')) ? query.get('sort') : 'recent';
  wecTeamState.page = Math.max(1, Number(query.get('page')) || 1);
}
function wecTeamArchivePath() {
  const query = new URLSearchParams();
  if (wecTeamState.view === 'all') query.set('view', 'all');
  if (wecTeamState.q) query.set('q', wecTeamState.q);
  if (wecTeamState.season !== 'all') query.set('season', wecTeamState.season);
  if (wecTeamState.classCode !== 'all') query.set('class', wecTeamState.classCode);
  if (wecTeamState.manufacturer !== 'all') query.set('manufacturer', wecTeamState.manufacturer);
  if (wecTeamState.country !== 'all') query.set('country', wecTeamState.country);
  if (wecTeamState.achievement !== 'all') query.set('achievement', wecTeamState.achievement);
  if (wecTeamState.sort !== 'recent') query.set('sort', wecTeamState.sort);
  if (wecTeamState.page > 1) query.set('page', wecTeamState.page);
  return `/wec/teams${query.size ? `?${query}` : ''}`;
}
function populateWecTeamFilters() {
  const years = [...new Set(wecTeams.flatMap(team => team.seasons))].sort((left, right) => right - left);
  const classes = [...new Set(wecTeams.flatMap(team => team.classCodes))].sort((left, right) => wecTeamClassLabel(left).localeCompare(wecTeamClassLabel(right)));
  const manufacturers = [...new Map(wecTeams.flatMap(team => team.manufacturers).map(manufacturer => [manufacturer.id, manufacturer.name])).entries()].sort((left, right) => left[1].localeCompare(right[1]));
  const countries = [...new Map(wecTeams.filter(team => team.countryId).map(team => [team.countryId, team.countryName || team.countryId])).entries()].sort((left, right) => left[1].localeCompare(right[1]));
  document.getElementById('wec-team-season').innerHTML = '<option value="all">All seasons</option>' + years.map(year => `<option value="${year}">${year}${year === latestWecTeamSeason ? ' · Latest recorded grid' : ''}</option>`).join('');
  document.getElementById('wec-team-class').innerHTML = '<option value="all">All classes</option>' + classes.map(code => `<option value="${esc(code)}">${esc(wecTeamClassLabel(code))}</option>`).join('');
  document.getElementById('wec-team-manufacturer').innerHTML = '<option value="all">All manufacturers</option>' + manufacturers.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  document.getElementById('wec-team-country').innerHTML = '<option value="all">All countries</option>' + countries.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  if (wecTeamState.season !== 'all' && !years.includes(Number(wecTeamState.season))) wecTeamState.season = 'all';
  if (wecTeamState.classCode !== 'all' && !classes.includes(wecTeamState.classCode)) wecTeamState.classCode = 'all';
  if (wecTeamState.manufacturer !== 'all' && !manufacturers.some(([id]) => id === wecTeamState.manufacturer)) wecTeamState.manufacturer = 'all';
  if (wecTeamState.country !== 'all' && !countries.some(([id]) => id === wecTeamState.country)) wecTeamState.country = 'all';
}
function filteredWecTeams() {
  const search = normalizeWecTeamText(wecTeamState.q);
  const season = wecTeamState.view === 'current' ? latestWecTeamSeason : Number(wecTeamState.season) || null;
  return wecTeams.filter(team => {
    if (!WecArchiveScopeModel.matches(team, { from: season, to: season, classCode: wecTeamState.classCode,
      manufacturerId: wecTeamState.manufacturer, achievement: wecTeamState.achievement })) return false;
    if (wecTeamState.country !== 'all' && team.countryId !== wecTeamState.country) return false;
    const searchText = [team.name, team.countryName, ...team.classCodes, ...team.manufacturers.map(manufacturer => manufacturer.name)].filter(Boolean).join(' ');
    return !search || normalizeWecTeamText(searchText).includes(search);
  }).sort((left, right) => {
    const name = () => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    if (wecTeamState.sort === 'name') return name();
    if (wecTeamState.sort === 'starts') return right.starts - left.starts || name();
    if (wecTeamState.sort === 'wins') return right.classWins - left.classWins || right.overallWins - left.overallWins || name();
    if (wecTeamState.sort === 'podiums') return right.podiums - left.podiums || right.classWins - left.classWins || name();
    if (wecTeamState.sort === 'titles') return right.championships - left.championships || right.classWins - left.classWins || name();
    return Number(right.lastYear || 0) - Number(left.lastYear || 0) || right.starts - left.starts || name();
  });
}
function wecTeamCard(team) {
  const current = team.seasons.includes(latestWecTeamSeason);
  const career = team.firstYear ? (team.firstYear === team.lastYear ? `${team.firstYear} season` : `${team.firstYear}–${team.lastYear}`) : 'Participation unavailable';
  const classSummary = team.classCodes.slice(0, 2).map(wecTeamClassLabel).join(' · ') + (team.classCodes.length > 2 ? ` · +${team.classCodes.length - 2}` : '');
  const manufacturerSummary = team.manufacturers.slice(0, 2).map(manufacturer => manufacturer.name).join(' · ') + (team.manufacturers.length > 2 ? ` · +${team.manufacturers.length - 2}` : '');
  const flag = team.countryCode ? `<img src="/assets/flags/${esc(team.countryCode)}.svg" alt="" loading="lazy">` : '';
  const records = [];
  if (team.championships) records.push(`<span><strong>${fmtNumber(team.championships)}</strong> title${team.championships === 1 ? '' : 's'}</span>`);
  if (team.overallWins) records.push(`<span><strong>${fmtNumber(team.overallWins)}</strong> overall win${team.overallWins === 1 ? '' : 's'}</span>`);
  if (team.classWins) records.push(`<span><strong>${fmtNumber(team.classWins)}</strong> class win${team.classWins === 1 ? '' : 's'}</span>`);
  if (team.podiums) records.push(`<span><strong>${fmtNumber(team.podiums)}</strong> podium${team.podiums === 1 ? '' : 's'}</span>`);
  if (!records.length) records.push(`<span><strong>${fmtNumber(team.starts)}</strong> entries</span>`);
  const query = new URLSearchParams({ return: wecTeamArchivePath() });
  return `<a class="wec-team-card${team.championships ? ' is-champion' : ''}" href="${resourceUrl('team', team.id, { base: '/wec', query })}">
    ${team.championships ? `<em class="wec-team-title">${team.championships > 1 ? `${fmtNumber(team.championships)}× ` : ''}title winner</em>` : current ? '<em class="wec-team-current">Latest recorded grid</em>' : ''}
    <div class="wec-team-name"><h2>${esc(team.name)}</h2>${flag}</div>
    <p>${esc(team.countryName || 'Nationality unavailable')}</p>
    <div class="wec-team-context"><span>${esc(career)}</span><strong>${esc(classSummary || 'Class unavailable')}</strong></div>
    <div class="wec-team-manufacturers"><span>Cars</span><strong>${esc(manufacturerSummary || 'Manufacturer unavailable')}</strong></div>
    <div class="wec-team-record">${records.slice(0, 3).join('')}</div>
  </a>`;
}
function updateWecTeamControls() {
  document.getElementById('wec-team-search').value = wecTeamState.q;
  document.getElementById('wec-team-season').value = wecTeamState.view === 'current' ? String(latestWecTeamSeason) : wecTeamState.season;
  document.getElementById('wec-team-class').value = wecTeamState.classCode;
  document.getElementById('wec-team-manufacturer').value = wecTeamState.manufacturer;
  document.getElementById('wec-team-country').value = wecTeamState.country;
  document.getElementById('wec-team-achievement').value = wecTeamState.achievement;
  document.getElementById('wec-team-sort').value = wecTeamState.sort;
  document.querySelectorAll('[data-wec-team-view]').forEach(button => {
    const active = button.dataset.wecTeamView === wecTeamState.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function renderWecTeams(teams) {
  const target = document.getElementById('wec-teams');
  const paged = pageItems(teams, wecTeamState.page, WEC_TEAM_PAGE_SIZE);
  wecTeamState.page = paged.page;
  history.replaceState(null, '', wecTeamArchivePath());
  target.setAttribute('aria-busy', 'false');
  target.innerHTML = paged.items.length ? paged.items.map(wecTeamCard).join('') : `<div class="wec-team-empty"><p class="eyebrow">NO MATCHES</p><h2>No teams found</h2><p>Try another season, class, manufacturer or achievement.</p><button type="button" class="button primary" id="wec-team-empty-clear">Clear filters</button></div>`;
  document.getElementById('wec-team-empty-clear')?.addEventListener('click', clearWecTeamFilters);
  renderPagination('wec-teams', teams.length, wecTeamState.page, WEC_TEAM_PAGE_SIZE, page => { wecTeamState.page = page; updateWecTeams(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
function updateWecTeams() {
  const teams = filteredWecTeams();
  updateWecTeamControls();
  renderWecTeams(teams);
  const scope = wecTeamState.view === 'current' ? `on the ${latestWecTeamSeason} grid` : wecTeamState.season !== 'all' ? `in ${wecTeamState.season}` : 'in the archive';
  document.getElementById('wec-team-count').textContent = `${fmtNumber(teams.length)} team${teams.length === 1 ? '' : 's'} ${scope}`;
}
function clearWecTeamFilters() {
  wecTeamState = { view: 'current', q: '', season: 'all', classCode: 'all', manufacturer: 'all', country: 'all', achievement: 'all', sort: 'recent', page: 1 };
  updateWecTeams();
}
function bindWecTeamControls() {
  const bindings = [
    ['wec-team-search', 'input', 'q'], ['wec-team-season', 'change', 'season'], ['wec-team-class', 'change', 'classCode'],
    ['wec-team-manufacturer', 'change', 'manufacturer'], ['wec-team-country', 'change', 'country'],
    ['wec-team-achievement', 'change', 'achievement'], ['wec-team-sort', 'change', 'sort']
  ];
  bindings.forEach(([id, eventName, key]) => document.getElementById(id).addEventListener(eventName, event => {
    wecTeamState[key] = event.target.value;
    if (key === 'season') wecTeamState.view = 'all';
    wecTeamState.page = 1;
    updateWecTeams();
  }));
  document.getElementById('wec-team-clear').addEventListener('click', clearWecTeamFilters);
  document.querySelectorAll('[data-wec-team-view]').forEach(button => button.addEventListener('click', () => {
    wecTeamState.view = button.dataset.wecTeamView;
    wecTeamState.season = 'all';
    wecTeamState.page = 1;
    updateWecTeams();
  }));
  window.addEventListener('popstate', () => { readWecTeamState(); updateWecTeams(); });
}
function applyWecTeamData(rows) {
  wecTeams = rows.map(row => ({ ...row, seasons: (row.seasons || []).map(Number), classCodes: row.classCodes || [], manufacturers: row.manufacturers || [] }));
  latestWecTeamSeason = Math.max(0, ...wecTeams.map(team => Number(team.currentSeason) || 0)) || null;
  populateWecTeamFilters();
  updateWecTeams();
}
async function loadWecTeams() {
  const status = document.getElementById('wec-team-status');
  try {
    const cached = JSON.parse(sessionStorage.getItem(WEC_TEAM_CACHE_KEY));
    if (cached && Date.now() - cached.savedAt < 300000 && Array.isArray(cached.rows)) { applyWecTeamData(cached.rows); status.textContent = 'Refreshing teams…'; }
  } catch { /* The archive works without session storage. */ }
  try {
    const rows = await getJSON('/api/wec/teams');
    applyWecTeamData(rows);
    status.textContent = '';
    try { sessionStorage.setItem(WEC_TEAM_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows })); } catch { /* Optional cache. */ }
  } catch (error) {
    status.textContent = '';
    if (wecTeams.length) return;
    document.getElementById('wec-teams').setAttribute('aria-busy', 'false');
    document.getElementById('wec-team-count').textContent = 'Team archive unavailable';
    document.getElementById('wec-teams').innerHTML = `<div class="wec-team-empty"><h2>Teams unavailable</h2><p>${esc(error.message)}</p><button type="button" class="button secondary" id="wec-team-retry">Retry</button></div>`;
    document.getElementById('wec-team-retry').addEventListener('click', loadWecTeams);
  }
}

readWecTeamState();
bindWecTeamControls();
loadWecTeams();
