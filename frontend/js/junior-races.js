const juniorArchive = window.RacelyticJuniorRaceArchive;
let allJuniorRaces = [];
let juniorRacePage = 1;
const juniorRaceFilters = ['junior-race-search', 'junior-race-year', 'junior-race-circuit', 'junior-race-status', 'junior-race-format', 'junior-race-sort'];

function normalizedJuniorRaceDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function juniorWeekendStatus(race) {
  const completed = Number(race.completedRaceSessionCount || 0);
  const active = Number(race.activeRaceSessionCount ?? Math.max(0, Number(race.raceSessionCount || 0) - Number(race.cancelledSessionCount || 0)));
  if (completed > 0 && active > 0 && completed >= active) return 'completed';
  if (completed > 0) return 'in-progress';
  const endDate = normalizedJuniorRaceDate(race.endDate || race.date);
  if (endDate && endDate >= new Date()) return 'upcoming';
  return 'no-result';
}

function juniorWeekendStatusLabel(status, race) {
  if (status === 'in-progress') return 'In progress';
  if (status === 'completed') return 'Completed';
  if (status === 'no-result') return 'No result';
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const start = String(race.date || '').slice(0, 10);
  const end = String(race.endDate || race.date || '').slice(0, 10);
  return start && start <= today && today <= end ? 'This weekend' : 'Upcoming';
}

function juniorWeekendDates(race) {
  const start = fmtDate(race.date);
  const end = race.endDate ? fmtDate(race.endDate) : '';
  return end && end !== start ? `${start}–${end}` : start;
}

function juniorRaceFormatLabel(race) {
  const count = Number(race.raceSessionCount || 0);
  if (!count) return 'Schedule pending';
  return `${fmtNumber(count)} race${count === 1 ? '' : 's'}`;
}

function juniorRaceFilterState() {
  return {
    search: document.getElementById('junior-race-search').value.trim(),
    year: document.getElementById('junior-race-year').value,
    circuit: document.getElementById('junior-race-circuit').value.trim(),
    status: document.getElementById('junior-race-status').value,
    format: document.getElementById('junior-race-format').value,
    sort: document.getElementById('junior-race-sort').value === 'oldest' ? 'oldest' : 'newest'
  };
}

function syncJuniorRaceArchiveUrl(state) {
  const query = new URLSearchParams();
  if (state.search) query.set('search', state.search);
  if (state.year) query.set('year', state.year);
  if (state.circuit) query.set('circuit', state.circuit);
  if (state.status) query.set('status', state.status);
  if (state.format) query.set('format', state.format);
  if (state.sort !== 'newest') query.set('sort', state.sort);
  if (juniorRacePage > 1) query.set('page', juniorRacePage);
  history.replaceState(null, '', `${activeSeriesBase()}/races${query.size ? `?${query}` : ''}`);
}

function juniorRacePages(races) {
  const seasons = new Map();
  races.forEach(race => {
    const year = Number(race.year);
    if (!seasons.has(year)) seasons.set(year, []);
    seasons.get(year).push(race);
  });
  return [...seasons.entries()].map(([year, seasonRaces]) => [{ year, races: seasonRaces }]);
}

function renderJuniorRaceCard(race) {
  const status = juniorWeekendStatus(race);
  const completed = Number(race.completedRaceSessionCount || 0);
  const winner = race.winnerName
    ? `<div class="race-archive-winner"><span>${completed > 1 ? 'Winners' : 'Winner'}</span><strong>${esc(race.winnerName)}</strong><small>${esc(race.winnerConstructorName || '')}</small></div>`
    : `<div class="race-archive-winner race-archive-pending"><span>Status</span><strong>${esc(juniorWeekendStatusLabel(status, race))}</strong><small>${status === 'upcoming' ? 'Results pending' : 'Classification unavailable'}</small></div>`;
  return `<a class="race-archive-card series-race-archive-card ${juniorArchive.series === 'f2' ? 'f2-race-archive-card' : 'junior-race-archive-card'}" data-status="${status}" href="${activeSeriesBase()}/race?id=${encodeURIComponent(race.id)}">
    <div class="race-archive-date"><strong>${String(race.round).padStart(2, '0')}</strong><span>Round</span></div>
    <div class="race-archive-copy"><h3>${esc(race.name)}</h3><p>${esc(race.circuitName || '')}${race.placeName ? ` · ${esc(race.placeName)}` : ''}</p></div>
    ${winner}
    <div class="race-archive-meta"><span>${esc(juniorWeekendDates(race))}</span><div><small>${esc(juniorRaceFormatLabel(race))}</small>${race.cancelledSessionCount ? `<small class="race-cancelled-badge">${fmtNumber(race.cancelledSessionCount)} cancelled</small>` : ''}<small class="race-status-badge">${esc(juniorWeekendStatusLabel(status, race))}</small></div></div>
  </a>`;
}

