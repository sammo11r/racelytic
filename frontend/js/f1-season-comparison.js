(() => {
  'use strict';
  const model = SeasonComparisonModel, analysis = SeasonAnalysisModel, $ = id => document.getElementById(id);
  const seriesKey = activeSeriesKey(), junior = seriesKey !== 'f1';
  const colors = [junior ? activeSeriesAccent() : '#d92337', '#334d70'];
  const raceUnit = junior ? 'race sessions' : 'Grands Prix';
  let state = model.readState(location.search), data, comparison, requestId = 0, years = [];
  const normalizeSort = () => {
    if (junior && ['finish', 'qualifying'].includes(state.sort)) state.sort = 'feature';
    if (!junior && ['sprint', 'feature'].includes(state.sort)) state.sort = 'finish';
  };
  normalizeSort();
  const cache = new Map();
  const format = (value, decimals = 0, suffix = '') => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix;
  function getSeason(year) {
    const key = String(year);
    if (!cache.has(key)) cache.set(key, getJSON('/api/seasons/' + encodeURIComponent(key))
      .then(response => junior ? analysis.adaptJunior(response, seriesKey) : response)
      .catch(error => { cache.delete(key); throw error; }));
    return cache.get(key);
  }
  function saveState() {
    if (!comparison) return;
    const url = new URL(location.href);
    for (const key of ['first', 'second', 'view', 'basis', 'field', 'sort']) url.searchParams.set(key, state[key]);
    url.searchParams.set('direction', state.direction === 1 ? 'asc' : 'desc');
    if (state.basis === 'matched') url.searchParams.set('round', comparison.cutoff);
    else url.searchParams.delete('round');
    history.replaceState(null, '', url);
  }
  function selectView(view) {
    state.view = view;
    document.querySelectorAll('[data-comparison-panel]').forEach(panel => { panel.hidden = panel.dataset.comparisonPanel !== view; });
    document.querySelectorAll('[data-comparison-view]').forEach(button => {
      const active = button.dataset.comparisonView === view;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    $('comparison-view').value = view;
    renderCharts(); saveState();
  }
  function seasonHeads() {
    $('comparison-season-heads').innerHTML = comparison.snapshots.map((snapshot, index) => {
      const matched = state.basis === 'matched';
      const tied = matched && snapshot.leader?.tied;
      const label = matched ? tied ? 'Joint comparison leaders' : 'Comparison leader' : snapshot.leader?.championshipWon ? 'Champion' : 'Championship leader';
      const name = tied ? snapshot.marginSeries.at(-1)?.tied.map(driver => driver.name).join(', ') : snapshot.leader?.name;
      return '<div style="--comparison-color:' + colors[index] + '"><a href="' + seriesPageUrl('season', 'year', snapshot.year) + '">' + snapshot.year + '</a><p>' + esc(label) + ' · ' + esc(name || 'No results') + '</p><small>' + snapshot.state.recorded.length + ' / ' + (junior ? snapshot.fullState.expected.length : snapshot.fullState.calendar.length) + ' ' + raceUnit + ' included' +
        (matched ? ' · through R' + snapshot.cutoff : snapshot.complete ? ' · Complete season' : ' · Incomplete data') + '</small></div>';
    }).join('');
  }
  function metricTable(rows) {
    const [first, second] = comparison.snapshots;
    return '<table class="comparison-metrics"><thead><tr><th scope="col">Measure</th><th scope="col" style="color:' + colors[0] + '">' + first.year + '</th><th scope="col" style="color:' + colors[1] + '">' + second.year + '</th><th scope="col">Difference</th></tr></thead><tbody>' + rows.map(([key, label, decimals = 0, suffix = '', note = '']) => {
      const a = first.metrics[key], b = second.metrics[key], difference = a == null || b == null ? null : b - a;
      return '<tr><th scope="row">' + label + (note ? '<small>' + note + '</small>' : '') + '</th><td>' + format(a, decimals, suffix) + '</td><td>' + format(b, decimals, suffix) + '</td><td>' + (difference > 0 ? '+' : '') + format(difference, decimals, suffix === '%' ? ' pp' : suffix) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function renderMetrics() {
    $('comparison-overview').innerHTML = metricTable([
      ['races', junior ? 'Race sessions recorded' : 'Grands Prix recorded'], ['winners', 'Different winners'], ['teams', ['f3', 'academy'].includes(seriesKey) ? 'Winning teams' : 'Winning constructors'],
      ['margin', state.basis === 'matched' ? 'Lead at cutoff' : 'Championship margin', 1, ' pts'],
      ['marginPercent', 'Margin / leader’s points', 1, '%'], ['concentration', 'Top-three points share', 1, '%'],
      [junior ? 'unclassifiedRate' : 'retirementRate', junior ? 'Unclassified rate' : 'Retirement rate', 1, '%', junior ? 'Unclassified / starts · includes DSQ' : 'Recorded retirements / starts'], ['nonStarts', 'Non-starts', 0, '', 'DNS, DNQ and withdrawals'], ['disqualifications', 'Disqualifications']
    ]);
    $('comparison-competition-metrics').innerHTML = metricTable([
      ['winnerRate', 'Different winners per 10 races', 2], ['dominantShare', 'Most successful driver’s win share', 1, '%'],
      ['marginPercent', 'Margin / leader’s points', 1, '%'], ['leadChanges', 'Changes in the points lead', 0, '', 'Includes entering and leaving a tie; inferred across missing ' + (junior ? 'sessions' : 'rounds')]
    ]);
  }
  function renderFields() {
    const columns = [['position', 'Pos.'], ['name', 'Driver'], ['points', 'Points'], ...(junior
      ? [['sprint', seriesKey === 'academy' ? 'Avg. reverse' : 'Avg. sprint'], ['feature', seriesKey === 'academy' ? 'Avg. standard' : 'Avg. feature']]
      : [['finish', 'Avg. finish'], ['qualifying', 'Avg. quali.']]), ['spread', 'Spread']];
    $('comparison-field-size').value = state.field;
    $('comparison-fields').innerHTML = comparison.snapshots.map((snapshot, index) => {
      const rows = model.sortedField(snapshot, state.field, state.sort, state.direction);
      return '<section style="--comparison-color:' + colors[index] + '"><h3>' + snapshot.year + ' <small>' + rows.length + ' drivers · ' + (state.basis === 'matched' ? 'Reconstructed standings' : 'Season standings') + '</small></h3><div class="table-wrap" tabindex="0" aria-label="' + snapshot.year + ' driver field; scroll for more columns"><table><thead><tr>' + columns.map(([key, label]) => '<th scope="col" aria-sort="' + (state.sort === key ? state.direction === 1 ? 'ascending' : 'descending' : 'none') + '"><button type="button" data-field-sort="' + key + '" data-field-index="' + index + '">' + label + (state.sort === key ? state.direction === 1 ? ' ↑' : ' ↓' : ' ↕') + '</button></th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + columns.map(([key]) => '<td>' +
        (key === 'name' ? '<a href="' + seriesPageUrl('driver', 'id', row.driverId) + '">' + esc(row.name) + '</a>'
          : key === 'position' ? (row.tied ? '= ' : '') + format(row.position)
          : format(row[key], ['finish', 'qualifying', 'sprint', 'feature', 'spread'].includes(key) ? 2 : key === 'points' ? 1 : 0) +
            (['finish', 'qualifying', 'sprint', 'feature'].includes(key) ? '<small>n=' + row[key + 'Count'] + '</small>' : '')) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></section>';
    }).join('');
  }
  function renderNotes() {
    $('comparison-data-notes').innerHTML = comparison.snapshots.map(snapshot => '<p><strong>' + snapshot.year + ':</strong> ' + (junior ? snapshot.metrics.unclassified + ' unclassified results' : snapshot.metrics.retirements + ' recorded retirements') + ' / ' + snapshot.metrics.starts + ' starts. ' +
      (junior ? snapshot.state.calendar.filter(race => race.cancelled).length + ' cancelled sessions excluded within this scope. ' : '') +
      (state.basis === 'matched' ? 'Points are reconstructed at the cutoff; no official round-by-round standings are used.' : snapshot.mismatches.length ? 'Reconstructed totals differ from season standings for ' + esc(snapshot.mismatches.join(', ')) + '.' : 'No difference between reconstructed and season points totals detected.') + '</p>').join('');
    if (comparison.snapshots.some(snapshot => snapshot.mismatches.length)) $('comparison-data-notes').insertAdjacentHTML('afterbegin', '<p class="comparison-warning">Charts use reconstructed counted points; season summaries use the recorded standings. The following differences have not been silently corrected.</p>');
  }
  function chart(containerId, margin) {
    const container = $(containerId), prefix = margin ? 'comparison-margin' : 'comparison-progression';
    const rows = comparison.snapshots.map((snapshot, index) => ({ snapshot, color: colors[index], values: margin ? snapshot.marginSeries : snapshot.progress }));
    $(prefix + '-legend').innerHTML = rows.map(row => '<span style="--comparison-color:' + row.color + '">' + row.snapshot.year + (margin ? '' : ' · ' + esc(row.snapshot.leader?.name || 'No leader')) + '</span>').join('');
    const all = rows.flatMap(row => row.values.filter(value => value.available && value.value != null));
    if (!all.length) { container.innerHTML = '<p class="empty-state">No recorded points available for this comparison.</p>'; $(prefix + '-readout').innerHTML = ''; return; }
    const width = Math.max(280, container.clientWidth), small = width < 600, height = small ? 310 : 340;
    const left = 39, right = small ? 91 : 122, top = 22, bottom = 42, end = width - right;
    const x = value => left + value / 100 * (end - left), y = value => top + (1 - value / 100) * (height - top - bottom);
    let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" aria-label="' + (margin ? 'Championship lead' : 'Counted points progression') + ' by season progress">';
    svg += '<g class="chart-grid">' + [0,25,50,75,100].map(value => '<line x1="' + left + '" x2="' + end + '" y1="' + y(value) + '" y2="' + y(value) + '"/><text x="' + (left - 5) + '" y="' + (y(value) + 4) + '" text-anchor="end">' + value + '%</text><text x="' + x(value) + '" y="' + (height - 24) + '" text-anchor="middle">' + value + '%</text>').join('') + '</g>';
    svg += '<text x="' + ((left + end) / 2) + '" y="' + (height - 6) + '" text-anchor="middle">' + (state.basis === 'matched' ? 'Progress through compared ' + (junior ? 'sessions' : 'rounds') : 'Progress through scheduled calendar') + '</text>';
    const endpoints = [];
    rows.forEach((row, index) => {
      let connected = false;
      const path = row.values.map(value => {
        if (!value.available || value.value == null) { connected = false; return ''; }
        const command = connected ? 'L' : 'M'; connected = true;
        return command + x(value.x) + ',' + y(value.value);
      }).join(' ');
      const available = row.values.filter(value => value.available && value.value != null);
      svg += '<g class="chart-series" style="--series-color:' + row.color + '"><path d="' + path + '" stroke-dasharray="' + (index ? '6 4' : '') + '"/>' + available.map(value => '<circle cx="' + x(value.x) + '" cy="' + y(value.value) + '" r="3"/>').join('') + '</g>';
      if (available.length) endpoints.push({ row, value: available.at(-1), labelY: y(available.at(-1).value) });
    });
    endpoints.sort((a, b) => a.labelY - b.labelY).forEach((point, index) => { point.labelY = Math.max(top + 3, point.labelY, index ? endpoints[index - 1].labelY + 18 : 0); });
    if (endpoints.at(-1)?.labelY > height - bottom) endpoints.forEach(point => { point.labelY -= 18; });
    endpoints.forEach(({ row, value, labelY }) => { svg += '<g class="chart-endpoint"><path d="M' + x(value.x) + ',' + y(value.value) + ' L' + (end + 5) + ',' + labelY + '" stroke="#89919d" stroke-dasharray="2 3"/><text x="' + (end + 9) + '" y="' + (labelY + 4) + '">' + row.snapshot.year + ' ' + format(value.value, 1, '%') + '</text></g>'; });
    const checkpoints = [...new Set(all.map(value => value.x))].sort((a,b) => a-b);
    checkpoints.forEach((point, index) => {
      const before = index ? (x(checkpoints[index - 1]) + x(point)) / 2 : left;
      const after = index + 1 < checkpoints.length ? (x(point) + x(checkpoints[index + 1])) / 2 : x(point) + 3;
      svg += '<rect class="analysis-round-hit" data-checkpoint="' + index + '" x="' + before + '" y="' + top + '" width="' + Math.max(2, after - before) + '" height="' + (height - top - bottom) + '" tabindex="0" role="button" aria-label="Compare at ' + format(point, 1) + ' percent of ' + (state.basis === 'matched' ? 'compared ' + (junior ? 'sessions' : 'rounds') : 'calendar') + '"/>';
    });
    container.innerHTML = svg + '</svg>';
    function readout(index) {
      const progress = checkpoints[index];
      $(prefix + '-readout').innerHTML = rows.map(row => {
        const point = row.values.filter(value => value.x <= progress + .00001).at(-1);
        const last = row.values.filter(value => value.available).at(-1);
        if (!point || !point.available || point.value == null) return '<div><strong>' + row.snapshot.year + '</strong><p>No recorded points at this comparison position.</p></div>';
        const unavailable = progress > (last?.x || 0) + .00001;
        const detail = margin ? (point.tied.length > 1 ? 'Tied on points: ' + point.tied.map(driver => driver.name).join(', ') : point.leader.name + ' leads ' + (point.runnerUp?.name || 'the field') + ' by ' + format(point.gap, 1) + ' pts') : point.driver + ' · ' + format(point.points, 1) + ' counted points';
        const date = junior ? (point.race.endDate ? 'Weekend ending ' : 'Weekend of ') + fmtDate(point.race.endDate || point.race.date) : fmtDate(point.race.date);
        return '<div style="--comparison-color:' + row.color + '"><strong>' + row.snapshot.year + ' · ' + esc(point.race.analysisLabel || 'R' + point.round) + '</strong><small>' + esc(displayRaceName(point.race)) + ' · ' + esc(date) + '</small><p>' + esc(detail) + ' · ' + format(point.value, 1, '%') + '</p>' + (unavailable ? '<small>No later recorded results; showing the latest available ' + (junior ? 'session' : 'round') + '.</small>' : '') + '</div>';
      }).join('');
      container.querySelectorAll('[data-checkpoint]').forEach(hit => hit.classList.toggle('is-current', Number(hit.dataset.checkpoint) === index));
    }
    const hits = [...container.querySelectorAll('[data-checkpoint]')];
    hits.forEach((hit, index) => {
      const show = () => readout(index);
      hit.addEventListener('pointerenter', show); hit.addEventListener('focus', show); hit.addEventListener('click', show);
      hit.addEventListener('keydown', event => {
        if (['Enter',' '].includes(event.key)) { event.preventDefault(); show(); }
        if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); hits[event.key === 'Home' ? 0 : event.key === 'End' ? hits.length - 1 : Math.max(0, Math.min(hits.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))].focus(); }
      });
    });
    readout(checkpoints.length - 1);
  }
  function renderCharts() {
    if (!comparison || $('comparison-loaded').hidden) return;
    if (state.view === 'progression') chart('comparison-progression-chart', false);
    if (state.view === 'competition') chart('comparison-margin-chart', true);
  }
  function render() {
    comparison = model.compare(data, state.basis, state.round);
    state.round = comparison.cutoff;
    $('comparison-basis').value = state.basis;
    $('comparison-round-label').hidden = state.basis !== 'matched';
    $('comparison-round').innerHTML = Array.from({ length: comparison.maxRound }, (_, index) => '<option value="' + (index + 1) + '">R' + (index + 1) + '</option>').join('');
    $('comparison-round').value = String(comparison.cutoff || comparison.maxRound);
    $('comparison-round').disabled = !comparison.maxRound;
    $('comparison-scope-note').textContent = state.basis === 'matched' ? comparison.maxRound ? 'Both seasons include results through R' + comparison.cutoff + '. Points and standings are reconstructed at that cutoff.' + (junior ? ' Race counts and formats may differ.' : '') : 'No continuous run of recorded ' + (junior ? 'weekends' : 'Grands Prix') + ' is shared by these seasons.'
      : comparison.snapshots.every(snapshot => snapshot.complete) ? 'Two completed seasons. Race counts and scoring systems may differ.' : 'Includes an incomplete season. Switch to the same-' + (junior ? 'weekend' : 'round') + ' view for a like-for-like cutoff.';
    seasonHeads(); renderMetrics(); renderFields(); renderNotes();
    $('comparison-loaded').hidden = false; selectView(state.view); saveState();
  }
  async function loadComparison() {
    const current = ++requestId;
    const first = $('comparison-season-one').value, second = $('comparison-season-two').value;
    $('comparison-loaded').hidden = true; $('comparison-status').hidden = false;
    $('comparison-status').textContent = 'Comparing ' + first + ' and ' + second + '…';
    try {
      if (!first || !second || first === second) throw new Error('Choose two different seasons.');
      const response = await Promise.all([getSeason(first), getSeason(second)]);
      if (current !== requestId) return;
      data = response; state.first = first; state.second = second;
      render(); $('comparison-status').textContent = ''; $('comparison-status').hidden = true;
    } catch (error) {
      if (current !== requestId) return;
      comparison = null; $('comparison-status').textContent = error.message + ' Select a season to try again.';
    }
  }
  for (const side of ['one', 'two']) $('comparison-season-' + side).addEventListener('change', () => {
    const other = side === 'one' ? 'two' : 'one';
    if ($('comparison-season-' + side).value === $('comparison-season-' + other).value) $('comparison-season-' + other).value = side === 'one' ? state.first : state.second;
    loadComparison();
  });
  $('swap-seasons').addEventListener('click', () => {
    const first = $('comparison-season-one').value;
    $('comparison-season-one').value = $('comparison-season-two').value; $('comparison-season-two').value = first; loadComparison();
  });
  $('comparison-basis').addEventListener('change', event => { state.basis = event.target.value; state.round = null; render(); });
  $('comparison-round').addEventListener('change', event => { state.round = Number(event.target.value); render(); });
  $('comparison-field-size').addEventListener('change', event => { state.field = event.target.value; renderFields(); saveState(); });
  $('comparison-fields').addEventListener('click', event => {
    const button = event.target.closest('[data-field-sort]'); if (!button) return;
    const key = button.dataset.fieldSort, index = button.dataset.fieldIndex;
    state.direction = state.sort === key ? -state.direction : 1; state.sort = key; renderFields(); saveState();
    $('comparison-fields').querySelector('[data-field-sort="' + key + '"][data-field-index="' + index + '"]').focus();
  });
  $('comparison-view').addEventListener('change', event => selectView(event.target.value));
  const tabs = [...document.querySelectorAll('[data-comparison-view]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => selectView(button.dataset.comparisonView));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectView(tabs[target].dataset.comparisonView); tabs[target].focus();
    });
  });
  let width = 0;
  new ResizeObserver(entries => { const next = Math.round(entries[0].contentRect.width); if (next && next !== width) { width = next; renderCharts(); } }).observe($('season-analysis-workspace'));
  window.addEventListener('popstate', () => {
    const restored = model.readState(location.search);
    state = { ...restored, first: years.includes(restored.first) ? restored.first : state.first, second: years.includes(restored.second) ? restored.second : state.second };
    normalizeSort();
    $('comparison-season-one').value = state.first; $('comparison-season-two').value = state.second; loadComparison();
  });
  async function initialize() {
    try {
      const seasons = await getJSON('/api/seasons');
      years = seasons.map(season => String(season.year));
      if (years.length < 2) throw new Error('At least two seasons are needed for a comparison.');
      const defaults = [];
      if (!years.includes(state.first) || !years.includes(state.second) || state.first === state.second) {
        for (const season of seasons) {
          if (!season.champion) continue;
          const candidate = await getSeason(season.year);
          if (analysis.seasonState(candidate).complete) defaults.push(String(season.year));
          if (defaults.length === 2) break;
        }
      }
      state.first = years.includes(state.first) ? state.first : defaults[0] || years[0];
      state.second = years.includes(state.second) && state.second !== state.first ? state.second : [...defaults, ...years].find(year => year !== state.first);
      for (const [side, value] of [['one', state.first], ['two', state.second]]) {
        const select = $('comparison-season-' + side);
        select.innerHTML = years.map(year => '<option value="' + esc(year) + '">' + esc(year) + '</option>').join(''); select.value = value; select.disabled = false;
      }
      $('swap-seasons').disabled = false; await loadComparison();
    } catch (error) { $('comparison-status').textContent = error.message; }
  }
  initialize();
})();
