(() => {
  'use strict';
  const $ = id => document.getElementById(id), model = window.WecDriverFormModel;
  const initial = model.readState(location.search), validViews = ['trend', 'classes', 'crew', 'results'];
  let drivers = [], detail = null, view = initial.view, requestId = 0;
  let resultFilters = { year: '', classCode: '', status: '' };
  const display = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : fmtNumber(Number(value));
  const position = value => Number(value) > 0 ? `P${Number(value)}` : '—';
  const statusLabel = row => String(row.status || 'not classified').replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const raceUrl = row => resourceUrl('race', row.eventId, { base: '/wec', label: row.eventName });
  const driverUrl = id => `/wec/drivers/${encodeURIComponent(id)}`;
  const selected = () => detail ? model.selectedRows(detail.appearances, $('wec-form-range').value) : [];

  function saveState() {
    const url = new URL(location.href), driver = $('wec-form-driver').value;
    if (driver) url.searchParams.set('driver', driver);
    url.searchParams.set('range', $('wec-form-range').value); url.searchParams.set('window', $('wec-form-window').value); url.searchParams.set('view', view);
    history.replaceState(null, '', url);
  }
  function setStatus(message = '', error = false) { const node = $('wec-driver-form-status'); node.textContent = message; node.hidden = !message; node.classList.toggle('is-error', error); }

  function renderSummary(rows) {
    const summary = model.summary(rows);
    $('wec-driver-form-summary').innerHTML = `<div><span>Average class finish</span><strong>${summary.averageClassFinish === null ? '—' : summary.averageClassFinish.toFixed(2)}</strong><small>${summary.classified} classified result${summary.classified === 1 ? '' : 's'}</small></div><div><span>Class wins</span><strong>${display(summary.classWins)}</strong><small>${rows.length} event${rows.length === 1 ? '' : 's'} selected</small></div><div><span>Class podiums</span><strong>${display(summary.podiums)}</strong><small>Top-three finishes in class</small></div><div><span>Classified rate</span><strong>${summary.classifiedRate === null ? '—' : `${summary.classifiedRate.toFixed(1)}%`}</strong><small>${summary.classified}/${summary.starts} starts officially classified</small></div>`;
  }

  function readout(point) {
    if (!point) return '<strong>No classified result selected</strong>Missing and unclassified finishes remain gaps in the form line.';
    const row = point.row;
    return `<strong>${esc(row.year)} ${esc(row.eventName)} · ${esc(row.classCode)}</strong>${esc(row.teamName)} · class ${esc(position(row.classPosition))} · overall ${esc(position(row.overallPosition))} · ${esc(statusLabel(row))}${point.value === null ? '' : `<br>${$('wec-form-window').value === '1' ? 'Raw class result' : `${esc(point.sample)}-race rolling class finish: ${point.value.toFixed(2)}`}`}`;
  }

  function renderTrend(rows) {
    const windowSize = Number($('wec-form-window').value), points = model.rolling(rows, windowSize), width = 1100, height = 300;
    const left = 46, right = width - 24, top = 30, bottom = height - 48;
    const values = points.map(point => point.value).filter(value => value !== null), max = Math.max(3, ...values.map(Math.ceil));
    const x = index => points.length <= 1 ? (left + right) / 2 : left + index / (points.length - 1) * (right - left);
    const y = value => top + (value - 1) / Math.max(1, max - 1) * (bottom - top);
    let path = '', drawing = false;
    points.forEach((point, index) => { if (point.value === null) { drawing = false; return; } path += `${drawing ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)} `; drawing = true; });
    const grid = Array.from({ length: Math.min(max, 8) }, (_, index) => Math.round(1 + index * (max - 1) / Math.max(1, Math.min(max, 8) - 1))).filter((value, index, all) => all.indexOf(value) === index).map(value => `<line class="grid" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/><text class="position" x="${left - 10}" y="${y(value) + 3}" text-anchor="end">P${value}</text>`).join('');
    const nodes = points.map((point, index) => {
      const axisLabel = `${String(point.row.year).slice(-2)} R${point.row.round}`;
      if (point.value === null) return `<text class="label" x="${x(index)}" y="${bottom + 22}" text-anchor="middle">${esc(axisLabel)}</text>`;
      const label = points.length <= 12 || index % Math.ceil(points.length / 10) === 0 ? `<text class="label" x="${x(index)}" y="${bottom + 22}" text-anchor="middle">${esc(axisLabel)}</text>` : '';
      return `<g role="button" tabindex="0" data-wec-form-point="${index}" aria-label="${esc(`${point.row.eventName}, ${point.row.classCode} class position ${point.raw}`)}"><circle class="node" cx="${x(index)}" cy="${y(point.value)}" r="4.5"/>${label}</g>`;
    }).join('');
    $('wec-form-panel-trend').innerHTML = `<div class="section-heading"><div><h2>Recent class-position form</h2><p>Official class finishes only; lower is better and gaps remain gaps.</p></div><span>${windowSize === 1 ? 'Raw results' : `${windowSize}-race rolling average`}</span></div><div class="wec-form-chart"><svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Recent class finishing-position trend">${grid}<line class="axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/><path class="line" d="${path.trim()}"/>${nodes}</svg></div><div id="wec-form-readout" class="wec-form-readout" aria-live="polite">${readout([...points].reverse().find(point => point.value !== null) || null)}</div><p class="comparison-method">Class positions are compared within each event’s class. The line does not imply that different WEC classes had equal field size or competitiveness.</p>`;
    document.querySelectorAll('[data-wec-form-point]').forEach(node => {
      const show = () => { $('wec-form-readout').innerHTML = readout(points[Number(node.dataset.wecFormPoint)]); };
      node.addEventListener('click', show); node.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); show(); } });
    });
  }

  function renderClasses(rows) {
    const groups = model.classBreakdown(rows);
    $('wec-form-panel-classes').innerHTML = `<div class="section-heading"><div><h2>Form by class</h2><p>Every metric is calculated inside the selected race range.</p></div><span>${groups.length} class${groups.length === 1 ? '' : 'es'}</span></div>${groups.length ? `<div class="wec-form-class-grid">${groups.map(group => `<article class="wec-form-card"><span>WEC CLASS</span><h3>${esc(group.code)}</h3><dl><div><dt>Starts</dt><dd>${display(group.starts)}</dd></div><div><dt>Wins</dt><dd>${display(group.classWins)}</dd></div><div><dt>Podiums</dt><dd>${display(group.podiums)}</dd></div></dl><p>${group.averageClassFinish === null ? 'No official class finishes' : `${group.averageClassFinish.toFixed(2)} average class finish · ${group.classifiedRate.toFixed(1)}% classified`}</p></article>`).join('')}</div>` : '<div class="empty-state">No class results are available in this range.</div>'}`;
  }

  function renderCrew(rows) {
    const crew = model.crewBreakdown(detail.crew, rows);
    $('wec-form-panel-crew').innerHTML = `<div class="section-heading"><div><h2>Recent co-drivers</h2><p>Drivers listed on the same entry during the selected events.</p></div><span>${crew.length} co-driver${crew.length === 1 ? '' : 's'}</span></div>${crew.length ? `<div class="wec-form-crew-grid">${crew.map(item => `<article class="wec-form-card"><span>${esc(item.countryName || 'WEC DRIVER')}</span><h3><a href="${driverUrl(item.id)}">${esc(item.name)}</a></h3><dl><div><dt>Events</dt><dd>${display(item.startsTogether)}</dd></div><div><dt>Entries</dt><dd>${display(item.entriesTogether)}</dd></div><div><dt>Share</dt><dd>${rows.length ? `${(item.startsTogether / rows.length * 100).toFixed(0)}%` : '—'}</dd></div></dl><p>Shared entry appearances in this form window.</p></article>`).join('')}</div>` : '<div class="empty-state">No co-driver records are available in this range.</div>'}`;
  }

  function renderResults(rows) {
    const years = [...new Set(rows.map(row => String(row.year)))].sort((a, b) => Number(b) - Number(a));
    const classes = [...new Set(rows.map(row => row.classCode).filter(Boolean))].sort();
    const filtered = rows.filter(row => (!resultFilters.year || String(row.year) === resultFilters.year) && (!resultFilters.classCode || row.classCode === resultFilters.classCode) && (!resultFilters.status || model.category(row) === resultFilters.status));
    $('wec-form-panel-results').innerHTML = `<div class="section-heading"><div><h2>Selected results</h2><p>Class and overall classifications remain separate.</p></div><span>${filtered.length} of ${rows.length} events</span></div><div class="form-result-filters wec-form-result-filters"><label>Season<select id="wec-form-filter-year"><option value="">All seasons</option>${years.map(year => `<option value="${year}"${resultFilters.year === year ? ' selected' : ''}>${year}</option>`).join('')}</select></label><label>Class<select id="wec-form-filter-class"><option value="">All classes</option>${classes.map(code => `<option value="${esc(code)}"${resultFilters.classCode === code ? ' selected' : ''}>${esc(code)}</option>`).join('')}</select></label><label>Status<select id="wec-form-filter-status"><option value="">All statuses</option>${[['classified','Classified'],['retired','Retired'],['nonstarter','Did not start'],['unclassified','Not classified'],['disqualified','Disqualified']].map(([value,label]) => `<option value="${value}"${resultFilters.status === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="table-wrap" tabindex="0" aria-label="WEC driver results"><table class="form-results-table wec-form-results-table"><thead><tr><th>Event</th><th>Entry</th><th>Class</th><th>Class finish</th><th>Overall</th><th>Status</th><th>Laps</th></tr></thead><tbody>${filtered.map(row => `<tr><td><a href="${raceUrl(row)}">${esc(row.eventName)}</a><small>${esc(row.year)} · R${esc(row.round)}</small></td><td>#${esc(row.carNumber)} ${esc(row.teamName)}<small>${esc(row.manufacturerName)} · ${esc(row.carModelName)}</small></td><td>${esc(row.classCode)}</td><td>${esc(position(row.classPosition))}</td><td>${esc(position(row.overallPosition))}</td><td><span class="wec-form-status wec-form-status-${model.category(row)}">${esc(statusLabel(row))}</span></td><td>${esc(row.laps ?? '—')}</td></tr>`).join('') || '<tr><td colspan="7">No results match these filters.</td></tr>'}</tbody></table></div>`;
    [['wec-form-filter-year','year'],['wec-form-filter-class','classCode'],['wec-form-filter-status','status']].forEach(([id,key]) => $(id).addEventListener('change', event => { resultFilters[key] = event.target.value; renderResults(rows); }));
  }

  function renderAll() {
    const rows = selected(), driver = detail.entity, years = rows.map(row => Number(row.year)).filter(Boolean), latest = rows[0];
    renderSummary(rows); renderTrend(rows); renderClasses(rows); renderCrew(rows); renderResults(rows);
    $('wec-form-title').textContent = driver.name; $('wec-form-meta').textContent = `${latest?.teamName || 'Team unavailable'}${years.length ? ` · ${Math.min(...years)}–${Math.max(...years)}` : ''} · World Endurance Championship`;
    document.title = `${driver.name} form · WEC · Racelytic`; $('wec-driver-form-workspace').hidden = false; setStatus(`${driver.name} · ${rows.length} of ${detail.appearances.length} available events shown`); selectView(view); saveState();
  }

  function selectView(next, focus = false) {
    view = validViews.includes(next) ? next : 'trend';
    document.querySelectorAll('[data-wec-form-panel]').forEach(panel => { panel.hidden = panel.dataset.wecFormPanel !== view; });
    document.querySelectorAll('[data-wec-form-view]').forEach(button => { const active = button.dataset.wecFormView === view; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
    $('wec-form-view').value = view; saveState();
  }
  async function loadDriver() {
    const id = $('wec-form-driver').value, current = ++requestId; if (!id) return;
    setStatus('Loading driver form…'); $('wec-driver-form-workspace').hidden = true;
    try { const data = await getJSON(`/api/wec/entities/drivers/${encodeURIComponent(id)}`); if (current !== requestId) return; detail = data; resultFilters = { year: '', classCode: '', status: '' }; renderAll(); }
    catch (error) { if (current === requestId) setStatus(`Unable to load driver form: ${error.message}`, true); }
  }

  $('wec-form-driver').addEventListener('change', loadDriver);
  $('wec-form-range').addEventListener('change', () => { resultFilters = { year: '', classCode: '', status: '' }; renderAll(); });
  $('wec-form-window').addEventListener('change', () => { renderTrend(selected()); saveState(); });
  $('wec-form-view').addEventListener('change', event => selectView(event.target.value));
  const tabs = [...document.querySelectorAll('[data-wec-form-view]')];
  tabs.forEach((button, index) => { button.addEventListener('click', () => selectView(button.dataset.wecFormView)); button.addEventListener('keydown', event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectView(tabs[target].dataset.wecFormView, true); }); });

  Promise.resolve(getJSON('/api/wec/drivers')).then(response => {
    drivers = response.sort((a, b) => Number(b.lastYear || 0) - Number(a.lastYear || 0) || Number(b.starts) - Number(a.starts) || a.name.localeCompare(b.name));
    $('wec-form-driver').innerHTML = drivers.map(driver => `<option value="${esc(driver.id)}">${esc(driver.name)}</option>`).join('');
    const chosen = drivers.find(driver => String(driver.id) === initial.driver) || drivers[0];
    $('wec-form-driver').value = chosen?.id || ''; $('wec-form-range').value = initial.range; $('wec-form-window').value = String(initial.window); $('wec-form-driver').disabled = !drivers.length;
    if (chosen) loadDriver(); else setStatus('No WEC drivers are available.', true);
  }).catch(error => setStatus(`Unable to load WEC drivers: ${error.message}`, true));
})();
