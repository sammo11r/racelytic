const F2_ANALYSIS_COLORS = ['#1677ff','#f2a900','#16a36a','#8b5cf6','#e56b22','#0f9fa8','#d94c9d','#68707d','#7d9b35','#4f46b8','#ad6b47','#0091d5','#c13d63','#536d3b','#9367a8','#a77b00','#3b8391','#cf5944','#6573c3'];
let f2AnalysisData;
let f2AnalysisSessions = [];
let f2SelectedDrivers = new Set();
let f2DriverStyles = new Map();
let f2Tooltip;

function selectF2AnalysisView(view) {
  document.querySelectorAll('[data-f2-analysis]').forEach(panel => { panel.hidden = panel.dataset.f2Analysis !== view; });
  document.querySelectorAll('[data-f2-analysis-button]').forEach(button => {
    const active = button.dataset.f2AnalysisButton === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  f2Tooltip?.classList.remove('visible');
}

function bindF2Tooltips(container = document) {
  if (!f2Tooltip) {
    f2Tooltip = document.createElement('div');
    f2Tooltip.className = 'analysis-tooltip';
    f2Tooltip.setAttribute('role', 'status');
    document.body.append(f2Tooltip);
  }
  container.querySelectorAll('[data-chart-tooltip]').forEach(element => {
    const show = event => {
      f2Tooltip.innerHTML = element.dataset.chartTooltip;
      f2Tooltip.classList.add('visible');
      const bounds = element.getBoundingClientRect();
      const x = event?.clientX ?? bounds.left;
      const y = event?.clientY ?? bounds.top;
      f2Tooltip.style.left = `${Math.min(innerWidth - f2Tooltip.offsetWidth - 12, x + 14)}px`;
      f2Tooltip.style.top = `${Math.max(10, y - f2Tooltip.offsetHeight - 12)}px`;
    };
    element.addEventListener('pointerenter', show);
    element.addEventListener('pointermove', show);
    element.addEventListener('pointerleave', () => f2Tooltip.classList.remove('visible'));
    element.addEventListener('focus', show);
    element.addEventListener('blur', () => f2Tooltip.classList.remove('visible'));
  });
}

function f2AnalysisSessionType(session, index, count) {
  const name = String(session.name || '').toLowerCase();
  if (name.includes('sprint') || /race\s*1/.test(name)) return 'S';
  if (name.includes('feature') || /race\s*2/.test(name)) return 'F';
  return count > 1 && index === 0 ? 'S' : 'F';
}

function flattenF2AnalysisSessions(data) {
  return data.calendar.flatMap(race => race.sessions.map((session, index) => ({
    ...session,
    race,
    type: f2AnalysisSessionType(session, index, race.sessions.length),
    label: `${race.code || `R${race.round}`} ${f2AnalysisSessionType(session, index, race.sessions.length)}`
  })));
}

function f2DriverSeries() {
  return f2AnalysisData.championship.map((driver, index) => {
    let cumulative = 0;
    return {
      ...driver,
      color: f2DriverStyles.get(String(driver.driverId))?.color || F2_ANALYSIS_COLORS[index % F2_ANALYSIS_COLORS.length],
      dash: f2DriverStyles.get(String(driver.driverId))?.dash || '',
      values: f2AnalysisSessions.map((session, sessionIndex) => {
        const result = driver.raceResults?.[session.id];
        cumulative += Number(result?.points || 0);
        return { index: sessionIndex, points: cumulative, session, result };
      })
    };
  });
}

function f2LineChart(series, { height = 430, suffix = '' } = {}) {
  const width = 1000, left = 58, right = 24, top = 25, bottom = 58;
  const values = series.flatMap(item => item.values.map(value => Number((value.value ?? value.points) || 0)));
  const max = Math.max(...values, 1);
  const count = Math.max(...series.flatMap(item => item.values.map(value => value.index)), 0) + 1;
  const x = index => left + index / Math.max(count - 1, 1) * (width - left - right);
  const y = value => top + (1 - Number(value) / max) * (height - top - bottom);
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = max * (4 - index) / 4;
    return `<line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end">${fmtNumber(Math.round(value))}</text>`;
  }).join('');
  const labels = f2AnalysisSessions.filter((session, index) => count <= 16 || index === 0 || index === count - 1 || index % Math.ceil(count / 10) === 0)
    .map(session => `<text x="${x(f2AnalysisSessions.indexOf(session))}" y="${height-18}" text-anchor="middle">${esc(session.label)}</text>`).join('');
  const lines = series.map(item => {
    const path = item.values.map((value, index) => `${index ? 'L' : 'M'}${x(value.index).toFixed(1)},${y(value.value ?? value.points).toFixed(1)}`).join(' ');
    const dots = item.values.map(value => {
      const tooltip = value.tooltip || `<strong>${esc(item.name)}</strong><span>${esc(value.session.label)} · ${esc(value.session.race.name)}</span><b>${fmtNumber(value.value ?? value.points)}${suffix}</b>`;
      return `<circle tabindex="0" data-chart-tooltip="${esc(tooltip)}" cx="${x(value.index)}" cy="${y(value.value ?? value.points)}" r="4"></circle>`;
    }).join('');
    return `<g class="chart-series" style="--series-color:${item.color}"><path d="${path}"${item.dash ? ` stroke-dasharray="${item.dash}"` : ''}/>${dots}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Championship points by Formula 2 race session"><g class="chart-grid">${grid}${labels}</g>${lines}</svg>`;
}

function renderF2Progression() {
  const series = f2DriverSeries();
  document.getElementById('f2-progression-legend').innerHTML = series.map(driver => `<button type="button" class="progression-driver${f2SelectedDrivers.has(String(driver.driverId)) ? ' active' : ''}" data-f2-driver="${esc(driver.driverId)}"><i style="--driver-color:${driver.color};--driver-dash:${driver.dash || 'none'}"></i>${esc(driver.name)}</button>`).join('');
  const visible = series.filter(driver => f2SelectedDrivers.has(String(driver.driverId)));
  document.getElementById('f2-progression-chart').innerHTML = visible.length ? f2LineChart(visible) : '<div class="empty-state">Select at least one driver.</div>';
  bindF2Tooltips(document.getElementById('f2-progression-chart'));
  document.querySelectorAll('[data-f2-driver]').forEach(button => button.addEventListener('click', () => {
    const id = String(button.dataset.f2Driver);
    f2SelectedDrivers.has(id) ? f2SelectedDrivers.delete(id) : f2SelectedDrivers.add(id);
    renderF2Progression();
  }));
}

function renderF2Margin() {
  const series = f2DriverSeries();
  const values = f2AnalysisSessions.map((session, index) => {
    const order = series.map(driver => ({ name: driver.name, points: driver.values[index].points })).sort((a, b) => b.points - a.points);
    const gap = Number(order[0]?.points || 0) - Number(order[1]?.points || 0);
    return { index, value: gap, session, tooltip: `<strong>${esc(order[0]?.name || 'No leader')}</strong><span>${esc(session.label)} · over ${esc(order[1]?.name || '—')}</span><b>${fmtNumber(gap)} points</b>` };
  });
  document.getElementById('f2-margin-chart').innerHTML = f2LineChart([{ name: 'Championship lead', color: '#1677ff', values }], { height: 330, suffix: ' pts' });
  bindF2Tooltips(document.getElementById('f2-margin-chart'));
}

function renderF2Distribution() {
  const drivers = f2AnalysisData.championship.filter(driver => Number(driver.points) > 0);
  const total = drivers.reduce((sum, driver) => sum + Number(driver.points), 0) || 1;
  const items = drivers.slice(0, 9).map((driver, index) => ({ ...driver, color: f2DriverStyles.get(String(driver.driverId))?.color || F2_ANALYSIS_COLORS[index] }));
  const other = drivers.slice(9).reduce((sum, driver) => sum + Number(driver.points), 0);
  if (other) items.push({ name: 'Other', points: other, color: '#c9cdd4' });
  const container = document.getElementById('f2-distribution-chart');
  container.innerHTML = `<div class="distribution-bar">${items.map(item => `<span tabindex="0" data-chart-tooltip="<strong>${esc(item.name)}</strong><span>Share of championship points</span><b>${fmtNumber(item.points)} pts · ${(Number(item.points)/total*100).toFixed(1)}%</b>" style="width:${Number(item.points)/total*100}%;background:${item.color}"></span>`).join('')}</div><div class="distribution-legend">${items.map(item => `<div><i style="background:${item.color}"></i><span>${esc(item.name)}</span><strong>${(Number(item.points)/total*100).toFixed(1)}%</strong></div>`).join('')}</div>`;
  bindF2Tooltips(container);
}

function f2HeatClass(result) {
  if (!result) return 'absent';
  const position = Number(result.position || 0);
  if (!position) return 'retired';
  if (position === 1) return 'winner';
  if (position <= 3) return 'podium';
  if (Number(result.points || 0) > 0) return 'points';
  return 'finish';
}

function renderF2Heatmap() {
  const drivers = f2AnalysisData.championship.slice(0, 15);
  const container = document.getElementById('f2-results-heatmap');
  container.innerHTML = `<div class="results-heatmap" style="--rounds:${f2AnalysisSessions.length}"><div class="heatmap-corner">Driver</div>${f2AnalysisSessions.map(session => `<div class="heatmap-round" data-chart-tooltip="<strong>${esc(session.label)}</strong><span>${esc(session.race.name)}</span><b>${session.cancelled ? 'Cancelled' : esc(session.name)}</b>">${esc(session.label)}</div>`).join('')}${drivers.map(driver => `<a class="heatmap-driver" href="/f2/driver?id=${encodeURIComponent(driver.driverId)}">${esc(driver.name)}</a>${f2AnalysisSessions.map(session => {
    const result = driver.raceResults?.[session.id];
    const display = result?.positionText || result?.position || '';
    return `<div tabindex="0" class="heatmap-cell ${f2HeatClass(result)}" data-chart-tooltip="<strong>${esc(driver.name)}</strong><span>${esc(session.label)} · ${esc(session.race.name)}</span><b>${session.cancelled ? 'Cancelled' : display ? `Finished ${esc(display)} · ${fmtNumber(result.points)} pts` : 'Did not participate'}</b>">${session.cancelled ? 'C' : esc(display)}</div>`;
  }).join('')}`).join('')}</div><div class="heatmap-key"><span class="winner">Win</span><span class="podium">Podium</span><span class="points">Points</span><span class="finish">Finish</span><span class="retired">Retired / unclassified</span></div>`;
  bindF2Tooltips(container);
}

function f2Average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function renderF2Averages() {
  const rows = f2AnalysisData.championship.map(driver => {
    const sprint = [], feature = [];
    f2AnalysisSessions.forEach(session => {
      const position = Number(driver.raceResults?.[session.id]?.position || 0);
      if (position > 0) (session.type === 'S' ? sprint : feature).push(position);
    });
    return { ...driver, sprintAverage: f2Average(sprint), featureAverage: f2Average(feature), starts: sprint.length + feature.length };
  }).sort((first, second) => (f2Average([first.sprintAverage, first.featureAverage].filter(Number.isFinite)) ?? 99) - (f2Average([second.sprintAverage, second.featureAverage].filter(Number.isFinite)) ?? 99));
  document.getElementById('f2-average-table').innerHTML = `<table class="average-position-table"><thead><tr><th>Driver</th><th>Avg. sprint</th><th>Avg. feature</th><th>Classified results</th><th>Final standing</th></tr></thead><tbody>${rows.map(driver => `<tr><td><a href="/f2/driver?id=${encodeURIComponent(driver.driverId)}">${esc(driver.name)}</a></td><td>${driver.sprintAverage?.toFixed(2) ?? '—'}</td><td>${driver.featureAverage?.toFixed(2) ?? '—'}</td><td>${fmtNumber(driver.starts)}</td><td>P${esc(driver.position)}</td></tr>`).join('')}</tbody></table>`;
}

async function renderF2SeasonAnalysis() {
  const year = document.getElementById('f2-analysis-season').value;
  if (!year) return;
  try {
    f2AnalysisData = await getJSON(`/api/seasons/${encodeURIComponent(year)}?series=f2`);
    f2AnalysisSessions = flattenF2AnalysisSessions(f2AnalysisData);
    f2DriverStyles = assignDriverTeamStyles(f2AnalysisData.championship);
    f2SelectedDrivers = new Set(f2AnalysisData.championship.slice(0, 5).map(driver => String(driver.driverId)));
    const leader = f2AnalysisData.championship[0], runnerUp = f2AnalysisData.championship[1], team = f2AnalysisData.constructorChampionship[0];
    document.title = `${year} Formula 2 Season Analysis · Racelytic`;
    document.getElementById('f2-analysis-summary').innerHTML = `<div><span>Champion / leader</span><strong>${esc(leader?.name || '—')}</strong><small>${fmtNumber(leader?.points)} points</small></div><div><span>Current margin</span><strong>${fmtNumber(Number(leader?.points || 0) - Number(runnerUp?.points || 0))}</strong><small>points over ${esc(runnerUp?.name || '—')}</small></div><div><span>Teams’ leader</span><strong>${esc(team?.name || '—')}</strong><small>${fmtNumber(team?.points)} points</small></div><div><span>Season length</span><strong>${fmtNumber(f2AnalysisData.calendar.length)}</strong><small>${fmtNumber(f2AnalysisSessions.length)} race sessions</small></div>`;
    renderF2Progression(); renderF2Margin(); renderF2Distribution(); renderF2Heatmap(); renderF2Averages();
  } catch (error) { setError('f2-progression-chart', error.message); }
}

getJSON('/api/seasons?series=f2').then(seasons => {
  const select = document.getElementById('f2-analysis-season');
  select.innerHTML = seasons.map(season => `<option value="${esc(season.year)}">${esc(season.year)}</option>`).join('');
  renderF2SeasonAnalysis();
}).catch(error => setError('f2-progression-chart', error.message));
document.getElementById('f2-analysis-season').addEventListener('change', renderF2SeasonAnalysis);
document.querySelectorAll('[data-f2-analysis-button]').forEach(button => button.addEventListener('click', () => selectF2AnalysisView(button.dataset.f2AnalysisButton)));
