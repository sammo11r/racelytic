let circuitData = null;
let circuitHistoryPage = 1, circuitHistorySeason = '', circuitHistorySearch = '', circuitHistorySort = 'newest';
const CIRCUIT_HISTORY_PAGE_SIZE = 25;
const circuitDetailId = params().get('id');
const circuitDetailSeries = ['f2', 'f3', 'academy'].find(series => String(window.location?.pathname || '').startsWith(`/${series}/`)) || 'f1';
const circuitDetailBase = circuitDetailSeries === 'f1' ? '' : `/${circuitDetailSeries}`;
const circuitDetailSeriesName = { f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy' }[circuitDetailSeries];
const circuitTeamPage = ['f3', 'academy'].includes(circuitDetailSeries) ? 'team' : 'constructor';
const CIRCUIT_DETAIL_CACHE = `racelytic:${circuitDetailSeries}:circuit:${circuitDetailId}:v2`;

function circuitNode(id) { return document.getElementById(id); }
function circuitStat(label, value, suffix = '') {
  const display = value === null || value === undefined || value === '' ? '—' : `${fmtNumber(value)}${suffix}`;
  return `<div><dt>${esc(label)}</dt><dd>${esc(display)}</dd></div>`;
}
function titleCase(value) {
  return String(value || '').toLowerCase().replace(/(^|[_\s-])\w/g, match => match.toUpperCase()).replaceAll('_', ' ');
}
function circuitText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function circuitDate(value) {
  const text = String(value || '');
  return fmtDate(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : value);
}
function circuitRaceDate(race) {
  if (!race.dateIsWeekend) return circuitDate(race.date);
  const start = race.weekendDate || race.date;
  return `${circuitDate(start)}${race.endDate && race.endDate !== start ? ` – ${circuitDate(race.endDate)}` : ''} (weekend)`;
}
function circuitReturnPath() {
  const returnPath = params().get('return');
  const archive = `${circuitDetailBase}/circuits`;
  return returnPath === archive || returnPath?.startsWith(`${archive}?`) ? returnPath : archive;
}
function readCircuitHistoryState() {
  const query = params(), page = Number(query.get('page'));
  circuitHistoryPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  circuitHistorySeason = /^\d{4}$/.test(query.get('season') || '') ? query.get('season') : '';
  circuitHistorySearch = query.get('q') || '';
  circuitHistorySort = query.get('sort') === 'oldest' ? 'oldest' : 'newest';
}
function saveCircuitHistoryState() {
  const query = new URLSearchParams({ id: circuitDetailId });
  if (circuitReturnPath() !== `${circuitDetailBase}/circuits`) query.set('return', circuitReturnPath());
  if (circuitHistorySeason) query.set('season', circuitHistorySeason);
  if (circuitHistorySearch.trim()) query.set('q', circuitHistorySearch.trim());
  if (circuitHistorySort === 'oldest') query.set('sort', 'oldest');
  if (circuitHistoryPage > 1) query.set('page', circuitHistoryPage);
  history.replaceState(null, '', `${circuitDetailBase}/circuit?${query}`);
}
function circuitRaceLink(race) {
  const query = new URLSearchParams({ id: race.raceId || race.id });
  if (race.sessionId) query.set('session', race.sessionId);
  return `${circuitDetailBase}/race?${query}`;
}
function circuitRaceStatus(race, now = new Date()) {
  if (race.cancelled) return 'cancelled';
  if (race.hasResults) return 'completed';
  const date = String(race.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'unavailable';
  return date >= now.toISOString().slice(0, 10) ? 'scheduled' : 'unavailable';
}
function filteredCircuitHistory() {
  const search = circuitText(circuitHistorySearch.trim());
  return circuitData.races.filter(race => circuitRaceStatus(race) !== 'scheduled')
    .filter(race => !circuitHistorySeason || Number(race.year) === Number(circuitHistorySeason))
    .filter(race => !search || circuitText([displayRaceName(race), race.year, ...(race.winners || []).flatMap(w => [w.name, w.constructorName])].join(' ')).includes(search))
    .sort((a, b) => (Number(a.year) - Number(b.year) || Number(a.round) - Number(b.round) || Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0)) * (circuitHistorySort === 'oldest' ? 1 : -1));
}
function circuitWinnerLinks(race, team = false) {
  if (race.cancelled) return team ? '—' : '<span class="section-note">Cancelled</span>';
  const winners = race.winners || [];
  const seen = new Set();
  const links = winners.flatMap(winner => {
    const id = team ? winner.constructorId : winner.driverId;
    const name = team ? winner.constructorName : winner.name;
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [`<a href="${circuitDetailBase}/${team ? circuitTeamPage : 'driver'}?id=${encodeURIComponent(id)}">${esc(name)}</a>`];
  });
  return links.join(' / ') || (team ? '—' : '<span class="section-note">Result unavailable</span>');
}
function renderCircuitHistory() {
  if (!circuitData) return;
  circuitNode('circuit-history-search').value = circuitHistorySearch;
  circuitNode('circuit-history-season').value = circuitHistorySeason;
  circuitNode('circuit-history-sort').value = circuitHistorySort;
  const rows = filteredCircuitHistory();
  const paged = pageItems(rows, circuitHistoryPage, CIRCUIT_HISTORY_PAGE_SIZE);
  circuitHistoryPage = paged.page;
  saveCircuitHistoryState();
  const container = circuitNode('circuit-races');
  container.setAttribute('aria-busy', 'false');
  container.innerHTML = rows.length ? `<div class="circuit-history-scroll" tabindex="0" role="region" aria-label="Race history table"><table class="circuit-history-table"><caption class="sr-only">Race history at ${esc(circuitData.circuit.name)}</caption><thead><tr><th scope="col">Season</th><th scope="col">Race</th><th scope="col">Date</th><th scope="col">Winner</th><th scope="col">${circuitTeamPage === 'team' ? 'Team' : 'Constructor'}</th><th scope="col">Laps</th></tr></thead><tbody>${paged.items.map(race => `<tr><td><a href="${circuitDetailBase}/season?year=${encodeURIComponent(race.year)}">${esc(race.year)}</a></td><td><a href="${esc(circuitRaceLink(race))}">${esc(displayRaceName(race))}</a><small>Round ${esc(race.round)}</small></td><td>${esc(circuitRaceDate(race))}</td><td>${circuitWinnerLinks(race)}</td><td>${circuitWinnerLinks(race, true)}</td><td>${Number(race.laps) > 0 ? fmtNumber(race.laps) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="circuit-history-empty"><p>No races match this selection.</p><button type="button" class="button secondary" id="circuit-empty-clear">Clear filters</button></div>';
  if (!rows.length) circuitNode('circuit-empty-clear').addEventListener('click', clearCircuitHistory);
  circuitNode('circuit-years').textContent = `${fmtNumber(rows.length)} race${rows.length === 1 ? '' : 's'} · ${fmtNumber(circuitData.circuit.totalRacesHeld)} completed in total`;
  renderPagination('circuit-races', rows.length, circuitHistoryPage, CIRCUIT_HISTORY_PAGE_SIZE, page => {
    circuitHistoryPage = page; renderCircuitHistory(); container.scrollIntoView({ block: 'start' });
  });
}
function clearCircuitHistory() {
  circuitHistorySeason = ''; circuitHistorySearch = ''; circuitHistorySort = 'newest'; circuitHistoryPage = 1; renderCircuitHistory();
}
function circuitLocationLink(circuit) {
  if (circuit.latitude == null || circuit.longitude == null || circuit.latitude === '' || circuit.longitude === '') return '';
  const lat = Number(circuit.latitude), lon = Number(circuit.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return '';
  return `<a href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lon}#map=14/${lat}/${lon}" target="_blank" rel="noopener noreferrer">View location ↗</a>`;
}
function renderCircuitRecords(records) {
  return [['drivers', 'Most successful drivers', 'driver'], ['constructors', circuitTeamPage === 'team' ? 'Most successful teams' : 'Most successful constructors', circuitTeamPage]].map(([key, title, page]) =>
    `<div><h3>${title}</h3>${records[key]?.length ? `<ol>${records[key].map(row => `<li><a href="${circuitDetailBase}/${page}?id=${encodeURIComponent(row.id)}">${esc(row.name)}</a><span>${fmtNumber(row.wins)} win${row.wins === 1 ? '' : 's'}</span></li>`).join('')}</ol>` : '<p class="section-note">No recorded winners yet.</p>'}</div>`
  ).join('');
}
function applyCircuitDetail(data) {
  data = { ...data, races: data.history || data.races };
  circuitData = data;
  const c = data.circuit;
  document.title = `${c.name} · ${circuitDetailSeriesName} · Racelytic`;
  circuitNode('circuit-back-link').href = circuitReturnPath();
  circuitNode('circuit-head').setAttribute('aria-busy', 'false');
  circuitNode('circuit-head').innerHTML = `<section class="detail-hero circuit-detail-hero"><div><h1>${esc(c.name)}</h1><p class="detail-sub">${esc([c.placeName, c.countryName].filter(Boolean).join(' · '))}</p><div class="circuit-detail-meta">${c.type ? `<span>${esc(titleCase(c.type))} circuit</span>` : ''}${c.direction ? `<span>${esc(titleCase(c.direction))}</span>` : ''}${circuitLocationLink(c)}</div></div><figure>${c.layoutId ? `<img id="circuit-detail-map" src="/assets/circuits/${encodeURIComponent(c.layoutId)}.svg" width="320" height="190" alt="Track outline of ${esc(c.name)}" decoding="async">` : '<span>Layout unavailable</span>'}<figcaption>Current / last recorded layout</figcaption></figure></section>`;
  const map = circuitNode('circuit-detail-map');
  if (c.layoutId && map) map.addEventListener('error', () => { map.replaceWith(Object.assign(document.createElement('span'), { textContent: 'Layout unavailable' })); }, { once: true });
  const length = c.layoutLength ?? c.length, turns = c.layoutTurns ?? c.turns;
  circuitNode('circuit-stats').innerHTML = `<dl>${[
    circuitStat('Length', Number(length) > 0 ? length : null, ' km'),
    circuitStat('Turns', Number(turns) > 0 ? turns : null),
    circuitStat('Races hosted', c.totalRacesHeld),
    `<div><dt>First race</dt><dd>${esc(c.firstHeldYear || '—')}</dd></div>`,
    `<div><dt>Latest race</dt><dd>${esc(c.lastHeldYear || '—')}</dd></div>`
  ].join('')}</dl>`;
  circuitNode('circuit-layout-note').textContent = 'Dimensions refer to the current or last recorded layout. Historical races may have used different configurations.';
  circuitNode('circuit-analysis-link').href = `${circuitDetailBase}/circuit-analysis?id=${encodeURIComponent(c.id)}`;
  circuitNode('circuit-records').innerHTML = renderCircuitRecords(data.records);
  const upcoming = data.races.filter(race => circuitRaceStatus(race) === 'scheduled').sort((a, b) => Number(a.year) - Number(b.year) || Number(a.round) - Number(b.round));
  circuitNode('circuit-upcoming').hidden = !upcoming.length;
circuitNode('circuit-upcoming').innerHTML = upcoming.length ? `<header class="section-heading"><div><div class="eyebrow">ON THE CALENDAR</div><h2>Scheduled appearances</h2></div></header><div class="circuit-scheduled-list">${upcoming.map(race => `<a href="${esc(circuitRaceLink(race))}"><span>${esc(race.year)} · ${esc(displayRaceName(race))}</span><span>${esc(circuitRaceDate(race))} · Scheduled</span></a>`).join('')}</div>` : '';
  const years = [...new Set(data.races.filter(race => circuitRaceStatus(race) !== 'scheduled').map(race => Number(race.year)))].sort((a, b) => b - a);
  circuitNode('circuit-history-season').innerHTML = '<option value="">All seasons</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
  if (circuitHistorySeason && !years.includes(Number(circuitHistorySeason))) circuitNode('circuit-history-season').innerHTML += `<option value="${circuitHistorySeason}">${circuitHistorySeason}</option>`;
  renderCircuitHistory();
}
function validCircuitDetail(data) {
  return data && String(data.circuit?.id) === circuitDetailId && Array.isArray(data.races) && data.records && Array.isArray(data.records.drivers) && Array.isArray(data.records.constructors);
}
function clearCircuitSkeletons() {
  ['circuit-head', 'circuit-stats', 'circuit-records', 'circuit-races'].forEach(id => { circuitNode(id).innerHTML = ''; circuitNode(id).setAttribute('aria-busy', 'false'); });
  circuitNode('circuit-years').textContent = '';
}
async function loadCircuit() {
  if (!circuitDetailId) { clearCircuitSkeletons(); circuitNode('circuit-load-status').textContent = 'No circuit selected. Choose a circuit from the archive.'; return; }
  if (!circuitData) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CIRCUIT_DETAIL_CACHE));
      if (saved && Date.now() - saved.savedAt < 300000 && validCircuitDetail(saved.data)) applyCircuitDetail(saved.data);
    } catch { /* Loading works even when storage is unavailable. */ }
  }
  circuitNode('circuit-load-status').textContent = circuitData ? 'Refreshing circuit…' : 'Loading circuit…';
  try {
    const data = await getJSON(`/api/circuits/${encodeURIComponent(circuitDetailId)}${circuitDetailSeries === 'f1' ? '' : `?series=${circuitDetailSeries}`}`);
    if (!validCircuitDetail(data)) throw new Error('Circuit data is unavailable.');
    applyCircuitDetail(data);
    circuitNode('circuit-load-status').textContent = '';
    try { sessionStorage.setItem(CIRCUIT_DETAIL_CACHE, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* Optional cache. */ }
  } catch (error) {
    if (!circuitData) clearCircuitSkeletons();
    circuitNode('circuit-load-status').innerHTML = `${circuitData ? 'Showing saved circuit. ' : ''}${esc(error.message)} <button type="button" id="circuit-retry" class="button secondary">Retry</button>`;
    circuitNode('circuit-retry').addEventListener('click', loadCircuit);
  }
}
function bindCircuitHistory() {
  const controls = {
    'circuit-history-search': value => { circuitHistorySearch = value; },
    'circuit-history-season': value => { circuitHistorySeason = value; },
    'circuit-history-sort': value => { circuitHistorySort = value; }
  };
  Object.entries(controls).forEach(([id, change]) => circuitNode(id).addEventListener(id.endsWith('search') ? 'input' : 'change', event => { change(event.target.value); circuitHistoryPage = 1; renderCircuitHistory(); }));
  circuitNode('circuit-history-clear').addEventListener('click', clearCircuitHistory);
  window.addEventListener('popstate', () => {
    if (params().get('id') !== circuitDetailId) { window.location.reload(); return; }
    readCircuitHistoryState(); renderCircuitHistory();
  });
}
readCircuitHistoryState();
bindCircuitHistory();
loadCircuit();
