let allF3Races = [];
let f3RacePage = 1;
const F3_RACE_PAGE_SIZE = 30;

function f3WeekendDates(race) {
  const start = fmtDate(race.date);
  const end = race.endDate ? fmtDate(race.endDate) : '';
  return end && end !== start ? `${start}–${end}` : start;
}

function f3WeekendSessionSummary(race) {
  if (!race.sessionCount) return 'Schedule pending';
  return `${fmtNumber(race.sessionCount)} sessions · ${fmtNumber(race.raceSessionCount)} races`;
}

function renderF3RaceArchive() {
  const query = document.getElementById('f3-race-search').value.toLowerCase().trim();
  const year = document.getElementById('f3-race-year').value;
  const circuit = document.getElementById('f3-race-circuit').value;
  const filtered = allF3Races.filter(race => (!year || String(race.year) === year)
    && (!circuit || race.circuitId === circuit)
    && (!query || `${race.name} ${race.code || ''} ${race.circuitName || ''} ${race.placeName || ''}`.toLowerCase().includes(query)));

  document.getElementById('f3-race-count').textContent = `${fmtNumber(filtered.length)} weekend${filtered.length === 1 ? '' : 's'}`;
  document.getElementById('f3-race-filter-note').textContent = filtered.length === allF3Races.length ? 'Complete F3 archive' : `of ${fmtNumber(allF3Races.length)}`;
  const paged = pageItems(filtered, f3RacePage, F3_RACE_PAGE_SIZE);
  f3RacePage = paged.page;
  document.getElementById('f3-races').innerHTML = filtered.length ? paged.items.map(race => `
    <a class="race-archive-card junior-race-archive-card" href="/f3/race?id=${encodeURIComponent(race.id)}">
      <div class="race-archive-date"><strong>${esc(race.year)}</strong><span>Round ${esc(race.round)}</span></div>
      <div class="race-archive-copy"><h2>${esc(race.name)}</h2><p>${esc(race.circuitName || '')}${race.placeName ? ` · ${esc(race.placeName)}` : ''}</p></div>
      <div class="race-archive-meta"><span>${esc(f3WeekendDates(race))}</span><small>${esc(f3WeekendSessionSummary(race))}</small>${race.cancelledSessionCount ? `<em>${fmtNumber(race.cancelledSessionCount)} cancelled</em>` : ''}</div>
      <span class="race-card-arrow" aria-hidden="true">→</span>
    </a>`).join('') : '<div class="empty-state">No Formula 3 weekends match these filters.</div>';
  renderPagination('f3-races', filtered.length, f3RacePage, F3_RACE_PAGE_SIZE, page => {
    f3RacePage = page;
    renderF3RaceArchive();
    document.getElementById('f3-races').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadF3Races() {
  try {
    allF3Races = await getJSON('/api/races?series=f3');
    const years = [...new Set(allF3Races.map(race => race.year))].sort((first, second) => second - first);
    const circuits = [...new Map(allF3Races.map(race => [race.circuitId, race.circuitName])).entries()]
      .filter(([, name]) => name)
      .sort((first, second) => first[1].localeCompare(second[1]));
    document.getElementById('f3-race-year').insertAdjacentHTML('beforeend', years.map(year => `<option value="${esc(year)}">${esc(year)}</option>`).join(''));
    document.getElementById('f3-race-circuit').insertAdjacentHTML('beforeend', circuits.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join(''));
    renderF3RaceArchive();
  } catch (error) {
    setError('f3-races', error.message);
  }
}

['f3-race-search', 'f3-race-year', 'f3-race-circuit'].forEach(id => {
  document.getElementById(id).addEventListener(id === 'f3-race-search' ? 'input' : 'change', () => {
    f3RacePage = 1;
    renderF3RaceArchive();
  });
});

document.getElementById('clear-f3-race-filters').addEventListener('click', () => {
  f3RacePage = 1;
  document.getElementById('f3-race-search').value = '';
  document.getElementById('f3-race-year').value = '';
  document.getElementById('f3-race-circuit').value = '';
  renderF3RaceArchive();
});

loadF3Races();