function renderJuniorSeasonGroup(group) {
  const currentYear = new Date().getFullYear();
  const active = group.races.filter(race => ['upcoming', 'in-progress'].includes(juniorWeekendStatus(race)));
  const past = group.races.filter(race => !['upcoming', 'in-progress'].includes(juniorWeekendStatus(race)));
  const seasonLabel = group.year === currentYear ? '<span>Current season</span>' : '';
  const countLabel = `${fmtNumber(group.races.length)} weekend${group.races.length === 1 ? '' : 's'}`;
  let rows;
  if (group.year === currentYear && active.length && past.length) {
    const activeLabel = active.some(race => juniorWeekendStatus(race) === 'in-progress') ? 'Current & upcoming' : 'Upcoming';
    rows = `<div class="race-season-subheading"><span>${activeLabel}</span><small>${fmtNumber(active.length)}</small></div>${active.map(renderJuniorRaceCard).join('')}
      <div class="race-season-subheading"><span>Past rounds</span><small>${fmtNumber(past.length)}</small></div>${past.map(renderJuniorRaceCard).join('')}`;
  } else {
    rows = group.races.map(renderJuniorRaceCard).join('');
  }
  return `<section class="race-season-group" aria-labelledby="junior-race-season-${group.year}">
    <header class="race-season-heading"><div><h2 id="junior-race-season-${group.year}">${group.year}</h2>${seasonLabel}</div><small>${countLabel}</small></header>
    <div class="race-season-list">${rows}</div>
  </section>`;
}

function renderJuniorActiveFilters(state) {
  const labels = [];
  if (state.search) labels.push(['search', `Search: ${state.search}`]);
  if (state.year) labels.push(['year', `Season: ${state.year}`]);
  if (state.circuit) labels.push(['circuit', `Circuit: ${state.circuit}`]);
  if (state.status) labels.push(['status', `Status: ${state.status.replace('-', ' ')}`]);
  if (state.format) labels.push(['format', `${state.format}-race weekends`]);
  if (state.sort === 'oldest') labels.push(['sort', 'Oldest first']);
  document.getElementById('junior-race-active-filters').innerHTML = labels.map(([filter, label]) =>
    `<button type="button" data-clear-junior-race-filter="${filter}" aria-label="Remove ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`
  ).join('');
  document.getElementById('clear-junior-race-filters').disabled = labels.length === 0;
  const advancedCount = ['status', 'format'].filter(key => state[key]).length + (state.sort === 'oldest' ? 1 : 0);
  document.getElementById('junior-race-more-filter-count').textContent = advancedCount ? String(advancedCount) : '';
  document.querySelectorAll('[data-clear-junior-race-filter]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.clearJuniorRaceFilter;
    document.getElementById(`junior-race-${key}`).value = key === 'sort' ? 'newest' : '';
    juniorRacePage = 1;
    renderJuniorRaceArchive();
  }));
}

