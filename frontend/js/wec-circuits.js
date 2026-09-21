let wecCircuits = [];
let wecCircuitState = { view: 'current', q: '', season: 'all', country: 'all', format: 'all', sort: 'recent', page: 1 };
let latestWecCircuitSeason = null;
const WEC_CIRCUIT_PAGE_SIZE = 24;
const WEC_CIRCUIT_CACHE_KEY = 'racelytic:wec:circuits:v1';

function normalizeWecCircuitText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function readWecCircuitState() {
  const query = params();
  wecCircuitState.view = query.get('view') === 'all' ? 'all' : 'current';
  wecCircuitState.q = String(query.get('q') || '').trim();
  wecCircuitState.season = /^\d{4}$/.test(query.get('season') || '') ? query.get('season') : 'all';
  if (wecCircuitState.season !== 'all') wecCircuitState.view = 'all';
  wecCircuitState.country = query.get('country') || 'all';
  wecCircuitState.format = ['24h', '8h', '6h', 'distance'].includes(query.get('format')) ? query.get('format') : 'all';
  wecCircuitState.sort = ['name', 'races', 'length'].includes(query.get('sort')) ? query.get('sort') : 'recent';
  wecCircuitState.page = Math.max(1, Number(query.get('page')) || 1);
}

function wecCircuitArchivePath() {
  const query = new URLSearchParams();
  if (wecCircuitState.view === 'all') query.set('view', 'all');
  if (wecCircuitState.q) query.set('q', wecCircuitState.q);
  if (wecCircuitState.season !== 'all') query.set('season', wecCircuitState.season);
  if (wecCircuitState.country !== 'all') query.set('country', wecCircuitState.country);
  if (wecCircuitState.format !== 'all') query.set('format', wecCircuitState.format);
  if (wecCircuitState.sort !== 'recent') query.set('sort', wecCircuitState.sort);
  if (wecCircuitState.page > 1) query.set('page', wecCircuitState.page);
  return `/wec/circuits${query.size ? `?${query}` : ''}`;
}

function populateWecCircuitFilters() {
  const years = [...new Set(wecCircuits.flatMap(circuit => circuit.seasons))].sort((a, b) => b - a);
  const countries = [...new Map(wecCircuits.filter(circuit => circuit.countryId).map(circuit => [circuit.countryId, circuit.countryName || circuit.countryId])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1]));
  document.getElementById('wec-circuit-season').innerHTML = '<option value="all">All seasons</option>'
    + years.map(year => `<option value="${year}">${year}${year === latestWecCircuitSeason ? ' · Current calendar' : ''}</option>`).join('');
  document.getElementById('wec-circuit-country').innerHTML = '<option value="all">All countries</option>'
    + countries.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  if (wecCircuitState.season !== 'all' && !years.includes(Number(wecCircuitState.season))) wecCircuitState.season = 'all';
  if (wecCircuitState.country !== 'all' && !countries.some(([id]) => id === wecCircuitState.country)) wecCircuitState.country = 'all';
}

function wecCircuitMatchesFormat(circuit) {
  if (wecCircuitState.format === '24h') return circuit.formats.twentyFourHours > 0;
  if (wecCircuitState.format === '8h') return circuit.formats.eightHours > 0;
  if (wecCircuitState.format === '6h') return circuit.formats.sixHours > 0;
  if (wecCircuitState.format === 'distance') return circuit.formats.distance > 0;
  return true;
}

function filteredWecCircuits() {
  const search = normalizeWecCircuitText(wecCircuitState.q);
  const season = wecCircuitState.view === 'current' ? latestWecCircuitSeason : Number(wecCircuitState.season) || null;
  return wecCircuits.filter(circuit => {
    if (season && !circuit.seasons.includes(season)) return false;
    if (wecCircuitState.country !== 'all' && circuit.countryId !== wecCircuitState.country) return false;
    if (!wecCircuitMatchesFormat(circuit)) return false;
    return !search || normalizeWecCircuitText([circuit.name, circuit.placeName, circuit.countryName, circuit.latestEventName].filter(Boolean).join(' ')).includes(search);
  }).sort((left, right) => {
    const name = () => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    if (wecCircuitState.sort === 'name') return name();
    if (wecCircuitState.sort === 'races') return right.totalRacesHeld - left.totalRacesHeld || name();
    if (wecCircuitState.sort === 'length') return Number(right.length || 0) - Number(left.length || 0) || name();
    return Number(right.lastYear || 0) - Number(left.lastYear || 0) || right.totalRacesHeld - left.totalRacesHeld || name();
  });
}

