let allRaces = [];
let racePage = 1;
const raceFilters = ['race-search', 'race-year', 'race-circuit', 'race-status', 'race-weekend', 'race-sort'];

function normalizedRaceDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function raceArchiveStatus(race) {
  if (race.winnerName) return 'completed';
  const date = normalizedRaceDate(race.date);
  if (date && date >= new Date()) return 'upcoming';
  return 'no-result';
}

function raceFilterState() {
  return {
    search: document.getElementById('race-search').value.trim(),
    year: document.getElementById('race-year').value,
    circuit: document.getElementById('race-circuit').value.trim(),
    status: document.getElementById('race-status').value,
    weekend: document.getElementById('race-weekend').value,
    sort: document.getElementById('race-sort').value === 'oldest' ? 'oldest' : 'newest'
  };
}

function syncRaceArchiveUrl(state) {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.year) params.set('year', state.year);
  if (state.circuit) params.set('circuit', state.circuit);
  if (state.status) params.set('status', state.status);
  if (state.weekend) params.set('weekend', state.weekend);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (racePage > 1) params.set('page', racePage);
  history.replaceState(null, '', `/races${params.size ? `?${params}` : ''}`);
}

function groupedRacePages(races) {
  const seasons = new Map();
  races.forEach(race => {
    const year = Number(race.year);
    if (!seasons.has(year)) seasons.set(year, []);
    seasons.get(year).push(race);
  });
  return [...seasons.entries()].map(([year, seasonRaces]) => [{ year, races: seasonRaces }]);
}

function raceStatusLabel(status, race) {
  if (status === 'upcoming') {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return String(race.date).slice(0, 10) === today ? 'Today' : 'Upcoming';
  }
  return status === 'completed' ? 'Completed' : 'No result';
}

function renderRaceCard(race) {
  const status = raceArchiveStatus(race);
  const winner = status === 'completed'
    ? `<div class="race-archive-winner"><span>Winner</span><strong>${esc(race.winnerName)}</strong><small>${esc(race.winnerConstructorName || '')}</small></div>`
    : `<div class="race-archive-winner race-archive-pending"><span>Status</span><strong>${esc(raceStatusLabel(status, race))}</strong><small>${status === 'upcoming' ? 'Result pending' : 'Classification unavailable'}</small></div>`;
  return `<a class="race-archive-card f1-race-archive-card" data-status="${status}" href="/race?id=${encodeURIComponent(race.id)}">
    <div class="race-archive-date"><strong>${String(race.round).padStart(2, '0')}</strong><span>Round</span></div>
    <div class="race-archive-copy"><h3>${esc(displayRaceName(race))}</h3><p>${esc(race.circuitName || '')}${race.countryName ? ` · ${esc(race.countryName)}` : ''}</p></div>
    ${winner}
    <div class="race-archive-meta"><span>${esc(fmtDate(race.date))}</span><div>${race.sprintRaceDate ? '<small>Sprint</small>' : ''}<small class="race-status-badge">${esc(raceStatusLabel(status, race))}</small></div></div>
  </a>`;
}

function renderSeasonGroup(group) {
  const currentYear = new Date().getFullYear();
  const statuses = group.races.reduce((counts, race) => {
    counts[raceArchiveStatus(race)] += 1;
    return counts;
  }, { upcoming: 0, completed: 0, 'no-result': 0 });
  const seasonLabel = group.year === currentYear ? '<span>Current season</span>' : '';
  const countLabel = `${fmtNumber(group.races.length)} race${group.races.length === 1 ? '' : 's'}`;
  const hasMixedCurrentSeason = group.year === currentYear && statuses.upcoming && (statuses.completed || statuses['no-result']);
  let rows = '';
  if (hasMixedCurrentSeason) {
    const upcoming = group.races.filter(race => raceArchiveStatus(race) === 'upcoming');
    const finished = group.races.filter(race => raceArchiveStatus(race) !== 'upcoming');
    rows = `<div class="race-season-subheading"><span>Upcoming</span><small>${fmtNumber(upcoming.length)}</small></div>${upcoming.map(renderRaceCard).join('')}
      <div class="race-season-subheading"><span>Past rounds</span><small>${fmtNumber(finished.length)}</small></div>${finished.map(renderRaceCard).join('')}`;
  } else {
    rows = group.races.map(renderRaceCard).join('');
  }
  return `<section class="race-season-group" aria-labelledby="race-season-${group.year}">
    <header class="race-season-heading"><div><h2 id="race-season-${group.year}">${group.year}</h2>${seasonLabel}</div><small>${countLabel}</small></header>
    <div class="race-season-list">${rows}</div>
  </section>`;
}

