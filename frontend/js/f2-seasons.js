let allF2Seasons = [];
let f2SeasonPage = 1;
const F2_SEASON_PAGE_SIZE = 16;

function matchingF2Seasons() {
  const query = document.getElementById('season-search')?.value.trim() || '';
  return query ? allF2Seasons.filter(season => String(season.year).includes(query)) : allF2Seasons;
}

function renderF2Seasons(seasons) {
  const container = document.getElementById('f2-seasons');
  if (!seasons.length) {
    container.innerHTML = '<div class="error">No season matches that search.</div>';
    renderPagination('f2-seasons', 0, 1, F2_SEASON_PAGE_SIZE, () => {});
    return;
  }
  const paged = pageItems(seasons, f2SeasonPage, F2_SEASON_PAGE_SIZE);
  f2SeasonPage = paged.page;
  container.innerHTML = paged.items.map(season => {
    const championName = season.champion?.name;
    return `
    <a class="season-card" href="/f2/season?year=${encodeURIComponent(season.year)}">
      <div class="season-card-heading">
        <div class="season-year">${esc(season.year)}</div>
        <div class="season-card-champion${championName ? ' has-champion' : ''}">
          <span>F2 champion</span>
          <strong>${esc(championName || 'To be decided')}</strong>
        </div>
      </div>
      <div class="season-details">
        <div class="season-stat"><span>Rounds</span><strong>${fmtNumber(season.raceCount || 0)}</strong></div>
        <div class="season-stat"><span>Drivers</span><strong>${fmtNumber(season.driverCount || 0)}</strong></div>
        <div class="season-stat"><span>Teams</span><strong>${fmtNumber(season.constructorCount || 0)}</strong></div>
      </div>
    </a>`;
  }).join('');
  renderPagination('f2-seasons', seasons.length, f2SeasonPage, F2_SEASON_PAGE_SIZE, page => {
    f2SeasonPage = page;
    renderF2Seasons(seasons);
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadF2Seasons() {
  try {
    allF2Seasons = await getJSON('/api/seasons?series=f2');
    document.getElementById('season-years').innerHTML = allF2Seasons.map(season => `<option value="${esc(season.year)}"></option>`).join('');
    renderF2Seasons(allF2Seasons);
  } catch (error) {
    console.error('F2 seasons error:', error);
    setError('f2-seasons', error.message);
  }
}

document.getElementById('season-search')?.addEventListener('input', () => {
  f2SeasonPage = 1;
  document.getElementById('season-search-message').textContent = '';
  renderF2Seasons(matchingF2Seasons());
});

document.getElementById('season-jump')?.addEventListener('submit', event => {
  event.preventDefault();
  const input = document.getElementById('season-search');
  const message = document.getElementById('season-search-message');
  const exact = allF2Seasons.find(season => String(season.year) === input.value.trim());
  if (exact) {
    input.value = String(exact.year);
    f2SeasonPage = 1;
    renderF2Seasons([exact]);
    document.getElementById('f2-seasons')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  message.textContent = input.value.trim() ? 'Enter a complete year from the archive.' : 'Enter a season year to find it.';
});

loadF2Seasons();
