let allWecRaces = [];
let wecRacePage = 1;
const wecRaceFilters = ['wec-race-search', 'wec-race-year', 'wec-race-circuit', 'wec-race-status', 'wec-race-format', 'wec-race-sort'];

function wecRaceStatus(race) {
  if (race.winner) return 'completed';
  const end = new Date(`${String(race.endDate || race.date || '').slice(0, 10)}T23:59:59`);
  if (!Number.isNaN(end.getTime()) && end >= new Date()) return 'upcoming';
  return 'no-result';
}

function wecRaceStatusLabel(status) {
  return status === 'completed' ? 'Completed' : status === 'upcoming' ? 'Upcoming' : 'No result';
}

function wecRaceFormatKey(race) {
  if (race.formatType === 'distance' || Number(race.scheduledDistanceKm) > 0) return 'distance';
  const hours = Number(race.scheduledMinutes) / 60;
  return [6, 8, 24].includes(hours) ? `${hours}h` : 'other';
}

function wecRaceFormatLabel(race) {
  if (wecRaceFormatKey(race) === 'distance') return `${fmtNumber(Number(race.scheduledDistanceKm || 0))} km`;
  const minutes = Number(race.scheduledMinutes || 0);
  if (!minutes) return 'Format pending';
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hours` : `${Math.floor(hours)}h ${minutes % 60}m`;
}

function wecRaceDates(race) {
  const start = fmtDate(race.date);
  const end = race.endDate ? fmtDate(race.endDate) : '';
  return end && end !== start ? `${start}–${end}` : start;
}

function wecRaceFilterState() {
  return {
    search: document.getElementById('wec-race-search').value.trim(),
    year: document.getElementById('wec-race-year').value,
    circuit: document.getElementById('wec-race-circuit').value.trim(),
    status: document.getElementById('wec-race-status').value,
    format: document.getElementById('wec-race-format').value,
    sort: document.getElementById('wec-race-sort').value === 'oldest' ? 'oldest' : 'newest'
  };
}

function syncWecRaceUrl(state) {
  const query = new URLSearchParams();
  for (const key of ['search', 'year', 'circuit', 'status', 'format']) if (state[key]) query.set(key, state[key]);
  if (state.sort === 'oldest') query.set('sort', 'oldest');
  if (wecRacePage > 1) query.set('page', wecRacePage);
  history.replaceState(null, '', `/wec/races${query.size ? `?${query}` : ''}`);
}

function wecRacePages(races) {
  const seasons = new Map();
  for (const race of races) {
    if (!seasons.has(Number(race.year))) seasons.set(Number(race.year), []);
    seasons.get(Number(race.year)).push(race);
  }
  return [...seasons.entries()].map(([year, seasonRaces]) => ({ year, races: seasonRaces }));
}

function renderWecRaceCard(race) {
  const status = wecRaceStatus(race);
  const winner = race.winner
    ? `<div class="race-archive-winner wec-race-winner"><span>Overall winner</span><strong><b>#${esc(race.winner.carNumber)}</b> ${esc(race.winner.teamName)}</strong><small>${esc(race.winner.drivers.join(' · '))}</small></div>`
    : `<div class="race-archive-winner race-archive-pending"><span>Status</span><strong>${esc(wecRaceStatusLabel(status))}</strong><small>${status === 'upcoming' ? 'Classification pending' : 'Classification unavailable'}</small></div>`;
  return `<a class="race-archive-card series-race-archive-card wec-race-archive-card" data-status="${status}" href="${resourceUrl('race', race.id, { label: race.name })}">
    <div class="race-archive-date"><strong>${String(race.round).padStart(2, '0')}</strong><span>Round</span></div>
    <div class="race-archive-copy"><h3>${esc(race.name)}</h3><p>${esc(race.circuitName || '')}${race.placeName ? ` · ${esc(race.placeName)}` : ''}</p></div>
    ${winner}
    <div class="race-archive-meta"><span>${esc(wecRaceDates(race))}</span><div><small>${esc(wecRaceFormatLabel(race))}</small><small class="race-status-badge">${esc(wecRaceStatusLabel(status))}</small></div></div>
  </a>`;
}

