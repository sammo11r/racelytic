let allConstructors = [], constructorPage = 1, constructorSearch = '', constructorSort = 'name';
let constructorView = 'current', constructorSeason = '', constructorCountry = '', constructorType = '';
let latestConstructorSeason = null, constructorsLoaded = false;
const CONSTRUCTOR_PAGE_SIZE = 24;
const CONSTRUCTOR_SERIES = ['f2', 'f3', 'academy'].find(series => window.location?.pathname.startsWith(`/${series}/`)) || 'f1';
const CONSTRUCTOR_BASE = CONSTRUCTOR_SERIES === 'f1' ? '' : `/${CONSTRUCTOR_SERIES}`;
const CONSTRUCTOR_ENTITY = ['f3', 'academy'].includes(CONSTRUCTOR_SERIES) ? 'team' : 'constructor';
const CONSTRUCTOR_LABEL = CONSTRUCTOR_ENTITY === 'team' ? 'Teams' : 'Constructors';
const CONSTRUCTOR_SERIES_LABEL = { f1: 'F1', f2: 'F2', f3: 'F3', academy: 'F1 Academy' }[CONSTRUCTOR_SERIES];
const CONSTRUCTOR_CACHE_KEY = `racelytic:${CONSTRUCTOR_SERIES}:constructors:v1`;
const CONSTRUCTOR_TYPES = { champions: 'Championship winners' };

function constructorSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function constructorName(constructor) { return constructor.shortName || constructor.name; }

