const searchPageForm = document.getElementById('search-page-form');
const searchPageInput = document.getElementById('search-page-input');
const searchPageSeries = document.getElementById('search-page-series');
const searchPageStatus = document.getElementById('search-page-status');
const searchPageResults = document.getElementById('search-page-results');
const searchSeriesLabels = { f1: 'F1', f2: 'F2', f3: 'F3', academy: 'F1 Academy' };
const validSearchSeries = new Set(['all', ...Object.keys(searchSeriesLabels)]);
let fullSearchController;

function searchSeriesFromParams(params) {
  const series = params.get('series') || 'all';
  return validSearchSeries.has(series) ? series : 'all';
}

function applySearchParams(params) {
  searchPageInput.value = params.get('q') || '';
  searchPageSeries.value = searchSeriesFromParams(params);
}

function searchBadges(result) {
  const series = Array.isArray(result.series) ? result.series : [result.series];
  return series.filter(Boolean).map(key => `<span>${esc(searchSeriesLabels[key] || key)}</span>`).join('');
}

function renderFullSearch(payload) {
  searchPageStatus.textContent = `${fmtNumber(payload.total)} result${payload.total === 1 ? '' : 's'} for “${payload.query}”`;
  searchPageResults.innerHTML = payload.groups.length ? payload.groups.map(group => `
    <section class="search-result-group" aria-labelledby="search-group-${esc(group.key)}">
      <div class="search-result-group-head"><h2 id="search-group-${esc(group.key)}">${esc(group.label)}</h2><span>${fmtNumber(group.results.length)}</span></div>
      <div class="search-result-list">${group.results.map(result => `
        <a class="search-result-card" href="${esc(result.url)}">
          <div><span>${esc(result.type)}</span><h3>${esc(result.label)}</h3><p>${esc(result.meta)}</p></div>
          <div class="search-result-series">${searchBadges(result)}</div>
          <strong aria-hidden="true">→</strong>
        </a>`).join('')}</div>
    </section>`).join('') : '<div class="empty-state">No matching pages or database entries.</div>';
}

async function loadFullSearch(pushHistory = false) {
  fullSearchController?.abort();
  const controller = new AbortController();
  fullSearchController = controller;
  const query = searchPageInput.value.trim();
  const series = searchPageSeries.value;
  if (query.length < 2) {
    searchPageStatus.textContent = 'Enter at least two characters to search.';
    searchPageResults.innerHTML = '';
    fullSearchController = undefined;
    return;
  }
  const params = new URLSearchParams({ q: query });
  if (series !== 'all') params.set('series', series);
  const context = new URLSearchParams(window.location.search).get('context');
  if (context) params.set('context', context);
  if (pushHistory) window.history.pushState({}, '', `/search?${params}`);
  searchPageStatus.textContent = 'Searching every series…';
  searchPageResults.innerHTML = '';
  try {
    const payload = await getJSON(`/api/search?${params}&mode=full`, { signal: controller.signal });
    if (fullSearchController !== controller) return;
    renderFullSearch(payload);
    document.title = `${query} · Search · Racelytic`;
  } catch (error) {
    if (error.name === 'AbortError' || fullSearchController !== controller) return;
    console.error('Full search error:', error);
    searchPageStatus.textContent = 'Search is temporarily unavailable.';
  } finally {
    if (fullSearchController === controller) fullSearchController = undefined;
  }
}

searchPageForm.addEventListener('submit', event => {
  event.preventDefault();
  loadFullSearch(true);
});
searchPageSeries.addEventListener('change', () => loadFullSearch(true));
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  applySearchParams(params);
  loadFullSearch();
});

const initialSearchParams = new URLSearchParams(window.location.search);
applySearchParams(initialSearchParams);
if (searchPageInput.value) loadFullSearch();
