let allF2Races = [];
let f2RacePage = 1;
const F2_RACE_PAGE_SIZE = 30;

function f2WeekendDates(race) {
  const start = fmtDate(race.date);
  const end = race.endDate ? fmtDate(race.endDate) : '';
  return end && end !== start ? `${start}–${end}` : start;
}

function f2WeekendSessionSummary(race) {
  if (!race.sessionCount) return 'Schedule pending';
  return `${fmtNumber(race.sessionCount)} sessions · ${fmtNumber(race.raceSessionCount)} races`;
}

function renderF2RaceArchive() {
  const query = document.getElementById('f2-race-search').value.toLowerCase().trim();
  const year = document.getElementById('f2-race-year').value;
  const circuit = document.getElementById('f2-race-circuit').value;
  const filtered = allF2Races.filter(race => (!year || String(race.year) === year)
    && (!circuit || race.circuitId === circuit)
    && (!query || `${race.name} ${race.code || ''} ${race.circuitName || ''} ${race.placeName || ''}`.toLowerCase().includes(query)));

  document.getElementById('f2-race-count').textContent = `${fmtNumber(filtered.length)} weekend${filtered.length === 1 ? '' : 's'}`;
  document.getElementById('f2-race-filter-note').textContent = filtered.length === allF2Races.length ? 'Complete F2 archive' : `of ${fmtNumber(allF2Races.length)}`;
  const paged = pageItems(filtered, f2RacePage, F2_RACE_PAGE_SIZE);
  f2RacePage = paged.page;
  document.getElementById('f2-races').innerHTML = filtered.length ? paged.items.map(race => `
    <a class="race-archive-card f2-race-archive-card" href="/f2/race?id=${encodeURIComponent(race.id)}">
      <div class="race-archive-date"><strong>${esc(race.year)}</strong><span>Round ${esc(race.round)}</span></div>
      <div class="race-archive-copy"><h2>${esc(race.name)}</h2><p>${esc(race.circuitName || '')}${race.placeName ? ` · ${esc(race.placeName)}` : ''}</p></div>
      <div class="race-archive-meta"><span>${esc(f2WeekendDates(race))}</span><small>${esc(f2WeekendSessionSummary(race))}</small>${race.cancelledSessionCount ? `<em>${fmtNumber(race.cancelledSessionCount)} cancelled</em>` : ''}</div>
      <span class="race-card-arrow" aria-hidden="true">→</span>
    </a>`).join('') : '<div class="empty-state">No Formula 2 weekends match these filters.</div>';
  renderPagination('f2-races', filtered.length, f2RacePage, F2_RACE_PAGE_SIZE, page => {
    f2RacePage = page;
    renderF2RaceArchive();
    document.getElementById('f2-races').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadF2Races() {
  try {
    allF2Races = await getJSON('/api/races?series=f2');
    const years = [...new Set(allF2Races.map(race => race.year))].sort((first, second) => second - first);
    const circuits = [...new Map(allF2Races.map(race => [race.circuitId, race.circuitName])).entries()]
      .filter(([, name]) => name)
      .sort((first, second) => first[1].localeCompare(second[1]));
    document.getElementById('f2-race-year').insertAdjacentHTML('beforeend', years.map(year => `<option value="${esc(year)}">${esc(year)}</option>`).join(''));
    document.getElementById('f2-race-circuit').insertAdjacentHTML('beforeend', circuits.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join(''));
    renderF2RaceArchive();
  } catch (error) {
    setError('f2-races', error.message);
  }
}

['f2-race-search', 'f2-race-year', 'f2-race-circuit'].forEach(id => {
  document.getElementById(id).addEventListener(id === 'f2-race-search' ? 'input' : 'change', () => {
    f2RacePage = 1;
    renderF2RaceArchive();
  });
});

document.getElementById('clear-f2-race-filters').addEventListener('click', () => {
  f2RacePage = 1;
  document.getElementById('f2-race-search').value = '';
  document.getElementById('f2-race-year').value = '';
  document.getElementById('f2-race-circuit').value = '';
  renderF2RaceArchive();
});

loadF2Races();
