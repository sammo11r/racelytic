let allRaces = [];
let racePage = 1;
const RACE_PAGE_SIZE = 30;

function renderRaceArchive() {
  const query = document.getElementById('race-search').value.toLowerCase().trim();
  const year = document.getElementById('race-year').value;
  const circuit = document.getElementById('race-circuit').value;
  const filtered = allRaces.filter(race => (!year || String(race.year) === year)
    && (!circuit || race.circuitId === circuit)
    && (!query || `${race.officialName} ${race.circuitName} ${race.countryName}`.toLowerCase().includes(query)));

  document.getElementById('race-count').textContent = `${fmtNumber(filtered.length)} race${filtered.length === 1 ? '' : 's'}`;
  document.getElementById('race-filter-note').textContent = filtered.length === allRaces.length ? 'Complete archive' : `of ${fmtNumber(allRaces.length)}`;
  const paged = pageItems(filtered, racePage, RACE_PAGE_SIZE);
  racePage = paged.page;
  document.getElementById('races').innerHTML = filtered.length ? paged.items.map(race => `
    <a class="race-archive-card" href="/race?id=${encodeURIComponent(race.id)}">
      <div class="race-archive-date"><strong>${esc(race.year)}</strong><span>Round ${esc(race.round)}</span></div>
      <div class="race-archive-copy"><h2>${esc(race.officialName)}</h2><p>${esc(race.circuitName || '')}${race.countryName ? ` · ${esc(race.countryName)}` : ''}</p></div>
      <div class="race-archive-meta"><span>${esc(fmtDate(race.date))}</span>${race.sprintRaceDate ? '<small>Sprint weekend</small>' : ''}</div>
      <span class="race-card-arrow" aria-hidden="true">→</span>
    </a>`).join('') : '<div class="empty-state">No races match these filters.</div>';
  renderPagination('races', filtered.length, racePage, RACE_PAGE_SIZE, page => { racePage = page; renderRaceArchive(); document.getElementById('races').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

async function loadRaces() {
  try {
    allRaces = await getJSON('/api/races');
    const years = [...new Set(allRaces.map(race => race.year))].sort((a, b) => b - a);
    const circuits = [...new Map(allRaces.map(race => [race.circuitId, race.circuitName])).entries()]
      .filter(([, name]) => name).sort((a, b) => a[1].localeCompare(b[1]));
    document.getElementById('race-year').insertAdjacentHTML('beforeend', years.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''));
    document.getElementById('race-circuit').insertAdjacentHTML('beforeend', circuits.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join(''));
    renderRaceArchive();
  } catch (error) { setError('races', error.message); }
}

['race-search', 'race-year', 'race-circuit'].forEach(id => document.getElementById(id).addEventListener(id === 'race-search' ? 'input' : 'change', () => { racePage = 1; renderRaceArchive(); }));
document.getElementById('clear-race-filters').addEventListener('click', () => {
  racePage = 1;
  document.getElementById('race-search').value = '';
  document.getElementById('race-year').value = '';
  document.getElementById('race-circuit').value = '';
  renderRaceArchive();
});
loadRaces();
