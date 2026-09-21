(() => {
  'use strict';
  const $ = id => document.getElementById(id), model = window.WecDriverComparisonModel;
  const initial = model.readState(location.search), validViews = ['overview', 'shared', 'crew'];
  let drivers = [], comparison = null, activePair = null, view = initial.view, requestId = 0;
  let sharedState = { year: '', classCode: '', crewOnly: false, page: 1 };
  const pageSize = 20;
  const number = value => value === null || value === undefined || value === '' ? null : Number(value);
  const display = value => number(value) === null || !Number.isFinite(number(value)) ? '—' : fmtNumber(number(value));
  const position = value => number(value) > 0 ? `P${number(value)}` : '—';
  const rate = (value, starts) => Number(starts) > 0 ? Number(value || 0) / Number(starts) * 100 : null;
  const percent = value => value === null ? '—' : `${Number(value).toFixed(1)}%`;
  const driverUrl = id => `/wec/drivers/${encodeURIComponent(id)}`;
  const raceUrl = row => resourceUrl('race', row.eventId, { base: '/wec', label: row.eventName });

  function careerYears(driver) {
    if (!driver.firstYear && !driver.lastYear) return 'Career years unavailable';
    return Number(driver.firstYear) === Number(driver.lastYear) ? String(driver.firstYear) : `${driver.firstYear}–${driver.lastYear}`;
  }

  function metric(label, first, second, note = '', formatter = display, lowerBetter = false) {
    const a = number(first), b = number(second);
    const firstLeads = a !== null && b !== null && a !== b && (lowerBetter ? a < b : a > b);
    const secondLeads = a !== null && b !== null && a !== b && (lowerBetter ? b < a : b > a);
    return `<div class="comparison-metric"><strong class="${firstLeads ? 'leader' : ''}">${esc(formatter(first))}</strong><span>${esc(label)}${note ? `<small>${esc(note)}</small>` : ''}</span><strong class="${secondLeads ? 'leader' : ''}">${esc(formatter(second))}</strong></div>`;
  }

  function renderOverview() {
    const [first, second] = comparison.profiles, a = first.stats, b = second.stats;
    return `<div class="comparison-section-head"><h2>Career overview</h2><span>Entry results credited to every listed crew member</span></div>
      <div class="comparison-scorecard">
        ${metric('Driver championships', first.championships, second.championships)}
        ${metric('Best championship finish', first.bestChampionshipPosition, second.bestChampionshipPosition, 'Lower is better', position, true)}
        ${metric('Race starts', a.eventStarts, b.eventStarts)}
        ${metric('Seasons', a.seasons, b.seasons)}
        ${metric('Overall wins', a.overallWins, b.overallWins)}
        ${metric('Class wins', a.classWins, b.classWins)}
        ${metric('Class-win rate', rate(a.classWins, a.eventStarts), rate(b.classWins, b.eventStarts), 'Class wins ÷ starts', percent)}
        ${metric('Class podiums', a.podiums, b.podiums)}
        ${metric('Podium rate', rate(a.podiums, a.eventStarts), rate(b.podiums, b.eventStarts), 'Class podiums ÷ starts', percent)}
        ${metric('Le Mans class wins', a.leMansWins, b.leMansWins)}
        ${metric('Teams represented', a.teams, b.teams)}
        ${metric('Classes raced', first.classCodes.length, second.classCodes.length, `${first.classCodes.join(', ') || '—'} · ${second.classCodes.join(', ') || '—'}`)}
      </div>
      <p class="comparison-method">A WEC result belongs to the car, so every listed crew member receives that entry’s finish. Rates provide opportunity context; they do not separate individual driving time, stint performance or car reliability.</p>`;
  }

  function scoreText(score) { return `${score.first}–${score.second}`; }
  function sharedRows() {
    return comparison.shared.filter(row => (!sharedState.year || String(row.year) === sharedState.year)
      && (!sharedState.classCode || row.first.classCode === sharedState.classCode || row.second.classCode === sharedState.classCode)
      && (!sharedState.crewOnly || row.sameEntry));
  }

  function resultCell(row) {
    return `<div class="wec-comparison-result"><b>${esc(row.classCode)} · ${esc(position(row.classPosition))}</b><small>Overall ${esc(position(row.overallPosition))} · ${esc(String(row.status || 'unknown').replaceAll('-', ' '))}</small></div>`;
  }

  function sharedTable(rows) {
    if (!rows.length) return '<div class="comparison-empty">No shared events match these filters.</div>';
    return `<div class="table-wrap"><table class="comparison-table wec-comparison-table"><thead><tr><th>Event</th><th>Crew context</th><th>${esc(comparison.profiles[0].name)}</th><th>${esc(comparison.profiles[1].name)}</th></tr></thead><tbody>${rows.map(row => `<tr><td><a href="${raceUrl(row)}">${esc(row.eventName)}</a><small>${esc(row.year)} · Round ${esc(row.round)}</small></td><td class="${row.sameEntry ? 'same-entry' : ''}">${row.sameEntry ? `Same #${esc(row.first.carNumber)} entry` : row.sameClass ? `Same class · ${esc(row.first.classCode)}` : 'Different classes'}</td><td>${resultCell(row.first)}</td><td>${resultCell(row.second)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderShared() {
    const all = comparison.shared, filtered = sharedRows(), score = model.headToHead(filtered);
    const years = [...new Set(all.map(row => String(row.year)))].sort((a, b) => Number(b) - Number(a));
    const classes = [...new Set(all.flatMap(row => [row.first.classCode, row.second.classCode]).filter(Boolean))].sort();
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); sharedState.page = Math.min(sharedState.page, pages);
    const start = (sharedState.page - 1) * pageSize, rows = filtered.slice(start, start + pageSize);
    return `<div class="comparison-section-head"><h2>Shared WEC events</h2><span>${filtered.length} of ${all.length} events</span></div>
      <div class="wec-shared-summary"><div><span>Shared events</span><strong>${display(all.length)}</strong><small>Both drivers recorded in the event</small></div><div><span>Same-class head-to-head</span><strong>${esc(scoreText(score))}</strong><small>${score.compared} comparable · ${score.ties} ties</small></div><div><span>Same entry</span><strong>${display(comparison.crew.rows.length)}</strong><small>Listed together in one car</small></div></div>
      <div class="comparison-filter-bar"><label>Season<select id="wec-shared-year"><option value="">All seasons</option>${years.map(year => `<option value="${year}"${sharedState.year === year ? ' selected' : ''}>${year}</option>`).join('')}</select></label><label>Class<select id="wec-shared-class"><option value="">All classes</option>${classes.map(code => `<option value="${esc(code)}"${sharedState.classCode === code ? ' selected' : ''}>${esc(code)}</option>`).join('')}</select></label><label class="comparison-check"><input id="wec-shared-crew" type="checkbox"${sharedState.crewOnly ? ' checked' : ''}> Same entry only</label></div>
      ${sharedTable(rows)}<div class="comparison-pagination"><span>${filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length}` : '0 results'}</span><div><button type="button" data-wec-shared-page="previous"${sharedState.page <= 1 ? ' disabled' : ''}>Previous</button><button type="button" data-wec-shared-page="next"${sharedState.page >= pages ? ' disabled' : ''}>Next</button></div></div>
      <p class="comparison-method">The head-to-head includes only events where both drivers have a positive class classification in the same class. Cross-class finishes, retirements and non-starts are shown but excluded from the score.</p>`;
  }

  function renderCrew() {
    const crew = comparison.crew;
    if (!crew.rows.length) return '<div class="comparison-empty">These drivers have not shared an entry in the available WEC results.</div>';
    return `<div class="comparison-section-head"><h2>Shared crew history</h2><span>Results earned together in the same car</span></div>
      <div class="wec-shared-summary"><div><span>Starts together</span><strong>${display(crew.starts)}</strong><small>${new Set(crew.rows.map(row => row.year)).size} seasons</small></div><div><span>Class wins together</span><strong>${display(crew.classWins)}</strong><small>One result credited to the crew</small></div><div><span>Class podiums together</span><strong>${display(crew.podiums)}</strong><small>Top-three class finishes</small></div></div>
      ${sharedTable(crew.rows)}<p class="comparison-method">Crew records indicate that both drivers were listed on the same entry. They do not measure stint length or individual lap-time contribution.</p>`;
  }

  function saveState() {
    if (!activePair) return;
    const url = new URL(location.href); url.searchParams.set('first', activePair[0]); url.searchParams.set('second', activePair[1]); url.searchParams.set('view', view); history.replaceState(null, '', url);
  }

  function selectView(next, focus = false) {
    view = validViews.includes(next) ? next : 'overview';
    document.querySelectorAll('[data-wec-comparison-panel]').forEach(panel => { panel.hidden = panel.dataset.wecComparisonPanel !== view; });
    document.querySelectorAll('[data-wec-comparison-view]').forEach(button => { const active = button.dataset.wecComparisonView === view; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
    const mobile = $('wec-comparison-view'); if (mobile) mobile.value = view; saveState();
  }

  function rerenderShared() {
    const panel = document.querySelector('[data-wec-comparison-panel="shared"]');
    panel.innerHTML = renderShared(); bindSharedControls();
  }
  function bindSharedControls() {
    $('wec-shared-year')?.addEventListener('change', event => { sharedState.year = event.target.value; sharedState.page = 1; rerenderShared(); });
    $('wec-shared-class')?.addEventListener('change', event => { sharedState.classCode = event.target.value; sharedState.page = 1; rerenderShared(); });
    $('wec-shared-crew')?.addEventListener('change', event => { sharedState.crewOnly = event.target.checked; sharedState.page = 1; rerenderShared(); });
    document.querySelectorAll('[data-wec-shared-page]').forEach(button => button.addEventListener('click', () => { sharedState.page += button.dataset.wecSharedPage === 'next' ? 1 : -1; rerenderShared(); }));
  }

  function bindWorkspace() {
    const tabs = [...document.querySelectorAll('[data-wec-comparison-view]')];
    tabs.forEach((button, index) => {
      button.addEventListener('click', () => selectView(button.dataset.wecComparisonView));
      button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectView(tabs[target].dataset.wecComparisonView, true); });
    });
    $('wec-comparison-view').addEventListener('change', event => selectView(event.target.value)); bindSharedControls();
  }

  function renderComparison() {
    const [first, second] = comparison.profiles;
    $('wec-comparison-title').textContent = `${first.name} vs ${second.name}`; document.title = `${first.name} vs ${second.name} · WEC · Racelytic`;
    $('wec-comparison-content').innerHTML = `<section class="comparison-driver-heads"><a href="${driverUrl(first.id)}"><span>${esc(first.countryName || 'WEC DRIVER')}</span><h2>${esc(first.name)}</h2><small>${esc(careerYears(first))} · ${display(first.stats.eventStarts)} starts · ${esc(first.classCodes.join(', ') || 'Class unavailable')}</small></a><div>HEAD TO HEAD</div><a href="${driverUrl(second.id)}"><span>${esc(second.countryName || 'WEC DRIVER')}</span><h2>${esc(second.name)}</h2><small>${esc(careerYears(second))} · ${display(second.stats.eventStarts)} starts · ${esc(second.classCodes.join(', ') || 'Class unavailable')}</small></a></section>
      <div class="comparison-workspace-shell"><nav class="analysis-visualization-menu" aria-label="WEC driver comparison views"><label class="analysis-mobile-view" for="wec-comparison-view">Comparison view<select id="wec-comparison-view"><option value="overview">Career overview</option><option value="shared">Shared events</option><option value="crew">Crew history</option></select></label><div class="analysis-visualization-tabs comparison-tabs" role="tablist"><button id="wec-comparison-tab-overview" type="button" role="tab" aria-controls="wec-comparison-panel-overview" aria-selected="true" data-wec-comparison-view="overview">Career overview</button><button id="wec-comparison-tab-shared" type="button" role="tab" aria-controls="wec-comparison-panel-shared" aria-selected="false" tabindex="-1" data-wec-comparison-view="shared">Shared events</button><button id="wec-comparison-tab-crew" type="button" role="tab" aria-controls="wec-comparison-panel-crew" aria-selected="false" tabindex="-1" data-wec-comparison-view="crew">Crew history</button></div></nav>
      <div class="comparison-workspace"><section id="wec-comparison-panel-overview" role="tabpanel" aria-labelledby="wec-comparison-tab-overview" data-wec-comparison-panel="overview">${renderOverview()}</section><section id="wec-comparison-panel-shared" role="tabpanel" aria-labelledby="wec-comparison-tab-shared" data-wec-comparison-panel="shared" hidden>${renderShared()}</section><section id="wec-comparison-panel-crew" role="tabpanel" aria-labelledby="wec-comparison-tab-crew" data-wec-comparison-panel="crew" hidden>${renderCrew()}</section></div></div>`;
    bindWorkspace(); selectView(view); $('wec-copy-comparison-link').disabled = false;
  }

  function setStatus(message = '', error = false) { const status = $('wec-comparison-status'); status.textContent = message; status.hidden = !message; status.classList.toggle('is-error', error); }
  function driverFor(value) { const query = String(value || '').trim().toLowerCase(); return drivers.find(driver => String(driver.id).toLowerCase() === query || driver.name.toLowerCase() === query || String(driver.abbreviation || '').toLowerCase() === query); }
  async function compareDrivers(first, second) {
    if (!first || !second) return setStatus('Choose drivers from the suggestions.', true);
    if (first.id === second.id) return setStatus('Choose two different drivers.', true);
    if (activePair?.[0] === first.id && activePair?.[1] === second.id && comparison) return;
    const current = ++requestId; setStatus('Building WEC comparison…'); $('wec-comparison-content').setAttribute('aria-busy', 'true');
    try {
      const details = await Promise.all([first, second].map(driver => getJSON(`/api/wec/entities/drivers/${encodeURIComponent(driver.id)}`)));
      if (current !== requestId) return;
      const profiles = details.map((detail, index) => ({ ...drivers.find(driver => driver.id === [first, second][index].id), ...detail.entity, stats: detail.stats, appearances: detail.appearances, titleRows: detail.championships }));
      const shared = model.sharedAppearances(profiles[0].appearances, profiles[1].appearances);
      comparison = { profiles, shared, crew: model.sharedCrew(shared) }; activePair = [first.id, second.id]; sharedState = { year: '', classCode: '', crewOnly: false, page: 1 };
      $('wec-comparison-driver-one').value = first.id; $('wec-comparison-driver-two').value = second.id; renderComparison(); saveState(); setStatus('');
    } catch (error) { if (current === requestId) setStatus(`Unable to compare drivers: ${error.message}`, true); }
    finally { if (current === requestId) $('wec-comparison-content').removeAttribute('aria-busy'); }
  }
  function compareFromInputs() { compareDrivers(driverFor($('wec-comparison-driver-one').value), driverFor($('wec-comparison-driver-two').value)); }
  ['wec-comparison-driver-one', 'wec-comparison-driver-two'].forEach(id => $(id).addEventListener('change', compareFromInputs));
  $('wec-swap-drivers').addEventListener('click', () => { const first = $('wec-comparison-driver-one').value; $('wec-comparison-driver-one').value = $('wec-comparison-driver-two').value; $('wec-comparison-driver-two').value = first; compareFromInputs(); });
  $('wec-copy-comparison-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); setStatus('Comparison link copied.'); setTimeout(() => setStatus(''), 1800); } catch { setStatus('Unable to copy the link. Copy it from the address bar instead.', true); } });

  getJSON('/api/wec/drivers').then(response => {
    drivers = response.sort((a, b) => Number(b.classWins) - Number(a.classWins) || Number(b.starts) - Number(a.starts) || a.name.localeCompare(b.name));
    const options = drivers.map(driver => `<option value="${esc(driver.id)}">${esc(driver.name)}</option>`).join('');
    $('wec-comparison-driver-one').innerHTML = options; $('wec-comparison-driver-two').innerHTML = options;
    const requestedFirst = drivers.find(driver => String(driver.id) === initial.first), requestedSecond = drivers.find(driver => String(driver.id) === initial.second);
    const first = requestedFirst || drivers[0], second = requestedSecond && requestedSecond.id !== first?.id ? requestedSecond : drivers.find(driver => driver.id !== first?.id);
    $('wec-comparison-driver-one').disabled = false; $('wec-comparison-driver-two').disabled = false; $('wec-swap-drivers').disabled = false;
    $('wec-comparison-driver-one').value = first?.id || ''; $('wec-comparison-driver-two').value = second?.id || '';
    if (first && second) compareDrivers(first, second); else setStatus('At least two WEC drivers are required for a comparison.', true);
  }).catch(error => setStatus(`Unable to load WEC drivers: ${error.message}`, true));
})();