function renderWecSeasonGroup(group) {
  return `<section class="race-season-group" aria-labelledby="wec-race-season-${group.year}">
    <header class="race-season-heading"><div><h2 id="wec-race-season-${group.year}">${group.year}</h2></div><small>${fmtNumber(group.races.length)} race${group.races.length === 1 ? '' : 's'}</small></header>
    <div class="race-season-list">${group.races.map(renderWecRaceCard).join('')}</div>
  </section>`;
}

function renderWecActiveFilters(state) {
  const labels = [];
  if (state.search) labels.push(['search', `Search: ${state.search}`]);
  if (state.year) labels.push(['year', `Season: ${state.year}`]);
  if (state.circuit) labels.push(['circuit', `Circuit: ${state.circuit}`]);
  if (state.status) labels.push(['status', `Status: ${state.status.replace('-', ' ')}`]);
  if (state.format) labels.push(['format', `Format: ${state.format}`]);
  if (state.sort === 'oldest') labels.push(['sort', 'Oldest first']);
  document.getElementById('wec-race-active-filters').innerHTML = labels.map(([filter, label]) =>
    `<button type="button" data-clear-wec-race-filter="${filter}" aria-label="Remove ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`).join('');
  document.getElementById('clear-wec-race-filters').disabled = labels.length === 0;
  const advancedCount = ['status', 'format'].filter(key => state[key]).length + (state.sort === 'oldest' ? 1 : 0);
  document.getElementById('wec-race-more-filter-count').textContent = advancedCount ? String(advancedCount) : '';
  document.querySelectorAll('[data-clear-wec-race-filter]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.clearWecRaceFilter;
    document.getElementById(`wec-race-${key}`).value = key === 'sort' ? 'newest' : '';
    wecRacePage = 1;
    renderWecRaceArchive();
  }));
}

