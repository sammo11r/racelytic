(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const junior = location.pathname.startsWith('/f2/') || location.pathname.startsWith('/f3/') || location.pathname.startsWith('/academy/');
  const series = location.pathname.startsWith('/academy/') ? 'academy' : location.pathname.startsWith('/f3/') ? 'f3' : location.pathname.startsWith('/f2/') ? 'f2' : 'f1';
  const validViews = ['flow', 'matrix', 'contribution', 'attrition'];
  const params = new URLSearchParams(location.search);
  const initial = {
    year: params.get('year'), race: params.get('race'),
    view: validViews.includes(params.get('view')) ? params.get('view') : 'flow',
    mode: params.get('mode') === 'weekend' ? 'weekend' : 'race',
    drivers: params.has('drivers') ? params.get('drivers').split(',').filter(Boolean) : null
  };
  let races = [], activeData = null, activeResults = [], styles = new Map(), selected = new Set();
  let view = initial.view, flowMode = initial.mode, focusedDriver = null, selectionInitialized = false;
  let populationId = 0, requestId = 0, sortKey = 'classification', sortDirection = 1;
  const details = new Map();

  function normalizeJunior(data, selectedSessionId) {
    if (!Array.isArray(data?.sessions)) return data;
    const raceSessions = data.sessions.filter(session => session.isRace && !session.cancelled && session.results?.length);
    const raceSession = raceSessions.find(session => String(session.id) === String(selectedSessionId)) || raceSessions[raceSessions.length - 1];
    const gridSessions = data.sessions.filter(session => /grid/i.test(session.name) && session.results?.length);
    const selectedGrid = [...gridSessions].reverse().find(session => Number(session.sessionNumber) < Number(raceSession?.sessionNumber));
    const featureGrid = gridSessions[gridSessions.length - 1];
    const qualifyingSessions = data.sessions.filter(session => /qualif/i.test(session.name));
    const qualifying = new Map();
    (raceSession?.results || []).forEach(result => { if (Number(result.qualificationPositionNumber) > 0) qualifying.set(String(result.driverId), Number(result.qualificationPositionNumber)); });
    if (!qualifying.size && qualifyingSessions.length === 1) {
      (qualifyingSessions[0].results || []).forEach(result => { const position = Number(result.positionNumber); if (position > 0 && position < 100) qualifying.set(String(result.driverId), position); });
    } else if (!qualifying.size) {
      const classified = new Set(qualifyingSessions.flatMap(session => session.results || []).filter(result => Number(result.positionNumber) > 0 && Number(result.positionNumber) < 100).map(result => String(result.driverId)));
      (featureGrid?.results || []).forEach(result => { if (classified.has(String(result.driverId))) qualifying.set(String(result.driverId), Number(result.positionNumber)); });
    }
    const grid = new Map((raceSession?.results || []).filter(result => Number(result.gridPositionNumber) > 0).map(result => [String(result.driverId), Number(result.gridPositionNumber)]));
    if (!grid.size) (selectedGrid?.results || []).forEach(result => grid.set(String(result.driverId), Number(result.positionNumber)));
    const results = (raceSession?.results || []).map(result => ({ ...result,
      positionText: result.positionNumber || result.status,
      qualificationPositionNumber: qualifying.get(String(result.driverId)) || null,
      gridPositionNumber: grid.get(String(result.driverId)) || null,
      reasonRetired: /ret|dnf|dns|dnq|dq|dsq|disq|exc|wd|nc/i.test(String(result.status || '')) ? result.status : null,
      gap: result.gapMillis ? `${(Number(result.gapMillis) / 1000).toFixed(3)}` : null
    }));
    return { race: { ...data.race, officialName: `${data.race.name} · ${raceSession?.displayName || raceSession?.name || 'Race'}`, analysisSessionName: raceSession?.displayName || raceSession?.name || 'Race', laps: Math.max(0, ...results.map(result => Number(result.laps || 0))), gridNote: raceSession?.gridNote || null }, sessions: { race: results } };
  }

  function category(result, raceLaps = activeData?.race?.laps) {
    const code = String(result.positionText || '').trim().toUpperCase();
    if (/^(DNS|DNQ|DNPQ|WD|DNE)$/.test(code)) return 'non-starter';
    if (/^(DSQ|DQ|DISQ|EXC)$/.test(code)) return 'disqualified';
    if (code === 'NC') return 'unclassified';
    if (/^(DNF|RET|R)$/.test(code)) return 'retired';
    if (Number(result.positionNumber) > 0) return 'classified';
    if (result.reasonRetired && Number(result.laps) < Number(raceLaps)) return 'retired';
    return 'unclassified';
  }

  function statusLabel(result) {
    const type = category(result);
    if (type === 'classified') return 'Classified';
    if (type === 'retired') return result.reasonRetired ? `Retired · ${result.reasonRetired}` : 'Retired';
    if (type === 'non-starter') return 'Did not start';
    if (type === 'disqualified') return 'Disqualified';
    return 'Unclassified';
  }

  function classificationLabel(result) {
    return category(result) === 'classified' ? `P${result.positionNumber}` : String(result.positionText || statusLabel(result));
  }

  function classificationRank(result) {
    const typeRank = { classified: 0, unclassified: 1, retired: 2, 'non-starter': 3, disqualified: 4 }[category(result)];
    return typeRank * 1000 + (category(result) === 'classified' ? Number(result.positionNumber) : 100 - Number(result.laps || 0));
  }

  function positionChange(result) {
    const grid = Number(result.gridPositionNumber), finish = Number(result.positionNumber);
    return grid > 0 && finish > 0 ? grid - finish : null;
  }

  function positionChangeText(change) { return change == null ? '—' : `${change > 0 ? '+' : ''}${change}`; }
  function entityUrl(type, id) {
    const page = type === 'team' ? (['f3', 'academy'].includes(series) ? 'team' : 'constructor') : 'driver';
    return `${series === 'f1' ? '' : `/${series}`}/${page}?id=${encodeURIComponent(id)}`;
  }
  function driverShortName(name) { const parts = String(name || '').replace(/\s+(Jr\.?|Sr\.?)$/i, '').split(/\s+/); return parts[parts.length - 1] || name; }
  function recordedRace(race) { return junior ? race.raceSessionCount === undefined || Number(race.raceSessionCount) > 0 : Boolean(race.winnerDriverId || race.winnerName || race.winnerConstructorId || race.winnerConstructorName); }

  function saveState() {
    if (!activeData) return;
    const url = new URL(location.href);
    url.searchParams.set('year', $('race-analysis-year').value);
    url.searchParams.set('race', $('race-analysis-race').value);
    url.searchParams.set('view', view);
    url.searchParams.set('mode', flowMode);
    url.searchParams.set('drivers', [...selected].join(','));
    history.replaceState(null, '', url);
  }

  function selectView(next, focus = false) {
    view = validViews.includes(next) ? next : 'flow';
    document.querySelectorAll('[data-race-visual]').forEach(panel => { panel.hidden = panel.dataset.raceVisual !== view; });
    document.querySelectorAll('[data-race-visual-button]').forEach(button => {
      const active = button.dataset.raceVisualButton === view;
      button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    $('race-analysis-view').value = view;
    if (view === 'flow' && activeData) renderFlow();
    saveState();
  }

  function renderHeader() {
    const race = activeData.race;
    $('race-analysis-title').textContent = displayRaceName(race);
    const bits = [race.circuitName, fmtDate(race.date), race.round ? `Round ${race.round}` : '', race.analysisSessionName]
      .map(value => String(value || '').trim()).filter(Boolean);
    $('race-analysis-meta').textContent = bits.join(' · ');
    document.title = `${displayRaceName(race)} analysis · ${activeSeriesName()} · Racelytic`;
  }

  function renderSummary() {
    const results = activeResults;
    const counts = { classified: 0, unclassified: 0, retired: 0, 'non-starter': 0, disqualified: 0 };
    results.forEach(result => { counts[category(result)] += 1; });
    const starters = results.length - counts['non-starter'];
    const winner = results.find(result => Number(result.positionNumber) === 1) || results[0];
    const biggest = results.map(result => ({ ...result, gained: positionChange(result) })).filter(result => result.gained != null).sort((a, b) => b.gained - a.gained)[0];
    const card = (label, value, note) => `<div><span>${label}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
    $('race-analysis-summary').innerHTML =
      card('Winner', winner?.driverName || '—', winner?.constructorName || '') +
      card('Biggest mover', biggest?.driverName || '—', biggest ? `${positionChangeText(biggest.gained)} net positions` : 'Movement unavailable') +
      card('Starters', starters, `${results.length} entries`) + card('Retirements', counts.retired, 'Started but did not finish') +
      card('Non-starters', counts['non-starter'], 'DNS, DNQ or withdrawal') + card('Unclassified', counts.unclassified, 'Recorded separately') +
      card('Disqualified', counts.disqualified, 'Recorded separately');
  }

  function renderDriverPicker() {
    const query = $('race-driver-search').value.trim().toLowerCase();
    $('race-driver-list').innerHTML = activeResults.filter(result => !query || `${result.driverName} ${result.driverId}`.toLowerCase().includes(query)).map(result => {
      const id = String(result.driverId), style = styles.get(id);
      return `<button type="button" data-race-driver="${esc(id)}" aria-pressed="${selected.has(id)}" style="--driver-color:${style?.color || '#777'}"><i></i>${esc(result.driverName)}</button>`;
    }).join('');
    updateSelectionCount();
  }

  function updateSelectionCount() {
    const text = `${selected.size} driver${selected.size === 1 ? '' : 's'} selected`;
    $('race-selection-count').textContent = text; $('race-driver-picker-count').textContent = `(${selected.size})`;
  }

  function setPreset(preset) {
    if (preset === 'ten') selected = new Set(activeResults.filter(result => Number(result.positionNumber) > 0 && Number(result.positionNumber) <= 10).map(result => String(result.driverId)));
    if (preset === 'points') selected = new Set(activeResults.filter(result => Number(result.points) > 0).map(result => String(result.driverId)));
    if (preset === 'all') selected = new Set(activeResults.map(result => String(result.driverId)));
    if (!selected.has(focusedDriver)) focusedDriver = null;
    renderDriverPicker(); renderFlow(); saveState();
  }

  function flowReadout(result) {
    if (!result) { $('race-flow-readout').innerHTML = ''; return; }
    const change = positionChange(result);
    $('race-flow-readout').innerHTML = `<strong>${esc(result.driverName)} · ${esc(result.constructorName || '')}</strong><span>Qualifying ${result.qualificationPositionNumber ? `P${result.qualificationPositionNumber}` : '—'} · Grid ${result.gridPositionNumber ? `P${result.gridPositionNumber}` : '—'} → ${esc(classificationLabel(result))} · ${change == null ? 'net change unavailable' : `${positionChangeText(change)} net positions`} · ${fmtNumber(result.points)} pts</span>`;
  }

  function renderFlow() {
    if (!activeData) return;
    const container = $('race-flow-chart');
    const shown = activeResults.filter(result => selected.has(String(result.driverId)));
    updateSelectionCount();
    if (!shown.length) { container.innerHTML = '<div class="empty-state">Select drivers or choose a preset to begin.</div>'; flowReadout(null); return; }
    const width = Math.max(320, Math.round(container.clientWidth || 900));
    const compact = width < 560, top = 46, row = compact ? 25 : 29, fieldSize = Math.max(activeResults.length, 20), height = top + 24 + fieldSize * row;
    const finishOrder = [...activeResults].sort((a, b) => classificationRank(a) - classificationRank(b));
    const finishPosition = new Map(finishOrder.map((result, index) => [String(result.driverId), index + 1]));
    const y = value => Number(value) > 0 ? top + (Number(value) - 1) * row : null;
    const columns = flowMode === 'weekend' ? [compact ? 66 : 170, width / 2, width - (compact ? 66 : 170)] : [compact ? 92 : 190, width - (compact ? 92 : 190)];
    const headings = (flowMode === 'weekend' ? ['QUALIFYING', 'GRID', 'FINISH'] : ['GRID', 'FINISH']).map((label, index) => `<text class="flow-heading" x="${columns[index]}" y="18" text-anchor="middle">${label}</text><line class="flow-axis" x1="${columns[index]}" x2="${columns[index]}" y1="30" y2="${height - 12}"/>`).join('');
    const items = shown.map(result => {
      const id = String(result.driverId), style = styles.get(id), finishY = y(finishPosition.get(id)), gridY = y(result.gridPositionNumber), qualY = y(result.qualificationPositionNumber);
      const current = focusedDriver === id ? ' is-current' : '', dash = style?.dash ? ` stroke-dasharray="${style.dash}"` : '', segments = [];
      if (flowMode === 'weekend') {
        if (qualY != null && gridY != null) segments.push(`<path class="race-flow-line${current}" style="--flow-color:${style?.color || '#777'}"${dash} d="M${columns[0]} ${qualY} C${(columns[0] + columns[1]) / 2} ${qualY},${(columns[0] + columns[1]) / 2} ${gridY},${columns[1]} ${gridY}"/>`);
        if (gridY != null && finishY != null) segments.push(`<path class="race-flow-line${current}" style="--flow-color:${style?.color || '#777'}"${dash} d="M${columns[1]} ${gridY} C${(columns[1] + columns[2]) / 2} ${gridY},${(columns[1] + columns[2]) / 2} ${finishY},${columns[2]} ${finishY}"/>`);
        const nodes = [[columns[0], qualY], [columns[1], gridY], [columns[2], finishY]].filter(([, cy]) => cy != null).map(([cx, cy]) => `<circle class="flow-node" style="--flow-color:${style?.color || '#777'}" cx="${cx}" cy="${cy}" r="3.5"/>`).join('');
        const labelY = qualY ?? gridY ?? finishY;
        return `<g tabindex="0" role="button" aria-label="${esc(result.driverName)}: qualifying ${result.qualificationPositionNumber || 'unavailable'}, grid ${result.gridPositionNumber || 'unavailable'}, ${esc(classificationLabel(result))}" data-driver-flow="${esc(id)}">${segments.join('')}${nodes}<text x="${columns[0] - 7}" y="${labelY + 4}" text-anchor="end">${result.qualificationPositionNumber ? `P${result.qualificationPositionNumber}` : '—'} ${esc(driverShortName(result.driverName))}</text><text x="${columns[2] + 7}" y="${finishY + 4}">${esc(driverShortName(result.driverName))} ${esc(classificationLabel(result))}</text></g>`;
      }
      if (gridY != null && finishY != null) segments.push(`<path class="race-flow-line${current}" style="--flow-color:${style?.color || '#777'}"${dash} d="M${columns[0]} ${gridY} C${width / 2} ${gridY},${width / 2} ${finishY},${columns[1]} ${finishY}"/>`);
      return `<g tabindex="0" role="button" aria-label="${esc(result.driverName)}: grid ${result.gridPositionNumber || 'unavailable'}, ${esc(classificationLabel(result))}" data-driver-flow="${esc(id)}">${segments.join('')}<text x="${columns[0] - 7}" y="${(gridY ?? finishY) + 4}" text-anchor="end">${result.gridPositionNumber ? `P${result.gridPositionNumber}` : '—'} ${esc(driverShortName(result.driverName))}</text><text x="${columns[1] + 7}" y="${finishY + 4}">${esc(driverShortName(result.driverName))} ${esc(classificationLabel(result))}</text></g>`;
    }).join('');
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${flowMode === 'weekend' ? 'Qualifying, grid and finish positions' : 'Starting grid to race classification'}">${headings}<g class="flow-labels">${items}</g></svg>`;
    container.querySelectorAll('[data-driver-flow]').forEach(element => {
      const activate = () => { focusedDriver = element.dataset.driverFlow; renderFlow(); saveState(); };
      element.addEventListener('click', activate); element.addEventListener('focus', () => { focusedDriver = element.dataset.driverFlow; element.classList.add('is-current'); flowReadout(activeResults.find(result => String(result.driverId) === focusedDriver)); });
    });
    const readoutResult = activeResults.find(result => String(result.driverId) === focusedDriver) || shown[0];
    flowReadout(readoutResult);
  }

  function resultSortValue(result, key) {
    if (key === 'classification') return classificationRank(result);
    if (key === 'driver') return result.driverName || '';
    if (key === 'team') return result.constructorName || '';
    if (key === 'status') return statusLabel(result);
    if (key === 'change') return positionChange(result);
    if (key === 'timing') return result.time || result.gap || '';
    return Number(result[key]);
  }

  function renderResults() {
    const query = $('race-result-search').value.trim().toLowerCase(), team = $('race-team-filter').value;
    const filtered = activeResults.filter(result => (!query || String(result.driverName).toLowerCase().includes(query)) && (!team || String(result.constructorId) === team));
    const rows = [...filtered].sort((a, b) => {
      const av = resultSortValue(a, sortKey), bv = resultSortValue(b, sortKey);
      const aMissing = av == null || (typeof av === 'number' && Number.isNaN(av)) || av === '';
      const bMissing = bv == null || (typeof bv === 'number' && Number.isNaN(bv)) || bv === '';
      if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * sortDirection;
    });
    const columns = [['classification', 'Finish'], ['driver', 'Driver'], ['team', junior ? 'Team' : 'Constructor'], ['qualificationPositionNumber', 'Qual.'], ['gridPositionNumber', 'Grid'], ['change', 'Change'], ['laps', 'Laps'], ['status', 'Status'], ['timing', 'Time / gap'], ['points', 'Points']];
    const head = columns.map(([key, label]) => `<th scope="col" aria-sort="${sortKey === key ? sortDirection === 1 ? 'ascending' : 'descending' : 'none'}"><button type="button" data-race-sort="${key}">${label}${sortKey === key ? sortDirection === 1 ? ' ↑' : ' ↓' : ' ↕'}</button></th>`).join('');
    const body = rows.map(result => {
      const gained = positionChange(result), type = category(result), timing = result.time || result.gap || '—';
      return `<tr><td><span class="finish-position${Number(result.positionNumber) <= 3 ? ' podium' : ''}">${esc(result.positionText || result.positionNumber || '—')}</span></td><td><a href="${entityUrl('driver', result.driverId)}">${esc(result.driverName)}</a>${result.fastestLap ? '<small>Fastest lap</small>' : ''}</td><td>${esc(result.constructorName || '—')}</td><td>${result.qualificationPositionNumber ?? '—'}</td><td>${result.gridPositionNumber ?? '—'}${result.polePosition ? '<small>Pole</small>' : ''}</td><td><span class="position-change ${gained == null ? 'unavailable' : gained > 0 ? 'up' : gained < 0 ? 'down' : 'same'}">${positionChangeText(gained)}</span></td><td>${result.laps ?? '—'}</td><td><span class="result-status status-${type}">${esc(statusLabel(result))}</span></td><td>${esc(timing)}</td><td class="result-points-total">${fmtNumber(result.points)}</td></tr>`;
    }).join('');
    $('race-result-matrix').innerHTML = rows.length ? `<table class="race-analysis-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` : '<div class="empty-state">No results match these filters.</div>';
    $('race-result-matrix').querySelectorAll('[data-race-sort]').forEach(button => button.addEventListener('click', () => { const next = button.dataset.raceSort; if (sortKey === next) sortDirection *= -1; else { sortKey = next; sortDirection = 1; } renderResults(); }));
  }

  function renderContribution() {
    const teams = new Map();
    activeResults.forEach(result => { if (!teams.has(result.constructorId)) teams.set(result.constructorId, { id: result.constructorId, name: result.constructorName, drivers: [], points: 0 }); const team = teams.get(result.constructorId); team.drivers.push(result); team.points += Number(result.points || 0); });
    const ordered = [...teams.values()].sort((a, b) => b.points - a.points), maximum = Math.max(...ordered.map(team => team.points), 1);
    $('constructor-contribution-chart').innerHTML = `<div class="contribution-chart">${ordered.map(team => `<div class="contribution-row"><a href="${entityUrl('team', team.id)}">${esc(team.name)}</a><div class="contribution-track">${team.drivers.map(driver => `<span title="${esc(driver.driverName)}: ${fmtNumber(driver.points)} points" style="width:${Number(driver.points) / maximum * 100}%;background:${baseConstructorColor(team.id)}"></span>`).join('')}</div><div class="contribution-drivers">${team.drivers.map(driver => `${esc(driverShortName(driver.driverName))} <b>${fmtNumber(driver.points)}</b>`).join(' · ')}</div><strong>${fmtNumber(team.points)}</strong></div>`).join('')}</div>`;
  }

  function renderAttrition() {
    const maximum = Math.max(Number(activeData.race.laps), ...activeResults.map(result => Number(result.laps || 0)), 1);
    const ordered = [...activeResults].sort((a, b) => Number(b.laps) - Number(a.laps));
    $('attrition-chart').innerHTML = `<div class="attrition-chart">${ordered.map(result => { const type = category(result); return `<div class="attrition-row"><a href="${entityUrl('driver', result.driverId)}">${esc(result.driverName)}</a><div class="attrition-track"><span class="${type === 'retired' ? 'retired' : ''}" style="width:${Number(result.laps || 0) / maximum * 100}%"></span></div><strong class="status-${type}">${fmtNumber(result.laps || 0)} laps · ${esc(statusLabel(result))}</strong></div>`; }).join('')}</div>`;
  }

  function renderAll() {
    renderHeader(); renderSummary(); renderDriverPicker(); renderFlow(); renderResults(); renderContribution(); renderAttrition();
    $('race-grid-note').textContent = activeData.race.gridNote || 'Net position change; this is not an overtake count.';
    $('race-analysis-workspace').hidden = false; $('race-analysis-status').hidden = true; selectView(view); saveState();
  }

  async function loadRace() {
    const selection = $('race-analysis-race').value; if (!selection) return;
    const current = ++requestId, [id, sessionId] = junior ? selection.split('::') : [selection, null];
    $('race-analysis-status').hidden = false; $('race-analysis-status').textContent = 'Loading race analysis…'; $('race-analysis-workspace').hidden = true; $('race-analysis-summary').innerHTML = '';
    try {
      const raw = details.get(String(id)) || await getJSON(`/api/races/${encodeURIComponent(id)}`);
      if (current !== requestId) return;
      details.set(String(id), raw); activeData = normalizeJunior(raw, sessionId); activeResults = activeData.sessions?.race || []; styles = assignDriverTeamStyles(activeResults.map(result => ({ driverId: result.driverId, raceResults: { 1: { constructorId: result.constructorId } } })));
      const valid = new Set(activeResults.map(result => String(result.driverId)));
      if (!selectionInitialized) {
        const requested = initial.drivers == null ? null : initial.drivers.filter(idValue => valid.has(idValue));
        selected = new Set(requested == null || requested.length === 0 ? valid : requested);
        selectionInitialized = true;
      } else {
        const previousCount = selected.size, retained = [...selected].filter(idValue => valid.has(idValue));
        selected = new Set(previousCount > 0 && retained.length === 0 ? valid : retained);
      }
      focusedDriver = selected.has(focusedDriver) ? focusedDriver : null;
      $('race-driver-search').value = ''; $('race-result-search').value = '';
      const teamOptions = [...new Map(activeResults.map(result => [String(result.constructorId), result.constructorName])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
      $('race-team-filter').innerHTML = '<option value="">All teams</option>' + teamOptions.map(([idValue, name]) => `<option value="${esc(idValue)}">${esc(name)}</option>`).join('');
      renderAll();
    } catch (error) {
      if (current !== requestId) return;
      activeData = null; activeResults = []; $('race-analysis-status').hidden = false; $('race-analysis-status').textContent = `Unable to load race: ${error.message}`;
    }
  }

  async function populateRaces(preferredRace = null) {
    const current = ++populationId; requestId += 1;
    activeData = null; activeResults = [];
    $('race-analysis-status').hidden = false;
    $('race-analysis-status').textContent = 'Loading recorded races…';
    $('race-analysis-workspace').hidden = true;
    $('race-analysis-summary').innerHTML = '';
    const year = $('race-analysis-year').value, yearRaces = races.filter(race => String(race.year) === year).sort((a, b) => Number(a.round) - Number(b.round));
    const selector = $('race-analysis-race'); selector.disabled = true; selector.innerHTML = '<option>Loading recorded races…</option>';
    if (!junior) {
      selector.innerHTML = yearRaces.map(race => `<option value="${esc(race.id)}">R${esc(race.round)} · ${esc(displayRaceName(race))}</option>`).join('');
      const wanted = preferredRace && yearRaces.some(race => String(race.id) === String(preferredRace)) ? String(preferredRace) : String(yearRaces[yearRaces.length - 1]?.id || '');
      selector.value = wanted; selector.disabled = !yearRaces.length; if (yearRaces.length) loadRace(); return;
    }
    try {
      const weekends = await Promise.all(yearRaces.map(async race => { const data = details.get(String(race.id)) || await getJSON(`/api/races/${encodeURIComponent(race.id)}`); details.set(String(race.id), data); return { race, data }; }));
      if (current !== populationId) return;
      const options = weekends.flatMap(({ race, data }) => data.sessions.filter(session => session.isRace && !session.cancelled && session.results?.length).map(session => ({ value: `${race.id}::${session.id}`, label: `R${race.round} · ${displayRaceName(race)} · ${session.displayName || session.name}` })));
      selector.innerHTML = options.map(option => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join('');
      selector.value = preferredRace && options.some(option => option.value === preferredRace) ? preferredRace : options[options.length - 1]?.value || '';
      selector.disabled = !options.length; if (options.length) loadRace(); else { $('race-analysis-status').textContent = 'No completed race sessions are available for this season.'; }
    } catch (error) { if (current === populationId) $('race-analysis-status').textContent = `Unable to load races: ${error.message}`; }
  }

  $('race-analysis-view').addEventListener('change', event => selectView(event.target.value));
  $('race-flow-mode').value = flowMode; $('race-flow-mode').addEventListener('change', event => { flowMode = event.target.value; renderFlow(); saveState(); });
  $('race-driver-search').addEventListener('input', renderDriverPicker);
  $('race-driver-list').addEventListener('click', event => { const button = event.target.closest('[data-race-driver]'); if (!button) return; const id = button.dataset.raceDriver; if (selected.has(id)) { if (selected.size > 1) selected.delete(id); } else selected.add(id); if (!selected.has(focusedDriver)) focusedDriver = null; renderDriverPicker(); renderFlow(); saveState(); });
  document.querySelectorAll('[data-race-preset]').forEach(button => button.addEventListener('click', () => setPreset(button.dataset.racePreset)));
  $('race-result-search').addEventListener('input', renderResults); $('race-team-filter').addEventListener('change', renderResults);
  $('race-result-reset').addEventListener('click', () => { $('race-result-search').value = ''; $('race-team-filter').value = ''; renderResults(); });
  const tabs = [...document.querySelectorAll('[data-race-visual-button]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => selectView(button.dataset.raceVisualButton));
    button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectView(tabs[target].dataset.raceVisualButton, true); });
  });
  $('race-analysis-year').addEventListener('change', () => populateRaces()); $('race-analysis-race').addEventListener('change', loadRace);
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (activeData && view === 'flow') renderFlow(); }).observe($('race-flow-chart'));
  $('race-series-label').textContent = `${activeSeriesName().toUpperCase()} · RACE`; if (junior) $('race-contribution-heading').textContent = 'Team points';

  getJSON('/api/races').then(response => {
    races = response.filter(recordedRace);
    const years = [...new Set(races.map(race => String(race.year)))].sort((a, b) => Number(b) - Number(a));
    const year = initial.year && years.includes(initial.year) ? initial.year : years[0];
    $('race-analysis-year').innerHTML = years.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''); $('race-analysis-year').value = year; $('race-analysis-year').disabled = !years.length;
    if (!years.length) { $('race-analysis-status').textContent = 'No recorded races are available.'; return; }
    populateRaces(initial.race);
  }).catch(error => { $('race-analysis-status').textContent = `Unable to load races: ${error.message}`; });
})();
