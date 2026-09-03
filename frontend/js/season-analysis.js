(() => {
  'use strict';
  const model = SeasonAnalysisModel;
  const seriesKey = activeSeriesKey();
  const junior = seriesKey !== 'f1';
  const seriesQuery = junior ? '?series=' + seriesKey : '';
  const driverBase = junior ? '/' + seriesKey + '/driver?id=' : '/driver?id=';
  const $ = id => document.getElementById(id);
  const initial = model.readState(location.search);
  let data, state, styles, selected = new Set(), view = initial.view, scoring = initial.scoring;
  let requestId = 0, sortKey = 'averageFinish', sortDirection = 1;
  const fallbackColors = ['#e32636', '#2764d8', '#16a36a', '#8b5cf6', '#e56b22'];
  const empty = text => '<div class="empty-state">' + esc(text) + '</div>';
  const number = value => value == null ? '—' : fmtNumber(value);
  const raceName = race => displayRaceName(race);
  const roundLabel = race => race.analysisLabel || 'R' + race.round;
  function saveState() {
    if (!data) return;
    const url = new URL(location.href);
    url.searchParams.set('year', data.year);
    url.searchParams.set('view', view);
    url.searchParams.set('scoring', scoring);
    url.searchParams.set('drivers', [...selected].join(','));
    history.replaceState(null, '', url);
  }
  function selectView(next) {
    view = next;
    document.querySelectorAll('[data-season-visual]').forEach(panel => { panel.hidden = panel.dataset.seasonVisual !== view; });
    document.querySelectorAll('[data-season-visual-button]').forEach(button => {
      const active = button.dataset.seasonVisualButton === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $('analysis-view').value = view;
    updateScoringVisibility();
    if (data) renderCharts();
    saveState();
  }
  function seriesRows(mode = scoring) {
    return model.series(data, mode).map((driver, index) => ({ ...driver,
      color: styles.get(String(driver.driverId))?.color || fallbackColors[index % fallbackColors.length],
      dash: styles.get(String(driver.driverId))?.dash || '' }));
  }
  function scoringNote() {
    const rules = junior ? {} : model.rulesFor(Number(data.year));
    const rule = rules.countOnlySegments
      ? 'Best ' + rules.bestFirstRounds + ' results from the first ' + rules.firstRoundsWindow + ' rounds, plus best ' + rules.bestLastRounds + ' from the next ' + rules.lastRoundsWindow + '.'
      : Number.isFinite(rules.countBest) ? 'Only the best ' + rules.countBest + ' round scores count.' : junior ? 'All recorded session points and bonuses count.' : 'All recorded race and sprint points count.';
    const mismatches = seriesRows('counted').filter(driver => driver.points != null && Math.abs((driver.values.at(-1)?.points || 0) - Number(driver.points)) > 0.01);
    $('analysis-scoring-note').textContent = scoring === 'scored'
      ? 'All points earned, including scores dropped under historical rules. This may differ from the championship standings.'
      : rule + ' Reconstructed from recorded results.' + (mismatches.length ? ' Totals differ from official standings for ' + mismatches.map(driver => driver.name).join(', ') + '; penalties, adjustments or missing data are not inferred.' : '');
    if (junior && mismatches.length) {
      $('analysis-scoring-note').innerHTML = '<details><summary>Data notes · ' + mismatches.length + ' driver' + (mismatches.length === 1 ? '' : 's') + ' with different session and standings totals</summary><p>' + esc(rule) + ' Session totals differ from season standings for ' + esc(mismatches.map(driver => driver.name).join(', ')) + '. Adjustments and missing points are not inferred.</p></details>';
    }
    $('analysis-scoring-note').classList.toggle('has-warning', scoring === 'counted' && mismatches.length > 0);
    updateScoringVisibility();
  }
  function updateScoringVisibility() {
    const relevant = Boolean(data && model.hasDroppedScores(data.year, seriesKey));
    $('analysis-scoring').closest('label').hidden = !relevant;
    // Keep genuine data discrepancies visible even when there is no scoring choice.
    $('analysis-scoring-controls').hidden = !['progression', 'margin'].includes(view) ||
      (!relevant && !$('analysis-scoring-note').classList.contains('has-warning'));
  }
  function renderSummary() {
    const driver = data.driverChampionship.find(row => row.championshipWon) || data.driverChampionship[0];
    const runner = data.driverChampionship.find(row => row.driverId !== driver?.driverId);
    const team = data.constructorChampionship.find(row => row.championshipWon) || data.constructorChampionship[0];
    const hasTitle = Boolean(driver?.championshipWon);
    const item = (label, value, note) => '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(note) + '</small></div>';
    $('season-analysis-summary').innerHTML =
      item(hasTitle ? 'Champion' : 'Championship leader', driver?.name || '—', number(driver?.points) + ' championship points') +
      item(state.complete ? 'Final margin' : 'Current lead', driver && runner ? number(Number(driver.points) - Number(runner.points)) + ' pts' : '—', runner ? 'over ' + runner.name : 'No runner-up recorded') +
      item(team?.championshipWon ? junior ? 'Teams’ champion' : 'Constructors’ champion' : junior ? 'Leading team' : 'Leading constructor', team?.name || 'Not awarded', team ? number(team.points) + ' points' : 'No team standings') +
      item(junior ? 'Race sessions recorded' : 'Rounds recorded', state.recorded.length + ' / ' + state.expected.length,
        junior ? (state.complete ? 'Season complete' : 'Recorded session results') + (state.calendar.some(race => race.cancelled) ? ' · ' + state.calendar.filter(race => race.cancelled).length + ' cancelled' : '') +
          (state.calendar.some(race => race.placeholder) ? ' · Schedule incomplete' : '') : state.complete ? 'Season complete' : 'Grand Prix results available');
    $('analysis-status').textContent = '';
    $('analysis-status').hidden = true;
  }
  function renderPicker() {
    $('progression-legend').innerHTML = seriesRows().map(driver =>
      '<button type="button" class="progression-driver' + (selected.has(String(driver.driverId)) ? ' active' : '') +
      '" data-driver="' + esc(driver.driverId) + '" aria-pressed="' + selected.has(String(driver.driverId)) +
      '" data-search="' + esc((driver.name + ' ' + (driver.abbreviation || '')).toLowerCase()) +
      '"><i style="--driver-color:' + driver.color + '"></i>' + esc(driver.name) + '</button>').join('');
    filterDrivers();
    updateSelection();
  }
  function updateSelection() {
    $('selection-count').textContent = selected.size + ' drivers selected';
    $('driver-picker-count').textContent = '(' + selected.size + ')';
  }
  function filterDrivers() {
    const query = $('driver-search').value.trim().toLowerCase();
    document.querySelectorAll('[data-driver]').forEach(button => { button.hidden = !button.dataset.search.includes(query); });
  }
  function preset(value) {
    const rows = data.driverChampionship;
    let ids;
    if (value === 'clear') ids = [];
    else if (value === 'all') ids = model.driversFor(data);
    else if (value === 'five') ids = rows.slice(0, 5);
    else {
      // A transparent navigation preset, not a claim of mathematical title eligibility.
      ids = rows.filter((driver, index) => index < 2 || (Number(rows[0]?.points) > 0 && Number(driver.points) >= Number(rows[0].points) * 0.8));
    }
    selected = new Set(ids.map(driver => String(driver.driverId)));
    $('driver-picker').setAttribute('data-preset-note', value === 'contenders' ? 'Top two plus drivers within 20% of the leader’s recorded points.' : '');
    renderPicker(); renderCharts(); saveState();
  }
  function drawChart(container, rows, margin = false) {
    const rounds = rows[0]?.values || [];
    if (!rounds.length) { container.innerHTML = empty(junior ? 'No recorded race sessions to plot.' : 'No recorded rounds to plot.'); $(margin ? 'lead-readout' : 'round-readout').innerHTML = ''; return; }
    const width = Math.max(300, Math.round(container.clientWidth || $('season-analysis-workspace').clientWidth));
    const small = width < 600, left = 40, right = small ? 84 : 175;
    const height = Math.max(small ? 300 : 320, rows.length * 18 + 70), top = 20, bottom = 38;
    const plotRight = width - right, plotBottom = height - bottom;
    const max = Math.max(1, ...rows.flatMap(row => row.values.filter(value => value.available).map(value => value.points)));
    const x = index => left + index / Math.max(1, rounds.length - 1) * (plotRight - left);
    const y = points => top + (1 - points / max) * (plotBottom - top);
    let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" aria-label="' + (margin ? 'Lead' : 'Points') + (junior ? ' by race session' : ' by round') + '">';
    svg += '<g class="chart-grid">' + Array.from({ length: 5 }, (_, index) => {
      const value = max * index / 4;
      return '<line x1="' + left + '" x2="' + plotRight + '" y1="' + y(value) + '" y2="' + y(value) + '"/><text x="' + (left - 7) + '" y="' + (y(value) + 4) + '" text-anchor="end">' + number(Math.round(value * 10) / 10) + '</text>';
    }).join('') + '</g>';
    const endpoints = rows.map(row => ({ row, value: row.values.at(-1), labelY: y(row.values.at(-1).points) })).sort((a, b) => a.labelY - b.labelY);
    endpoints.forEach((point, index) => { point.labelY = Math.max(point.labelY, index ? endpoints[index - 1].labelY + 17 : top + 4); });
    if (endpoints.at(-1)?.labelY > plotBottom) {
      const shift = endpoints.at(-1).labelY - plotBottom;
      endpoints.forEach(point => { point.labelY -= shift; });
    }
    rows.forEach(row => {
      let previous = false;
      const path = row.values.map((value, index) => {
        if (!value.available) { previous = false; return ''; }
        const command = previous ? 'L' : 'M'; previous = true;
        return command + x(index) + ',' + y(value.points);
      }).join(' ');
      svg += '<g class="chart-series" style="--series-color:' + row.color + '"><path d="' + path + '" stroke-dasharray="' + row.dash + '"/>' +
        row.values.map((value, index) => value.available ? '<circle cx="' + x(index) + '" cy="' + y(value.points) + '" r="3"/>' : '').join('') + '</g>';
    });
    endpoints.forEach(({ row, value, labelY }) => {
      const name = margin ? 'Lead' : small ? (row.abbreviation || row.name.split(' ').at(-1).slice(0, 5)) : row.name;
      svg += '<g class="chart-endpoint"><path d="M' + plotRight + ',' + y(value.points) + ' L' + (plotRight + 8) + ',' + labelY + '" stroke="' + row.color + '"/><text x="' + (plotRight + 12) + '" y="' + (labelY + 4) + '">' + esc(name) + ' ' + number(value.points) + '</text></g>';
    });
    rounds.forEach((round, index) => {
      if (index === 0 || index === rounds.length - 1 || index % Math.ceil(rounds.length / (small ? 4 : 9)) === 0)
        svg += '<text class="chart-round-label" x="' + x(index) + '" y="' + (height - 12) + '" text-anchor="middle">' + esc(roundLabel(round.race)) + '</text>';
      if (!round.available) return;
      const before = index ? (x(index - 1) + x(index)) / 2 : left;
      const after = index < rounds.length - 1 ? (x(index) + x(index + 1)) / 2 : plotRight;
      svg += '<rect class="analysis-round-hit" data-round-index="' + index + '" x="' + (rounds.length === 1 ? left : before) + '" y="' + top + '" width="' + Math.max(1, rounds.length === 1 ? plotRight - left : after - before) + '" height="' + (plotBottom - top) + '" tabindex="0" role="button" aria-label="' + esc(roundLabel(round.race)) + ': ' + esc(raceName(round.race)) + '"><title>' + esc(raceName(round.race)) + '</title></rect>';
    });
    container.innerHTML = svg + '</svg>';
    const readout = index => {
      const round = rounds[index], target = $(margin ? 'lead-readout' : 'round-readout');
      let content = '<strong>' + esc(roundLabel(round.race)) + ' · ' + esc(raceName(round.race)) + '</strong><span>' + esc(fmtDate(round.race.date)) + (junior ? ' · Weekend' : '') + '</span>';
      if (margin) {
        const entry = model.leaders(seriesRows())[index];
        content += '<p>' + esc(leadDescription(entry)) + '</p>';
      } else content += '<ul>' + [...rows].sort((a, b) => b.values[index].points - a.values[index].points).map(row =>
        '<li><i style="background:' + row.color + '"></i><span>' + esc(row.name) + '</span><b>' + number(row.values[index].points) + ' pts</b></li>').join('') + '</ul>';
      target.innerHTML = content;
      container.querySelectorAll('[data-round-index]').forEach(hit => hit.classList.toggle('is-current', Number(hit.dataset.roundIndex) === index));
    };
    container.querySelectorAll('[data-round-index]').forEach(hit => {
      const show = () => readout(Number(hit.dataset.roundIndex));
      hit.addEventListener('pointerenter', show); hit.addEventListener('focus', show); hit.addEventListener('click', show);
      hit.addEventListener('keydown', event => {
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); show(); }
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const hits = [...container.querySelectorAll('[data-round-index]')], index = hits.indexOf(hit);
          hits[event.key === 'Home' ? 0 : event.key === 'End' ? hits.length - 1 : Math.max(0, Math.min(hits.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))].focus();
        }
      });
    });
    readout(rounds.length - 1);
  }
  function leadDescription(entry) {
    if (entry.tied.length > 1) return 'Tied on points: ' + entry.tied.map(driver => driver.name).join(', ') + '.';
    return entry.leader.name + ' leads' + (entry.runnerUp ? ' ' + entry.runnerUp.name + ' by ' + number(entry.gap) + ' pts.' : '.');
  }
  function renderCharts() {
    if (!data) return;
    if (view === 'progression') {
      const rows = seriesRows().filter(driver => selected.has(String(driver.driverId)));
      if (rows.length) drawChart($('season-progression-chart'), rows);
      else { $('season-progression-chart').innerHTML = empty('Select drivers or choose a preset to begin.'); $('round-readout').innerHTML = ''; }
    }
    if (view === 'margin') {
      const entries = model.leaders(seriesRows());
      drawChart($('winning-margin-chart'), entries.length ? [{ name: 'Lead', color: activeSeriesAccent(), dash: '', values: entries.map(entry => ({ ...entry, points: entry.gap })) }] : [], true);
      let lastKey;
      $('lead-changes').innerHTML = entries.filter(entry => {
        if (!entry.available || entry.leaderKey === lastKey) return false;
        lastKey = entry.leaderKey; return true;
      }).map(entry => '<li><strong>' + esc(roundLabel(entry.race)) + ' · ' + esc(raceName(entry.race)) + '</strong><span>' + esc(leadDescription(entry)) + '</span></li>').join('') || '<li>No recorded lead changes.</li>';
    }
  }
  function renderDistribution() {
    const rows = seriesRows().filter(driver => Number(driver.points) > 0).sort((a, b) => Number(b.points) - Number(a.points));
    const total = rows.reduce((sum, driver) => sum + Number(driver.points), 0);
    $('points-distribution-chart').innerHTML = rows.length ? '<ol class="analysis-share-bars">' + rows.map(driver =>
      '<li><span>' + esc(driver.name) + '</span><div class="analysis-share-track" aria-hidden="true"><i style="width:' + Number(driver.points) / total * 100 + '%;background:' + driver.color + '"></i></div><strong>' + number(driver.points) + ' pts <small>' + (Number(driver.points) / total * 100).toFixed(1) + '%</small></strong></li>').join('') + '</ol>' : empty('No championship points recorded.');
  }
  function renderHeatmap() {
    const rows = model.driversFor(data);
    const columns = state.calendar;
    const labels = { upcoming: 'Upcoming', missing: 'No data', cancelled: 'Cancelled', 'sprint-only': 'GP pending' };
    $('heatmap-readout').textContent = 'Select a result for details.';
    $('results-heatmap').innerHTML = '<table class="analysis-results-table"><caption>All ' + rows.length + ' drivers · ' + data.year + '</caption><thead><tr><th scope="col">Driver</th>' +
      columns.map(race => '<th scope="col"><span>' + esc(roundLabel(race)) + '</span><small>' + esc(raceName(race)) + '</small></th>').join('') + '</tr></thead><tbody>' +
      rows.map(driver => '<tr><th scope="row"><a href="' + driverBase + encodeURIComponent(driver.driverId) + '">' + esc(driver.name) + '</a></th>' +
        columns.map(race => {
          const result = driver.raceResults?.[race.round], status = state.roundStatus(race);
          const recorded = model.raceRecorded(result);
          const label = status !== 'recorded' ? labels[status] : recorded ? String(result.positionText || result.position) : '—';
          const detail = driver.name + ' · ' + roundLabel(race) + ' · ' + raceName(race) + ' · ' + fmtDate(race.date) + (junior ? ' (weekend)' : '') + ': ' +
            (status !== 'recorded' ? labels[status] : recorded ? 'Result ' + label + ' · ' + number(result.points) + ' race pts' : 'Did not participate') +
            (result && Number(result.sprintPoints) ? ' · ' + number(result.sprintPoints) + ' sprint pts' : '');
          return '<td><button type="button" class="heatmap-cell ' + (status === 'recorded' ? model.heatClass(result) : status) + '" data-result-detail="' + esc(detail) + '" aria-label="' + esc(detail) + '">' + esc(label) + '</button></td>';
        }).join('') + '</tr>').join('') + '</tbody></table><div class="heatmap-key"><span class="winner">Win</span><span class="podium">Podium</span><span class="points">Points awarded</span><span class="finish">Classified</span><span class="retired">Unclassified / did not start</span><span class="disqualified">Disqualified</span><span>— Did not participate</span><span>' + (junior ? 'Upcoming / no data / cancelled' : 'Upcoming / no data / GP pending') + '</span></div>';
    $('results-heatmap').querySelectorAll('[data-result-detail]').forEach(button => {
      const show = () => { $('heatmap-readout').textContent = button.dataset.resultDetail; };
      button.addEventListener('focus', show); button.addEventListener('click', show); button.addEventListener('pointerenter', show);
    });
  }
  function renderAverages() {
    const columns = junior
      ? [['name', 'Driver'], ['averageFinish', 'Avg. finish'], ['sprintAverage', seriesKey === 'academy' ? 'Avg. reverse-grid' : 'Avg. sprint'], ['featureAverage', seriesKey === 'academy' ? 'Avg. standard race' : 'Avg. feature'], ['spread', 'Finish spread'], ['finishes', 'Race sample'], ['unclassifiedRate', 'Unclassified rate'], ['position', state.complete ? 'Final standing' : 'Standing']]
      : [['name', 'Driver'], ['averageFinish', 'Avg. finish'], ['averageQualifying', 'Avg. qualifying'], ['spread', 'Finish spread'], ['finishes', 'Race sample'], ['qualifyingCount', 'Qual. sample'], ['retirementRate', 'Retirement rate'], ['position', state.complete ? 'Final standing' : 'Standing']];
    const rows = model.driversFor(data).map(junior ? model.juniorAverages : model.averages).sort((a, b) => {
      if (a[sortKey] == null) return b[sortKey] == null ? 0 : 1;
      if (b[sortKey] == null) return -1;
      return sortDirection * (typeof a[sortKey] === 'string' ? a[sortKey].localeCompare(b[sortKey]) : a[sortKey] - b[sortKey]);
    });
    $('average-position-table').innerHTML = '<table class="average-position-table"><thead><tr>' + columns.map(([key, label]) =>
      '<th scope="col" aria-sort="' + (sortKey === key ? sortDirection === 1 ? 'ascending' : 'descending' : 'none') + '"><button type="button" data-sort="' + key + '">' + label + (sortKey === key ? sortDirection === 1 ? ' ↑' : ' ↓' : ' ↕') + '</button></th>').join('') + '</tr></thead><tbody>' + rows.map(driver =>
      '<tr>' + columns.map(([key]) => '<td>' + (key === 'name' ? '<a href="' + driverBase + encodeURIComponent(driver.driverId) + '">' + esc(driver.name) + '</a>'
        : key === 'position' ? esc(driver.positionText || (driver.position > 0 ? 'P' + driver.position : '—'))
        : ['finishes', 'qualifyingCount'].includes(key) ? driver[key]
        : driver[key] == null ? '—' : driver[key].toFixed(key.endsWith('Rate') ? 1 : 2) +
          (key.endsWith('Rate') ? '% <small>(' + (key === 'unclassifiedRate' ? driver.unclassified : driver.retirements) + '/' + driver.starts + ' starts)</small>'
            : key === 'sprintAverage' ? '<small>' + driver.sprintCount + ' results</small>' : key === 'featureAverage' ? '<small>' + driver.featureCount + ' results</small>' : '')) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  async function loadSeason(year, drivers = null) {
    const current = ++requestId;
    data = null;
    $('season-analysis-workspace').hidden = true;
    $('season-analysis-summary').innerHTML = '';
    $('analysis-status').textContent = 'Loading ' + year + ' season…';
    $('analysis-status').hidden = false;
    try {
      const response = await getJSON('/api/seasons/' + encodeURIComponent(year) + seriesQuery);
      if (current !== requestId) return;
      data = junior ? model.adaptJunior(response, seriesKey) : response; state = model.seasonState(data); styles = assignDriverTeamStyles(model.driversFor(data));
      if (!model.hasDroppedScores(data.year, seriesKey)) scoring = 'counted';
      $('analysis-scoring').value = scoring;
      const valid = new Set(model.driversFor(data).map(driver => String(driver.driverId)));
      selected = new Set(drivers == null ? data.driverChampionship.slice(0, 5).map(driver => String(driver.driverId)) : drivers.filter(id => valid.has(id)));
      $('driver-search').value = '';
      $('driver-picker').removeAttribute('data-preset-note');
      renderSummary(); renderPicker(); renderDistribution(); renderHeatmap(); renderAverages(); scoringNote();
      $('season-analysis-workspace').hidden = false;
      selectView(view);
    } catch (error) {
      if (current !== requestId) return;
      data = null;
      $('analysis-status').hidden = false;
      $('analysis-status').textContent = 'Unable to load ' + year + ': ' + error.message;
    }
  }
  $('analysis-season').addEventListener('change', event => loadSeason(event.target.value));
  $('analysis-view').addEventListener('change', event => selectView(event.target.value));
  $('analysis-scoring').value = scoring;
  $('analysis-scoring').addEventListener('change', event => { scoring = event.target.value; scoringNote(); renderCharts(); saveState(); });
  $('driver-search').addEventListener('input', filterDrivers);
  $('progression-legend').addEventListener('click', event => {
    const button = event.target.closest('[data-driver]'); if (!button) return;
    const id = button.dataset.driver;
    $('driver-picker').removeAttribute('data-preset-note');
    selected.has(id) ? selected.delete(id) : selected.add(id);
    button.classList.toggle('active', selected.has(id)); button.setAttribute('aria-pressed', String(selected.has(id)));
    updateSelection(); renderCharts(); saveState();
  });
  document.querySelectorAll('[data-preset]').forEach(button => {
    if (button.dataset.preset === 'contenders') button.title = 'Top two plus drivers within 20% of the leader’s recorded points.';
    button.addEventListener('click', () => preset(button.dataset.preset));
  });
  const tabs = [...document.querySelectorAll('[data-season-visual-button]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => selectView(button.dataset.seasonVisualButton));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectView(tabs[target].dataset.seasonVisualButton); tabs[target].focus();
    });
  });
  $('average-position-table').addEventListener('click', event => {
    const button = event.target.closest('[data-sort]'); if (!button) return;
    sortDirection = sortKey === button.dataset.sort ? -sortDirection : 1; sortKey = button.dataset.sort;
    renderAverages(); $('average-position-table').querySelector('[data-sort="' + sortKey + '"]').focus();
  });
  window.addEventListener('popstate', () => {
    const restored = model.readState(location.search);
    view = restored.view; scoring = restored.scoring; $('analysis-scoring').value = scoring;
    const select = $('analysis-season');
    if ([...select.options].some(option => option.value === restored.year)) select.value = restored.year;
    loadSeason(select.value, restored.drivers);
  });
  let previousWidth = 0;
  new ResizeObserver(entries => {
    const width = Math.round(entries[0].contentRect.width);
    if (width && width !== previousWidth) { previousWidth = width; renderCharts(); }
  }).observe($('season-analysis-workspace'));
  getJSON('/api/seasons' + seriesQuery).then(seasons => {
    const select = $('analysis-season');
    select.innerHTML = seasons.map(season => '<option value="' + esc(season.year) + '">' + esc(season.year) + '</option>').join('');
    select.disabled = false;
    if (seasons.some(season => String(season.year) === initial.year)) select.value = initial.year;
    if (select.value) loadSeason(select.value, initial.drivers);
    else $('analysis-status').textContent = 'No seasons available.';
  }).catch(error => { $('analysis-status').textContent = 'Unable to load seasons: ' + error.message; });
})();
