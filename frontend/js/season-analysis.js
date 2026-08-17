const CHART_COLORS = ['#e32636','#2764d8','#16a36a','#f2a900','#8b5cf6','#e56b22','#0f9fa8','#d94c9d','#68707d','#7d9b35','#4f46b8','#ad6b47','#0091d5','#c13d63','#536d3b','#9367a8','#a77b00','#3b8391','#cf5944','#6573c3'];
let selectedDrivers = new Set();
let seasonData = null;
let chartTooltip = null;
let seasonDriverStyles = new Map();

function selectSeasonVisualization(value) {
  document.querySelectorAll('[data-season-visual]').forEach(panel => {
    panel.hidden = panel.dataset.seasonVisual !== value;
  });
  document.querySelectorAll('[data-season-visual-button]').forEach(button => {
    const active = button.dataset.seasonVisualButton === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  chartTooltip?.classList.remove('visible');
}

function bindChartTooltips(container = document) {
  if (!chartTooltip) {
    chartTooltip = document.createElement('div');
    chartTooltip.className = 'analysis-tooltip';
    chartTooltip.setAttribute('role', 'status');
    document.body.append(chartTooltip);
  }
  const show = (element, event) => {
    chartTooltip.innerHTML = element.dataset.chartTooltip;
    chartTooltip.classList.add('visible');
    const x = event?.clientX ?? element.getBoundingClientRect().left;
    const y = event?.clientY ?? element.getBoundingClientRect().top;
    const tooltipWidth = chartTooltip.offsetWidth;
    chartTooltip.style.left = `${Math.min(window.innerWidth - tooltipWidth - 12, x + 14)}px`;
    chartTooltip.style.top = `${Math.max(10, y - chartTooltip.offsetHeight - 12)}px`;
  };
  container.querySelectorAll('[data-chart-tooltip]').forEach(element => {
    element.addEventListener('pointerenter', event => show(element, event));
    element.addEventListener('pointermove', event => show(element, event));
    element.addEventListener('pointerleave', () => chartTooltip.classList.remove('visible'));
    element.addEventListener('focus', event => show(element, event));
    element.addEventListener('blur', () => chartTooltip.classList.remove('visible'));
  });
}

function driverSeries(data) {
  return data.driverChampionship.map((driver, index) => {
    let cumulative = 0;
    return {
      ...driver,
      color: seasonDriverStyles.get(String(driver.driverId))?.color || CHART_COLORS[index % CHART_COLORS.length],
      dash: seasonDriverStyles.get(String(driver.driverId))?.dash || '',
      constructorId: seasonDriverStyles.get(String(driver.driverId))?.constructorId,
      values: data.calendar.map(race => {
        const result = driver.raceResults?.[String(race.round)];
        cumulative += Number(result?.points || 0) + Number(result?.sprintPoints || 0);
        return { round: Number(race.round), points: cumulative, race: race.officialName };
      })
    };
  });
}

function lineChart(series, { height = 430, yLabel = 'Points', suffix = '' } = {}) {
  const width = 1000, left = 58, right = 24, top = 25, bottom = 48;
  const all = series.flatMap(item => item.values.map(value => value.value ?? value.points));
  const max = Math.max(...all, 1);
  const rounds = Math.max(...series.flatMap(item => item.values.map(value => value.round)), 1);
  const x = round => left + ((round - 1) / Math.max(rounds - 1, 1)) * (width - left - right);
  const y = value => top + (1 - value / max) * (height - top - bottom);
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = max * (4 - index) / 4;
    const py = y(value);
    return `<line x1="${left}" y1="${py}" x2="${width-right}" y2="${py}"/><text x="${left-10}" y="${py+4}" text-anchor="end">${fmtNumber(Math.round(value))}</text>`;
  }).join('');
  const xLabels = Array.from({ length: rounds }, (_, index) => index + 1).filter(round => rounds <= 12 || round === 1 || round === rounds || round % Math.ceil(rounds / 8) === 0)
    .map(round => `<text x="${x(round)}" y="${height-17}" text-anchor="middle">R${round}</text>`).join('');
  const lines = series.map(item => {
    const path = item.values.map((value, index) => `${index ? 'L' : 'M'}${x(value.round).toFixed(1)},${y(value.value ?? value.points).toFixed(1)}`).join(' ');
    const dots = item.values.map(value => `<circle tabindex="0" data-chart-tooltip="${esc(value.tooltip || `<strong>${item.name}</strong><span>Round ${value.round}</span><b>${fmtNumber(value.value ?? value.points)}${suffix}</b>`)}" cx="${x(value.round)}" cy="${y(value.value ?? value.points)}" r="4"></circle>`).join('');
    return `<g class="chart-series" style="--series-color:${item.color}"><path d="${path}"${item.dash ? ` stroke-dasharray="${item.dash}"` : ''}/>${dots}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(yLabel)} by round"><g class="chart-grid">${grid}${xLabels}</g>${lines}</svg>`;
}

function renderProgression() {
  const series = driverSeries(seasonData);
  document.getElementById('progression-legend').innerHTML = series.map(driver => `<button type="button" class="progression-driver${selectedDrivers.has(String(driver.driverId)) ? ' active' : ''}" data-driver="${esc(driver.driverId)}" title="Primary constructor: ${esc(driver.constructorId)}"><i style="--driver-color:${driver.color};--driver-dash:${driver.dash || 'none'}"></i>${esc(driver.name)}</button>`).join('');
  const visible = series.filter(driver => selectedDrivers.has(String(driver.driverId)));
  document.getElementById('season-progression-chart').innerHTML = visible.length ? lineChart(visible) : '<div class="empty-state">Select at least one driver.</div>';
  bindChartTooltips(document.getElementById('season-progression-chart'));
  document.querySelectorAll('[data-driver]').forEach(button => button.addEventListener('click', () => {
    const id = String(button.dataset.driver);
    selectedDrivers.has(id) ? selectedDrivers.delete(id) : selectedDrivers.add(id);
    renderProgression();
  }));
}

function renderWinningMargin() {
  const series = driverSeries(seasonData);
  const values = seasonData.calendar.map((race, index) => {
    const standings = series.map(driver => ({ name: driver.name, points: driver.values[index].points })).sort((a,b) => b.points-a.points);
    const gap = standings[0].points - standings[1].points;
    return { round: Number(race.round), value: gap, tooltip: `<strong>${esc(standings[0].name)} leads</strong><span>After round ${race.round} · over ${esc(standings[1].name)}</span><b>${fmtNumber(gap)} points</b>` };
  });
  document.getElementById('winning-margin-chart').innerHTML = lineChart([{ name: 'Championship lead', color: '#e32636', values }], { height: 330, yLabel: 'Championship lead', suffix: ' pts' });
  bindChartTooltips(document.getElementById('winning-margin-chart'));
}

function renderDistribution() {
  const drivers = seasonData.driverChampionship.filter(driver => Number(driver.points) > 0);
  const total = drivers.reduce((sum, driver) => sum + Number(driver.points), 0) || 1;
  const top = drivers.slice(0, 9);
  const other = drivers.slice(9).reduce((sum, driver) => sum + Number(driver.points), 0);
  const items = top.map((driver, index) => ({ ...driver, color: seasonDriverStyles.get(String(driver.driverId))?.color || CHART_COLORS[index] }));
  if (other) items.push({ name: 'Other', points: other, color: '#c9cdd4' });
  const container = document.getElementById('points-distribution-chart');
  container.innerHTML = `<div class="distribution-bar">${items.map(item => `<span tabindex="0" data-chart-tooltip="<strong>${esc(item.name)}</strong><span>Share of all championship points</span><b>${fmtNumber(item.points)} pts · ${(Number(item.points)/total*100).toFixed(1)}%</b>" style="width:${Number(item.points)/total*100}%;background:${item.color}"></span>`).join('')}</div><div class="distribution-legend">${items.map(item => `<div data-chart-tooltip="<strong>${esc(item.name)}</strong><span>Championship points</span><b>${fmtNumber(item.points)} · ${(Number(item.points)/total*100).toFixed(1)}%</b>"><i style="background:${item.color}"></i><span>${esc(item.name)}</span><strong>${(Number(item.points)/total*100).toFixed(1)}%</strong></div>`).join('')}</div>`;
  bindChartTooltips(container);
}

function resultHeatClass(result) {
  if (!result) return 'absent';
  if (!result.position || /ret|dns|dnq|dsq|wd/i.test(result.positionText || result.reasonRetired || '')) return 'retired';
  if (result.position === 1) return 'winner';
  if (result.position <= 3) return 'podium';
  if (result.position <= 10) return 'points';
  return 'finish';
}

function renderHeatmap() {
  const drivers = seasonData.driverChampionship.slice(0, 15);
  const rounds = seasonData.calendar;
  const container = document.getElementById('results-heatmap');
  container.innerHTML = `<div class="results-heatmap" style="--rounds:${rounds.length}"><div class="heatmap-corner">Driver</div>${rounds.map(race => `<div class="heatmap-round" data-chart-tooltip="<strong>Round ${race.round}</strong><span>${esc(race.officialName)}</span><b>${esc(fmtDate(race.date))}</b>">R${race.round}</div>`).join('')}${drivers.map(driver => `<a class="heatmap-driver" href="/driver.html?id=${encodeURIComponent(driver.driverId)}">${esc(driver.name)}</a>${rounds.map(race => {
    const result = driver.raceResults?.[String(race.round)];
    const display = result?.positionText || result?.position || '';
    const sprint = Number(result?.sprintPoints || 0);
    return `<div tabindex="0" class="heatmap-cell ${resultHeatClass(result)}" data-chart-tooltip="<strong>${esc(driver.name)}</strong><span>R${race.round} · ${esc(race.officialName)}</span><b>${display ? `Finished ${esc(display)}` : 'Did not participate'}${sprint ? ` · ${fmtNumber(sprint)} sprint pts` : ''}</b>">${esc(display)}</div>`;
  }).join('')}`).join('')}</div><div class="heatmap-key"><span class="winner">Win</span><span class="podium">Podium</span><span class="points">Points</span><span class="finish">Finish</span><span class="retired">Retired / unclassified</span></div>`;
  bindChartTooltips(container);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function renderAverages() {
  const rows = seasonData.driverChampionship.map(driver => {
    const results = Object.values(driver.raceResults || {});
    const finishes = results.filter(result => result.position !== null && result.position !== undefined).map(result => Number(result.position)).filter(Number.isFinite);
    const qualifying = results.filter(result => result.qualifyingPosition !== null && result.qualifyingPosition !== undefined).map(result => Number(result.qualifyingPosition)).filter(Number.isFinite);
    return { ...driver, averageFinish: average(finishes), averageQualifying: average(qualifying), starts: finishes.length };
  }).sort((a,b) => (a.averageFinish ?? 99) - (b.averageFinish ?? 99));
  document.getElementById('average-position-table').innerHTML = `<table class="average-position-table"><thead><tr><th>Driver</th><th>Avg. finish</th><th>Avg. qualifying</th><th>Classified results</th><th>Final standing</th></tr></thead><tbody>${rows.map(driver => `<tr><td><a href="/driver.html?id=${encodeURIComponent(driver.driverId)}">${esc(driver.name)}</a></td><td>${driver.averageFinish?.toFixed(2) ?? '—'}</td><td>${driver.averageQualifying?.toFixed(2) ?? '—'}</td><td>${driver.starts}</td><td>P${driver.position}</td></tr>`).join('')}</tbody></table>`;
}

async function renderSeasonAnalysis() {
  const year = document.getElementById('analysis-season').value;
  if (!year) return;
  try {
    seasonData = await getJSON(`/api/seasons/${encodeURIComponent(year)}`);
    seasonDriverStyles = assignDriverTeamStyles(seasonData.driverChampionship);
    const champion = seasonData.driverChampionship[0], runnerUp = seasonData.driverChampionship[1], team = seasonData.constructorChampionship[0];
    document.getElementById('season-analysis-summary').innerHTML = `<div><span>Champion</span><strong>${esc(champion?.name)}</strong><small>${fmtNumber(champion?.points)} points</small></div><div><span>Winning margin</span><strong>${fmtNumber(Number(champion?.points||0)-Number(runnerUp?.points||0))}</strong><small>points over ${esc(runnerUp?.name)}</small></div><div><span>Constructors’ champion</span><strong>${esc(team?.name)}</strong><small>${fmtNumber(team?.points)} points</small></div><div><span>Season length</span><strong>${fmtNumber(seasonData.calendar.length)}</strong><small>races</small></div>`;
    selectedDrivers = new Set(seasonData.driverChampionship.slice(0, 5).map(driver => String(driver.driverId)));
    renderProgression(); renderWinningMargin(); renderDistribution(); renderHeatmap(); renderAverages();
  } catch (error) { setError('season-progression-chart', error.message); }
}

getJSON('/api/seasons').then(seasons => { const select=document.getElementById('analysis-season'); select.innerHTML=seasons.map(season=>`<option value="${esc(season.year)}">${esc(season.year)}</option>`).join(''); renderSeasonAnalysis(); }).catch(error=>setError('season-progression-chart',error.message));
document.getElementById('analysis-season').addEventListener('change', renderSeasonAnalysis);
document.querySelectorAll('[data-season-visual-button]').forEach(button => button.addEventListener('click', () => selectSeasonVisualization(button.dataset.seasonVisualButton)));
