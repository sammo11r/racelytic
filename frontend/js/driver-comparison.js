(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const series = activeSeriesKey();
  const validViews = ['overview', 'teammates', 'races'];
  const initialParams = new URLSearchParams(location.search);
  let view = validViews.includes(initialParams.get('view')) ? initialParams.get('view') : 'overview';
  let drivers = [], comparisonData = null, activePair = null, requestId = 0, inputTimer = null;
  let sharedState = { search: '', year: '', team: '', teammates: false, sort: 'date', direction: -1, page: 1 };
  const pageSize = 25;

  function comparisonUrl(type, id) {
    const base = series === 'f1' ? '' : `/${series}`;
    return `${base}/${type}?${type === 'season' ? 'year' : 'id'}=${encodeURIComponent(id)}`;
  }

  function number(value) { return value == null || value === '' ? null : Number(value); }
  function format(value, digits = null) {
    const numeric = number(value); if (numeric == null || !Number.isFinite(numeric)) return '—';
    return digits == null ? fmtNumber(numeric) : numeric.toFixed(digits);
  }
  function rate(value, starts) { return Number(starts) > 0 ? Number(value || 0) / Number(starts) * 100 : null; }
  function classified(position) { const value = Number(position); return Number.isFinite(value) && value > 0; }
  function resultText(text, position) { return String(text || (classified(position) ? position : '—')); }
  function careerYears(driver) {
    const first = driver.firstYear ?? driver.firstSeason, last = driver.lastYear ?? driver.lastSeason;
    if (!first && !last) return 'Career years unavailable';
    return Number(first) === Number(last) ? String(first) : `${first}–${last}`;
  }

  function duelScore(races, firstKey, secondKey) {
    return races.reduce((score, race) => {
      if (!classified(race[firstKey]) || !classified(race[secondKey])) { score.excluded += 1; return score; }
      score.compared += 1;
      if (Number(race[firstKey]) === Number(race[secondKey])) score.ties += 1;
      else if (Number(race[firstKey]) < Number(race[secondKey])) score.first += 1;
      else score.second += 1;
      return score;
    }, { first: 0, second: 0, ties: 0, compared: 0, excluded: 0 });
  }

  function metric(label, first, second, note = '', formatter = value => format(value), lowerBetter = false) {
    const a = number(first), b = number(second);
    const firstLeads = a != null && b != null && a !== b && (lowerBetter ? a < b : a > b), secondLeads = a != null && b != null && a !== b && (lowerBetter ? b < a : b > a);
    return `<div class="comparison-metric"><strong class="${firstLeads ? 'leader' : ''}">${esc(formatter(first))}</strong><span>${esc(label)}${note ? `<small>${esc(note)}</small>` : ''}</span><strong class="${secondLeads ? 'leader' : ''}">${esc(formatter(second))}</strong></div>`;
  }

  function renderOverview() {
    const [first, second] = comparisonData.drivers;
    const firstStarts = number(first.totalRaceStarts), secondStarts = number(second.totalRaceStarts);
    return `<div class="comparison-section-head"><h2>Career overview</h2><span>Totals with opportunity-adjusted rates</span></div>
      <div class="comparison-scorecard">
        ${metric(series === 'f1' ? 'World championships' : 'Championships', first.totalChampionshipWins, second.totalChampionshipWins)}
        ${metric('Best championship finish', first.bestChampionshipPosition, second.bestChampionshipPosition, 'Lower is better', value => number(value) > 0 ? `P${number(value)}` : '—', true)}
        ${metric('Race starts', firstStarts, secondStarts)}
        ${metric('Seasons', first.seasons || (first.firstYear ? Number(first.lastYear) - Number(first.firstYear) + 1 : null), second.seasons || (second.firstYear ? Number(second.lastYear) - Number(second.firstYear) + 1 : null))}
        ${metric('Race wins', first.totalRaceWins, second.totalRaceWins)}
        ${metric('Win rate', rate(first.totalRaceWins, firstStarts), rate(second.totalRaceWins, secondStarts), 'Wins ÷ starts', value => number(value) == null ? '—' : `${format(value, 1)}%`)}
        ${metric('Podiums', first.totalPodiums, second.totalPodiums)}
        ${metric('Podium rate', rate(first.totalPodiums, firstStarts), rate(second.totalPodiums, secondStarts), 'Podiums ÷ starts', value => number(value) == null ? '—' : `${format(value, 1)}%`)}
        ${metric('Pole positions', first.totalPolePositions, second.totalPolePositions)}
        ${metric('Pole rate', rate(first.totalPolePositions, firstStarts), rate(second.totalPolePositions, secondStarts), 'Poles ÷ starts', value => number(value) == null ? '—' : `${format(value, 1)}%`)}
        ${metric('Fastest laps', first.totalFastestLaps, second.totalFastestLaps)}
        ${metric('Points per start', firstStarts ? Number(first.totalPoints || 0) / firstStarts : null, secondStarts ? Number(second.totalPoints || 0) / secondStarts : null, 'Raw career points ÷ starts', value => format(value, 2))}
        ${metric('Career points', first.totalPoints, second.totalPoints, 'Scoring systems differ by era')}
      </div>
      <p class="comparison-method">Career totals reflect the rules and schedules of each driver’s era. Rates add opportunity context but do not normalize car performance, field strength, sprint formats or historical scoring systems.</p>`;
  }

  function scoreNote(score) {
    const parts = [`${score.compared} classified comparison${score.compared === 1 ? '' : 's'}`];
    if (score.ties) parts.push(`${score.ties} tie${score.ties === 1 ? '' : 's'}`);
    if (score.excluded) parts.push(`${score.excluded} excluded`);
    return parts.join(' · ');
  }

  function renderTeammates() {
    const races = comparisonData.teammateRaces || [], [first, second] = comparisonData.drivers;
    if (!races.length) return '<div class="comparison-empty">These drivers were never teammates in the available race results.</div>';
    const raceScore = duelScore(races, 'firstPosition', 'secondPosition'), qualifyingScore = duelScore(races, 'firstQualifying', 'secondQualifying');
    const seasons = [...new Set(races.map(race => Number(race.year)))].sort((a, b) => b - a);
    const rows = seasons.map(year => {
      const season = races.filter(race => Number(race.year) === year), race = duelScore(season, 'firstPosition', 'secondPosition'), qualifying = duelScore(season, 'firstQualifying', 'secondQualifying');
      const teams = [...new Set(season.map(item => item.constructorName).filter(Boolean))].join(', ');
      const firstPoints = season.reduce((sum, item) => sum + Number(item.firstPoints || 0), 0), secondPoints = season.reduce((sum, item) => sum + Number(item.secondPoints || 0), 0);
      return `<tr><td><a href="${comparisonUrl('season', year)}">${year}</a></td><td>${esc(teams || '—')}</td><td>${season.length}</td><td>${race.first}–${race.second}<small>${esc(scoreNote(race))}</small></td><td>${qualifying.first}–${qualifying.second}<small>${esc(scoreNote(qualifying))}</small></td><td>${fmtNumber(firstPoints)}–${fmtNumber(secondPoints)}</td></tr>`;
    }).join('');
    return `<div class="comparison-section-head"><h2>Teammate battle</h2><span>Same-team race sessions only</span></div>
      <div class="teammate-summary"><div><span>Shared teammate races</span><strong>${fmtNumber(races.length)}</strong><small>${seasons.length} season${seasons.length === 1 ? '' : 's'}</small></div><div><span>Race head-to-head</span><strong>${raceScore.first}–${raceScore.second}</strong><small>${esc(scoreNote(raceScore))}</small></div><div><span>Qualifying head-to-head</span><strong>${qualifyingScore.first}–${qualifyingScore.second}</strong><small>${esc(scoreNote(qualifyingScore))}</small></div></div>
      <p class="comparison-method">A head-to-head is counted only when both drivers have positive numeric classifications. Ties are shown separately; DNS, DNQ, disqualifications, unclassified results and missing qualifying positions are excluded.</p>
      <div class="table-wrap"><table class="comparison-table"><thead><tr><th>Season</th><th>Team</th><th>Races</th><th>Race H2H</th><th>Qualifying H2H</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function sharedSortValue(race, key) {
    if (key === 'date') return new Date(race.date || `${race.year}-01-01`).getTime() + Number(race.round || 0);
    if (key === 'race') return displayRaceName(race);
    if (key === 'team') return race.firstConstructorName || race.secondConstructorName || '';
    if (key === 'first') return classified(race.firstPosition) ? Number(race.firstPosition) : 999;
    if (key === 'second') return classified(race.secondPosition) ? Number(race.secondPosition) : 999;
    if (key === 'grid') return classified(race.firstGrid) ? Number(race.firstGrid) : 999;
    if (key === 'qualifying') return classified(race.firstQualifying) ? Number(race.firstQualifying) : 999;
    if (key === 'points') return Number(race.firstPoints || 0) - Number(race.secondPoints || 0);
    return '';
  }

  function renderSharedRaces() {
    const races = comparisonData.sharedRaces || [], [first, second] = comparisonData.drivers;
    const years = [...new Set(races.map(race => String(race.year)))].sort((a, b) => Number(b) - Number(a));
    const teams = [...new Set(races.flatMap(race => [race.firstConstructorName, race.secondConstructorName]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const query = sharedState.search.toLowerCase();
    const filtered = races.filter(race => (!query || `${displayRaceName(race)} ${race.circuitName || ''} ${race.year}`.toLowerCase().includes(query)) &&
      (!sharedState.year || String(race.year) === sharedState.year) && (!sharedState.team || race.firstConstructorName === sharedState.team || race.secondConstructorName === sharedState.team) && (!sharedState.teammates || race.sameTeam));
    filtered.sort((a, b) => { const av = sharedSortValue(a, sharedState.sort), bv = sharedSortValue(b, sharedState.sort); return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * sharedState.direction; });
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); sharedState.page = Math.min(sharedState.page, pages);
    const start = (sharedState.page - 1) * pageSize, pageRows = filtered.slice(start, start + pageSize);
    const heading = (key, label) => `<th scope="col" aria-sort="${sharedState.sort === key ? sharedState.direction === 1 ? 'ascending' : 'descending' : 'none'}"><button type="button" data-shared-sort="${key}">${label}${sharedState.sort === key ? sharedState.direction === 1 ? ' ↑' : ' ↓' : ' ↕'}</button></th>`;
    const rows = pageRows.map(race => {
      const firstAhead = classified(race.firstPosition) && classified(race.secondPosition) && Number(race.firstPosition) < Number(race.secondPosition);
      const secondAhead = classified(race.firstPosition) && classified(race.secondPosition) && Number(race.secondPosition) < Number(race.firstPosition);
      const teamText = race.sameTeam ? race.firstConstructorName : `${race.firstConstructorName || '—'} / ${race.secondConstructorName || '—'}`;
      return `<tr><td><a href="${comparisonUrl('race', race.raceId)}">${esc(displayRaceName(race))}</a><small>${esc(race.year)} · Round ${esc(race.round)}</small></td><td>${esc(teamText || '—')}<small>${race.sameTeam ? 'Teammates' : 'Different teams'}</small></td><td class="${firstAhead ? 'ahead' : ''}">${esc(resultText(race.firstPositionText, race.firstPosition))}</td><td class="${secondAhead ? 'ahead' : ''}">${esc(resultText(race.secondPositionText, race.secondPosition))}</td><td>${race.firstGrid || '—'}–${race.secondGrid || '—'}</td><td>${race.firstQualifying || '—'}–${race.secondQualifying || '—'}</td><td>${fmtNumber(race.firstPoints)}–${fmtNumber(race.secondPoints)}</td></tr>`;
    }).join('');
    const content = pageRows.length ? `<div class="table-wrap"><table class="comparison-table"><thead><tr>${heading('date', 'Race')}${heading('team', 'Team context')}${heading('first', first.name)}${heading('second', second.name)}${heading('grid', 'Grid')}${heading('qualifying', 'Qualifying')}${heading('points', 'Points')}</tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="comparison-empty">No shared races match these filters.</div>';
    return `<div class="comparison-section-head"><h2>Shared races</h2><span>${filtered.length} of ${races.length} race sessions</span></div>
      <div class="comparison-filter-bar"><label>Race or year<input id="shared-race-search" type="search" value="${esc(sharedState.search)}" placeholder="Search shared races"></label><label>Season<select id="shared-season-filter"><option value="">All seasons</option>${years.map(year => `<option value="${year}"${sharedState.year === year ? ' selected' : ''}>${year}</option>`).join('')}</select></label><label>Team<select id="shared-team-filter"><option value="">All teams</option>${teams.map(team => `<option value="${esc(team)}"${sharedState.team === team ? ' selected' : ''}>${esc(team)}</option>`).join('')}</select></label><label class="comparison-check"><input id="shared-teammate-filter" type="checkbox"${sharedState.teammates ? ' checked' : ''}> Teammates only</label></div>
      ${content}<div class="comparison-pagination"><span>${filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length}` : '0 results'}</span><div><button type="button" data-shared-page="previous"${sharedState.page <= 1 ? ' disabled' : ''}>Previous</button><button type="button" data-shared-page="next"${sharedState.page >= pages ? ' disabled' : ''}>Next</button></div></div>`;
  }

  function saveState() {
    if (!activePair) return;
    const url = new URL(location.href); url.searchParams.set('first', activePair[0]); url.searchParams.set('second', activePair[1]); url.searchParams.set('view', view); history.replaceState(null, '', url);
  }

  function selectView(next, focus = false) {
    view = validViews.includes(next) ? next : 'overview';
    document.querySelectorAll('[data-comparison-panel]').forEach(panel => { panel.hidden = panel.dataset.comparisonPanel !== view; });
    document.querySelectorAll('[data-comparison-view]').forEach(button => { const active = button.dataset.comparisonView === view; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
    const mobile = $('comparison-view'); if (mobile) mobile.value = view; saveState();
  }

  function bindWorkspace() {
    const tabs = [...document.querySelectorAll('[data-comparison-view]')];
    tabs.forEach((button, index) => {
      button.addEventListener('click', () => selectView(button.dataset.comparisonView));
      button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectView(tabs[target].dataset.comparisonView, true); });
    });
    $('comparison-view').addEventListener('change', event => selectView(event.target.value));
    bindSharedRaceControls();
  }

  function bindSharedRaceControls() {
    const panel = document.querySelector('[data-comparison-panel="races"]'); if (!panel) return;
    const rerender = () => { panel.innerHTML = renderSharedRaces(); bindSharedRaceControls(); };
    panel.querySelector('#shared-race-search')?.addEventListener('input', event => { sharedState.search = event.target.value; sharedState.page = 1; rerender(); });
    panel.querySelector('#shared-season-filter')?.addEventListener('change', event => { sharedState.year = event.target.value; sharedState.page = 1; rerender(); });
    panel.querySelector('#shared-team-filter')?.addEventListener('change', event => { sharedState.team = event.target.value; sharedState.page = 1; rerender(); });
    panel.querySelector('#shared-teammate-filter')?.addEventListener('change', event => { sharedState.teammates = event.target.checked; sharedState.page = 1; rerender(); });
    panel.querySelectorAll('[data-shared-sort]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.sharedSort; if (sharedState.sort === key) sharedState.direction *= -1; else { sharedState.sort = key; sharedState.direction = 1; } sharedState.page = 1; rerender(); }));
    panel.querySelectorAll('[data-shared-page]').forEach(button => button.addEventListener('click', () => { sharedState.page += button.dataset.sharedPage === 'next' ? 1 : -1; rerender(); }));
  }

  function renderComparison() {
    const [first, second] = comparisonData.drivers;
    $('comparison-title').textContent = `${first.name} vs ${second.name}`; document.title = `${first.name} vs ${second.name} · ${activeSeriesName()} · Racelytic`;
    $('comparison-content').innerHTML = `<section class="comparison-driver-heads"><a href="${comparisonUrl('driver', first.id)}"><span>${esc(displayCountryName(first.nationalityCountryId))}</span><h2>${esc(first.name)}</h2><small>${esc(careerYears(first))} · ${format(first.totalRaceStarts)} starts</small></a><div>HEAD TO HEAD</div><a href="${comparisonUrl('driver', second.id)}"><span>${esc(displayCountryName(second.nationalityCountryId))}</span><h2>${esc(second.name)}</h2><small>${esc(careerYears(second))} · ${format(second.totalRaceStarts)} starts</small></a></section>
      <div class="comparison-workspace-shell"><nav class="analysis-visualization-menu" aria-label="Comparison views"><label class="analysis-mobile-view" for="comparison-view">Comparison view<select id="comparison-view"><option value="overview">Career overview</option><option value="teammates">Teammate battle</option><option value="races">Shared races</option></select></label><div class="analysis-visualization-tabs comparison-tabs" role="tablist" aria-label="Driver comparison views"><button id="comparison-tab-overview" type="button" role="tab" aria-controls="comparison-panel-overview" aria-selected="true" data-comparison-view="overview">Career overview</button><button id="comparison-tab-teammates" type="button" role="tab" aria-controls="comparison-panel-teammates" aria-selected="false" tabindex="-1" data-comparison-view="teammates">Teammate battle</button><button id="comparison-tab-races" type="button" role="tab" aria-controls="comparison-panel-races" aria-selected="false" tabindex="-1" data-comparison-view="races">Shared races</button></div></nav>
      <div class="comparison-workspace"><section id="comparison-panel-overview" role="tabpanel" aria-labelledby="comparison-tab-overview" data-comparison-panel="overview">${renderOverview()}</section><section id="comparison-panel-teammates" role="tabpanel" aria-labelledby="comparison-tab-teammates" data-comparison-panel="teammates" hidden>${renderTeammates()}</section><section id="comparison-panel-races" role="tabpanel" aria-labelledby="comparison-tab-races" data-comparison-panel="races" hidden>${renderSharedRaces()}</section></div></div>`;
    bindWorkspace(); selectView(view); $('copy-comparison-link').disabled = false;
  }

  function driverFor(value) {
    const query = String(value || '').trim().toLowerCase();
    return drivers.find(driver => String(driver.id).toLowerCase() === query || String(driver.name).toLowerCase() === query || String(driver.abbreviation || '').toLowerCase() === query);
  }

  function setStatus(message = '', error = false) {
    $('comparison-status').textContent = message; $('comparison-status').hidden = !message; $('comparison-status').classList.toggle('is-error', error);
  }

  async function compareDrivers(first, second) {
    if (!first || !second) { setStatus('Choose drivers from the suggestions.', true); return; }
    if (first.id === second.id) { setStatus('Choose two different drivers.', true); return; }
    const pairKey = `${first.id},${second.id}`; if (activePair?.join(',') === pairKey && comparisonData) return;
    const current = ++requestId; setStatus('Building comparison…'); $('comparison-content').setAttribute('aria-busy', 'true');
    try {
      const data = await getJSON(`/api/drivers/compare?ids=${encodeURIComponent(first.id)},${encodeURIComponent(second.id)}`);
      if (current !== requestId) return;
      data.drivers = data.drivers.map(driver => ({ ...drivers.find(item => String(item.id) === String(driver.id)), ...driver }));
      comparisonData = data; activePair = [first.id, second.id]; sharedState = { search: '', year: '', team: '', teammates: false, sort: 'date', direction: -1, page: 1 };
      $('comparison-driver-one').value = first.name; $('comparison-driver-two').value = second.name; renderComparison(); saveState(); setStatus('');
    } catch (error) { if (current === requestId) setStatus(`Unable to compare drivers: ${error.message}`, true); }
    finally { if (current === requestId) $('comparison-content').removeAttribute('aria-busy'); }
  }

  function compareFromInputs() { compareDrivers(driverFor($('comparison-driver-one').value), driverFor($('comparison-driver-two').value)); }
  function scheduleComparison() { clearTimeout(inputTimer); const first = driverFor($('comparison-driver-one').value), second = driverFor($('comparison-driver-two').value); if (first && second && first.id !== second.id) inputTimer = setTimeout(() => compareDrivers(first, second), 180); }

  ['comparison-driver-one', 'comparison-driver-two'].forEach(id => {
    $(id).addEventListener('input', scheduleComparison); $(id).addEventListener('change', compareFromInputs); $(id).addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); compareFromInputs(); } }); $(id).addEventListener('focus', event => event.target.select());
  });
  $('swap-drivers').addEventListener('click', () => { const first = $('comparison-driver-one').value; $('comparison-driver-one').value = $('comparison-driver-two').value; $('comparison-driver-two').value = first; compareFromInputs(); });
  $('copy-comparison-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); setStatus('Comparison link copied.'); setTimeout(() => setStatus(''), 1800); } catch { setStatus('Unable to copy the link. Copy it from the address bar instead.', true); } });
  $('comparison-series-label').textContent = `${activeSeriesName().toUpperCase()} · DRIVER COMPARISON`;

  getJSON('/api/drivers?limit=1000').then(response => {
    drivers = response.map(driver => ({ ...driver,
      totalRaceStarts: driver.totalRaceStarts ?? driver.totalStarts,
      firstYear: driver.firstYear ?? driver.firstSeason,
      lastYear: driver.lastYear ?? driver.lastSeason,
      seasons: driver.seasons ?? (driver.firstYear && driver.lastYear ? Number(driver.lastYear) - Number(driver.firstYear) + 1 : null)
    })).sort((a, b) => Number(b.totalRaceWins || 0) - Number(a.totalRaceWins || 0) || a.name.localeCompare(b.name));
    const options = drivers.map(driver => `<option value="${esc(driver.name)}">${esc([driver.abbreviation, careerYears(driver)].filter(Boolean).join(' · '))}</option>`).join('');
    $('comparison-driver-options-one').innerHTML = options; $('comparison-driver-options-two').innerHTML = options;
    const requestedFirst = drivers.find(driver => String(driver.id) === initialParams.get('first')), requestedSecond = drivers.find(driver => String(driver.id) === initialParams.get('second'));
    const first = requestedFirst || drivers[0], second = requestedSecond && requestedSecond.id !== first?.id ? requestedSecond : drivers.find(driver => driver.id !== first?.id);
    $('comparison-driver-one').disabled = false; $('comparison-driver-two').disabled = false; $('swap-drivers').disabled = false;
    $('comparison-driver-one').value = first?.name || ''; $('comparison-driver-two').value = second?.name || '';
    if (first && second) compareDrivers(first, second); else setStatus('At least two drivers are required for a comparison.', true);
  }).catch(error => setStatus(`Unable to load drivers: ${error.message}`, true));
})();
