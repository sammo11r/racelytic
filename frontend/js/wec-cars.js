let wecCars = [];
let latestWecCarSeason = null;
let wecCarState = { view: 'all', q: '', season: 'all', classCode: 'all', manufacturer: 'all', country: 'all', achievement: 'all', sort: 'recent', page: 1 };
const WEC_CAR_PAGE_SIZE = 24;
const WEC_CAR_CACHE_KEY = 'racelytic:wec:cars:v1';

function normalizeWecCarText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function wecCarClassLabel(code) { return String(code || '').replace(/-/g, ' '); }
function readWecCarState() {
  const query = params();
  wecCarState.view = query.get('view') === 'current' ? 'current' : 'all';
  wecCarState.q = String(query.get('q') || '').trim();
  wecCarState.season = /^\d{4}$/.test(query.get('season') || '') ? query.get('season') : 'all';
  if (wecCarState.season !== 'all') wecCarState.view = 'all';
  wecCarState.classCode = query.get('class') || 'all';
  wecCarState.manufacturer = query.get('manufacturer') || 'all';
  wecCarState.country = query.get('country') || 'all';
  wecCarState.achievement = ['overall-winners', 'class-winners', 'podiums'].includes(query.get('achievement')) ? query.get('achievement') : 'all';
  wecCarState.sort = ['name', 'starts', 'wins', 'podiums'].includes(query.get('sort')) ? query.get('sort') : 'recent';
  wecCarState.page = Math.max(1, Number(query.get('page')) || 1);
}
function wecCarArchivePath() {
  const query = new URLSearchParams();
  if (wecCarState.view === 'current') query.set('view', 'current');
  if (wecCarState.q) query.set('q', wecCarState.q);
  if (wecCarState.season !== 'all') query.set('season', wecCarState.season);
  if (wecCarState.classCode !== 'all') query.set('class', wecCarState.classCode);
  if (wecCarState.manufacturer !== 'all') query.set('manufacturer', wecCarState.manufacturer);
  if (wecCarState.country !== 'all') query.set('country', wecCarState.country);
  if (wecCarState.achievement !== 'all') query.set('achievement', wecCarState.achievement);
  if (wecCarState.sort !== 'recent') query.set('sort', wecCarState.sort);
  if (wecCarState.page > 1) query.set('page', wecCarState.page);
  return `/wec/cars${query.size ? `?${query}` : ''}`;
}
function populateWecCarFilters() {
  const years = [...new Set(wecCars.flatMap(car => car.seasons))].sort((left, right) => right - left);
  const classes = [...new Set(wecCars.flatMap(car => car.classCodes))].sort((left, right) => wecCarClassLabel(left).localeCompare(wecCarClassLabel(right)));
  const manufacturers = [...new Map(wecCars.map(car => [car.manufacturerId, car.manufacturerName])).entries()].sort((left, right) => left[1].localeCompare(right[1]));
  const countries = [...new Map(wecCars.filter(car => car.countryId).map(car => [car.countryId, car.countryName || car.countryId])).entries()].sort((left, right) => left[1].localeCompare(right[1]));
  document.getElementById('wec-car-season').innerHTML = '<option value="all">All seasons</option>' + years.map(year => `<option value="${year}">${year}${year === latestWecCarSeason ? ' · Latest recorded' : ''}</option>`).join('');
  document.getElementById('wec-car-class').innerHTML = '<option value="all">All classes</option>' + classes.map(code => `<option value="${esc(code)}">${esc(wecCarClassLabel(code))}</option>`).join('');
  document.getElementById('wec-car-manufacturer').innerHTML = '<option value="all">All constructors</option>' + manufacturers.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  document.getElementById('wec-car-country').innerHTML = '<option value="all">All countries</option>' + countries.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  if (wecCarState.season !== 'all' && !years.includes(Number(wecCarState.season))) wecCarState.season = 'all';
  if (wecCarState.classCode !== 'all' && !classes.includes(wecCarState.classCode)) wecCarState.classCode = 'all';
  if (wecCarState.manufacturer !== 'all' && !manufacturers.some(([id]) => id === wecCarState.manufacturer)) wecCarState.manufacturer = 'all';
  if (wecCarState.country !== 'all' && !countries.some(([id]) => id === wecCarState.country)) wecCarState.country = 'all';
}
function filteredWecCars() {
  const search = normalizeWecCarText(wecCarState.q);
  const season = wecCarState.view === 'current' ? latestWecCarSeason : Number(wecCarState.season) || null;
  return wecCars.filter(car => {
    if (season && !car.seasons.includes(season)) return false;
    if (wecCarState.classCode !== 'all' && !car.classCodes.includes(wecCarState.classCode)) return false;
    if (wecCarState.manufacturer !== 'all' && car.manufacturerId !== wecCarState.manufacturer) return false;
    if (wecCarState.country !== 'all' && car.countryId !== wecCarState.country) return false;
    if (wecCarState.achievement === 'overall-winners' && !car.overallWins) return false;
    if (wecCarState.achievement === 'class-winners' && !car.classWins) return false;
    if (wecCarState.achievement === 'podiums' && !car.podiums) return false;
    const searchText = [car.name, car.manufacturerName, car.regulation, car.countryName, ...car.classCodes, ...car.teams.map(team => team.name)].filter(Boolean).join(' ');
    return !search || normalizeWecCarText(searchText).includes(search);
  }).sort((left, right) => {
    const name = () => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    if (wecCarState.sort === 'name') return name();
    if (wecCarState.sort === 'starts') return right.starts - left.starts || name();
    if (wecCarState.sort === 'wins') return right.classWins - left.classWins || right.overallWins - left.overallWins || name();
    if (wecCarState.sort === 'podiums') return right.podiums - left.podiums || right.classWins - left.classWins || name();
    return Number(right.lastYear || 0) - Number(left.lastYear || 0) || right.starts - left.starts || name();
  });
}
function wecCarCard(car) {
  const current = car.seasons.includes(latestWecCarSeason);
  const career = car.firstYear === car.lastYear ? `${car.firstYear} season` : `${car.firstYear}–${car.lastYear}`;
  const classes = car.classCodes.map(wecCarClassLabel).join(' · ') || car.regulation || 'Class unavailable';
  const teams = car.teams.slice(0, 3).map(team => team.name).join(' · ') + (car.teams.length > 3 ? ` · +${car.teams.length - 3}` : '');
  const flag = car.countryCode ? `<img src="/assets/flags/${esc(car.countryCode)}.svg" alt="" loading="lazy">` : '';
  const records = [];
  if (car.overallWins) records.push(`<span><strong>${fmtNumber(car.overallWins)}</strong> overall win${car.overallWins === 1 ? '' : 's'}</span>`);
  if (car.classWins) records.push(`<span><strong>${fmtNumber(car.classWins)}</strong> class win${car.classWins === 1 ? '' : 's'}</span>`);
  if (car.podiums) records.push(`<span><strong>${fmtNumber(car.podiums)}</strong> podium${car.podiums === 1 ? '' : 's'}</span>`);
  if (!records.length) records.push(`<span><strong>${fmtNumber(car.eventStarts)}</strong> weekend${car.eventStarts === 1 ? '' : 's'}</span>`);
  const query = new URLSearchParams({ return: wecCarArchivePath() });
  return `<a class="wec-car-card${car.overallWins ? ' is-winner' : ''}" href="${resourceUrl('carModel', car.id, { base: '/wec', query })}">
    ${car.overallWins ? '<em class="wec-car-achievement">Overall winner</em>' : current ? `<em class="wec-car-current">${esc(latestWecCarSeason)} grid</em>` : ''}
    <div class="wec-car-identity"><div><small>${esc(car.manufacturerName)}</small><h2>${esc(car.name)}</h2></div>${flag}</div>
    <div class="wec-car-context"><span>${esc(career)}</span><strong>${esc(classes)}</strong></div>
    <div class="wec-car-teams"><span>Teams</span><strong>${esc(teams || 'Team unavailable')}</strong></div>
    <div class="wec-car-record"><span><strong>${fmtNumber(car.starts)}</strong> starts</span>${records.slice(0, 2).join('')}</div>
  </a>`;
}
function updateWecCarControls() {
  document.getElementById('wec-car-search').value = wecCarState.q;
  document.getElementById('wec-car-season').value = wecCarState.view === 'current' ? String(latestWecCarSeason) : wecCarState.season;
  document.getElementById('wec-car-class').value = wecCarState.classCode;
  document.getElementById('wec-car-manufacturer').value = wecCarState.manufacturer;
  document.getElementById('wec-car-country').value = wecCarState.country;
  document.getElementById('wec-car-achievement').value = wecCarState.achievement;
  document.getElementById('wec-car-sort').value = wecCarState.sort;
  document.querySelectorAll('[data-wec-car-view]').forEach(button => {
    const active = button.dataset.wecCarView === wecCarState.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function renderWecCars(cars) {
  const target = document.getElementById('wec-cars');
  const paged = pageItems(cars, wecCarState.page, WEC_CAR_PAGE_SIZE);
  wecCarState.page = paged.page;
  history.replaceState(null, '', wecCarArchivePath());
  target.setAttribute('aria-busy', 'false');
  target.innerHTML = paged.items.length ? paged.items.map(wecCarCard).join('') : `<div class="wec-car-empty"><p class="eyebrow">NO MATCHES</p><h2>No cars found</h2><p>Try another season, class, manufacturer or achievement.</p><button type="button" class="button primary" id="wec-car-empty-clear">Clear filters</button></div>`;
  document.getElementById('wec-car-empty-clear')?.addEventListener('click', clearWecCarFilters);
  renderPagination('wec-cars', cars.length, wecCarState.page, WEC_CAR_PAGE_SIZE, page => { wecCarState.page = page; updateWecCars(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
function updateWecCars() {
  const cars = filteredWecCars();
  updateWecCarControls();
  renderWecCars(cars);
  const scope = wecCarState.view === 'current' ? `on the latest recorded grid (${latestWecCarSeason})` : wecCarState.season !== 'all' ? `in ${wecCarState.season}` : 'in the archive';
  document.getElementById('wec-car-count').textContent = `${fmtNumber(cars.length)} car model${cars.length === 1 ? '' : 's'} ${scope}`;
}
function clearWecCarFilters() {
  wecCarState = { view: 'all', q: '', season: 'all', classCode: 'all', manufacturer: 'all', country: 'all', achievement: 'all', sort: 'recent', page: 1 };
  updateWecCars();
}
function bindWecCarControls() {
  const bindings = [
    ['wec-car-search', 'input', 'q'], ['wec-car-season', 'change', 'season'], ['wec-car-class', 'change', 'classCode'],
    ['wec-car-manufacturer', 'change', 'manufacturer'], ['wec-car-country', 'change', 'country'],
    ['wec-car-achievement', 'change', 'achievement'], ['wec-car-sort', 'change', 'sort']
  ];
  bindings.forEach(([id, eventName, key]) => document.getElementById(id).addEventListener(eventName, event => {
    wecCarState[key] = event.target.value;
    if (key === 'season') wecCarState.view = 'all';
    wecCarState.page = 1;
    updateWecCars();
  }));
  document.getElementById('wec-car-clear').addEventListener('click', clearWecCarFilters);
  document.querySelectorAll('[data-wec-car-view]').forEach(button => button.addEventListener('click', () => {
    wecCarState.view = button.dataset.wecCarView;
    wecCarState.season = 'all';
    wecCarState.page = 1;
    updateWecCars();
  }));
  window.addEventListener('popstate', () => { readWecCarState(); updateWecCars(); });
  const moreFilters = document.querySelector('.wec-car-more-filters');
  const mobileFilters = window.matchMedia('(max-width: 600px)');
  const syncMoreFilters = () => { moreFilters.open = !mobileFilters.matches; };
  mobileFilters.addEventListener?.('change', syncMoreFilters);
  syncMoreFilters();
}
function applyWecCarData(rows) {
  wecCars = rows.map(row => ({ ...row, seasons: (row.seasons || []).map(Number), classCodes: row.classCodes || [], teams: row.teams || [] }));
  latestWecCarSeason = Math.max(0, ...wecCars.map(car => Number(car.currentSeason) || 0)) || null;
  populateWecCarFilters();
  updateWecCars();
}
async function loadWecCars() {
  const status = document.getElementById('wec-car-status');
  try {
    const cached = JSON.parse(sessionStorage.getItem(WEC_CAR_CACHE_KEY));
    if (cached && Date.now() - cached.savedAt < 300000 && Array.isArray(cached.rows)) { applyWecCarData(cached.rows); status.textContent = 'Refreshing cars…'; }
  } catch { /* The archive works without session storage. */ }
  try {
    const rows = await getJSON('/api/wec/cars');
    applyWecCarData(rows);
    status.textContent = '';
    try { sessionStorage.setItem(WEC_CAR_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows })); } catch { /* Optional cache. */ }
  } catch (error) {
    status.textContent = '';
    if (wecCars.length) return;
    document.getElementById('wec-cars').setAttribute('aria-busy', 'false');
    document.getElementById('wec-car-count').textContent = 'Car archive unavailable';
    document.getElementById('wec-cars').innerHTML = `<div class="wec-car-empty"><h2>Cars unavailable</h2><p>${esc(error.message)}</p><button type="button" class="button secondary" id="wec-car-retry">Retry</button></div>`;
    document.getElementById('wec-car-retry').addEventListener('click', loadWecCars);
  }
}

readWecCarState();
bindWecCarControls();
loadWecCars();
