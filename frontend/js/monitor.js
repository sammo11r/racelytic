const monitorSeriesLabels = Object.freeze({ f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy' });
const monitorRefreshButton = document.getElementById('monitor-refresh');
const monitorAutoRefreshButton = document.getElementById('monitor-auto-refresh');
let monitorLoading = false;
let monitorAutoRefresh = true;
let monitorTimer;

function monitorDuration(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  return value < 3600 ? `${minutes}m ${Math.round(value % 60)}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function monitorDate(value, withTime = false) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return withTime ? date.toLocaleString() : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function monitorRelative(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function monitorTable(headers, rows, emptyMessage = 'No data is available for this period.') {
  const body = rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="monitor-empty-cell">${esc(emptyMessage)}</td></tr>`;
  return `<table><thead><tr>${headers.map(header => `<th scope="col">${esc(header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function monitorDelta(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!previousValue) return { label: currentValue ? 'New this period' : 'No change', className: 'flat' };
  const percentage = (currentValue - previousValue) / previousValue * 100;
  if (Math.abs(percentage) < .5) return { label: 'No change', className: 'flat' };
  return { label: `${percentage > 0 ? '+' : '−'}${Math.abs(percentage).toFixed(1)}% vs previous`, className: percentage > 0 ? 'up' : 'down' };
}

function monitorMetric(label, value, current, previous, note) {
  const delta = monitorDelta(current, previous);
  return `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small class="monitor-delta ${delta.className}">${esc(delta.label)}</small>${note ? `<em>${esc(note)}</em>` : ''}</article>`;
}

function renderMonitorSummary(summary, previous = {}) {
  const visits = Number(summary.visits || 0);
  const visitors = Number(summary.visitors || 0);
  const engaged = Number(summary.engagedVisits || 0);
  const previousVisits = Number(previous.visits || 0);
  const engagementRate = visits ? engaged / visits * 100 : 0;
  const previousEngagementRate = previousVisits ? Number(previous.engagedVisits || 0) / previousVisits * 100 : 0;
  document.getElementById('monitor-summary').innerHTML = [
    monitorMetric('Visits', fmtNumber(visits), visits, previousVisits),
    monitorMetric('Visitor IDs', fmtNumber(visitors), visitors, previous.visitors, 'Anonymous browser identifiers'),
    monitorMetric('Engaged visits', fmtNumber(engaged), engagementRate, previousEngagementRate, `${engagementRate.toFixed(1)}% active for at least 10s`),
    monitorMetric('Average active time', monitorDuration(summary.averageDuration), summary.averageDuration, previous.averageDuration),
    monitorMetric('Total active time', monitorDuration(summary.totalDuration), summary.totalDuration, previous.totalDuration),
    `<article class="metric monitor-live-metric"><span>Active now</span><strong>${esc(fmtNumber(summary.activeNow || 0))}</strong><small class="monitor-delta live">Distinct visitor IDs in 5 minutes</small></article>`
  ].join('');
  document.getElementById('monitor-summary').setAttribute('aria-busy', 'false');
}

function monitorIsoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monitorDayKey(value) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : monitorIsoDay(date);
}

function monitorDailySeries(rows, days) {
  const byDate = new Map(rows.map(row => [monitorDayKey(row.date), row]));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    const key = monitorIsoDay(date);
    const row = byDate.get(key) || {};
    return { date: key, visits: Number(row.visits || 0), visitors: Number(row.visitors || 0), averageDuration: Number(row.averageDuration || 0) };
  });
}

function monitorPath(rows, field, x, y) {
  return rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(row[field]).toFixed(1)}`).join(' ');
}

function renderMonitorChart(rows, days) {
  const series = monitorDailySeries(rows, days);
  const width = 960, height = 290, left = 48, right = 18, top = 18, bottom = 42;
  const maximum = Math.max(1, ...series.flatMap(row => [row.visits, row.visitors]));
  const x = index => left + index / Math.max(1, series.length - 1) * (width - left - right);
  const y = value => top + (1 - value / maximum) * (height - top - bottom);
  const ticks = [...new Set([0, .25, .5, .75, 1].map(portion => Math.round(maximum * portion)))];
  const labelIndexes = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const points = series.length <= 90 ? series.map((row, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(row.visits).toFixed(1)}" r="2.5"><title>${esc(`${row.date}: ${row.visits} visits, ${row.visitors} visitor IDs`)}</title></circle>`).join('') : '';
  document.getElementById('monitor-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily visits and anonymous visitor IDs over ${days} days"><g class="monitor-chart-grid">${ticks.map(value => `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"></line><text x="${left - 9}" y="${y(value) + 4}" text-anchor="end">${value}</text>`).join('')}${labelIndexes.map(index => `<text x="${x(index)}" y="${height - 12}" text-anchor="${index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}">${esc(monitorDate(`${series[index].date}T12:00:00`))}</text>`).join('')}</g><path class="monitor-chart-line visitors" d="${monitorPath(series, 'visitors', x, y)}"></path><g class="monitor-chart-points">${points}</g><path class="monitor-chart-line visits" d="${monitorPath(series, 'visits', x, y)}"></path></svg>`;
  document.getElementById('monitor-chart').setAttribute('aria-busy', 'false');
  document.getElementById('monitor-daily').innerHTML = monitorTable(['Date', 'Visits', 'Visitor IDs', 'Average time'], series.map(row => `<tr><td>${esc(row.date)}</td><td>${fmtNumber(row.visits)}</td><td>${fmtNumber(row.visitors)}</td><td>${esc(monitorDuration(row.averageDuration))}</td></tr>`));
}

