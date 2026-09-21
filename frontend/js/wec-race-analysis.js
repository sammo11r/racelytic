(() => {
  'use strict';
  const $ = id => document.getElementById(id), model = window.WecRaceAnalysisModel;
  const initial = model.readState(location.search), validViews = ['flow', 'results', 'points', 'distance'];
  let events = [], data = null, activeClass = initial.classCode, view = initial.view, sortKey = initial.sort, sortDirection = initial.direction, requestId = 0;
  let selected = new Set(), focusedEntry = null, selectionInitialized = false;
  const number = value => value === null || value === undefined ? '—' : fmtNumber(value);
  const crewNames = entry => (entry?.crew || []).map(driver => driver.name).join(' · ');
  const entryName = entry => `#${entry.carNumber} ${entry.team?.name || ''}`;
  const entityPath = (type, id) => `/wec/${type}/${encodeURIComponent(id)}`;
  const statusText = value => String(value || 'Not classified').replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const classToken = code => String(code || '').toLowerCase();
  const positionChangeText = change => change === null ? '—' : `${change > 0 ? '+' : ''}${change}`;
  const currentRows = () => model.rowsFor(data, activeClass);

  function saveState() {
    if (!data) return;
    const url = new URL(location.href);
    url.searchParams.set('year', $('wec-race-analysis-year').value); url.searchParams.set('race', $('wec-race-analysis-race').value);
    url.searchParams.set('class', activeClass); url.searchParams.set('view', view); url.searchParams.set('entries', [...selected].join(','));
    url.searchParams.set('sort', sortKey); url.searchParams.set('direction', sortDirection === -1 ? 'desc' : 'asc');
    history.replaceState(null, '', url);
  }

  function setView(next, focus = false) {
    view = validViews.includes(next) ? next : 'flow';
    document.querySelectorAll('[data-wec-race-panel]').forEach(panel => { panel.hidden = panel.dataset.wecRacePanel !== view; });
    document.querySelectorAll('[data-wec-race-view]').forEach(button => {
      const active = button.dataset.wecRaceView === view;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    $('wec-race-analysis-view').value = view;
    if (view === 'flow' && data) renderFlow();
    saveState();
  }

  function renderHeader() {
    const event = data.event;
    $('wec-race-analysis-title').textContent = event.name;
    $('wec-race-analysis-meta').textContent = [`Round ${event.round}`, event.circuitName, event.placeName, fmtDate(event.date)].filter(Boolean).join(' · ');
    document.title = `${event.name} analysis · WEC · Racelytic`;
  }

  function renderClassSelector() {
    const codes = model.groupsFor(data).map(group => group.code);
    if (activeClass !== 'overall' && !codes.includes(activeClass)) activeClass = 'overall';
    $('wec-race-analysis-class').innerHTML = `<option value="overall">Overall field</option>${codes.map(code => `<option value="${esc(code)}">${esc(code)}</option>`).join('')}`;
    $('wec-race-analysis-class').value = activeClass; $('wec-race-analysis-class').disabled = false;
  }

  function summaryCard(label, value, note, highlight = false) { return `<div${highlight ? ' class="highlight"' : ''}><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`; }
  function renderSummary() {
    const summary = model.summary(data, activeClass), winner = summary.winner;
    const biggest = summary.rows.map(entry => ({ entry, change: model.positionChange(entry) })).filter(item => item.change !== null).sort((a, b) => b.change - a.change)[0];
    const retired = summary.rows.filter(entry => String(entry.status).toLowerCase() === 'retired').length;
    const nonStarters = summary.rows.filter(model.nonStarter).length;
    $('wec-race-analysis-summary').innerHTML =
      summaryCard('Winner', winner ? entryName(winner) : '—', winner ? crewNames(winner) : 'No winner recorded', true) +
      summaryCard('Biggest class mover', biggest ? entryName(biggest.entry) : '—', biggest ? `${positionChangeText(biggest.change)} net positions` : 'Qualifying unavailable') +
      summaryCard('Starters', number(summary.starters), `${summary.classCount} classes`) + summaryCard('Classified', number(summary.classified), `${number(summary.attrition)} other result${summary.attrition === 1 ? '' : 's'}`) +
      summaryCard('Retirements', number(retired), 'Official race status') + summaryCard('Non-starters', number(nonStarters), 'DNS or withdrawal');
  }

  function validSelectionRows() { return currentRows().filter(entry => model.positionChange(entry) !== null); }
  function setPreset(preset) {
    const rows = validSelectionRows();
    const chosen = preset === 'all' ? rows : preset === 'points' ? rows.filter(entry => Number(entry.points) > 0) : rows.filter(entry => Number(entry.classPosition) <= 10);
    selected = new Set(chosen.map(entry => String(entry.entryId)));
    if (!selected.has(focusedEntry)) focusedEntry = null;
    renderEntryPicker(); renderFlow(); saveState();
  }
  function updateSelectionCount() {
    const text = `${selected.size} entr${selected.size === 1 ? 'y' : 'ies'} selected`;
    $('wec-race-selection-count').textContent = text; $('wec-race-entry-picker-count').textContent = `(${selected.size})`;
  }
  function renderEntryPicker() {
    const query = $('wec-race-entry-search').value.trim().toLowerCase();
    const rows = validSelectionRows().filter(entry => !query || `${entryName(entry)} ${entry.manufacturer?.name || ''} ${entry.carModel?.name || ''}`.toLowerCase().includes(query));
    $('wec-race-entry-list').innerHTML = rows.map(entry => {
      const id = String(entry.entryId);
      return `<button type="button" data-wec-flow-entry="${esc(id)}" aria-pressed="${selected.has(id)}" data-class-code="${esc(classToken(entry.class.code))}"><i></i>#${esc(entry.carNumber)} ${esc(entry.team.name)}</button>`;
    }).join(''); updateSelectionCount();
  }

  function flowReadout(entry) {
    if (!entry) { $('wec-race-flow-readout').innerHTML = ''; return; }
    const change = model.positionChange(entry);
    $('wec-race-flow-readout').innerHTML = `<strong>${esc(entryName(entry))} · ${esc(entry.class.code)}</strong><span>Qualifying P${esc(entry.qualifyingPosition ?? '—')} → class P${esc(entry.classPosition ?? '—')} · ${change === null ? 'net change unavailable' : `${positionChangeText(change)} net positions`} · overall P${esc(entry.overallPosition ?? '—')} · ${number(entry.points)} pts</span>`;
  }
  function flowGroup(group) {
    const rows = group.entries.filter(entry => selected.has(String(entry.entryId)) && model.positionChange(entry) !== null);
    if (!rows.length) return '';
    const width = Math.max(320, Math.round($('wec-race-flow-chart').clientWidth || 900)), compact = width < 560, left = compact ? 92 : 180, right = width - left;
    const fieldSize = Math.max(group.entries.length, ...rows.flatMap(entry => [Number(entry.qualifyingPosition), Number(entry.classPosition)]));
    const rowHeight = compact ? 24 : 27, top = 42, height = top + fieldSize * rowHeight + 12, y = position => top + (Number(position) - 1) * rowHeight;
    const paths = rows.map(entry => {
      const id = String(entry.entryId), current = focusedEntry === id ? ' is-current' : '';
      const label = compact ? `#${entry.carNumber}` : `#${entry.carNumber} ${entry.team.name}`;
      return `<g data-wec-flow-line="${esc(id)}" tabindex="0" role="button" aria-label="${esc(`${entryName(entry)}, qualifying P${entry.qualifyingPosition} to class P${entry.classPosition}`)}"><path class="race-flow-line${current}" data-class-code="${esc(classToken(entry.class.code))}" d="M${left} ${y(entry.qualifyingPosition)} C${width / 2} ${y(entry.qualifyingPosition)},${width / 2} ${y(entry.classPosition)},${right} ${y(entry.classPosition)}"/><circle class="flow-node" data-class-code="${esc(classToken(entry.class.code))}" cx="${left}" cy="${y(entry.qualifyingPosition)}" r="4"/><circle class="flow-node" data-class-code="${esc(classToken(entry.class.code))}" cx="${right}" cy="${y(entry.classPosition)}" r="4"/><text class="wec-flow-label left" x="${left - 10}" y="${y(entry.qualifyingPosition) + 4}" text-anchor="end">${esc(label)}</text><text class="wec-flow-label right" x="${right + 10}" y="${y(entry.classPosition) + 4}">P${esc(entry.classPosition)}</text></g>`;
    }).join('');
    return `<section class="wec-flow-group"><header><h3>${esc(group.code)}</h3><span>${rows.length} selected</span></header><svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(group.code)} qualifying to finish chart"><text class="flow-heading" x="${left}" y="18" text-anchor="middle">QUALIFYING</text><text class="flow-heading" x="${right}" y="18" text-anchor="middle">CLASS FINISH</text><line class="flow-axis" x1="${left}" x2="${left}" y1="28" y2="${height - 8}"/><line class="flow-axis" x1="${right}" x2="${right}" y1="28" y2="${height - 8}"/>${paths}</svg></section>`;
  }
  function renderFlow() {
    if (!data) return;
    updateSelectionCount();
    $('wec-race-flow-chart').innerHTML = model.groupsFor(data, activeClass).map(flowGroup).filter(Boolean).join('') || '<div class="empty-state">Select entries with recorded qualifying and race positions to begin.</div>';
    flowReadout(currentRows().find(entry => String(entry.entryId) === focusedEntry) || null);
  }

  function sortButton(key, label) {
    const active = sortKey === key, arrow = active ? (sortDirection === 1 ? ' ↑' : ' ↓') : '';
    const action = active ? `sorted ${sortDirection === 1 ? 'ascending' : 'descending'}; reverse sort` : `sort by ${label.toLowerCase()}`;
    return `<button type="button" data-wec-race-sort="${key}" aria-label="${esc(`${label}, ${action}`)}">${label}${arrow}</button>`;
  }
  function renderResults() {
    const query = $('wec-race-result-search').value.trim().toLowerCase();
    const rows = model.sortedRows(data, activeClass, sortKey, sortDirection).filter(entry => !query || `${entryName(entry)} ${entry.manufacturer?.name || ''} ${entry.carModel?.name || ''} ${crewNames(entry)}`.toLowerCase().includes(query));
    $('wec-race-result-table').innerHTML = rows.length ? `<table class="race-analysis-table wec-race-analysis-table"><thead><tr><th>${sortButton('overallPosition', 'Overall')}</th><th>${sortButton('classPosition', 'Class')}</th><th>${sortButton('entry', 'Entry')}</th><th>Drivers</th><th>${sortButton('qualifyingPosition', 'Qual.')}</th><th>${sortButton('laps', 'Laps')}</th><th>Time / gap</th><th>${sortButton('bestLapMillis', 'Best lap')}</th><th>Status</th><th>${sortButton('points', 'Points')}</th></tr></thead><tbody>${rows.map(entry => `<tr data-class-code="${esc(classToken(entry.class.code))}">
      <td data-label="Overall"><strong>${esc(entry.overallPosition ?? '—')}</strong></td><td data-label="Class"><span class="wec-class-position">${esc(entry.class.code)} · P${esc(entry.classPosition ?? '—')}</span></td><td data-label="Entry"><div class="wec-analysis-entry"><b>#${esc(entry.carNumber)}</b><span><a href="${entityPath('entries', entry.competitorId)}">${esc(entry.team.name)}</a><small>${esc(entry.manufacturer.name)} · ${esc(entry.carModel.name)}</small></span></div></td>
      <td data-label="Drivers"><div class="wec-table-crew">${entry.crew.map(driver => `<a href="${entityPath('drivers', driver.id)}">${esc(driver.name)}</a>`).join('')}</div></td><td data-label="Qualifying">${esc(entry.qualifyingPosition ?? '—')}</td><td data-label="Laps">${esc(entry.laps ?? '—')}</td><td data-label="Time / gap">${esc(entry.gap || entry.time || '—')}</td><td data-label="Best lap">${esc(entry.bestLap || '—')}</td><td data-label="Status"><span class="wec-analysis-status status-${esc(entry.status)}">${esc(statusText(entry.status))}</span></td><td data-label="Points">${esc(entry.points ?? '—')}</td>
    </tr>`).join('')}</tbody></table>` : '<div class="empty-state">No entries match this filter.</div>';
  }

  function chartGroup(group, type) {
    const points = type === 'points';
    const rows = points ? group.entries.filter(entry => Number(entry.points) > 0).sort((a, b) => Number(b.points) - Number(a.points)) : group.entries;
    if (!rows.length) return `<section class="wec-analysis-chart-group"><header><h3>${esc(group.code)}</h3><span>${esc(group.name)}</span></header><div class="empty-state">No ${points ? 'points' : 'race distance'} recorded for this class.</div></section>`;
    const maxPoints = Math.max(1, ...rows.map(entry => Number(entry.points) || 0));
    return `<section class="wec-analysis-chart-group" data-class-code="${esc(classToken(group.code))}"><header><h3>${esc(group.code)}</h3><span>${esc(group.name)}</span></header><div>${rows.map(entry => {
      const value = points ? (Number(entry.points) || 0) / maxPoints * 100 : group.leaderLaps ? (Number(entry.laps) || 0) / group.leaderLaps * 100 : 0;
      const deficit = group.leaderLaps - (Number(entry.laps) || 0);
      const detail = points ? `${number(entry.points)} pts` : (deficit ? `${deficit} lap${deficit === 1 ? '' : 's'} behind` : 'Full class distance');
      return `<article class="wec-analysis-bar-row"><div class="wec-analysis-bar-label"><b>#${esc(entry.carNumber)}</b><span><strong>${esc(entry.team.name)}</strong><small>${points ? `Class P${esc(entry.classPosition ?? '—')}` : `${esc(entry.laps ?? 0)} laps · ${esc(statusText(entry.status))}`}</small></span></div><div class="wec-analysis-bar-track"><i style="width:${Math.max(0, Math.min(100, value)).toFixed(2)}%"></i></div><strong>${esc(detail)}</strong></article>`;
    }).join('')}</div></section>`;
  }
  function renderCharts() {
    const groups = model.groupsFor(data, activeClass);
    $('wec-race-points-chart').innerHTML = groups.map(group => chartGroup(group, 'points')).join('');
    $('wec-race-distance-chart').innerHTML = groups.map(group => chartGroup(group, 'distance')).join('');
  }

  function initialiseSelection() {
    const valid = validSelectionRows().map(entry => String(entry.entryId));
    const defaults = valid.filter(id => currentRows().find(entry => String(entry.entryId) === id && Number(entry.classPosition) <= 10));
    if (!selectionInitialized) {
      const requested = initial.entries?.filter(id => valid.includes(String(id))) || [];
      selected = new Set(requested.length ? requested : defaults); selectionInitialized = true;
    } else {
      const retained = [...selected].filter(id => valid.includes(id)); selected = new Set(retained.length ? retained : defaults);
    }
  }
  function renderAll() {
    renderHeader(); renderClassSelector(); initialiseSelection(); renderSummary(); renderEntryPicker(); renderFlow(); renderResults(); renderCharts();
    $('wec-race-analysis-workspace').hidden = false; $('wec-race-analysis-status').hidden = true; setView(view); saveState();
  }
  async function loadRace() {
    const eventId = $('wec-race-analysis-race').value, current = ++requestId;
    if (!eventId) return;
    $('wec-race-analysis-status').hidden = false; $('wec-race-analysis-status').textContent = 'Loading race analysis…'; $('wec-race-analysis-workspace').hidden = true;
    try {
      const raceData = await getJSON(`/api/wec/events/${encodeURIComponent(eventId)}`);
      const qualifyingSessions = raceData.sessions.filter(session => ['qualifying', 'hyperpole'].includes(String(session.type).toLowerCase()));
      const sessionData = await Promise.all(qualifyingSessions.map(session => getJSON(`/api/wec/events/${encodeURIComponent(eventId)}?session=${encodeURIComponent(session.id)}`).catch(() => ({ classification: [] }))));
      if (current !== requestId) return;
      data = model.withQualifying(raceData, sessionData.map(item => item.classification || []));
      selectionInitialized = false; focusedEntry = null; renderAll();
    } catch { if (current === requestId) $('wec-race-analysis-status').textContent = 'This race analysis could not be loaded.'; }
  }
  function populateRaces(requestedRace) {
    const year = Number($('wec-race-analysis-year').value), choices = events.filter(event => Number(event.year) === year);
    $('wec-race-analysis-race').innerHTML = choices.map(event => `<option value="${esc(event.id)}">R${esc(event.round)} · ${esc(event.name)}</option>`).join('');
    const chosen = choices.find(event => String(event.id) === String(requestedRace)) || choices[0]; if (chosen) $('wec-race-analysis-race').value = chosen.id;
    $('wec-race-analysis-race').disabled = !choices.length;
  }
  async function initialise() {
    try {
      const all = await getJSON('/api/wec/events');
      events = all.filter(event => event.winner).sort((a, b) => Number(b.year) - Number(a.year) || Number(b.round) - Number(a.round));
      const years = [...new Set(events.map(event => Number(event.year)))];
      $('wec-race-analysis-year').innerHTML = years.map(year => `<option value="${year}">${year}</option>`).join('');
      $('wec-race-analysis-year').value = years.includes(Number(initial.year)) ? Number(initial.year) : years[0]; $('wec-race-analysis-year').disabled = false;
      populateRaces(initial.race); await loadRace();
    } catch { $('wec-race-analysis-status').textContent = 'WEC race analysis is unavailable right now.'; }
  }

  $('wec-race-analysis-year').addEventListener('change', () => { activeClass = 'overall'; populateRaces(); loadRace(); });
  $('wec-race-analysis-race').addEventListener('change', () => { activeClass = 'overall'; loadRace(); });
  $('wec-race-analysis-class').addEventListener('change', event => { activeClass = event.target.value; focusedEntry = null; initialiseSelection(); renderSummary(); renderEntryPicker(); renderFlow(); renderResults(); renderCharts(); saveState(); });
  $('wec-race-analysis-view').addEventListener('change', event => setView(event.target.value));
  $('wec-race-result-search').addEventListener('input', renderResults); $('wec-race-entry-search').addEventListener('input', renderEntryPicker);
  document.querySelectorAll('[data-wec-race-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.wecRaceView, true)));
  document.querySelectorAll('[data-wec-race-preset]').forEach(button => button.addEventListener('click', () => setPreset(button.dataset.wecRacePreset)));
  document.addEventListener('click', event => {
    const sort = event.target.closest('[data-wec-race-sort]');
    if (sort) { const key = sort.dataset.wecRaceSort; if (sortKey === key) sortDirection *= -1; else { sortKey = key; sortDirection = 1; } renderResults(); saveState(); return; }
    const picker = event.target.closest('[data-wec-flow-entry]');
    if (picker) { const id = picker.dataset.wecFlowEntry; if (selected.has(id)) { if (selected.size > 1) selected.delete(id); } else selected.add(id); if (!selected.has(focusedEntry)) focusedEntry = null; renderEntryPicker(); renderFlow(); saveState(); return; }
    const line = event.target.closest('[data-wec-flow-line]'); if (line) { focusedEntry = line.dataset.wecFlowLine; renderFlow(); }
  });
  document.addEventListener('keydown', event => { const line = event.target.closest('[data-wec-flow-line]'); if (line && ['Enter', ' '].includes(event.key)) { event.preventDefault(); focusedEntry = line.dataset.wecFlowLine; renderFlow(); } });
  window.addEventListener('resize', () => { if (view === 'flow' && data) renderFlow(); });
  initialise();
})();