function wecCircuitFormatBadges(circuit) {
  const badges = [];
  if (circuit.formats.twentyFourHours) badges.push('24 hours');
  if (circuit.formats.eightHours) badges.push('8 hours');
  if (circuit.formats.sixHours) badges.push('6 hours');
  if (circuit.formats.distance) badges.push('Distance');
  return badges.slice(0, 3).map(label => `<span>${esc(label)}</span>`).join('');
}

function wecCircuitCard(circuit, index) {
  const location = [circuit.placeName, circuit.countryName].filter(Boolean).join(' · ');
  const yearRange = circuit.firstYear === circuit.lastYear ? String(circuit.firstYear || '') : `${circuit.firstYear}–${circuit.lastYear}`;
  const facts = [circuit.length ? `${Number(circuit.length).toLocaleString('en', { maximumFractionDigits: 3 })} km` : '', circuit.turns ? `${circuit.turns} turns` : '', circuit.direction ? `${circuit.direction.toLowerCase()} direction` : ''].filter(Boolean);
  const flag = circuit.countryCode ? `<img src="/assets/flags/${esc(circuit.countryCode)}.svg" alt="" loading="lazy">` : '';
  const detailQuery = new URLSearchParams({ return: wecCircuitArchivePath() });
  return `<a class="wec-circuit-card" href="${resourceUrl('circuit', circuit.id, { base: '/wec', query: detailQuery })}" aria-label="View ${esc(circuit.name)} circuit history">
    <div class="wec-circuit-layout">${circuit.layoutId ? `<img src="/assets/circuits/${encodeURIComponent(circuit.layoutId)}.svg" width="240" height="116" alt="${esc(circuit.name)} circuit layout" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async">` : '<span>Layout unavailable</span>'}</div>
    <div class="wec-circuit-heading"><div><h2>${esc(circuit.name)}</h2><p>${flag}${esc(location)}</p></div><span aria-hidden="true">↗</span></div>
    <div class="wec-circuit-facts">${facts.map(fact => `<span>${esc(fact)}</span>`).join('')}</div>
    <div class="wec-circuit-formats">${wecCircuitFormatBadges(circuit)}</div>
    <div class="wec-circuit-record"><strong>${fmtNumber(circuit.totalRacesHeld)} race${circuit.totalRacesHeld === 1 ? '' : 's'} hosted</strong><span>${esc(yearRange)}</span></div>
  </a>`;
}

function updateWecCircuitControls() {
  document.getElementById('wec-circuit-search').value = wecCircuitState.q;
  document.getElementById('wec-circuit-season').value = wecCircuitState.view === 'current' ? String(latestWecCircuitSeason) : wecCircuitState.season;
  document.getElementById('wec-circuit-country').value = wecCircuitState.country;
  document.getElementById('wec-circuit-format').value = wecCircuitState.format;
  document.getElementById('wec-circuit-sort').value = wecCircuitState.sort;
  document.querySelectorAll('[data-wec-circuit-view]').forEach(button => {
    const active = button.dataset.wecCircuitView === wecCircuitState.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderWecCircuits(circuits) {
  const target = document.getElementById('wec-circuits');
  const paged = pageItems(circuits, wecCircuitState.page, WEC_CIRCUIT_PAGE_SIZE);
  wecCircuitState.page = paged.page;
  history.replaceState(null, '', wecCircuitArchivePath());
  target.setAttribute('aria-busy', 'false');
  target.innerHTML = paged.items.length ? paged.items.map(wecCircuitCard).join('')
    : `<div class="wec-circuit-empty"><p class="eyebrow">NO MATCHES</p><h2>No circuits found</h2><p>Try another season, country or race format.</p><button type="button" class="button primary" id="wec-circuit-empty-clear">Clear filters</button></div>`;
  document.getElementById('wec-circuit-empty-clear')?.addEventListener('click', clearWecCircuitFilters);
  target.querySelectorAll('.wec-circuit-layout img').forEach(image => image.addEventListener('error', () => { image.parentElement.textContent = 'Layout unavailable'; }, { once: true }));
  renderPagination('wec-circuits', circuits.length, wecCircuitState.page, WEC_CIRCUIT_PAGE_SIZE, page => {
    wecCircuitState.page = page;
    updateWecCircuits();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function updateWecCircuits() {
  const circuits = filteredWecCircuits();
  updateWecCircuitControls();
  renderWecCircuits(circuits);
  const scope = wecCircuitState.view === 'current' ? `on the ${latestWecCircuitSeason} calendar` : wecCircuitState.season !== 'all' ? `in ${wecCircuitState.season}` : 'in the archive';
  document.getElementById('wec-circuit-count').textContent = `${fmtNumber(circuits.length)} venue${circuits.length === 1 ? '' : 's'} ${scope}`;
}

function clearWecCircuitFilters() {
  wecCircuitState = { view: 'current', q: '', season: 'all', country: 'all', format: 'all', sort: 'recent', page: 1 };
  updateWecCircuits();
}

function bindWecCircuitControls() {
  const bindings = [
    ['wec-circuit-search', 'input', 'q'], ['wec-circuit-season', 'change', 'season'],
    ['wec-circuit-country', 'change', 'country'], ['wec-circuit-format', 'change', 'format'],
    ['wec-circuit-sort', 'change', 'sort']
  ];
  bindings.forEach(([id, eventName, key]) => document.getElementById(id).addEventListener(eventName, event => {
    wecCircuitState[key] = event.target.value;
    if (key === 'season') wecCircuitState.view = 'all';
    wecCircuitState.page = 1;
    updateWecCircuits();
  }));
  document.getElementById('wec-circuit-clear').addEventListener('click', clearWecCircuitFilters);
  document.querySelectorAll('[data-wec-circuit-view]').forEach(button => button.addEventListener('click', () => {
    wecCircuitState.view = button.dataset.wecCircuitView;
    wecCircuitState.season = 'all';
    wecCircuitState.page = 1;
    updateWecCircuits();
  }));
  window.addEventListener('popstate', () => { readWecCircuitState(); updateWecCircuits(); });
}

function applyWecCircuitData(rows) {
  wecCircuits = rows.map(row => ({ ...row, seasons: (row.seasons || []).map(Number), formats: row.formats || {} }));
  latestWecCircuitSeason = Math.max(0, ...wecCircuits.map(circuit => Number(circuit.currentSeason) || 0)) || null;
  populateWecCircuitFilters();
  updateWecCircuits();
}

async function loadWecCircuits() {
  const status = document.getElementById('wec-circuit-status');
  try {
    const cached = JSON.parse(sessionStorage.getItem(WEC_CIRCUIT_CACHE_KEY));
    if (cached && Date.now() - cached.savedAt < 300000 && Array.isArray(cached.rows)) {
      applyWecCircuitData(cached.rows);
      status.textContent = 'Refreshing circuits…';
    }
  } catch { /* The archive works without session storage. */ }
  try {
    const rows = await getJSON('/api/wec/circuits');
    applyWecCircuitData(rows);
    status.textContent = '';
    try { sessionStorage.setItem(WEC_CIRCUIT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows })); } catch { /* Optional cache. */ }
  } catch (error) {
    status.textContent = '';
    if (wecCircuits.length) return;
    document.getElementById('wec-circuits').setAttribute('aria-busy', 'false');
    document.getElementById('wec-circuit-count').textContent = 'Circuit archive unavailable';
    document.getElementById('wec-circuits').innerHTML = `<div class="wec-circuit-empty"><h2>Circuits unavailable</h2><p>${esc(error.message)}</p><button type="button" class="button secondary" id="wec-circuit-retry">Retry</button></div>`;
    document.getElementById('wec-circuit-retry').addEventListener('click', loadWecCircuits);
  }
}

readWecCircuitState();
bindWecCircuitControls();
loadWecCircuits();