function renderWecRacePagination(pages) {
  const nav = document.getElementById('wec-races-pagination');
  if (pages.length <= 1) { nav.innerHTML = ''; nav.hidden = true; return; }
  nav.hidden = false;
  const visible = new Set([1, pages.length, wecRacePage - 2, wecRacePage - 1, wecRacePage, wecRacePage + 1, wecRacePage + 2]
    .filter(page => page >= 1 && page <= pages.length));
  let previous = 0;
  const buttons = [...visible].sort((a, b) => a - b).map(page => {
    const gap = previous && page - previous > 1 ? '<span class="pagination-gap">…</span>' : '';
    previous = page;
    return `${gap}<button type="button" data-wec-race-page="${page}" class="${page === wecRacePage ? 'active' : ''}" ${page === wecRacePage ? 'aria-current="page"' : ''}>${pages[page - 1].year}</button>`;
  }).join('');
  nav.innerHTML = `<button type="button" data-wec-race-page="${wecRacePage - 1}" ${wecRacePage <= 1 ? 'disabled' : ''} aria-label="Previous season">←</button><div class="pagination-pages">${buttons}</div><button type="button" data-wec-race-page="${wecRacePage + 1}" ${wecRacePage >= pages.length ? 'disabled' : ''} aria-label="Next season">→</button><span class="pagination-count">${fmtNumber(pages.length)} seasons</span>`;
  nav.querySelectorAll('[data-wec-race-page]').forEach(button => button.addEventListener('click', () => {
    const page = Number(button.dataset.wecRacePage);
    if (page < 1 || page > pages.length || page === wecRacePage) return;
    wecRacePage = page;
    renderWecRaceArchive();
    document.getElementById('wec-race-browser-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function renderWecRaceArchive() {
  const state = wecRaceFilterState();
  const query = state.search.toLowerCase();
  const circuit = state.circuit.toLowerCase();
  const filtered = allWecRaces.filter(race => (!state.year || String(race.year) === state.year)
    && (!circuit || String(race.circuitName || '').toLowerCase().includes(circuit))
    && (!state.status || wecRaceStatus(race) === state.status)
    && (!state.format || wecRaceFormatKey(race) === state.format)
    && (!query || `${race.name || ''} ${race.circuitName || ''} ${race.placeName || ''} ${race.countryName || ''} ${race.searchText || ''}`.toLowerCase().includes(query)));
  filtered.sort((a, b) => state.sort === 'oldest'
    ? Number(a.year) - Number(b.year) || Number(a.round) - Number(b.round)
    : Number(b.year) - Number(a.year) || Number(b.round) - Number(a.round));
  document.getElementById('wec-race-count').textContent = `${fmtNumber(filtered.length)} race${filtered.length === 1 ? '' : 's'}`;
  document.getElementById('wec-race-filter-note').textContent = filtered.length === allWecRaces.length ? 'Complete WEC archive' : `of ${fmtNumber(allWecRaces.length)}`;
  const pages = wecRacePages(filtered);
  wecRacePage = Math.max(1, Math.min(wecRacePage, pages.length || 1));
  const target = document.getElementById('wec-races');
  target.innerHTML = pages.length ? renderWecSeasonGroup(pages[wecRacePage - 1]) : `<div class="race-archive-empty"><strong>No matching races</strong><p>Try a different event, season, circuit, status, or format.</p><button class="button" type="button" data-reset-wec-race-filters>Clear all filters</button></div>`;
  target.setAttribute('aria-busy', 'false');
  renderWecActiveFilters(state);
  renderWecRacePagination(pages);
  syncWecRaceUrl(state);
  document.querySelector('[data-reset-wec-race-filters]')?.addEventListener('click', resetWecRaceFilters);
}

function restoreWecRaceState() {
  const query = new URLSearchParams(window.location.search);
  const values = {
    'wec-race-search': query.get('search') || '', 'wec-race-year': query.get('year') || '',
    'wec-race-circuit': query.get('circuit') || '',
    'wec-race-status': ['upcoming', 'completed', 'no-result'].includes(query.get('status')) ? query.get('status') : '',
    'wec-race-format': ['6h', '8h', '24h', 'distance', 'other'].includes(query.get('format')) ? query.get('format') : '',
    'wec-race-sort': query.get('sort') === 'oldest' ? 'oldest' : 'newest'
  };
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value; });
  wecRacePage = Math.max(1, Number(query.get('page')) || 1);
  document.getElementById('wec-race-more-filters').open = Boolean(values['wec-race-status'] || values['wec-race-format'] || values['wec-race-sort'] === 'oldest') || !window.matchMedia('(max-width: 700px)').matches;
}

function resetWecRaceFilters() {
  wecRacePage = 1;
  wecRaceFilters.forEach(id => { document.getElementById(id).value = id === 'wec-race-sort' ? 'newest' : ''; });
  renderWecRaceArchive();
  document.getElementById('wec-race-search').focus();
}

async function loadWecRaces() {
  try {
    allWecRaces = await getJSON('/api/wec/events?include=participants');
    const years = [...new Set(allWecRaces.map(race => race.year))].sort((a, b) => b - a);
    const circuits = [...new Set(allWecRaces.map(race => race.circuitName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    document.getElementById('wec-race-year').insertAdjacentHTML('beforeend', years.map(year => `<option value="${esc(year)}">${esc(year)}</option>`).join(''));
    document.getElementById('wec-race-circuit-options').innerHTML = circuits.map(name => `<option value="${esc(name)}"></option>`).join('');
    restoreWecRaceState();
    renderWecRaceArchive();
  } catch (error) {
    document.getElementById('wec-race-count').textContent = 'Race archive unavailable';
    document.getElementById('wec-races').setAttribute('aria-busy', 'false');
    setError('wec-races', error.message);
  }
}

wecRaceFilters.forEach(id => document.getElementById(id).addEventListener(['wec-race-search', 'wec-race-circuit'].includes(id) ? 'input' : 'change', () => { wecRacePage = 1; renderWecRaceArchive(); }));
document.getElementById('clear-wec-race-filters').addEventListener('click', resetWecRaceFilters);
loadWecRaces();
