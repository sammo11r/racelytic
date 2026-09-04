const communityState = { type: 'all', series: 'all', sort: 'newest', query: '', page: 1, hasMore: false, loading: false };
const communityElements = {
  grid: document.getElementById('community-grid'), summary: document.getElementById('community-summary'),
  query: document.getElementById('community-query'), series: document.getElementById('community-series'),
  sort: document.getElementById('community-sort'), more: document.getElementById('community-more'),
  clear: document.getElementById('community-clear')
};
const communitySeriesNames = { all: 'All series', f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy' };
let communitySearchTimer;

function communityBase(series, page) {
  const base = series === 'f1' ? '' : `/${series}`;
  if (page === 'season') return series === 'f1' ? '/simulator' : `${base}/simulate-season`;
  return `${base}/${page}`;
}

function contextualSeries() {
  if (communityState.series !== 'all') return communityState.series;
  const requested = new URLSearchParams(location.search).get('series');
  if (['f1', 'f2', 'f3', 'academy'].includes(requested)) return requested;
  try {
    const remembered = localStorage.getItem('racelytic-series');
    if (['f1', 'f2', 'f3', 'academy'].includes(remembered)) return remembered;
  } catch {}
  return 'f1';
}

function creationSeries(item) {
  if (item.series !== 'all') return item.series;
  return contextualSeries();
}

function recordUrl(configuration = {}) {
  const query = new URLSearchParams();
  Object.entries(configuration).forEach(([key, value]) => {
    if (key !== 'series' && value !== null && value !== undefined && value !== '' && value !== false) query.set(key, String(value));
  });
  const series = ['f2', 'f3', 'academy'].includes(configuration.series) ? configuration.series : 'f1';
  return `${communityBase(series, 'records')}?${query}`;
}

function creationUrl(item) {
  const series = creationSeries(item);
  if (item.type === 'points') return `${communityBase(series, 'points-systems')}?copy=${encodeURIComponent(item.id)}`;
  if (item.type === 'records') return recordUrl(item.configuration);
  return `${communityBase(series, 'championship-builder')}?id=${encodeURIComponent(item.id)}`;
}

function typeLabel(type) {
  return type === 'points' ? 'Points system' : type === 'records' ? 'Record view' : 'Championship';
}

function categoryLabel(category = 'wins') {
  return String(category).replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function creationPresentation(item) {
  if (item.type === 'points') {
    const race = item.racePoints?.length ? item.racePoints.slice(0, 10).join('–') : 'Custom race scoring';
    const facts = [`${item.racePoints?.length || 0} scoring places`];
    if (item.sprintPoints?.length) facts.push('Sprint points');
    if (item.qualifyingPoints?.length) facts.push('Qualifying points');
    if (item.fastestLapBonus) facts.push(`${fmtNumber(item.fastestLapBonus)} fastest-lap bonus`);
    return { description: `${race}${item.racePoints?.length > 10 ? '…' : ''}`, facts, action: 'View & remix' };
  }
  if (item.type === 'records') {
    const config = item.configuration || {};
    const subject = config.type === 'constructors' ? (['f3', 'academy'].includes(item.series) ? 'Teams' : 'Constructors') : 'Drivers';
    const format = config.category === 'championships' ? 'Championship titles' : categoryLabel(config.category);
    const facts = [subject, format];
    if (config.fromYear || config.toYear) facts.push(`${config.fromYear || 'First'}–${config.toYear || 'latest'}`);
    return { description: `A saved historical ranking for ${subject.toLocaleLowerCase()}, ready to reopen with the creator’s filters.`, facts, action: 'Open record view' };
  }
  const config = item.configuration || {};
  const facts = [`${fmtNumber(config.raceIds?.length || 0)} races`, `${fmtNumber(config.driverIds?.length || 0)} drivers`, config.pointsSystem?.name || 'Custom scoring'];
  return { description: item.description || 'A custom calendar, field and scoring system built from historical race results.', facts, action: 'Open & remix' };
}

function formatCreationDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function creationCard(item) {
  const view = creationPresentation(item), date = formatCreationDate(item.updatedAt || item.createdAt);
  return `<article class="community-creation"><div class="community-card-body"><div class="community-card-top"><span class="community-card-type">${esc(typeLabel(item.type))}</span><span class="community-card-series">${esc(item.series === 'all' ? 'All series' : communitySeriesNames[item.series])}</span></div><h3>${esc(item.name)}</h3><p class="community-card-owner">By ${esc(item.ownerName || 'Racelytic community')}</p><p class="community-card-description">${esc(view.description)}</p><div class="community-card-facts">${view.facts.filter(Boolean).map(fact => `<span>${esc(fact)}</span>`).join('')}</div></div><footer class="community-card-footer"><time datetime="${esc(item.updatedAt || item.createdAt || '')}">${date ? `Updated ${esc(date)}` : 'Shared publicly'}</time><a href="${esc(creationUrl(item))}">${esc(view.action)} →</a></footer></article>`;
}

function setCommunityUrl() {
  const query = new URLSearchParams();
  if (communityState.type !== 'all') query.set('type', communityState.type);
  if (communityState.series !== 'all') query.set('series', communityState.series);
  if (communityState.sort !== 'newest') query.set('sort', communityState.sort);
  if (communityState.query) query.set('q', communityState.query);
  history.replaceState(null, '', `/community${query.size ? `?${query}` : ''}`);
}

function setCommunityMode() {
  document.querySelectorAll('[data-community-type]').forEach(button => {
    const active = button.dataset.communityType === communityState.type;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  communityElements.clear.hidden = communityState.type === 'all' && communityState.series === 'all' && communityState.sort === 'newest' && !communityState.query;
  const series = contextualSeries();
  document.getElementById('community-create-link').href = communityBase(series, 'championship-builder');
  document.getElementById('community-builder-link').href = communityBase(series, 'championship-builder');
  document.getElementById('community-points-link').href = communityBase(series, 'points-systems');
  document.getElementById('community-account-link').href = `/account?series=${encodeURIComponent(series)}`;
}

function communityError() {
  communityElements.grid.innerHTML = '<div class="community-state"><strong>We could not load the community.</strong><p>The shared creations are still safe. Check your connection and try again.</p><button class="button secondary" type="button">Try again</button></div>';
  communityElements.grid.querySelector('button').addEventListener('click', () => loadCommunity(false));
  communityElements.summary.textContent = 'Community unavailable';
}

async function loadCommunity(append = false) {
  if (communityState.loading) return;
  communityState.loading = true;
  communityElements.grid.setAttribute('aria-busy', 'true');
  if (!append) communityElements.grid.innerHTML = '<div class="community-state"><strong>Loading public creations…</strong><p>Looking through championships, scoring systems and record views.</p></div>';
  communityElements.more.hidden = true;
  const query = new URLSearchParams({ type: communityState.type, series: communityState.series, sort: communityState.sort, q: communityState.query, page: String(communityState.page), limit: '12' });
  try {
    const data = await getJSON(`/api/community?${query}`);
    const markup = data.items.map(creationCard).join('');
    if (append) communityElements.grid.insertAdjacentHTML('beforeend', markup);
    else communityElements.grid.innerHTML = markup || '<div class="community-state"><strong>No creations found.</strong><p>Try another series or search, or publish the first creation matching these filters.</p></div>';
    communityState.hasMore = data.hasMore;
    communityElements.more.hidden = !data.hasMore;
    communityElements.summary.textContent = `${fmtNumber(data.total)} public ${data.total === 1 ? 'creation' : 'creations'}`;
  } catch { communityError(); }
  finally { communityState.loading = false; communityElements.grid.setAttribute('aria-busy', 'false'); setCommunityMode(); }
}

function resetCommunityPage() { communityState.page = 1; setCommunityUrl(); setCommunityMode(); loadCommunity(false); }

function initialiseCommunity() {
  const params = new URLSearchParams(location.search);
  if (['all', 'points', 'records', 'championships'].includes(params.get('type'))) communityState.type = params.get('type');
  if (['all', 'f1', 'f2', 'f3', 'academy'].includes(params.get('series'))) communityState.series = params.get('series');
  if (['newest', 'updated', 'oldest', 'name'].includes(params.get('sort'))) communityState.sort = params.get('sort');
  communityState.query = (params.get('q') || '').slice(0, 80);
  communityElements.query.value = communityState.query;
  communityElements.series.value = communityState.series;
  communityElements.sort.value = communityState.sort;
  setCommunityMode();
  loadCommunity(false);
}

document.getElementById('community-controls').addEventListener('submit', event => event.preventDefault());
communityElements.query.addEventListener('input', () => {
  clearTimeout(communitySearchTimer);
  communitySearchTimer = setTimeout(() => { communityState.query = communityElements.query.value.trim(); resetCommunityPage(); }, 220);
});
communityElements.series.addEventListener('change', () => { communityState.series = communityElements.series.value; resetCommunityPage(); });
communityElements.sort.addEventListener('change', () => { communityState.sort = communityElements.sort.value; resetCommunityPage(); });
document.querySelectorAll('[data-community-type]').forEach(button => button.addEventListener('click', () => { communityState.type = button.dataset.communityType; resetCommunityPage(); }));
communityElements.more.addEventListener('click', () => { communityState.page += 1; loadCommunity(true); });
communityElements.clear.addEventListener('click', () => {
  communityState.type = 'all'; communityState.series = 'all'; communityState.sort = 'newest'; communityState.query = '';
  communityElements.query.value = ''; communityElements.series.value = 'all'; communityElements.sort.value = 'newest'; resetCommunityPage();
});

initialiseCommunity();