function renderActiveRaceFilters(state) {
  const labels = [];
  if (state.search) labels.push(['search', `Search: ${state.search}`]);
  if (state.year) labels.push(['year', `Season: ${state.year}`]);
  if (state.circuit) labels.push(['circuit', `Circuit: ${state.circuit}`]);
  if (state.status) labels.push(['status', `Status: ${state.status === 'no-result' ? 'No result' : state.status}`]);
  if (state.weekend) labels.push(['weekend', state.weekend === 'sprint' ? 'Sprint weekends' : 'Standard weekends']);
  if (state.sort === 'oldest') labels.push(['sort', 'Oldest first']);
  document.getElementById('race-active-filters').innerHTML = labels.map(([filter, label]) =>
    `<button type="button" data-clear-race-filter="${filter}" aria-label="Remove ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`
  ).join('');
  document.getElementById('clear-race-filters').disabled = labels.length === 0;
  const advancedCount = ['status', 'weekend'].filter(key => state[key]).length + (state.sort === 'oldest' ? 1 : 0);
  document.getElementById('race-more-filter-count').textContent = advancedCount ? String(advancedCount) : '';
  document.querySelectorAll('[data-clear-race-filter]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.clearRaceFilter;
    document.getElementById(`race-${key}`).value = key === 'sort' ? 'newest' : '';
    racePage = 1;
    renderRaceArchive();
  }));
}

