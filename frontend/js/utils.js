function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}
function params() {
  return new URLSearchParams(window.location.search);
}
async function getJSON(url) {
  const response = await fetch(url);
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
function setError(id, message='Unable to load data.') {
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
