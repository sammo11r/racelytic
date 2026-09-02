let allCircuits = [], circuitPage = 1, circuitSearch = '', circuitSort = 'name';
let circuitView = 'current', circuitSeason = '', circuitCountry = '', circuitType = '';
let latestCircuitSeason = null, circuitsLoaded = false;
const CIRCUIT_PAGE_SIZE = 24;
const CIRCUIT_SERIES = ['f2', 'f3', 'academy'].find(series => window.location?.pathname.startsWith(`/${series}/`)) || 'f1';
const CIRCUIT_BASE = CIRCUIT_SERIES === 'f1' ? '' : `/${CIRCUIT_SERIES}`;
const CIRCUIT_CACHE_KEY = `racelytic:${CIRCUIT_SERIES}:circuits:v1`;
const CIRCUIT_TYPES = { RACE: 'Race circuit', STREET: 'Street circuit', ROAD: 'Road circuit' };

function circuitSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function circuitName(circuit) { return circuit.shortName || circuit.name; }

function readCircuitState() {
  const query = params();
  circuitView = query.get('view') === 'all' ? 'all' : 'current';
  circuitSearch = query.get('q') || '';
  circuitSeason = /^\d{4}$/.test(query.get('season') || '') ? query.get('season') : '';
  if (circuitSeason) circuitView = 'all';
  circuitCountry = query.get('country') || '';
  circuitType = Object.hasOwn(CIRCUIT_TYPES, query.get('type') || '') ? query.get('type') : '';
  circuitSort = ['name', 'recent', 'races'].includes(query.get('sort')) ? query.get('sort') : 'name';
  const page = Number(query.get('page'));
  circuitPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function circuitArchivePath() {
  const query = new URLSearchParams();
  if (circuitView === 'all') query.set('view', 'all');
  if (circuitSearch.trim()) query.set('q', circuitSearch.trim());
  if (circuitSeason) query.set('season', circuitSeason);
  if (circuitCountry) query.set('country', circuitCountry);
  if (circuitType) query.set('type', circuitType);
  if (circuitSort !== 'name') query.set('sort', circuitSort);
  if (circuitPage > 1) query.set('page', circuitPage);
  return `${CIRCUIT_BASE}/circuits${query.size ? `?${query}` : ''}`;
}

function updateCircuitControls() {
  document.getElementById('search').value = circuitSearch;
  document.getElementById('circuit-season').value = circuitView === 'current' ? String(latestCircuitSeason || '') : circuitSeason;
  document.getElementById('circuit-country').value = circuitCountry;
  document.getElementById('circuit-type').value = circuitType;
  document.getElementById('circuit-sort').value = circuitSort;
  document.querySelectorAll('[data-circuit-view]').forEach(button => {
    const active = button.dataset.circuitView === circuitView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function populateCircuitFilters() {
  const years = [...new Set(allCircuits.flatMap(circuit => circuit.seasons))].sort((a, b) => b - a);
  const countries = [...new Map(allCircuits.filter(circuit => circuit.countryId).map(circuit => [circuit.countryId, circuit.countryName || circuit.countryId])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  document.getElementById('circuit-season').innerHTML = '<option value="">All seasons</option>' + years.map(year => `<option value="${year}">${year}${year === latestCircuitSeason ? ' · Current calendar' : ''}</option>`).join('');
  document.getElementById('circuit-country').innerHTML = '<option value="">All countries</option>' + countries.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  document.getElementById('circuit-type').innerHTML = '<option value="">All types</option>' + Object.entries(CIRCUIT_TYPES).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  if (circuitSeason && !years.includes(Number(circuitSeason))) circuitSeason = '';
  if (circuitCountry && !countries.some(([id]) => id === circuitCountry)) circuitCountry = '';
}

function filteredCircuits() {
  const search = circuitSearchText(circuitSearch.trim());
  const season = circuitView === 'current' ? latestCircuitSeason : Number(circuitSeason) || null;
  const compareNames = (a, b) => circuitName(a).localeCompare(circuitName(b), undefined, { sensitivity: 'base' });
  return allCircuits.filter(circuit => {
    if (season && !circuit.seasons.includes(season)) return false;
    if (circuitCountry && circuit.countryId !== circuitCountry) return false;
    if (circuitType && circuit.type !== circuitType) return false;
    return !search || circuitSearchText([circuit.id, circuitName(circuit), circuit.name, circuit.fullName, circuit.previousNames, circuit.placeName, circuit.countryName, circuit.countryId].filter(Boolean).join(' ')).includes(search);
  }).sort((a, b) => {
    if (circuitSort === 'recent') return Number(b.lastYear || 0) - Number(a.lastYear || 0) || compareNames(a, b);
    if (circuitSort === 'races') return Number(b.totalRacesHeld || 0) - Number(a.totalRacesHeld || 0) || compareNames(a, b);
    return compareNames(a, b);
  });
}

function renderCircuitCard(circuit, index) {
  const query = new URLSearchParams({ id: circuit.id, return: circuitArchivePath() });
  const years = circuit.firstHeldYear ? (Number(circuit.firstHeldYear) === Number(circuit.lastHeldYear) ? String(circuit.firstHeldYear) : `${circuit.firstHeldYear}–${circuit.lastHeldYear}`) : '';
  const length = Number(circuit.length);
  const facts = [length > 0 ? `${length.toLocaleString('en', { maximumFractionDigits: 3 })} km` : '', Number(circuit.turns) > 0 ? `${circuit.turns} turns` : '', CIRCUIT_TYPES[circuit.type] || ''].filter(Boolean);
  return `<a class="entity-card circuit-archive-card" href="${CIRCUIT_BASE}/circuit?${esc(query.toString())}" title="${esc(circuit.fullName || circuit.name)}">
    <div class="circuit-card-layout">${circuit.layoutId ? `<img class="circuit-card-map" src="/assets/circuits/${encodeURIComponent(circuit.layoutId)}.svg" width="200" height="90" alt="" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async">` : '<span>Layout unavailable</span>'}</div>
    <div class="circuit-card-heading"><h3>${esc(circuitName(circuit))}</h3><p>${esc([circuit.placeName, circuit.countryName].filter(Boolean).join(' · '))}</p></div>
    <div class="circuit-card-facts">${facts.map(fact => `<span>${esc(fact)}</span>`).join('')}</div>
    <div class="circuit-card-record"><strong>${Number(circuit.totalRacesHeld) > 0 ? `${fmtNumber(circuit.totalRacesHeld)} race${Number(circuit.totalRacesHeld) === 1 ? '' : 's'} hosted` : 'Awaiting first race'}</strong>${years ? `<span>${esc(years)}</span>` : ''}</div>
  </a>`;
}

function renderCircuits(list) {
  const paged = pageItems(list, circuitPage, CIRCUIT_PAGE_SIZE);
  circuitPage = paged.page;
  history.replaceState(null, '', circuitArchivePath());
  const grid = document.getElementById('circuits');
  grid.setAttribute('aria-busy', 'false');
  grid.innerHTML = list.length ? paged.items.map(renderCircuitCard).join('') : '<div class="driver-empty-state circuit-empty-state"><h2>No circuits found</h2><p>Try another circuit name, season, country or type.</p><button type="button" class="button secondary" id="circuit-empty-clear">Clear filters</button></div>';
  if (!list.length) document.getElementById('circuit-empty-clear').addEventListener('click', clearCircuitFilters);
  grid.querySelectorAll('img.circuit-card-map').forEach(img => img.addEventListener('error', () => { img.parentElement.textContent = 'Layout unavailable'; }, { once: true }));
  renderPagination('circuits', list.length, circuitPage, CIRCUIT_PAGE_SIZE, page => { circuitPage = page; updateCircuits(); grid.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

function updateCircuits() {
  updateCircuitControls();
  if (!circuitsLoaded) return;
  const visible = filteredCircuits();
  renderCircuits(visible);
  const scope = circuitView === 'current' ? `on the ${latestCircuitSeason} calendar` : circuitSeason ? `on the ${circuitSeason} calendar` : 'in the archive';
  document.getElementById('circuit-count').textContent = `${fmtNumber(visible.length)} circuit${visible.length === 1 ? '' : 's'} ${scope}`;
}

function clearCircuitFilters() {
  circuitSearch = ''; circuitSeason = ''; circuitCountry = ''; circuitType = ''; circuitSort = 'name'; circuitPage = 1;
  updateCircuits();
}

function bindCircuitControls() {
  const changes = { search: value => { circuitSearch = value; }, 'circuit-season': value => { circuitSeason = value; circuitView = 'all'; },
    'circuit-country': value => { circuitCountry = value; }, 'circuit-type': value => { circuitType = value; }, 'circuit-sort': value => { circuitSort = value; } };
  Object.entries(changes).forEach(([id, change]) => document.getElementById(id).addEventListener(id === 'search' ? 'input' : 'change', event => { change(event.target.value); circuitPage = 1; updateCircuits(); }));
  document.getElementById('circuit-clear').addEventListener('click', clearCircuitFilters);
  document.querySelectorAll('[data-circuit-view]').forEach(button => button.addEventListener('click', () => { circuitView = button.dataset.circuitView; circuitSeason = ''; circuitPage = 1; updateCircuits(); }));
  window.addEventListener('popstate', () => { readCircuitState(); updateCircuits(); });
}

function applyCircuitData(rows) {
  allCircuits = rows.map(row => ({ ...row, seasons: (row.seasons || []).map(Number) }));
  latestCircuitSeason = Math.max(0, ...allCircuits.map(row => Number(row.currentSeason) || 0)) || null;
  circuitsLoaded = true;
  populateCircuitFilters(); updateCircuits();
}

function cachedCircuits() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CIRCUIT_CACHE_KEY));
    if (cached && Date.now() - cached.savedAt < 300000 && Array.isArray(cached.rows) && cached.rows.every(row => row.id && Array.isArray(row.seasons))) return cached.rows;
  } catch { /* Storage can be unavailable; loading still works without it. */ }
  return null;
}

async function loadCircuits() {
  const status = document.getElementById('circuit-load-status');
  if (!circuitsLoaded) { const cached = cachedCircuits(); if (cached) applyCircuitData(cached); }
  status.textContent = circuitsLoaded ? 'Refreshing circuits…' : '';
  try {
    const rows = await getJSON(`/api/circuits${CIRCUIT_SERIES === 'f1' ? '' : `?series=${CIRCUIT_SERIES}`}`);
    applyCircuitData(rows); status.textContent = '';
    try { sessionStorage.setItem(CIRCUIT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows })); } catch { /* Optional cache. */ }
  } catch (error) {
    const retry = '<button type="button" class="button secondary" id="circuit-retry">Retry</button>';
    if (circuitsLoaded) status.innerHTML = `Showing saved circuits. ${retry}`;
    else {
      document.getElementById('circuits').setAttribute('aria-busy', 'false');
      document.getElementById('circuits').innerHTML = `<div class="circuit-empty-state"><h2>Circuits unavailable</h2><p>${esc(error.message)}</p>${retry}</div>`;
      document.getElementById('circuit-count').textContent = 'Unable to load circuits';
    }
    document.getElementById('circuit-retry').addEventListener('click', loadCircuits);
  }
}

readCircuitState();
bindCircuitControls();
loadCircuits();
