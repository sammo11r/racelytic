(() => {
  'use strict';
  const model = WecSeasonComparisonModel, $ = id => document.getElementById(id);
  const colors = ['#087f5b', '#334d70'];
  const typeLabels = { driver: ['Driver', 'Drivers'], manufacturer: ['Manufacturer', 'Manufacturers'], competitor: ['Team', 'Teams'], team: ['Team', 'Teams'] };
  let state = model.readState(location.search), years = [], data = [], comparison, requestId = 0;
  const cache = new Map();
  const format = (value, decimals = 0, suffix = '') => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  const signed = (value, decimals = 0, suffix = '') => value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value) > 0 ? '+' : ''}${format(value, decimals, suffix)}`;
  const typeLabel = (championship, plural = false) => typeLabels[championship?.entityType]?.[plural ? 1 : 0] || (plural ? 'Entries' : 'Entry');
  const championshipLink = snapshot => `/wec/seasons/${encodeURIComponent(snapshot.year)}`;
  function entityLink(championship, entity) {
    const collection = { driver: 'drivers', manufacturer: 'manufacturers', competitor: 'entries', team: 'teams' }[championship.entityType];
    return collection ? `/wec/${collection}/${encodeURIComponent(entity.id)}` : '';
  }
  function getSeason(year) {
    const key = String(year);
    if (!cache.has(key)) cache.set(key, getJSON(`/api/wec/analysis/seasons/${encodeURIComponent(key)}`).catch(error => { cache.delete(key); throw error; }));
    return cache.get(key);
  }
  function saveState() {
    if (!comparison) return;
    const url = new URL(location.href);
    for (const key of ['first', 'second', 'firstChampionship', 'secondChampionship', 'view', 'basis', 'field', 'sort']) url.searchParams.set(key, state[key]);
    url.searchParams.set('direction', state.direction === 1 ? 'asc' : 'desc');
    if (state.basis === 'matched') url.searchParams.set('round', comparison.cutoff); else url.searchParams.delete('round');
    history.replaceState(null, '', url);
  }
  function championshipOptions(season, selected) {
    return season.championships.map(championship => `<option value="${esc(championship.id)}"${championship.id === selected ? ' selected' : ''}>${esc(championship.name)}</option>`).join('');
  }
  function setChampionshipSelectors(requested = [state.firstChampionship, state.secondChampionship]) {
    const selects = [$('comparison-championship-one'), $('comparison-championship-two')];
    data.forEach((season, index) => {
      const chosen = season.championships.find(item => item.id === requested[index]) || model.defaultChampionship(season);
      selects[index].innerHTML = championshipOptions(season, chosen?.id);
      selects[index].disabled = !season.championships.length;
    });
    state.firstChampionship = selects[0].value; state.secondChampionship = selects[1].value;
  }
  function seasonHeads() {
    $('championship-one-year').textContent = state.first;
    $('championship-two-year').textContent = state.second;
    $('comparison-season-heads').innerHTML = comparison.snapshots.map((snapshot, index) => {
      const joint = snapshot.tiedLeaders.length > 1;
      const label = state.basis === 'matched' ? joint ? 'Joint comparison leaders' : snapshot.leader?.championshipWon ? 'Champion' : 'Comparison leader' : joint ? snapshot.leader?.championshipWon ? 'Champions' : 'Joint championship leaders' : snapshot.leader?.championshipWon ? 'Champion' : 'Championship leader';
      const leaders = snapshot.tiedLeaders.map(row => row.name).join(', ') || snapshot.leader?.name || 'No standings';
      return `<div style="--comparison-color:${colors[index]}"><a href="${championshipLink(snapshot)}">${snapshot.year}</a><p>${esc(snapshot.championship.name)}</p><small>${esc(label)} · ${esc(leaders)} · ${snapshot.events.length} rounds included</small></div>`;
    }).join('');
  }
  function metricTable(rows) {
    const [first, second] = comparison.snapshots;
    return `<table class="comparison-metrics"><thead><tr><th>Measure</th><th>${first.year}<small>${esc(typeLabel(first.championship, true))}</small></th><th>${second.year}<small>${esc(typeLabel(second.championship, true))}</small></th><th>Difference</th></tr></thead><tbody>${rows.map(row => {
      const left = row.value(first), right = row.value(second), difference = left == null || right == null ? null : right - left;
      return `<tr><th scope="row">${esc(row.label)}${row.note ? `<small>${esc(row.note)}</small>` : ''}</th><td>${row.format(left)}</td><td>${row.format(right)}</td><td>${row.diff(difference)}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  const whole = value => format(value), points = value => format(value, 1, ' pts'), percent = value => format(value, 1, '%');
  function renderOverview() {
    $('comparison-overview').innerHTML = metricTable([
      { label: 'Rounds included', value: row => row.metrics.rounds, format: whole, diff: signed },
      { label: 'Classified championship field', value: row => row.metrics.fieldSize, format: whole, diff: signed },
      { label: 'Different round winners', note: 'Best class result for manufacturers', value: row => row.metrics.winners, format: whole, diff: signed },
      { label: 'Podium representation', note: 'Entities with at least one top-three class result', value: row => row.metrics.podiumEntities, format: whole, diff: signed },
      { label: 'Championship margin', value: row => row.metrics.margin, format: points, diff: value => signed(value, 1, ' pts') },
      { label: 'Margin relative to leader', value: row => row.metrics.marginPercent, format: percent, diff: value => signed(value, 1, ' pp') },
      { label: 'Top-three points share', value: row => row.metrics.concentration, format: percent, diff: value => signed(value, 1, ' pp') },
      { label: 'Non-classified rate', value: row => row.metrics.unclassifiedRate, format: percent, diff: value => signed(value, 1, ' pp') }
    ]);
  }
  function chart(container, series, label, percentScale = true) {
    const width = Math.max(560, Math.round(container.clientWidth || 900)), height = 350, left = 50, right = 24, top = 20, bottom = 40;
    const maxLength = Math.max(1, ...series.map(item => item.values.length));
    const max = percentScale ? 100 : Math.max(1, ...series.flatMap(item => item.values.map(value => Number(value.value || 0))));
    const x = (index, length) => left + (length <= 1 ? 0 : index / (length - 1)) * (width - left - right);
    const y = value => top + (1 - Number(value || 0) / max) * (height - top - bottom);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><g class="chart-grid">`;
    svg += Array.from({ length: 5 }, (_, index) => { const value = max * index / 4; return `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${format(value, percentScale ? 0 : 1)}${percentScale ? '%' : ''}</text>`; }).join('');
    svg += `<text x="${left}" y="${height - 10}">Season start</text><text x="${width - right}" y="${height - 10}" text-anchor="end">Season end</text></g>`;
    series.forEach(item => {
      const valid = item.values.filter(value => value.value != null);
      const path = valid.map((value, index) => `${index ? 'L' : 'M'}${x(item.values.indexOf(value), item.values.length)},${y(value.value)}`).join(' ');
      svg += `<g class="chart-series" style="--series-color:${item.color}"><path d="${path}"/>${item.values.map((value, index) => value.value == null ? '' : `<circle cx="${x(index, item.values.length)}" cy="${y(value.value)}" r="4" tabindex="0" role="button" data-chart-series="${item.index}" data-chart-point="${index}"/>`).join('')}</g>`;
    });
    container.innerHTML = svg + '</svg>';
    container.querySelectorAll('[data-chart-point]').forEach(point => {
      const show = () => showChartPoint(series, Number(point.dataset.chartSeries), Number(point.dataset.chartPoint), container.id.includes('margin'));
      point.addEventListener('pointerenter', show); point.addEventListener('focus', show); point.addEventListener('click', show);
    });
    showChartPoint(series, 0, Math.max(0, series[0].values.length - 1), container.id.includes('margin'));
  }
  function showChartPoint(series, seriesIndex, pointIndex, margin) {
    const source = series[seriesIndex], point = source.values[pointIndex];
    const readout = $(margin ? 'comparison-margin-readout' : 'comparison-progression-readout');
    const event = point.event, value = margin ? percent(point.value) : `${percent(point.value)} · ${points(point.points)}`;
    const detail = margin ? point.tied?.length > 1 ? `Joint leaders: ${point.tied.map(row => row.name).join(', ')}${point.runnerUp ? `; ${points(point.gap)} ahead of ${point.runnerUp.name}` : ''}` : point.leader ? `${point.leader.name} leads${point.runnerUp ? ` ${point.runnerUp.name} by ${points(point.gap)}` : ''}` : 'No standing recorded' : `${point.driver || source.snapshot.leader?.name} championship progress`;
    readout.innerHTML = `<div style="--comparison-color:${source.color}"><strong>${source.snapshot.year} · R${point.round}</strong><small>${esc(event?.name || `Round ${point.round}`)}${event?.date ? ` · ${esc(fmtDate(event.date))}` : ''}</small><p>${esc(detail)} · ${value}</p></div>`;
  }
  function renderCharts() {
    if (!comparison) return;
    const series = comparison.snapshots.map((snapshot, index) => ({ index, snapshot, label: String(snapshot.year), color: colors[index], values: snapshot.progress.map(item => ({ ...item, driver: snapshot.leader?.name })) }));
    $('comparison-progression-legend').innerHTML = series.map(item => `<span style="--comparison-color:${item.color}">${item.label} · ${esc(item.snapshot.tiedLeaders.map(row => row.name).join(', ') || item.snapshot.leader?.name || 'Leader')}</span>`).join('');
    chart($('comparison-progression-chart'), series, 'WEC championship points progression');
    const margins = comparison.snapshots.map((snapshot, index) => ({ index, snapshot, label: String(snapshot.year), color: colors[index], values: snapshot.marginSeries }));
    $('comparison-margin-legend').innerHTML = margins.map(item => `<span style="--comparison-color:${item.color}">${item.label} · ${esc(item.snapshot.championship.name)}</span>`).join('');
    chart($('comparison-margin-chart'), margins, 'Championship lead as a share of leader points');
  }
  function renderCompetition() {
    $('comparison-competition-metrics').innerHTML = metricTable([
      { label: 'Final or comparison margin', value: row => row.metrics.margin, format: points, diff: value => signed(value, 1, ' pts') },
      { label: 'Margin relative to leader', value: row => row.metrics.marginPercent, format: percent, diff: value => signed(value, 1, ' pp') },
      { label: 'Lead changes', value: row => row.metrics.leadChanges, format: whole, diff: signed },
      { label: 'Different round winners', value: row => row.metrics.winners, format: whole, diff: signed },
      { label: 'Top-three points share', value: row => row.metrics.concentration, format: percent, diff: value => signed(value, 1, ' pp') }
    ]);
  }
  function fieldTable(snapshot) {
    const columns = [['position', 'Standing'], ['name', typeLabel(snapshot.championship)], ['finish', 'Avg. class finish'], ['spread', 'Finish spread'], ['unclassifiedRate', 'Unclassified'], ['points', 'Points']];
    const rows = model.sortedField(snapshot, state.field, state.sort, state.direction);
    return `<div><h3 style="--comparison-color:${colors[comparison.snapshots.indexOf(snapshot)]}">${snapshot.year} · ${esc(snapshot.championship.name)}</h3><div class="table-wrap" tabindex="0" aria-label="${snapshot.year} ${esc(snapshot.championship.name)} field; scroll horizontally for more columns"><table><thead><tr>${columns.map(([key, label]) => `<th scope="col"><button type="button" data-field-sort="${key}">${esc(label)}${state.sort === key ? state.direction === 1 ? ' ↑' : ' ↓' : ' ↕'}</button></th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><td>${row.position ? `P${row.position}` : '—'}</td><td><a href="${entityLink(snapshot.championship, row)}">${esc(row.name)}</a></td><td>${row.finish == null ? '—' : `${format(row.finish, 2)}<small>${row.finishCount} classified</small>`}</td><td>${format(row.spread, 2)}</td><td>${percent(row.unclassifiedRate)}<small>${row.starts} starts</small></td><td>${points(row.points)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function renderFields() { $('comparison-fields').innerHTML = comparison.snapshots.map(fieldTable).join(''); }
  function renderNotes() {
    $('comparison-data-notes').innerHTML = comparison.snapshots.map(snapshot => `<p><strong>${snapshot.year} · ${esc(snapshot.championship.name)}:</strong> ${snapshot.metrics.starts} recorded starts across ${snapshot.events.length} rounds; ${snapshot.metrics.unclassified} were not positively classified.</p>`).join('');
  }
  function renderScope() {
    $('comparison-round-label').hidden = state.basis !== 'matched';
    $('comparison-round').innerHTML = Array.from({ length: comparison.maxRound }, (_, index) => `<option value="${index + 1}">R${index + 1}</option>`).join('');
    if (comparison.cutoff) $('comparison-round').value = comparison.cutoff;
    $('comparison-scope-note').textContent = state.basis === 'matched' ? `Both championships through round ${comparison.cutoff}.` : 'Each championship uses all recorded rounds available for that season.';
  }
  function renderAll() {
    comparison = model.compare(data, [state.firstChampionship, state.secondChampionship], state.basis, state.round);
    if (comparison.snapshots.some(snapshot => !snapshot)) return;
    seasonHeads(); renderScope(); renderOverview(); renderCompetition(); renderFields(); renderCharts(); renderNotes();
    $('comparison-status').hidden = true; $('comparison-loaded').hidden = false;
    selectView(state.view, false); saveState();
  }
  function selectView(view, save = true) {
    state.view = ['overview', 'progression', 'competition', 'field'].includes(view) ? view : 'overview';
    document.querySelectorAll('[data-comparison-panel]').forEach(panel => { panel.hidden = panel.dataset.comparisonPanel !== state.view; });
    document.querySelectorAll('[data-comparison-view]').forEach(button => { const active = button.dataset.comparisonView === state.view; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    $('comparison-view').value = state.view;
    if (['progression', 'competition'].includes(state.view)) renderCharts();
    if (save) saveState();
  }
  async function loadPair(preserveChampionships = true) {
    const current = ++requestId;
    $('comparison-loaded').hidden = true; $('comparison-status').hidden = false; $('comparison-status').textContent = `Loading ${state.first} and ${state.second}…`;
    try {
      const next = await Promise.all([getSeason(state.first), getSeason(state.second)]);
      if (current !== requestId) return;
      data = next; setChampionshipSelectors(preserveChampionships ? [state.firstChampionship, state.secondChampionship] : [null, null]); renderAll();
    } catch (error) { if (current === requestId) $('comparison-status').textContent = `Unable to compare seasons: ${error.message}`; }
  }
  function changeSeason(index, value) {
    state[index ? 'second' : 'first'] = value;
    state[index ? 'secondChampionship' : 'firstChampionship'] = null;
    loadPair(true);
  }
  function bindTabs() {
    const tabs = [...document.querySelectorAll('[data-comparison-view]')];
    tabs.forEach((button, index) => {
      button.addEventListener('click', () => selectView(button.dataset.comparisonView));
      button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectView(tabs[target].dataset.comparisonView); tabs[target].focus(); });
    });
  }
  $('comparison-season-one').addEventListener('change', event => changeSeason(0, event.target.value));
  $('comparison-season-two').addEventListener('change', event => changeSeason(1, event.target.value));
  $('comparison-championship-one').addEventListener('change', event => { state.firstChampionship = event.target.value; renderAll(); });
  $('comparison-championship-two').addEventListener('change', event => { state.secondChampionship = event.target.value; renderAll(); });
  $('swap-seasons').addEventListener('click', () => {
    [state.first, state.second] = [state.second, state.first]; [state.firstChampionship, state.secondChampionship] = [state.secondChampionship, state.firstChampionship];
    $('comparison-season-one').value = state.first; $('comparison-season-two').value = state.second; loadPair(true);
  });
  $('comparison-basis').addEventListener('change', event => { state.basis = event.target.value; renderAll(); });
  $('comparison-round').addEventListener('change', event => { state.round = Number(event.target.value); renderAll(); });
  $('comparison-view').addEventListener('change', event => selectView(event.target.value));
  $('comparison-field-size').addEventListener('change', event => { state.field = event.target.value; renderFields(); saveState(); });
  $('comparison-fields').addEventListener('click', event => { const button = event.target.closest('[data-field-sort]'); if (!button) return; state.direction = state.sort === button.dataset.fieldSort ? -state.direction : 1; state.sort = button.dataset.fieldSort; renderFields(); saveState(); });
  bindTabs();
  getJSON('/api/wec/seasons').then(response => {
    years = response.map(season => String(season.year));
    const options = response.map(season => `<option value="${season.year}">${season.year}</option>`).join('');
    $('comparison-season-one').innerHTML = options; $('comparison-season-two').innerHTML = options;
    state.first = years.includes(state.first) ? state.first : years[0]; state.second = years.includes(state.second) && state.second !== state.first ? state.second : years.find(year => year !== state.first) || years[0];
    $('comparison-season-one').value = state.first; $('comparison-season-two').value = state.second;
    $('comparison-season-one').disabled = false; $('comparison-season-two').disabled = false; $('swap-seasons').disabled = years.length < 2;
    $('comparison-basis').value = state.basis; $('comparison-field-size').value = state.field;
    loadPair(true);
  }).catch(error => { $('comparison-status').textContent = `Unable to load WEC seasons: ${error.message}`; });
})();
