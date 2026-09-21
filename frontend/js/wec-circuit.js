let wecCircuitDetail = null;
let wecCircuitHistoryState = { q: '', season: 'all', format: 'all', sort: 'newest' };
const WEC_CIRCUIT_DETAIL_ID = resourceId('circuit');
const WEC_CIRCUIT_DETAIL_CACHE = `racelytic:wec:circuit:${WEC_CIRCUIT_DETAIL_ID}:v1`;

function wecCircuitDetailNode(id) { return document.getElementById(id); }
function normalizeWecCircuitDetailText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function titleWecCircuitValue(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}
function wecCircuitFormatKey(event) {
  if (event.formatType === 'distance' || Number(event.scheduledDistanceKm) > 0) return 'distance';
  const hours = Number(event.scheduledMinutes || 0) / 60;
  return [6, 8, 24].includes(hours) ? `${hours}h` : 'other';
}
function wecCircuitFormatLabel(event) {
  if (wecCircuitFormatKey(event) === 'distance') return `${fmtNumber(event.scheduledDistanceKm)} km`;
  const minutes = Number(event.scheduledMinutes || 0);
  if (!minutes) return 'Format unavailable';
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hours` : `${Math.floor(hours)}h ${minutes % 60}m`;
}
function wecCircuitEventDates(event) {
  const start = fmtDate(event.date);
  const end = event.endDate ? fmtDate(event.endDate) : '';
  return end && end !== start ? `${start}–${end}` : start;
}
function wecCircuitReturnPath() {
  const value = params().get('return');
  return value === '/wec/circuits' || value?.startsWith('/wec/circuits?') ? value : '/wec/circuits';
}
function readWecCircuitHistoryState() {
  const query = params();
  wecCircuitHistoryState.q = String(query.get('q') || '').trim();
  wecCircuitHistoryState.season = /^\d{4}$/.test(query.get('season') || '') ? query.get('season') : 'all';
  wecCircuitHistoryState.format = ['24h', '8h', '6h', 'distance', 'other'].includes(query.get('format')) ? query.get('format') : 'all';
  wecCircuitHistoryState.sort = query.get('sort') === 'oldest' ? 'oldest' : 'newest';
}
function syncWecCircuitHistoryState() {
  const query = new URLSearchParams();
  if (wecCircuitReturnPath() !== '/wec/circuits') query.set('return', wecCircuitReturnPath());
  if (wecCircuitHistoryState.q) query.set('q', wecCircuitHistoryState.q);
  if (wecCircuitHistoryState.season !== 'all') query.set('season', wecCircuitHistoryState.season);
  if (wecCircuitHistoryState.format !== 'all') query.set('format', wecCircuitHistoryState.format);
  if (wecCircuitHistoryState.sort === 'oldest') query.set('sort', 'oldest');
  history.replaceState(null, '', resourceUrl('circuit', WEC_CIRCUIT_DETAIL_ID, { base: '/wec', query }));
}

function wecCircuitStat(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value === null || value === undefined || value === '' ? '—' : value)}</dd></div>`;
}
function wecCircuitLocationLink(circuit) {
  const latitude = Number(circuit.latitude), longitude = Number(circuit.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `<a href="https://www.openstreetmap.org/?mlat=${latitude}&amp;mlon=${longitude}#map=14/${latitude}/${longitude}" target="_blank" rel="noopener noreferrer">View location ↗</a>`;
}
function renderWecCircuitHero(circuit) {
  const location = [circuit.placeName, circuit.countryName].filter(Boolean).join(' · ');
  const flag = circuit.countryCode ? `<img src="/assets/flags/${esc(circuit.countryCode)}.svg" alt="" width="28" height="19">` : '';
  const raceQuery = new URLSearchParams({ circuit: circuit.name });
  wecCircuitDetailNode('wec-circuit-hero').setAttribute('aria-busy', 'false');
  wecCircuitDetailNode('wec-circuit-hero').innerHTML = `<section class="wec-circuit-detail-hero">
    <div class="wec-circuit-detail-copy"><p class="eyebrow">WEC CIRCUIT</p><h1>${esc(circuit.name)}</h1><p>${flag}${esc(location)}</p>
      <div class="wec-circuit-detail-meta">${circuit.type ? `<span>${esc(titleWecCircuitValue(circuit.type))} circuit</span>` : ''}${circuit.direction ? `<span>${esc(titleWecCircuitValue(circuit.direction))}</span>` : ''}${wecCircuitLocationLink(circuit)}</div>
      <a class="button primary" href="/wec/races?${raceQuery}">View all races here</a>
    </div>
    <figure>${circuit.layoutId ? `<img id="wec-circuit-detail-map" src="/assets/circuits/${encodeURIComponent(circuit.layoutId)}.svg" width="420" height="260" alt="Track outline of ${esc(circuit.name)}" decoding="async">` : '<span>Layout unavailable</span>'}<figcaption>${esc(circuit.layoutVersion || 'Recorded WEC layout')}</figcaption></figure>
  </section>`;
  wecCircuitDetailNode('wec-circuit-detail-map')?.addEventListener('error', event => { event.currentTarget.parentElement.innerHTML = '<span>Layout unavailable</span>'; }, { once: true });
  wecCircuitDetailNode('wec-circuit-stats').innerHTML = [
    wecCircuitStat('Lap length', circuit.length ? `${Number(circuit.length).toLocaleString('en', { maximumFractionDigits: 3 })} km` : null),
    wecCircuitStat('Turns', circuit.turns),
    wecCircuitStat('WEC races', fmtNumber(circuit.totalRacesHeld)),
    wecCircuitStat('Seasons', fmtNumber(circuit.seasonCount)),
    wecCircuitStat('First visit', circuit.firstYear),
    wecCircuitStat('Latest visit', circuit.lastYear)
  ].join('');
}

function renderWecCircuitRecords(records) {
  const groups = [
    ['drivers', 'Drivers', 'driver'], ['teams', 'Teams', 'team'], ['manufacturers', 'Manufacturers', 'manufacturer']
  ];
  const target = wecCircuitDetailNode('wec-circuit-records');
  target.setAttribute('aria-busy', 'false');
  target.innerHTML = groups.map(([key, title, resource]) => `<article><h3>${title}</h3>${records[key]?.length ? `<ol>${records[key].map(row => `<li><a href="${resourceUrl(resource, row.id, { base: '/wec' })}">${esc(row.name)}</a><span>${fmtNumber(row.wins)} win${row.wins === 1 ? '' : 's'}</span></li>`).join('')}</ol>` : '<p>No recorded overall winners.</p>'}</article>`).join('');
}

function filteredWecCircuitEvents() {
  const search = normalizeWecCircuitDetailText(wecCircuitHistoryState.q);
  return wecCircuitDetail.events.filter(event => {
    if (wecCircuitHistoryState.season !== 'all' && Number(event.year) !== Number(wecCircuitHistoryState.season)) return false;
    if (wecCircuitHistoryState.format !== 'all' && wecCircuitFormatKey(event) !== wecCircuitHistoryState.format) return false;
    const winner = event.winner;
    const searchText = [event.name, event.year, winner?.teamName, winner?.manufacturerName, winner?.carModelName, ...(winner?.drivers || []).map(driver => driver.name)].filter(Boolean).join(' ');
    return !search || normalizeWecCircuitDetailText(searchText).includes(search);
  }).sort((left, right) => (Number(left.year) - Number(right.year) || Number(left.round) - Number(right.round)) * (wecCircuitHistoryState.sort === 'oldest' ? 1 : -1));
}
function wecCircuitWinner(event) {
  if (!event.winner) return `<div class="wec-circuit-event-winner is-pending"><span>Overall winner</span><strong>Result unavailable</strong></div>`;
  const drivers = event.winner.drivers.map(driver => `<a href="${resourceUrl('driver', driver.id, { base: '/wec' })}">${esc(driver.name)}</a>`).join(' · ');
  return `<div class="wec-circuit-event-winner"><span>Overall winner</span><strong><b>#${esc(event.winner.carNumber)}</b> <a href="${resourceUrl('team', event.winner.teamId, { base: '/wec' })}">${esc(event.winner.teamName)}</a></strong><small>${drivers}</small><em>${esc(event.winner.carModelName || event.winner.manufacturerName)}</em></div>`;
}
function wecCircuitEventCard(event) {
  return `<article class="wec-circuit-event-card">
    <div class="wec-circuit-event-year"><strong>${esc(event.year)}</strong><span>Round ${esc(event.round)}</span></div>
    <div class="wec-circuit-event-copy"><p>${esc(wecCircuitEventDates(event))}</p><h3><a href="${resourceUrl('race', event.id, { base: '/wec', label: event.name })}">${esc(event.name)}</a></h3><div><span>${esc(wecCircuitFormatLabel(event))}</span><span>${fmtNumber(event.entryCount)} entries</span><span>${fmtNumber(event.classCount)} classes</span></div></div>
    ${wecCircuitWinner(event)}
  </article>`;
}
function updateWecCircuitHistory() {
  const events = filteredWecCircuitEvents();
  const target = wecCircuitDetailNode('wec-circuit-events');
  wecCircuitDetailNode('wec-circuit-history-search').value = wecCircuitHistoryState.q;
  wecCircuitDetailNode('wec-circuit-history-season').value = wecCircuitHistoryState.season;
  wecCircuitDetailNode('wec-circuit-history-format').value = wecCircuitHistoryState.format;
  wecCircuitDetailNode('wec-circuit-history-sort').value = wecCircuitHistoryState.sort;
  target.setAttribute('aria-busy', 'false');
  target.innerHTML = events.length ? events.map(wecCircuitEventCard).join('') : `<div class="wec-circuit-history-empty"><h3>No races found</h3><p>Try another season, format or search.</p><button type="button" class="button secondary" id="wec-circuit-history-empty-clear">Clear filters</button></div>`;
  wecCircuitDetailNode('wec-circuit-history-empty-clear')?.addEventListener('click', clearWecCircuitHistory);
  wecCircuitDetailNode('wec-circuit-history-count').textContent = `${fmtNumber(events.length)} race${events.length === 1 ? '' : 's'}${events.length === wecCircuitDetail.events.length ? ' in the archive' : ` of ${fmtNumber(wecCircuitDetail.events.length)}`}`;
  syncWecCircuitHistoryState();
}
function clearWecCircuitHistory() {
  wecCircuitHistoryState = { q: '', season: 'all', format: 'all', sort: 'newest' };
  updateWecCircuitHistory();
}
function bindWecCircuitHistory() {
  const bindings = [
    ['wec-circuit-history-search', 'input', 'q'], ['wec-circuit-history-season', 'change', 'season'],
    ['wec-circuit-history-format', 'change', 'format'], ['wec-circuit-history-sort', 'change', 'sort']
  ];
  bindings.forEach(([id, eventName, key]) => wecCircuitDetailNode(id).addEventListener(eventName, event => {
    wecCircuitHistoryState[key] = event.target.value;
    updateWecCircuitHistory();
  }));
  wecCircuitDetailNode('wec-circuit-history-clear').addEventListener('click', clearWecCircuitHistory);
  window.addEventListener('popstate', () => { readWecCircuitHistoryState(); if (wecCircuitDetail) updateWecCircuitHistory(); });
}
function applyWecCircuitDetail(data) {
  wecCircuitDetail = data;
  document.title = `${data.circuit.name} · World Endurance Championship · Racelytic`;
  wecCircuitDetailNode('wec-circuit-back').href = wecCircuitReturnPath();
  renderWecCircuitHero(data.circuit);
  renderWecCircuitRecords(data.records);
  const years = [...new Set(data.events.map(event => Number(event.year)))].sort((left, right) => right - left);
  wecCircuitDetailNode('wec-circuit-history-season').innerHTML = '<option value="all">All seasons</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
  if (wecCircuitHistoryState.season !== 'all' && !years.includes(Number(wecCircuitHistoryState.season))) wecCircuitHistoryState.season = 'all';
  updateWecCircuitHistory();
}
function clearWecCircuitDetailLoading() {
  ['wec-circuit-hero', 'wec-circuit-records', 'wec-circuit-events'].forEach(id => { wecCircuitDetailNode(id).innerHTML = ''; wecCircuitDetailNode(id).setAttribute('aria-busy', 'false'); });
  wecCircuitDetailNode('wec-circuit-stats').innerHTML = '';
}
async function loadWecCircuitDetail() {
  if (!WEC_CIRCUIT_DETAIL_ID) {
    clearWecCircuitDetailLoading();
    wecCircuitDetailNode('wec-circuit-load-status').textContent = 'Choose a circuit from the WEC archive.';
    return;
  }
  try {
    const cached = JSON.parse(sessionStorage.getItem(WEC_CIRCUIT_DETAIL_CACHE));
    if (cached && Date.now() - cached.savedAt < 300000 && cached.data?.circuit?.id === WEC_CIRCUIT_DETAIL_ID) applyWecCircuitDetail(cached.data);
  } catch { /* The page works without session storage. */ }
  wecCircuitDetailNode('wec-circuit-load-status').textContent = wecCircuitDetail ? 'Refreshing circuit…' : 'Loading circuit…';
  try {
    const data = await getJSON(`/api/wec/circuits/${encodeURIComponent(WEC_CIRCUIT_DETAIL_ID)}`);
    applyWecCircuitDetail(data);
    wecCircuitDetailNode('wec-circuit-load-status').textContent = '';
    try { sessionStorage.setItem(WEC_CIRCUIT_DETAIL_CACHE, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* Optional cache. */ }
  } catch (error) {
    if (!wecCircuitDetail) clearWecCircuitDetailLoading();
    wecCircuitDetailNode('wec-circuit-load-status').innerHTML = `${wecCircuitDetail ? 'Showing saved circuit. ' : ''}${esc(error.message)} <button type="button" class="button secondary" id="wec-circuit-detail-retry">Retry</button>`;
    wecCircuitDetailNode('wec-circuit-detail-retry').addEventListener('click', loadWecCircuitDetail);
  }
}

readWecCircuitHistoryState();
bindWecCircuitHistory();
loadWecCircuitDetail();
