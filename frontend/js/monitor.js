function monitorDuration(seconds) {
  const value = Number(seconds || 0);
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  return value < 3600 ? `${minutes}m ${value % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function monitorTable(headers, rows) {
  return `<table><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

async function loadMonitor() {
  const days = document.getElementById('monitor-days').value;
  try {
    const data = await getJSON(`/api/analytics/report?days=${encodeURIComponent(days)}`);
    const summary = data.summary;
    document.getElementById('monitor-summary').innerHTML = [
      ['Visits', summary.visits], ['Unique visitors', summary.visitors],
      ['Average active time', monitorDuration(summary.averageDuration)], ['Active in 5 minutes', summary.activeNow]
    ].map(([label, value]) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    document.getElementById('monitor-daily').innerHTML = monitorTable(['Date', 'Visits', 'Visitors', 'Average time'], data.daily.map(row => `<tr><td>${esc(String(row.date).slice(0, 10))}</td><td>${fmtNumber(row.visits)}</td><td>${fmtNumber(row.visitors)}</td><td>${esc(monitorDuration(row.averageDuration))}</td></tr>`));
    document.getElementById('monitor-pages').innerHTML = monitorTable(['Page', 'Visits', 'Visitors', 'Average time'], data.pages.map(row => `<tr><td><a href="${esc(row.path)}">${esc(row.path)}</a></td><td>${fmtNumber(row.visits)}</td><td>${fmtNumber(row.visitors)}</td><td>${esc(monitorDuration(row.averageDuration))}</td></tr>`));
    document.getElementById('monitor-recent').innerHTML = monitorTable(['Time', 'Page', 'Referrer', 'Active time'], data.recent.map(row => `<tr><td>${esc(new Date(row.startedAt).toLocaleString())}</td><td>${esc(row.path)}</td><td>${esc(row.referrerHost || 'Direct')}</td><td>${esc(monitorDuration(row.durationSeconds))}</td></tr>`));
    document.getElementById('monitor-error').innerHTML = '';
  } catch (error) {
    setError('monitor-error', error.message);
  }
}

document.getElementById('monitor-days').addEventListener('change', loadMonitor);
loadMonitor();