function readConstructorState() {
  const query = params();
  constructorView = query.get('view') === 'all' ? 'all' : 'current';
  constructorSearch = query.get('q') || '';
  constructorSeason = /^\d{4}$/.test(query.get('season') || '') ? query.get('season') : '';
  if (constructorSeason) constructorView = 'all';
  constructorCountry = query.get('country') || '';
  constructorType = Object.hasOwn(CONSTRUCTOR_TYPES, query.get('achievement') || '') ? query.get('achievement') : '';
  constructorSort = ['name', 'recent', 'starts', 'wins', 'titles'].includes(query.get('sort')) ? query.get('sort') : 'name';
  const page = Number(query.get('page'));
  constructorPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function constructorArchivePath() {
  const query = new URLSearchParams();
  if (constructorView === 'all') query.set('view', 'all');
  if (constructorSearch.trim()) query.set('q', constructorSearch.trim());
  if (constructorSeason) query.set('season', constructorSeason);
  if (constructorCountry) query.set('country', constructorCountry);
  if (constructorType) query.set('achievement', constructorType);
  if (constructorSort !== 'name') query.set('sort', constructorSort);
  if (constructorPage > 1) query.set('page', constructorPage);
  return `${CONSTRUCTOR_BASE}/${CONSTRUCTOR_ENTITY}s${query.size ? `?${query}` : ''}`;
}

function updateConstructorControls() {
  document.getElementById('search').value = constructorSearch;
  document.getElementById('constructor-season').value = constructorView === 'current' ? String(latestConstructorSeason || '') : constructorSeason;
  document.getElementById('constructor-country').value = constructorCountry;
  document.getElementById('constructor-type').value = constructorType;
  document.getElementById('constructor-sort').value = constructorSort;
  document.querySelectorAll('[data-constructor-view]').forEach(button => {
    const active = button.dataset.constructorView === constructorView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function populateConstructorFilters() {
  const years = [...new Set(allConstructors.flatMap(constructor => constructor.seasons))].sort((a, b) => b - a);
  const countries = [...new Map(allConstructors.filter(constructor => constructor.countryId).map(constructor => [constructor.countryId, constructor.countryName || constructor.countryId])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  document.getElementById('constructor-season').innerHTML = '<option value="">All seasons</option>' + years.map(year => `<option value="${year}">${year}${year === latestConstructorSeason ? ' · Current grid' : ''}</option>`).join('');
  document.getElementById('constructor-country').innerHTML = '<option value="">All nationalities</option>' + countries.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  document.getElementById('constructor-type').innerHTML = `<option value="">All ${CONSTRUCTOR_LABEL.toLowerCase()}</option>` + Object.entries(CONSTRUCTOR_TYPES).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  if (constructorSeason && !years.includes(Number(constructorSeason))) constructorSeason = '';
  if (constructorCountry && !countries.some(([id]) => id === constructorCountry)) constructorCountry = '';
}

function filteredConstructors() {
  const search = constructorSearchText(constructorSearch.trim());
  const season = constructorView === 'current' ? latestConstructorSeason : Number(constructorSeason) || null;
  const compareNames = (a, b) => constructorName(a).localeCompare(constructorName(b), undefined, { sensitivity: 'base' });
  return allConstructors.filter(constructor => {
    if (season && !constructor.seasons.includes(season)) return false;
    if (constructorCountry && constructor.countryId !== constructorCountry) return false;
    if (constructorType === 'champions' && !(Number(constructor.totalChampionshipWins) > 0)) return false;
    return !search || constructorSearchText([constructor.id, constructorName(constructor), constructor.name, constructor.fullName, constructor.abbreviation, constructor.previousNames, constructor.placeName, constructor.countryName, constructor.countryId].filter(Boolean).join(' ')).includes(search);
  }).sort((a, b) => {
    if (constructorSort === 'recent') return Number(b.lastYear || 0) - Number(a.lastYear || 0) || compareNames(a, b);
    const field = { starts: 'totalRaceStarts', wins: 'totalRaceWins', titles: 'totalChampionshipWins' }[constructorSort];
    if (field) return Number(b[field] || 0) - Number(a[field] || 0) || compareNames(a, b);
    return compareNames(a, b);
  });
}

function renderConstructorCard(constructor) {
  const query = new URLSearchParams({ id: constructor.id, return: constructorArchivePath() });
  const years = constructor.firstYear ? (Number(constructor.firstYear) === Number(constructor.lastYear) ? String(constructor.firstYear) : `${constructor.firstYear}–${constructor.lastYear}`) : '';
  const titleLabel = CONSTRUCTOR_SERIES === 'f1' ? 'constructors’' : 'teams’';
  const achievements = [['totalRaceWins', 'win', 'wins'], ['totalPodiums', 'podium', 'podiums'], ['totalChampionshipWins', `${titleLabel} title`, `${titleLabel} titles`]]
    .filter(([key]) => Number(constructor[key]) > 0)
    .map(([key, singular, plural]) => `<span><strong>${fmtNumber(constructor[key])}</strong> ${Number(constructor[key]) === 1 ? singular : plural}</span>`);
  if (!achievements.length) {
    if (Number(constructor.totalRaceStarts) > 0) achievements.push(`<span><strong>${fmtNumber(constructor.totalRaceStarts)}</strong> race starts</span>`);
    if (constructor.seasons.length) achievements.push(`<span><strong>${constructor.seasons.length}</strong> season${constructor.seasons.length === 1 ? '' : 's'}</span>`);
  }
  const showCurrent = constructor.seasons.includes(latestConstructorSeason) && (!constructorSeason || Number(constructorSeason) === latestConstructorSeason);
  const position = Number(constructor.currentPosition);
  const snapshot = showCurrent ? `<div class="constructor-season-snapshot"><span class="constructor-card-label">${latestConstructorSeason} season</span><strong>${position > 0 && position < 100 ? `P${position}` : 'Not classified'}${constructor.currentPoints != null ? ` · ${fmtNumber(constructor.currentPoints)} points` : ''}</strong><p>${esc((constructor.currentDrivers || []).join(' · ') || 'Race drivers not yet recorded')}</p></div>` : '';
  const fullName = constructor.fullName && constructorSearchText(constructor.fullName.trim()) !== constructorSearchText(constructor.name.trim()) ? `<p class="constructor-full-name">${esc(constructor.fullName)}</p>` : '';
  const champion = Number(constructor.totalChampionshipWins) > 0;
  return `<a class="entity-card constructor-archive-card${champion ? ' constructor-champion-card' : ''}" href="${CONSTRUCTOR_BASE}/${CONSTRUCTOR_ENTITY}?${esc(query.toString())}" title="${esc(constructor.fullName || constructor.name)}">
    ${champion ? `<em class="f2-driver-title constructor-champion-badge">${CONSTRUCTOR_SERIES_LABEL} ${CONSTRUCTOR_SERIES === 'f1' ? 'constructors’' : 'teams’'} champion</em>` : ''}
    <div class="constructor-card-heading"><h3>${esc(constructor.name)}</h3>${fullName}<p>${esc(constructor.countryName || 'Nationality not recorded')}</p></div>
    <div class="constructor-card-years">${esc(years || 'Participation not recorded')}${years ? ` · ${constructor.seasons.length} season${constructor.seasons.length === 1 ? '' : 's'}` : ''}</div>
    ${snapshot}
    <div class="constructor-career"><span class="constructor-card-label">Career</span><div class="constructor-card-record">${achievements.join('') || '<span>No race starts recorded</span>'}</div></div>
  </a>`;
}

function renderConstructors(list) {
  const paged = pageItems(list, constructorPage, CONSTRUCTOR_PAGE_SIZE);
  constructorPage = paged.page;
  history.replaceState(null, '', constructorArchivePath());
  const grid = document.getElementById('constructors');
  grid.setAttribute('aria-busy', 'false');
  grid.innerHTML = list.length ? paged.items.map(renderConstructorCard).join('') : `<div class="driver-empty-state constructor-empty-state"><h2>No ${CONSTRUCTOR_LABEL.toLowerCase()} found</h2><p>Try another ${CONSTRUCTOR_ENTITY} name, season, nationality or achievement.</p><button type="button" class="button secondary" id="constructor-empty-clear">Clear filters</button></div>`;
  if (!list.length) document.getElementById('constructor-empty-clear').addEventListener('click', clearConstructorFilters);
  renderPagination('constructors', list.length, constructorPage, CONSTRUCTOR_PAGE_SIZE, page => { constructorPage = page; updateConstructors(); grid.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

function updateConstructors() {
  updateConstructorControls();
  if (!constructorsLoaded) return;
  const visible = filteredConstructors();
  renderConstructors(visible);
  const scope = constructorView === 'current' ? `on the ${latestConstructorSeason} grid` : constructorSeason ? `on the ${constructorSeason} grid` : 'in the archive';
  document.getElementById('constructor-count').textContent = `${fmtNumber(visible.length)} ${CONSTRUCTOR_ENTITY}${visible.length === 1 ? '' : 's'} ${scope}`;
}

function clearConstructorFilters() {
  constructorSearch = ''; constructorSeason = ''; constructorCountry = ''; constructorType = ''; constructorSort = 'name'; constructorPage = 1;
  updateConstructors();
}

function bindConstructorControls() {
  const changes = { search: value => { constructorSearch = value; }, 'constructor-season': value => { constructorSeason = value; constructorView = 'all'; },
    'constructor-country': value => { constructorCountry = value; }, 'constructor-type': value => { constructorType = value; }, 'constructor-sort': value => { constructorSort = value; } };
  Object.entries(changes).forEach(([id, change]) => document.getElementById(id).addEventListener(id === 'search' ? 'input' : 'change', event => { change(event.target.value); constructorPage = 1; updateConstructors(); }));
  document.getElementById('constructor-clear').addEventListener('click', clearConstructorFilters);
  document.querySelectorAll('[data-constructor-view]').forEach(button => button.addEventListener('click', () => { constructorView = button.dataset.constructorView; constructorSeason = ''; constructorPage = 1; updateConstructors(); }));
  window.addEventListener('popstate', () => { readConstructorState(); updateConstructors(); });
}

function applyConstructorData(rows) {
  allConstructors = rows.map(row => ({ ...row, seasons: (row.seasons || []).map(Number) }));
  latestConstructorSeason = Math.max(0, ...allConstructors.map(row => Number(row.currentSeason) || 0)) || null;
  constructorsLoaded = true;
  populateConstructorFilters(); updateConstructors();
}

function cachedConstructors() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CONSTRUCTOR_CACHE_KEY));
    if (cached && Date.now() - cached.savedAt < 300000 && Array.isArray(cached.rows) && cached.rows.every(row => row.id && Array.isArray(row.seasons))) return cached.rows;
  } catch { /* Storage can be unavailable; loading still works without it. */ }
  return null;
}

async function loadConstructors() {
  const status = document.getElementById('constructor-load-status');
  if (!constructorsLoaded) { const cached = cachedConstructors(); if (cached) applyConstructorData(cached); }
  status.textContent = constructorsLoaded ? `Refreshing ${CONSTRUCTOR_LABEL.toLowerCase()}…` : '';
  try {
    const rows = await getJSON(`/api/constructors${CONSTRUCTOR_SERIES === 'f1' ? '' : `?series=${CONSTRUCTOR_SERIES}`}`);
    applyConstructorData(rows); status.textContent = '';
    try { sessionStorage.setItem(CONSTRUCTOR_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows })); } catch { /* Optional cache. */ }
  } catch (error) {
    const retry = '<button type="button" class="button secondary" id="constructor-retry">Retry</button>';
    if (constructorsLoaded) status.innerHTML = `Showing saved ${CONSTRUCTOR_LABEL.toLowerCase()}. ${retry}`;
    else {
      document.getElementById('constructors').setAttribute('aria-busy', 'false');
      document.getElementById('constructors').innerHTML = `<div class="constructor-empty-state"><h2>${CONSTRUCTOR_LABEL} unavailable</h2><p>${esc(error.message)}</p>${retry}</div>`;
      document.getElementById('constructor-count').textContent = `Unable to load ${CONSTRUCTOR_LABEL.toLowerCase()}`;
    }
    document.getElementById('constructor-retry').addEventListener('click', loadConstructors);
  }
}

readConstructorState();
bindConstructorControls();
loadConstructors();
