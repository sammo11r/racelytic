let allF3Seasons = [];
let f3SeasonPage = 1;
const F3_SEASON_PAGE_SIZE = 16;

function matchingF3Seasons() {
  const query = document.getElementById('f3-season-search')?.value.trim() || '';
  return query ? allF3Seasons.filter(season => String(season.year).includes(query)) : allF3Seasons;
}

function renderF3Seasons(seasons) {
  const container = document.getElementById('f3-seasons');
  if (!seasons.length) {
    container.innerHTML = '<div class="error">No season matches that search.</div>';
    renderPagination('f3-seasons', 0, 1, F3_SEASON_PAGE_SIZE, () => {});
    return;
  }
  const paged = pageItems(seasons, f3SeasonPage, F3_SEASON_PAGE_SIZE);
  f3SeasonPage = paged.page;
  container.innerHTML = paged.items.map(season => {
    const championName = season.champion?.name;
    return `
      <a class="season-card f3-season-card" href="/f3/season?year=${encodeURIComponent(season.year)}">
        <div class="season-card-heading">
          <div class="season-year">${esc(season.year)}</div>
          <div class="season-card-champion${championName ? ' has-champion' : ''}">
            <span>F3 champion</span>
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
  renderPagination('f3-seasons', seasons.length, f3SeasonPage, F3_SEASON_PAGE_SIZE, page => {
    f3SeasonPage = page;
    renderF3Seasons(seasons);
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadF3Seasons() {
  try {
    allF3Seasons = await getJSON('/api/seasons?series=f3');
    document.getElementById('f3-season-years').innerHTML = allF3Seasons.map(season => `<option value="${esc(season.year)}"></option>`).join('');
    renderF3Seasons(allF3Seasons);
  } catch (error) {
    console.error('F3 seasons error:', error);
    setError('f3-seasons', error.message);
  }
}

document.getElementById('f3-season-search')?.addEventListener('input', () => {
  f3SeasonPage = 1;
  document.getElementById('f3-season-search-message').textContent = '';
  renderF3Seasons(matchingF3Seasons());
});

document.getElementById('f3-season-jump')?.addEventListener('submit', event => {
  event.preventDefault();
  const input = document.getElementById('f3-season-search');
  const message = document.getElementById('f3-season-search-message');
  const exact = allF3Seasons.find(season => String(season.year) === input.value.trim());
  if (exact) {
    input.value = String(exact.year);
    f3SeasonPage = 1;
    renderF3Seasons([exact]);
    document.getElementById('f3-seasons')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  message.textContent = input.value.trim() ? 'Enter a complete year from the archive.' : 'Enter a season year to find it.';
});

loadF3Seasons();