function renderMonitorHealth(operations = {}) {
  const races = new Map((operations.latestRaces || []).map(race => [race.series, race]));
  const sync = operations.latestSync;
  const ratings = operations.ratingRuns || [];
  const latestRating = ratings.map(row => row.calculatedAt).filter(Boolean).sort().at(-1);
  const cards = [
    `<article class="monitor-health-card ${operations.database === 'healthy' ? 'healthy' : 'warning'}"><span>Database</span><strong>${operations.database === 'healthy' ? 'Connected' : 'Unavailable'}</strong><small>Checked ${esc(monitorRelative(operations.checkedAt))}</small></article>`,
    `<article class="monitor-health-card ${sync?.status === 'succeeded' ? 'healthy' : sync ? 'warning' : 'neutral'}"><span>Latest data sync</span><strong>${esc(sync?.status || 'Not recorded')}</strong><small>${sync ? `${esc(monitorRelative(sync.finishedAt || sync.startedAt))} · ${esc(sync.series || '')}` : 'Run history is unavailable'}</small>${sync?.errorMessage ? `<em>${esc(sync.errorMessage)}</em>` : ''}</article>`,
    `<article class="monitor-health-card ${latestRating ? 'healthy' : 'neutral'}"><span>Ratings</span><strong>${latestRating ? esc(monitorRelative(latestRating)) : 'Not recorded'}</strong><small>${ratings.length ? `${ratings.length} series rebuilt` : 'No rating run found'}</small></article>`,
    ...Object.entries(monitorSeriesLabels).map(([series, label]) => {
      const race = races.get(series);
      return `<article class="monitor-health-card ${race ? 'healthy' : 'neutral'}"><span>${esc(label)} archive</span><strong>${race ? `${esc(race.year)} · R${esc(race.round)}` : 'Unavailable'}</strong><small>${race ? `${esc(race.name || 'Latest race')} · ${esc(monitorDate(race.date))}` : 'No completed race found'}</small></article>`;
    })
  ];
  document.getElementById('monitor-health').innerHTML = cards.join('');
  document.getElementById('monitor-health').setAttribute('aria-busy', 'false');
}

function renderMonitorTables(data) {
  document.getElementById('monitor-pages').innerHTML = monitorTable(['Page', 'Visits', 'Visitor IDs', 'Engaged', 'Average time'], data.pages.map(row => `<tr><td><a href="${esc(row.path)}">${esc(row.path)}</a></td><td>${fmtNumber(row.visits)}</td><td>${fmtNumber(row.visitors)}</td><td>${fmtNumber(row.engagedVisits)}</td><td>${esc(monitorDuration(row.averageDuration))}</td></tr>`));
  document.getElementById('monitor-referrers').innerHTML = monitorTable(['Source', 'Visits', 'Visitor IDs', 'Average time'], data.referrers.map(row => `<tr><td>${esc(row.referrerHost || 'Direct')}</td><td>${fmtNumber(row.visits)}</td><td>${fmtNumber(row.visitors)}</td><td>${esc(monitorDuration(row.averageDuration))}</td></tr>`));
  document.getElementById('monitor-recent').innerHTML = monitorTable(['Time', 'Page', 'Referrer', 'Active time', 'State'], data.recent.map(row => {
    const active = Date.now() - new Date(row.lastSeenAt).getTime() < 5 * 60 * 1000;
    return `<tr><td><time datetime="${esc(row.startedAt)}">${esc(monitorRelative(row.startedAt))}</time></td><td><a href="${esc(row.path)}">${esc(row.path)}</a></td><td>${esc(row.referrerHost || 'Direct')}</td><td>${esc(monitorDuration(row.durationSeconds))}</td><td><span class="monitor-state ${active ? 'active' : ''}">${active ? 'Active' : 'Completed'}</span></td></tr>`;
  }));
}

async function loadMonitor() {
  if (monitorLoading) return;
  monitorLoading = true;
  monitorRefreshButton.disabled = true;
  document.querySelectorAll('#monitor-health, #monitor-summary, #monitor-chart').forEach(node => node.setAttribute('aria-busy', 'true'));
  const days = Number(document.getElementById('monitor-days').value);
  try {
    const data = await getJSON(`/api/analytics/report?days=${encodeURIComponent(days)}`);
    renderMonitorHealth(data.operations);
    renderMonitorSummary(data.summary, data.previousSummary);
    renderMonitorChart(data.daily, days);
    renderMonitorTables(data);
    document.getElementById('monitor-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    document.getElementById('monitor-error').innerHTML = '';
  } catch (error) {
    setError('monitor-error', `${error.message} Existing dashboard data has been kept.`);
  } finally {
    monitorLoading = false;
    monitorRefreshButton.disabled = false;
  }
}

function scheduleMonitorRefresh() {
  window.clearInterval(monitorTimer);
  if (monitorAutoRefresh) monitorTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') loadMonitor();
  }, 60000);
}

document.getElementById('monitor-days').addEventListener('change', loadMonitor);
monitorRefreshButton.addEventListener('click', loadMonitor);
monitorAutoRefreshButton.addEventListener('click', () => {
  monitorAutoRefresh = !monitorAutoRefresh;
  monitorAutoRefreshButton.setAttribute('aria-pressed', String(monitorAutoRefresh));
  monitorAutoRefreshButton.textContent = `Auto-refresh ${monitorAutoRefresh ? 'on' : 'off'}`;
  scheduleMonitorRefresh();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && monitorAutoRefresh) loadMonitor();
});

document.getElementById('monitor-health').innerHTML = Array.from({ length: 7 }, () => '<div class="monitor-skeleton"></div>').join('');
document.getElementById('monitor-summary').innerHTML = Array.from({ length: 6 }, () => '<div class="monitor-skeleton"></div>').join('');
document.getElementById('monitor-chart').innerHTML = '<div class="monitor-skeleton chart"></div>';
scheduleMonitorRefresh();
loadMonitor();