function renderJuniorRacePagination(pages) {
  const nav = document.getElementById('junior-races-pagination');
  if (pages.length <= 1) {
    nav.innerHTML = '';
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  const visible = new Set([1, pages.length, juniorRacePage - 2, juniorRacePage - 1, juniorRacePage, juniorRacePage + 1, juniorRacePage + 2]
    .filter(page => page >= 1 && page <= pages.length));
  let previous = 0;
  const numbers = [...visible].sort((first, second) => first - second).map(page => {
    const gap = previous && page - previous > 1 ? '<span class="pagination-gap">…</span>' : '';
    previous = page;
    return `${gap}<button type="button" data-junior-race-page="${page}" class="${page === juniorRacePage ? 'active' : ''}" ${page === juniorRacePage ? 'aria-current="page"' : ''}>${page}</button>`;
  }).join('');
  nav.innerHTML = `<button type="button" data-junior-race-page="${juniorRacePage - 1}" ${juniorRacePage <= 1 ? 'disabled' : ''} aria-label="Previous season">←</button><div class="pagination-pages">${numbers}</div><button type="button" data-junior-race-page="${juniorRacePage + 1}" ${juniorRacePage >= pages.length ? 'disabled' : ''} aria-label="Next season">→</button><span class="pagination-count">${fmtNumber(pages.length)} seasons</span>`;
  nav.querySelectorAll('[data-junior-race-page]').forEach(button => button.addEventListener('click', () => {
    const page = Number(button.dataset.juniorRacePage);
    if (page < 1 || page > pages.length || page === juniorRacePage) return;
    juniorRacePage = page;
    renderJuniorRaceArchive();
    document.getElementById('junior-race-browser-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function renderJuniorRaceArchive() {
  const state = juniorRaceFilterState();
  const query = state.search.toLowerCase();
  const circuit = state.circuit.toLowerCase();
  const filtered = allJuniorRaces.filter(race => (!state.year || String(race.year) === state.year)
    && (!circuit || String(race.circuitName || '').toLowerCase().includes(circuit))
    && (!state.status || juniorWeekendStatus(race) === state.status)
    && (!state.format || Number(race.raceSessionCount || 0) === Number(state.format))
    && (!query || `${race.name || ''} ${race.code || ''} ${race.circuitName || ''} ${race.placeName || ''} ${race.winnerName || ''} ${race.winnerConstructorName || ''}`.toLowerCase().includes(query)));
  filtered.sort((first, second) => {
    if (state.sort === 'oldest') return Number(first.year) - Number(second.year) || Number(first.round) - Number(second.round);
    if (Number(first.year) !== Number(second.year)) return Number(second.year) - Number(first.year);
    if (Number(first.year) === new Date().getFullYear()) {
      const order = { 'in-progress': 0, upcoming: 1, completed: 2, 'no-result': 3 };
      const statusDifference = order[juniorWeekendStatus(first)] - order[juniorWeekendStatus(second)];
      if (statusDifference) return statusDifference;
      if (['upcoming', 'in-progress'].includes(juniorWeekendStatus(first))) return Number(first.round) - Number(second.round);
    }
    return Number(second.round) - Number(first.round);
  });

  document.getElementById('junior-race-count').textContent = `${fmtNumber(filtered.length)} weekend${filtered.length === 1 ? '' : 's'}`;
  document.getElementById('junior-race-filter-note').textContent = filtered.length === allJuniorRaces.length ? `Complete ${juniorArchive.shortName} archive` : `of ${fmtNumber(allJuniorRaces.length)}`;
  const pages = juniorRacePages(filtered);
  juniorRacePage = Math.max(1, Math.min(juniorRacePage, pages.length || 1));
  const target = document.getElementById('junior-races');
  target.innerHTML = filtered.length
    ? pages[juniorRacePage - 1].map(renderJuniorSeasonGroup).join('')
    : `<div class="race-archive-empty"><strong>No matching weekends</strong><p>Try a different event, season, circuit, status, or format.</p><button class="button" type="button" data-reset-junior-race-filters>Clear all filters</button></div>`;
  target.setAttribute('aria-busy', 'false');
  renderJuniorActiveFilters(state);
  renderJuniorRacePagination(pages);
  syncJuniorRaceArchiveUrl(state);
  document.querySelector('[data-reset-junior-race-filters]')?.addEventListener('click', resetJuniorRaceFilters);
}

function restoreJuniorRaceArchiveState() {
  const query = new URLSearchParams(window.location.search);
  const values = {
    'junior-race-search': query.get('search') || '',
    'junior-race-year': query.get('year') || '',
    'junior-race-circuit': query.get('circuit') || '',
    'junior-race-status': ['upcoming', 'in-progress', 'completed', 'no-result'].includes(query.get('status')) ? query.get('status') : '',
    'junior-race-format': ['1', '2', '3'].includes(query.get('format')) ? query.get('format') : '',
    'junior-race-sort': query.get('sort') === 'oldest' ? 'oldest' : 'newest'
  };
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value; });
  juniorRacePage = Math.max(1, Number(query.get('page')) || 1);
  const hasAdvancedFilter = values['junior-race-status'] || values['junior-race-format'] || values['junior-race-sort'] === 'oldest';
  document.getElementById('junior-race-more-filters').open = hasAdvancedFilter || !window.matchMedia('(max-width: 700px)').matches;
}

function resetJuniorRaceFilters() {
  juniorRacePage = 1;
  juniorRaceFilters.forEach(id => { document.getElementById(id).value = id === 'junior-race-sort' ? 'newest' : ''; });
  document.getElementById('junior-race-more-filters').open = !window.matchMedia('(max-width: 700px)').matches;
  renderJuniorRaceArchive();
  document.getElementById('junior-race-search').focus();
}

async function loadJuniorRaces() {
  try {
    allJuniorRaces = await getJSON(`/api/races?series=${encodeURIComponent(juniorArchive.series)}`);
    const years = [...new Set(allJuniorRaces.map(race => race.year))].sort((first, second) => second - first);
    const circuits = [...new Set(allJuniorRaces.map(race => race.circuitName).filter(Boolean))].sort((first, second) => first.localeCompare(second));
    document.getElementById('junior-race-year').insertAdjacentHTML('beforeend', years.map(year => `<option value="${esc(year)}">${esc(year)}</option>`).join(''));
    document.getElementById('junior-race-circuit-options').innerHTML = circuits.map(name => `<option value="${esc(name)}"></option>`).join('');
    restoreJuniorRaceArchiveState();
    renderJuniorRaceArchive();
  } catch (error) {
    document.getElementById('junior-race-count').textContent = 'Weekend archive unavailable';
    document.getElementById('junior-race-filter-note').textContent = '';
    document.getElementById('junior-races').setAttribute('aria-busy', 'false');
    setError('junior-races', error.message);
  }
}

juniorRaceFilters.forEach(id => document.getElementById(id).addEventListener(id === 'junior-race-search' || id === 'junior-race-circuit' ? 'input' : 'change', () => {
  juniorRacePage = 1;
  renderJuniorRaceArchive();
}));
document.getElementById('clear-junior-race-filters').addEventListener('click', resetJuniorRaceFilters);

loadJuniorRaces();
