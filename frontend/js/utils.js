function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}
function params() {
  return new URLSearchParams(window.location.search);
}
function activeSeriesKey() {
  if (window.RacelyticSeries) return window.RacelyticSeries.fromPath().key;
  if (window.location.pathname === '/academy' || window.location.pathname.startsWith('/academy/')) return 'academy';
  if (window.location.pathname === '/f3' || window.location.pathname.startsWith('/f3/')) return 'f3';
  if (window.location.pathname === '/f2' || window.location.pathname.startsWith('/f2/')) return 'f2';
  return 'f1';
}
function activeSeriesBase() {
  const series = activeSeriesKey();
  return series === 'f1' ? '' : `/${series}`;
}
function activeSeriesName() {
  return window.RacelyticSeries?.all[activeSeriesKey()]?.name
    || { f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy' }[activeSeriesKey()];
}
function seriesPageUrl(page, parameter, value) {
  const query = parameter ? `?${parameter}=${encodeURIComponent(value)}` : '';
  return `${activeSeriesBase()}/${page}${query}`;
}
function adaptActiveSeriesLinks(root = document.querySelector('main')) {
  const base = activeSeriesBase();
  if (!base || !root) return;
  const sharedPages = new Set(['analysis', 'season', 'driver', 'race', 'circuit', 'constructor', 'team']);
  root.querySelectorAll('a[href^="/"]').forEach(link => {
    const href = link.getAttribute('href');
    if (href.startsWith(`${base}/`)) return;
    if (activeSeriesKey() === 'academy' && /^\/f[23]\//.test(href)) {
      link.setAttribute('href', href.replace(/^\/f[23]/, base));
      return;
    }
    const page = href.slice(1).split(/[?#/]/, 1)[0];
    if (sharedPages.has(page)) link.setAttribute('href', `${base}${href}`);
  });
}
if (activeSeriesKey() !== 'f1') {
  const seriesLinkRoot = document.querySelector('main');
  adaptActiveSeriesLinks(seriesLinkRoot);
  if (seriesLinkRoot) new MutationObserver(() => adaptActiveSeriesLinks(seriesLinkRoot))
    .observe(seriesLinkRoot, { childList: true, subtree: true });
}
function activeSeriesAccent() {
  if (window.location.pathname === '/academy' || window.location.pathname.startsWith('/academy/')) return '#7b2cff';
  if (window.location.pathname === '/f3' || window.location.pathname.startsWith('/f3/')) return '#c95300';
  return window.location.pathname === '/f2' || window.location.pathname.startsWith('/f2/') ? '#1677ff' : '#e32636';
}
async function getJSON(url, options) {
  let requestUrl = url;
  const activeSeries = activeSeriesKey();
  if (activeSeries !== 'f1' && String(url).startsWith('/api/')) {
    const parsed = new URL(url, window.location.origin);
    const seriesEndpoints = ['/api/seasons', '/api/races', '/api/drivers', '/api/circuits', '/api/constructors', '/api/records/explore'];
    if (seriesEndpoints.some(endpoint => parsed.pathname === endpoint || parsed.pathname.startsWith(`${endpoint}/`))) {
      parsed.searchParams.set('series', activeSeries);
      requestUrl = `${parsed.pathname}${parsed.search}`;
    }
  }
  const response = await fetch(requestUrl, options);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() || 'Request failed' };
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function fmtNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString();
}
function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}
function displayRaceName(race, compact = false) {
  if (!race) return 'Race weekend';
  return compact
    ? race.shortName || race.name || race.officialName || 'Race weekend'
    : race.name || race.officialName || race.shortName || 'Race weekend';
}
function setError(id, message='Unable to load data.') {
  if (window.RacelyticUI) return window.RacelyticUI.setState(id, 'error', message);
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="error">${esc(message)}</div>`;
}

function pageItems(items, page, pageSize) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.max(1, Math.min(Number(page) || 1, pages));
  const start = (current - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: current, pages, start };
}

function renderPagination(targetId, total, page, pageSize, onChange) {
  const target = document.getElementById(targetId);
  if (!target) return;
  let nav = document.getElementById(`${targetId}-pagination`);
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = `${targetId}-pagination`;
    nav.className = 'pagination';
    nav.setAttribute('aria-label', 'Pagination');
    target.insertAdjacentElement('afterend', nav);
  }
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) { nav.innerHTML = ''; nav.hidden = true; return; }
  nav.hidden = false;
  const visible = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter(value => value >= 1 && value <= pages));
  let previous = 0;
  const numbers = [...visible].sort((a,b) => a-b).map(value => {
    const gap = previous && value - previous > 1 ? '<span class="pagination-gap">…</span>' : '';
    previous = value;
    return `${gap}<button type="button" data-page="${value}" class="${value === page ? 'active' : ''}" ${value === page ? 'aria-current="page"' : ''}>${value}</button>`;
  }).join('');
  nav.innerHTML = `<button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">←</button><div class="pagination-pages">${numbers}</div><button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next page">→</button><span class="pagination-count">${fmtNumber(total)} items</span>`;
  nav.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    const next = Number(button.dataset.page);
    if (next >= 1 && next <= pages && next !== page) onChange(next);
  }));
}
