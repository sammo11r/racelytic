(function initialiseWecSeasons() {
  let allSeasons = [];
  let currentPage = 1;
  const PAGE_SIZE = 16;

  function seasonLabel(season) {
    if (season.id === 'wec-2018-2019') return '2018/19';
    if (season.id === 'wec-2019-2020') return '2019/20';
    return String(season.year);
  }

  function seasonYearMarkup(season) {
    const label = seasonLabel(season);
    const parts = label.split('/');
    if (parts.length === 2) return `${esc(parts[0])}<span class="season-year-divider">/</span>${esc(parts[1])}`;
    const split = Math.max(0, label.length - 2);
    return `${esc(label.slice(0, split))}<span class="season-year-highlight">${esc(label.slice(split))}</span>`;
  }

  function matchingSeasons() {
    const query = document.getElementById('season-search')?.value.trim().toLowerCase() || '';
    const filtered = query ? allSeasons.filter(season => `${seasonLabel(season)} ${season.name}`.toLowerCase().includes(query)) : allSeasons;
    const direction = document.getElementById('season-sort')?.value === 'asc' ? 1 : -1;
    return [...filtered].sort((left, right) => direction * (Number(left.year) - Number(right.year)));
  }

  function renderSeasons(seasons) {
    const container = document.getElementById('seasons');
    if (!seasons.length) {
      container.innerHTML = '<div class="error">No season matches that search.</div>';
      renderPagination('seasons', 0, 1, PAGE_SIZE, () => {});
      return;
    }

    const paged = pageItems(seasons, currentPage, PAGE_SIZE);
    currentPage = paged.page;
    container.innerHTML = paged.items.map(season => `
      <a class="season-card" href="/wec/seasons/${encodeURIComponent(season.year)}">
        <div class="season-card-heading">
          <div class="season-year">${seasonYearMarkup(season)}</div>
          <div class="season-card-champion${season.champion?.name ? ' has-champion' : ''}">
            <span>Top-class champion</span>
            <strong>${esc(season.champion?.name || 'Not recorded')}</strong>
          </div>
        </div>
        <div class="season-details">
          <div class="season-stat"><span>Events</span><strong>${fmtNumber(season.eventCount || 0)}</strong></div>
          <div class="season-stat"><span>Entries</span><strong>${fmtNumber(season.entryCount || 0)}</strong></div>
          <div class="season-stat"><span>Classes</span><strong>${fmtNumber(season.classCount || 0)}</strong></div>
        </div>
      </a>
    `).join('');
    renderPagination('seasons', seasons.length, currentPage, PAGE_SIZE, page => {
      currentPage = page;
      renderSeasons(seasons);
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function refresh() {
    currentPage = 1;
    renderSeasons(matchingSeasons());
  }

  async function loadSeasons() {
    try {
      allSeasons = await getJSON('/api/wec/seasons');
      const years = document.getElementById('season-years');
      years.innerHTML = allSeasons.flatMap(season => {
        const labels = new Set([seasonLabel(season), String(season.year)]);
        return [...labels].map(label => `<option value="${esc(label)}"></option>`);
      }).join('');
      renderSeasons(matchingSeasons());
    } catch (error) {
      console.error('WEC seasons error:', error);
      setError('seasons', error.message);
    }
  }

  document.getElementById('season-search')?.addEventListener('input', refresh);
  document.getElementById('season-sort')?.addEventListener('change', refresh);
  loadSeasons();
})();