function renderRacePagination(pages) {
  const nav = document.getElementById('races-pagination');
  if (pages.length <= 1) {
    nav.innerHTML = '';
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  const visible = new Set([1, pages.length, racePage - 2, racePage - 1, racePage, racePage + 1, racePage + 2]
    .filter(page => page >= 1 && page <= pages.length));
  let previous = 0;
  const numbers = [...visible].sort((a, b) => a - b).map(page => {
    const gap = previous && page - previous > 1 ? '<span class="pagination-gap">…</span>' : '';
    previous = page;
    return `${gap}<button type="button" data-race-page="${page}" class="${page === racePage ? 'active' : ''}" ${page === racePage ? 'aria-current="page"' : ''}>${page}</button>`;
  }).join('');
  nav.innerHTML = `<button type="button" data-race-page="${racePage - 1}" ${racePage <= 1 ? 'disabled' : ''} aria-label="Previous archive page">←</button><div class="pagination-pages">${numbers}</div><button type="button" data-race-page="${racePage + 1}" ${racePage >= pages.length ? 'disabled' : ''} aria-label="Next archive page">→</button><span class="pagination-count">${fmtNumber(pages.length)} pages</span>`;
  nav.querySelectorAll('[data-race-page]').forEach(button => button.addEventListener('click', () => {
    const nextPage = Number(button.dataset.racePage);
    if (nextPage < 1 || nextPage > pages.length || nextPage === racePage) return;
    racePage = nextPage;
    renderRaceArchive();
    document.getElementById('race-browser-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function renderRaceArchive() {
  const state = raceFilterState();
  const query = state.search.toLowerCase();
  const circuit = state.circuit.toLowerCase();
  const filtered = allRaces.filter(race => (!state.year || String(race.year) === state.year)
    && (!circuit || `${race.circuitName || ''}`.toLowerCase().includes(circuit))
    && (!state.status || raceArchiveStatus(race) === state.status)
    && (!state.weekend || (state.weekend === 'sprint') === Boolean(race.sprintRaceDate))
    && (!query || `${race.name || ''} ${race.shortName || ''} ${race.officialName || ''} ${race.circuitName || ''} ${race.countryName || ''} ${race.winnerName || ''} ${race.winnerConstructorName || ''}`.toLowerCase().includes(query)));
  filtered.sort((first, second) => {
    if (state.sort === 'oldest') return Number(first.year) - Number(second.year) || Number(first.round) - Number(second.round);
    if (Number(first.year) !== Number(second.year)) return Number(second.year) - Number(first.year);
    const firstUpcoming = raceArchiveStatus(first) === 'upcoming';
    const secondUpcoming = raceArchiveStatus(second) === 'upcoming';
    if (Number(first.year) === new Date().getFullYear() && firstUpcoming !== secondUpcoming) return firstUpcoming ? -1 : 1;
    if (firstUpcoming && secondUpcoming) return Number(first.round) - Number(second.round);
    return Number(second.round) - Number(first.round);
  });

  document.getElementById('race-count').textContent = `${fmtNumber(filtered.length)} race${filtered.length === 1 ? '' : 's'}`;
  document.getElementById('race-filter-note').textContent = filtered.length === allRaces.length ? 'Complete archive' : `of ${fmtNumber(allRaces.length)}`;
  const pages = groupedRacePages(filtered);
  racePage = Math.max(1, Math.min(racePage, pages.length || 1));
  document.getElementById('races').innerHTML = filtered.length
    ? pages[racePage - 1].map(renderSeasonGroup).join('')
    : '<div class="race-archive-empty"><strong>No matching races</strong><p>Try a different race, season, circuit, or status.</p><button class="button" type="button" data-reset-race-filters>Clear all filters</button></div>';
  document.getElementById('races').setAttribute('aria-busy', 'false');
  renderActiveRaceFilters(state);
  renderRacePagination(pages);
  syncRaceArchiveUrl(state);
  document.querySelector('[data-reset-race-filters]')?.addEventListener('click', resetRaceFilters);
}

function resetRaceFilters() {
  racePage = 1;
  raceFilters.forEach(id => { document.getElementById(id).value = id === 'race-sort' ? 'newest' : ''; });
  document.getElementById('race-more-filters').open = !window.matchMedia('(max-width: 700px)').matches;
  renderRaceArchive();
  document.getElementById('race-search').focus();
}

function restoreRaceArchiveState() {
  const params = new URLSearchParams(window.location.search);
  const values = {
    'race-search': params.get('search') || '',
    'race-year': params.get('year') || '',
    'race-circuit': params.get('circuit') || '',
    'race-status': ['upcoming', 'completed', 'no-result'].includes(params.get('status')) ? params.get('status') : '',
    'race-weekend': ['sprint', 'standard'].includes(params.get('weekend')) ? params.get('weekend') : '',
    'race-sort': params.get('sort') === 'oldest' ? 'oldest' : 'newest'
  };
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value; });
  racePage = Math.max(1, Number(params.get('page')) || 1);
  const hasAdvancedFilter = values['race-status'] || values['race-weekend'] || values['race-sort'] === 'oldest';
  document.getElementById('race-more-filters').open = hasAdvancedFilter || !window.matchMedia('(max-width: 700px)').matches;
}

async function loadRaces() {
  try {
    allRaces = await getJSON('/api/races');
    const years = [...new Set(allRaces.map(race => race.year))].sort((a, b) => b - a);
    const circuits = [...new Set(allRaces.map(race => race.circuitName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    document.getElementById('race-year').insertAdjacentHTML('beforeend', years.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''));
    document.getElementById('race-circuit-options').innerHTML = circuits.map(name => `<option value="${esc(name)}"></option>`).join('');
    restoreRaceArchiveState();
    renderRaceArchive();
  } catch (error) {
    document.getElementById('race-count').textContent = 'Race archive unavailable';
    document.getElementById('race-filter-note').textContent = '';
    document.getElementById('races').setAttribute('aria-busy', 'false');
    setError('races', error.message);
  }
}

raceFilters.forEach(id => document.getElementById(id).addEventListener(id === 'race-search' || id === 'race-circuit' ? 'input' : 'change', () => {
  racePage = 1;
  renderRaceArchive();
}));
document.getElementById('clear-race-filters').addEventListener('click', resetRaceFilters);

loadRaces();
