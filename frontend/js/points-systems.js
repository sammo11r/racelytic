const systemForm = document.getElementById('points-system-form');
const isF2PointsPage = window.location.pathname.startsWith('/f2/');
const isAcademyPointsPage = window.location.pathname.startsWith('/academy/');
const isF3PointsPage = window.location.pathname.startsWith('/f3/') || isAcademyPointsPage;
const isFormulaEPointsPage = window.location.pathname.startsWith('/formula-e/');
const pointsSeries = isFormulaEPointsPage ? 'fe' : isAcademyPointsPage ? 'academy' : isF3PointsPage ? 'f3' : isF2PointsPage ? 'f2' : 'f1';
const pointsBase = pointsSeries === 'f1' ? '' : pointsSeries === 'fe' ? '/formula-e' : `/${pointsSeries}`;
const pointsDraftKey = `racelytic:points-system-draft:${pointsSeries}`;

const F1_PRESETS = [
  { key: 'modern', seasonKey: '2025-present', scenarioKey: 'modern', builderKey: 'modern', name: 'Modern', era: 'Current Formula 1', racePoints: [25,18,15,12,10,8,6,4,2,1], sprintPoints: [8,7,6,5,4,3,2,1], qualifyingPoints: [], poleBonus: 0, fastestLapBonus: 0 },
  { key: '2003', seasonKey: '2003-2009', scenarioKey: '2003', builderKey: '2003', name: '2003–2009', era: 'Ten-point era', racePoints: [10,8,6,5,4,3,2,1], sprintPoints: [], qualifyingPoints: [], poleBonus: 0, fastestLapBonus: 0 },
  { key: '1991', seasonKey: '1991-2002', scenarioKey: '1991', builderKey: '1991', name: '1991–2002', era: 'Classic countback', racePoints: [10,6,4,3,2,1], sprintPoints: [], qualifyingPoints: [], poleBonus: 0, fastestLapBonus: 0 },
  { key: 'classic', seasonKey: '1982-1990', scenarioKey: 'classic', builderKey: 'classic', name: '1982–1990', era: 'Nine points for a win', racePoints: [9,6,4,3,2,1], sprintPoints: [], qualifyingPoints: [], poleBonus: 0, fastestLapBonus: 0, countBestRounds: 11 }
];
const JUNIOR_PRESETS = {
  f2: [{ key: 'modern', seasonKey: 'f2-current', scenarioKey: 'modern', builderKey: 'modern', name: 'Formula 2 · current', era: 'Feature and sprint', racePoints: [25,18,15,12,10,8,6,4,2,1], sprintPoints: [10,8,6,5,4,3,2,1], qualifyingPoints: [], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10 }],
  f3: [
    { key: 'modern', seasonKey: 'f3-current', scenarioKey: 'modern', builderKey: 'modern', name: 'Formula 3 · current', era: 'Current feature and sprint', racePoints: [25,18,15,12,10,8,6,4,2,1], sprintPoints: [10,9,8,7,6,5,4,3,2,1], qualifyingPoints: [], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10 },
    { key: 'f3-legacy', seasonKey: 'f3-legacy', scenarioKey: 'f3-legacy', builderKey: 'f3-legacy', name: 'Formula 3 · 2019–2021', era: 'Legacy sprint format', racePoints: [25,18,15,12,10,8,6,4,2,1], sprintPoints: [15,12,10,8,6,5,4,3,2,1], qualifyingPoints: [], poleBonus: 4, fastestLapBonus: 2, fastestLapMaxPosition: 10 }
  ],
  academy: [{ key: 'modern', seasonKey: 'academy-current', scenarioKey: 'modern', builderKey: 'modern', name: 'F1 Academy · official', era: 'Standard and reverse-grid races', racePoints: [25,18,15,12,10,8,6,4,2,1], sprintPoints: [10,8,6,5,4,3,2,1], qualifyingPoints: [], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10 }],
  fe: FORMULA_E_POINTS_PRESETS
};
const officialPresets = pointsSeries === 'f1' ? F1_PRESETS : JUNIOR_PRESETS[pointsSeries];

let systems = [];
let currentUser = null;
let pointEditors = { racePoints: [], sprintPoints: [], qualifyingPoints: [] };

function normaliseSystem(system = {}) {
  return {
    ...system,
    racePoints: [...(system.racePoints || [])], sprintPoints: [...(system.sprintPoints || [])], qualifyingPoints: [...(system.qualifyingPoints || [])],
    poleBonus: Number(system.poleBonus || 0), fastestLapBonus: Number(system.fastestLapBonus || 0), fastestLapMaxPosition: system.fastestLapMaxPosition || null,
    countBestRounds: system.countBestRounds || null, bestFirstRounds: system.bestFirstRounds || null, firstRoundsWindow: system.firstRoundsWindow || null,
    bestLastRounds: system.bestLastRounds || null, lastRoundsWindow: system.lastRoundsWindow || null, sprintCountsTowardRound: system.sprintCountsTowardRound !== false,
    visibility: system.visibility === 'public' ? 'public' : 'private'
  };
}

function pointText(value) { return `${fmtNumber(value || 0)} ${Number(value) === 1 ? 'pt' : 'pts'}`; }
function scoringRoute(tool) {
  if (tool === 'season') return pointsSeries === 'f1' ? '/simulator' : `${pointsBase}/simulate-season`;
  return `${pointsBase}/${tool === 'scenario' ? 'scenario-calculator' : 'championship-builder'}`;
}
function useLinks(key, compact = false) {
  if (!key) return '<small>Save this ruleset to use it in the simulator tools.</small>';
  const query = `?points=${encodeURIComponent(key)}`;
  return `${compact ? '' : '<span>Use these rules in</span>'}<a href="${scoringRoute('season')}${query}">Season simulator</a><a href="${scoringRoute('scenario')}${query}">Scenario calculator</a><a href="${scoringRoute('builder')}${query}">Championship builder</a>`;
}
function countingDescription(system) {
  if (system.countBestRounds) return `Best ${system.countBestRounds} rounds count toward the championship.`;
  const segments = [];
  if (system.bestFirstRounds) segments.push(`best ${system.bestFirstRounds} of the first ${system.firstRoundsWindow}`);
  if (system.bestLastRounds) segments.push(`best ${system.bestLastRounds} of the last ${system.lastRoundsWindow}`);
  return segments.length ? `${segments.join(' and ')} rounds count.` : 'Every championship round counts.';
}
function systemDetails(system) {
  const parts = [`Race ${system.racePoints.join('–') || 'none'}`];
  if (system.sprintPoints.length) parts.push(`${isAcademyPointsPage ? 'Reverse-grid' : 'Sprint'} ${system.sprintPoints.join('–')}`);
  if (system.qualifyingPoints.length) parts.push(`Qualifying ${system.qualifyingPoints.join('–')}`);
  if (system.poleBonus) parts.push(`${pointText(system.poleBonus)} pole`);
  if (system.fastestLapBonus) parts.push(`${pointText(system.fastestLapBonus)} fastest lap${system.fastestLapMaxPosition ? ` · top ${system.fastestLapMaxPosition}` : ''}`);
  parts.push(countingDescription(system).replace(/\.$/, ''));
  return parts.join(' · ');
}

function historicalSystems() {
  if (pointsSeries !== 'f1') {
    return officialPresets.map(system => {
      const normalized = normaliseSystem(system);
      return { ...normalized, key: system.seasonKey, label: system.name, seasons: system.name, constructorRacePoints: [...normalized.racePoints], constructorsAvailable: true, source: system };
    });
  }
  return Object.entries(F1_POINTS_SYSTEMS).map(([key, source]) => ({
    key,
    label: source.name,
    seasons: source.name.replace(/ ·.*$/, ''),
    racePoints: [...(source.race || [])],
    constructorRacePoints: [...(source.constructorRace || source.race || [])],
    sprintPoints: [...(source.sprint || [])],
    qualifyingPoints: [],
    poleBonus: Number(source.poleBonus || 0),
    fastestLapBonus: Number(source.fastestLapBonus || 0),
    fastestLapMaxPosition: source.fastestLapMaxPosition || null,
    countBestRounds: source.countBest === Infinity ? null : source.countBest || null,
    bestFirstRounds: source.bestFirstRounds || null,
    firstRoundsWindow: source.firstRoundsWindow || null,
    bestLastRounds: source.bestLastRounds || null,
    lastRoundsWindow: source.lastRoundsWindow || null,
    constructorCountBest: source.constructorCountBest,
    constructorScoringCars: source.constructorScoringCars,
    constructorsAvailable: source.constructorsAvailable !== false,
    doublePointsFinalRound: Boolean(source.doublePointsFinalRound),
    source
  })).sort((first, second) => (historyYears(first)[0] || 0) - (historyYears(second)[0] || 0));
}

function historyYears(system) {
  if (Array.isArray(system.years)) return system.years;
  const match = String(system.key).match(/^(\d{4})(?:-(\d{4}|present))?$/);
  if (!match) return [];
  const start = Number(match[1]), end = match[2] === 'present' || !match[2] ? (match[2] ? new Date().getFullYear() : start) : Number(match[2]);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function historicalCounting(system) {
  if (system.bestFirstRounds || system.bestLastRounds) {
    const parts = [];
    if (system.bestFirstRounds) parts.push(`best ${system.bestFirstRounds} of the first ${system.firstRoundsWindow}`);
    if (system.bestLastRounds) parts.push(`best ${system.bestLastRounds} of the last ${system.lastRoundsWindow}`);
    return `${parts.join(' and ')} results counted`;
  }
  return system.countBestRounds ? `Best ${system.countBestRounds} results counted` : 'Every result counted';
}

function historicalNotes(system) {
  const notes = [];
  if (!system.constructorsAvailable) notes.push('No Constructors’ Championship');
  else if (system.constructorScoringCars === 1) notes.push('Best-placed constructor car scored');
  if (system.constructorRacePoints.join(',') !== system.racePoints.join(',')) notes.push(`Constructors used ${system.constructorRacePoints.join('–')}`);
  if (system.fastestLapBonus) notes.push(`${pointText(system.fastestLapBonus)} for fastest lap${system.fastestLapMaxPosition ? ` inside the top ${system.fastestLapMaxPosition}` : ''}`);
  if (system.sprintPoints.length) notes.push(`Sprint ${system.sprintPoints.join('–')}`);
  if (system.doublePointsFinalRound) notes.push('Final round awarded double points');
  notes.push(historicalCounting(system));
  return notes;
}

function historyChange(system, previous) {
  if (!previous) {
    const additions = [];
    if (system.sprintPoints.length) additions.push(`points for ${system.sprintPoints.length} secondary-race positions`);
    if (system.fastestLapBonus) additions.push('a fastest-lap bonus');
    if (system.poleBonus) additions.push('a pole bonus');
    const additionText = additions.length > 1 ? `${additions.slice(0, -1).join(', ')} and ${additions.at(-1)}` : additions[0];
    return `The archive begins with ${system.racePoints[0]} points for a win and points for the top ${system.racePoints.length}${additionText ? `, plus ${additionText}` : ''}.`;
  }
  const changes = [];
  if (system.racePoints[0] !== previous.racePoints[0]) changes.push(`a win changed from ${previous.racePoints[0]} to ${system.racePoints[0]} points`);
  if (system.racePoints.length !== previous.racePoints.length) changes.push(`${system.racePoints.length} positions now scored`);
  if (Boolean(system.fastestLapBonus) !== Boolean(previous.fastestLapBonus)) changes.push(system.fastestLapBonus ? 'the fastest-lap bonus returned' : 'the fastest-lap bonus was removed');
  if (Boolean(system.sprintPoints.length) !== Boolean(previous.sprintPoints.length)) changes.push(system.sprintPoints.length ? 'sprint points were introduced' : 'sprint points were removed');
  if (system.doublePointsFinalRound !== previous.doublePointsFinalRound) changes.push(system.doublePointsFinalRound ? 'the finale awarded double points' : 'double points ended');
  if (historicalCounting(system) !== historicalCounting(previous)) changes.push('the results-counting rule changed');
  return changes.length ? `${changes.join('; ')}.` : 'The points scale stayed stable while the applicable season changed.';
}

function historicalSystemCard(system, previous, canCompare) {
  const preset = officialPresets.find(item => item.seasonKey === system.key);
  const notes = historicalNotes(system);
  return `<article class="points-history-card" id="points-system-${esc(system.key)}"><div class="points-history-card-heading"><h3>${esc(system.label)}</h3>${canCompare ? `<button type="button" data-compare-system="${esc(system.key)}">Compare</button>` : ''}</div><div class="points-score-strip" tabindex="0" aria-label="${esc(system.label)} race points by finishing position">${system.racePoints.map((value, index) => `<span><small>P${index + 1}</small><strong>${fmtNumber(value)}</strong></span>`).join('')}</div><p class="points-history-change"><strong>What changed</strong>${esc(historyChange(system, previous))}</p><details><summary>Full scoring rules</summary><ul>${notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul></details>${preset && currentUser ? `<div class="points-card-actions"><button type="button" data-copy-preset="${esc(preset.key)}">Customize</button></div>` : ''}</article>`;
}

function populateHistoryControls(history) {
  const season = document.getElementById('points-history-season');
  const years = [...new Set(history.flatMap(historyYears))].sort((a, b) => b - a);
  season.innerHTML = `<option value="">All seasons</option>${years.map(year => `<option value="${year}">${year}</option>`).join('')}`;
  const requestedSeason = new URLSearchParams(location.search).get('season');
  if (years.includes(Number(requestedSeason))) season.value = requestedSeason;
  document.getElementById('points-history-search').value = String(new URLSearchParams(location.search).get('q') || '').slice(0, 80);
  const first = document.getElementById('points-compare-first'), second = document.getElementById('points-compare-second');
  const canCompare = history.length > 1;
  document.getElementById('compare-systems').hidden = !canCompare;
  document.querySelector('[data-points-nav="compare"]').hidden = !canCompare;
  const options = history.map(item => `<option value="${esc(item.key)}">${esc(item.label)}</option>`).join('');
  first.innerHTML = options;
  second.innerHTML = options;
  const requested = (new URLSearchParams(location.search).get('compare') || '').split(',');
  const defaults = pointsSeries === 'f1' ? ['1982-1990', '2025-present'] : [history[0]?.key, history.at(-1)?.key];
  first.value = history.some(item => item.key === requested[0]) ? requested[0] : defaults[0];
  second.value = history.some(item => item.key === requested[1]) ? requested[1] : defaults[1];
}

function renderHistoricalSystems() {
  const history = historicalSystems();
  const query = document.getElementById('points-history-search').value.trim().toLocaleLowerCase();
  const season = Number(document.getElementById('points-history-season').value);
  const visible = history.filter(system => (!season || historyYears(system).includes(season)) && (!query || `${system.label} ${system.seasons} ${system.racePoints.join(' ')} ${historicalNotes(system).join(' ')}`.toLocaleLowerCase().includes(query)));
  document.getElementById('points-history-count').textContent = `${history.length} official system${history.length === 1 ? '' : 's'}`;
  document.getElementById('points-history-summary').textContent = `${visible.length} system${visible.length === 1 ? '' : 's'} shown${season ? ` for ${season}` : ''}`;
  document.getElementById('official-systems').innerHTML = visible.length ? visible.map(system => historicalSystemCard(system, history[history.indexOf(system) - 1], history.length > 1)).join('') : '<div class="empty-state">No official system matches these filters.</div>';
  document.querySelectorAll('[data-compare-system]').forEach(button => button.addEventListener('click', () => {
    const first = document.getElementById('points-compare-first'), second = document.getElementById('points-compare-second');
    if (first.value === button.dataset.compareSystem) second.value = history.find(item => item.key !== button.dataset.compareSystem)?.key || button.dataset.compareSystem;
    else second.value = button.dataset.compareSystem;
    renderHistoricalComparison({ updateUrl: true });
    document.getElementById('compare-systems').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  document.querySelectorAll('[data-copy-preset]').forEach(button => button.addEventListener('click', () => editSystem(officialPresets.find(item => item.key === button.dataset.copyPreset), { copy: true })));
}

function comparisonValue(system, field) {
  if (field === 'race') return system.racePoints.join('–') || 'None';
  if (field === 'sprint') return system.sprintPoints.join('–') || 'None';
  if (field === 'bonuses') return [system.poleBonus ? `${pointText(system.poleBonus)} pole` : '', system.fastestLapBonus ? `${pointText(system.fastestLapBonus)} fastest lap${system.fastestLapMaxPosition ? ` · top ${system.fastestLapMaxPosition}` : ''}` : ''].filter(Boolean).join(' · ') || 'None';
  if (field === 'constructors') {
    if (!system.constructorsAvailable) return 'No Constructors’ Championship';
    const parts = [];
    if (system.constructorRacePoints.join(',') !== system.racePoints.join(',')) parts.push(`Points ${system.constructorRacePoints.join('–')}`);
    if (system.constructorScoringCars === 1) parts.push('Best-placed car scored');
    return parts.join(' · ') || 'Same scale as drivers';
  }
  if (field === 'special') return system.doublePointsFinalRound ? 'Final round awarded double points' : 'None';
  return historicalCounting(system);
}

function renderHistoricalComparison({ updateUrl = false } = {}) {
  const systemsHistory = historicalSystems();
  const first = systemsHistory.find(item => item.key === document.getElementById('points-compare-first').value) || systemsHistory[0];
  const second = systemsHistory.find(item => item.key === document.getElementById('points-compare-second').value) || systemsHistory.at(-1);
  if (!first || !second) return;
  const rows = [['Race points', 'race'], ['Sprint / secondary race', 'sprint'], ['Bonuses', 'bonuses'], ['Counting rule', 'counting'], ['Constructors', 'constructors'], ['Special rules', 'special']];
  document.getElementById('points-compare-result').innerHTML = `<table><caption>${esc(first.label)} compared with ${esc(second.label)}</caption><thead><tr><th scope="col">Rule</th><th scope="col">${esc(first.label)}</th><th scope="col">${esc(second.label)}</th></tr></thead><tbody>${rows.map(([label, field]) => { const one = comparisonValue(first, field), two = comparisonValue(second, field); return `<tr class="${one === two ? '' : 'is-different'}"><th scope="row">${label}</th><td>${esc(one)}</td><td>${esc(two)}</td></tr>`; }).join('')}</tbody></table><div class="points-compare-actions"><a class="button primary" href="${scoringRoute('season')}?points=${encodeURIComponent(first.key)}">Apply ${esc(first.label)}</a><a class="button secondary" href="${scoringRoute('season')}?points=${encodeURIComponent(second.key)}">Apply ${esc(second.label)}</a></div>`;
  if (updateUrl) {
    const params = new URLSearchParams(location.search);
    params.set('compare', `${first.key},${second.key}`);
    window.history.replaceState(null, '', `${location.pathname}?${params}#compare-systems`);
  }
}

function presetCard(system) {
  const preset = normaliseSystem(system);
  return `<article class="points-preset-card"><span>${esc(preset.era)}</span><strong>${esc(preset.name)}</strong><small>${esc(systemDetails(preset))}</small><div class="points-card-actions"><a href="${scoringRoute('season')}?points=${encodeURIComponent(preset.seasonKey)}">Use preset</a>${currentUser ? `<button type="button" data-copy-preset="${esc(preset.key)}">Customize</button>` : ''}<a href="${scoringRoute('scenario')}?points=${encodeURIComponent(preset.scenarioKey)}">Scenario</a>${preset.builderKey ? `<a href="${scoringRoute('builder')}?points=${encodeURIComponent(preset.builderKey)}">Builder</a>` : ''}</div></article>`;
}
function renderPresets() {
  const history = historicalSystems();
  populateHistoryControls(history);
  renderHistoricalSystems();
  renderHistoricalComparison();
  if (['#historical-systems', '#compare-systems', '#your-systems'].includes(location.hash)) {
    document.querySelector(location.hash)?.scrollIntoView({ block: 'start' });
  }
}

function systemCard(system, editable = false) {
  const item = normaliseSystem(system), key = `custom:${item.id}`;
  const accountLink = `/account?series=${encodeURIComponent(pointsSeries)}`;
  return `<article class="points-system-card"><span>${esc(item.visibility)}${!editable ? ` · ${esc(item.ownerName || 'Community')}` : ' · yours'}</span><strong>${esc(item.name)}</strong><small>${esc(systemDetails(item))}</small><div class="points-card-actions"><a href="${scoringRoute('season')}?points=${encodeURIComponent(key)}">Use system</a>${editable ? `<button type="button" data-system-id="${esc(item.id)}">Edit</button>` : currentUser ? `<button type="button" data-copy-system="${esc(item.id)}">Copy & edit</button>` : `<a href="${accountLink}">Sign in to copy</a>`}<a href="${scoringRoute('builder')}?points=${encodeURIComponent(key)}">Builder</a></div></article>`;
}
function renderSystems() {
  const owned = systems.filter(system => system.owned), query = document.getElementById('points-community-search').value.trim().toLocaleLowerCase();
  const published = systems.filter(system => !system.owned).filter(system => !query || `${system.name} ${system.ownerName} ${systemDetails(normaliseSystem(system))}`.toLocaleLowerCase().includes(query));
  document.getElementById('saved-systems').innerHTML = currentUser ? (owned.length ? owned.map(system => systemCard(system, true)).join('') : '<div class="empty-state">Create a ruleset or customize an official preset to start your library.</div>') : '<div class="empty-state">Sign in to view and manage private points systems.</div>';
  document.getElementById('public-systems').innerHTML = published.length ? published.map(system => systemCard(system)).join('') : `<div class="empty-state">${query ? 'No public rules match this search.' : 'No public points systems have been shared yet.'}</div>`;
  document.querySelectorAll('[data-system-id]').forEach(button => button.addEventListener('click', () => editSystem(systems.find(system => String(system.id) === button.dataset.systemId))));
  document.querySelectorAll('[data-copy-system]').forEach(button => button.addEventListener('click', () => editSystem(systems.find(system => String(system.id) === button.dataset.copySystem), { copy: true })));
}

function renderPositionEditor(name) {
  const container = document.querySelector(`[data-points-editor="${name}"]`), values = pointEditors[name];
  container.innerHTML = values.length ? values.map((value, index) => `<label class="points-position-row"><span>P${index + 1}</span><input type="number" min="0" max="1000" step="0.5" value="${esc(value)}" aria-label="${name.replace('Points', '')} position ${index + 1} points" data-point-field="${name}" data-point-index="${index}"><button type="button" data-remove-point="${name}" data-point-index="${index}" aria-label="Remove position ${index + 1}">×</button></label>`).join('') : '<div class="empty-state">No positions receive points.</div>';
}
function renderAllPositionEditors() { Object.keys(pointEditors).forEach(renderPositionEditor); syncPointInputs(); }
function syncPointInputs() { Object.entries(pointEditors).forEach(([name, values]) => { systemForm.elements[name].value = values.join(','); }); }
function parsePointsInput(value) { return String(value || '').split(',').map(item => item.trim()).filter(Boolean).map(Number); }

function countingModeFor(system) { return system.countBestRounds ? 'best' : system.bestFirstRounds || system.bestLastRounds ? 'segmented' : 'all'; }
function syncCountingFields() {
  const mode = systemForm.elements.countingMode.value;
  document.querySelectorAll('[data-counting-fields]').forEach(group => { group.hidden = group.dataset.countingFields !== mode; });
  ['countBestRounds'].forEach(name => { systemForm.elements[name].disabled = mode !== 'best'; });
  ['bestFirstRounds','firstRoundsWindow','bestLastRounds','lastRoundsWindow'].forEach(name => { systemForm.elements[name].disabled = mode !== 'segmented'; });
}
function systemPayload() {
  syncPointInputs();
  const values = Object.fromEntries(new FormData(systemForm)), mode = systemForm.elements.countingMode.value;
  return normaliseSystem({
    name: values.name, racePoints: parsePointsInput(values.racePoints), sprintPoints: parsePointsInput(values.sprintPoints), qualifyingPoints: parsePointsInput(values.qualifyingPoints),
    poleBonus: Number(values.poleBonus || 0), fastestLapBonus: Number(values.fastestLapBonus || 0), fastestLapMaxPosition: values.fastestLapMaxPosition || null,
    countBestRounds: mode === 'best' ? values.countBestRounds || null : null,
    bestFirstRounds: mode === 'segmented' ? values.bestFirstRounds || null : null, firstRoundsWindow: mode === 'segmented' ? values.firstRoundsWindow || null : null,
    bestLastRounds: mode === 'segmented' ? values.bestLastRounds || null : null, lastRoundsWindow: mode === 'segmented' ? values.lastRoundsWindow || null : null,
    sprintCountsTowardRound: systemForm.elements.sprintCountsTowardRound.checked, visibility: values.visibility
  });
}
function validateSystem(system) {
  if (system.name.trim().length < 2) return 'Give this system a name of at least two characters.';
  if (!system.racePoints.length) return 'Award points to at least one race position.';
  const allPoints = [...system.racePoints,...system.sprintPoints,...system.qualifyingPoints];
  if ([system.racePoints,system.sprintPoints,system.qualifyingPoints].some(points => points.length > 30)) return 'A classification can award points to at most 30 positions.';
  if (allPoints.some(value => !Number.isFinite(value) || value < 0 || value > 1000)) return 'Position points must be between 0 and 1,000.';
  if (![system.poleBonus,system.fastestLapBonus].every(value => Number.isFinite(value) && value >= 0 && value <= 1000)) return 'Bonus points must be between 0 and 1,000.';
  if (system.fastestLapMaxPosition && (!Number.isInteger(Number(system.fastestLapMaxPosition)) || system.fastestLapMaxPosition < 1 || system.fastestLapMaxPosition > 30)) return 'Fastest-lap eligibility must be a finishing position from 1 to 30.';
  if (system.countBestRounds && (!Number.isInteger(Number(system.countBestRounds)) || system.countBestRounds < 1 || system.countBestRounds > 100)) return 'Best-round count must be a whole number between 1 and 100.';
  if ([system.bestFirstRounds,system.firstRoundsWindow,system.bestLastRounds,system.lastRoundsWindow].filter(Boolean).some(value => !Number.isInteger(Number(value)) || value < 1 || value > 100)) return 'Segment values must be whole numbers between 1 and 100.';
  if (systemForm.elements.countingMode.value === 'best' && !system.countBestRounds) return 'Enter how many of the best rounds should count.';
  if (systemForm.elements.countingMode.value === 'segmented' && !system.bestFirstRounds && !system.bestLastRounds) return 'Configure at least one first- or last-season segment.';
  if ((system.bestFirstRounds && !system.firstRoundsWindow) || (!system.bestFirstRounds && system.firstRoundsWindow)) return 'Complete both fields for the first-season segment.';
  if ((system.bestLastRounds && !system.lastRoundsWindow) || (!system.bestLastRounds && system.lastRoundsWindow)) return 'Complete both fields for the last-season segment.';
  if (Number(system.bestFirstRounds) > Number(system.firstRoundsWindow)) return 'First-segment results cannot exceed its race window.';
  if (Number(system.bestLastRounds) > Number(system.lastRoundsWindow)) return 'Last-segment results cannot exceed its race window.';
  return '';
}
function previewScore(value) { return value.length ? value.join('–') : 'No points'; }
function updatePreview({ saveDraft = true } = {}) {
  syncCountingFields();
  const system = systemPayload(), error = validateSystem(system), id = systemForm.elements.id.value;
  document.getElementById('points-preview-name').textContent = system.name || 'Untitled points system';
  const status = document.getElementById('points-preview-status'); status.textContent = error || 'Rules are valid and ready to save.'; status.classList.toggle('is-error', Boolean(error));
  document.getElementById('points-preview-scores').innerHTML = `<div><span>Race</span><strong>${esc(previewScore(system.racePoints))}</strong></div><div><span>${isAcademyPointsPage ? 'Reverse-grid' : 'Sprint'}</span><strong>${esc(previewScore(system.sprintPoints))}</strong></div><div><span>Qualifying</span><strong>${esc(previewScore(system.qualifyingPoints))}</strong></div><div><span>Bonuses</span><strong>${pointText(system.poleBonus)} pole · ${pointText(system.fastestLapBonus)} fastest lap</strong></div>`;
  document.getElementById('points-preview-counting').textContent = countingDescription(system);
  document.getElementById('points-preview-links').innerHTML = useLinks(id ? `custom:${id}` : null);
  systemForm.querySelector('[type="submit"]').disabled = Boolean(error);
  if (saveDraft && currentUser) { try { sessionStorage.setItem(pointsDraftKey, JSON.stringify({ ...system, id })); } catch {} }
}

function applySystemToForm(source, { copy = false } = {}) {
  const system = normaliseSystem(source);
  systemForm.reset();
  systemForm.elements.id.value = copy ? '' : system.id || '';
  systemForm.elements.name.value = copy ? `${system.name} copy` : system.name || '';
  pointEditors = { racePoints: system.racePoints, sprintPoints: system.sprintPoints, qualifyingPoints: system.qualifyingPoints };
  systemForm.elements.poleBonus.value = system.poleBonus;
  systemForm.elements.fastestLapBonus.value = system.fastestLapBonus;
  systemForm.elements.fastestLapMaxPosition.value = system.fastestLapMaxPosition || '';
  systemForm.elements.countingMode.value = countingModeFor(system);
  ['countBestRounds','bestFirstRounds','firstRoundsWindow','bestLastRounds','lastRoundsWindow'].forEach(name => { systemForm.elements[name].value = system[name] || ''; });
  systemForm.elements.visibility.value = copy ? 'private' : system.visibility;
  systemForm.elements.sprintCountsTowardRound.checked = system.sprintCountsTowardRound;
  renderAllPositionEditors(); updatePreview({ saveDraft: false });
}
function readDraft() { try { return JSON.parse(sessionStorage.getItem(pointsDraftKey) || 'null'); } catch { return null; } }
function editSystem(system = null, options = {}) {
  if (!currentUser) return;
  const draft = !system && !options.fresh ? readDraft() : null, source = system || draft || { ...officialPresets[0], name: '' };
  applySystemToForm(source, { copy: options.copy });
  if (draft?.id && !system) systemForm.elements.id.value = draft.id;
  systemForm.hidden = false;
  const editing = Boolean(systemForm.elements.id.value);
  document.getElementById('points-form-kicker').textContent = options.copy ? 'COPY RULESET' : draft && !system ? 'RECOVERED DRAFT' : editing ? 'EDIT RULESET' : 'NEW RULESET';
  document.getElementById('points-form-title').textContent = editing ? systemForm.elements.name.value : options.copy ? 'Customize points system' : 'Create points system';
  document.getElementById('delete-system-button').hidden = !editing;
  document.getElementById('points-system-message').textContent = draft && !system ? 'Your unfinished rules were restored.' : '';
  systemForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadSystems() { systems = await getJSON('/api/points-systems'); renderSystems(); }
async function initialise() {
  try {
    const seriesName = isFormulaEPointsPage ? 'Formula E' : isAcademyPointsPage ? 'F1 Academy' : isF3PointsPage ? 'Formula 3' : isF2PointsPage ? 'Formula 2' : 'Formula 1';
    document.querySelector('.points-page-heading .eyebrow').textContent = `${seriesName.toUpperCase()} CHAMPIONSHIP RULES`;
    document.querySelector('.points-page-heading h1').textContent = `Explore ${seriesName} scoring history`;
    document.querySelector('.points-page-heading p').textContent = `Browse available official ${seriesName} systems, compare their race, ${isAcademyPointsPage ? 'reverse-grid race' : 'sprint'}, bonus and counting rules, or create your own.`;
    document.getElementById('points-history-title').textContent = `${seriesName} points systems`;
    document.querySelector('#points-login-prompt a').href = `/account?series=${encodeURIComponent(pointsSeries)}`;
    if (isAcademyPointsPage) { document.getElementById('sprint-score-label').textContent = 'Reverse-grid race'; document.getElementById('sprint-score-note').textContent = 'Optional reverse-grid classification'; document.getElementById('sprint-counting-label').textContent = 'Include reverse-grid race points in the round before applying result limits'; }
    if (isFormulaEPointsPage) {
      document.getElementById('sprint-score-label').closest('.points-score-group').hidden = true;
      document.getElementById('sprint-counting-label').closest('label').hidden = true;
      document.querySelector('.points-page-heading p').textContent = 'Browse official Formula E scoring eras, compare E-Prix bonuses and counting rules, or create your own.';
    }
    const account = await getJSON('/api/account'); currentUser = account.user;
    document.getElementById('points-login-prompt').hidden = Boolean(currentUser); document.getElementById('new-system-button').hidden = !currentUser;
    renderPresets(); await loadSystems();
    const copyId = new URLSearchParams(location.search).get('copy');
    const copySource = copyId ? systems.find(system => String(system.id) === copyId) : null;
    if (copySource && currentUser) editSystem(copySource, { copy: true });
    else if (copySource) {
      document.getElementById('points-community-search').value = copySource.name;
      renderSystems();
      document.getElementById('public-systems').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    else if (['#historical-systems', '#compare-systems', '#your-systems'].includes(location.hash)) {
      window.setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }), 100);
    }
  } catch (error) { setError('saved-systems', error.message); renderPresets(); }
}

document.getElementById('new-system-button').addEventListener('click', () => editSystem());
document.getElementById('cancel-system-button').addEventListener('click', () => { systemForm.hidden = true; });
document.getElementById('reset-system-button').addEventListener('click', () => { if (window.confirm('Reset this editor to the official preset?')) { try { sessionStorage.removeItem(pointsDraftKey); } catch {} applySystemToForm({ ...officialPresets[0], name: '' }); document.getElementById('points-system-message').textContent = 'Editor reset.'; } });
function updateHistoryUrl() {
  const params = new URLSearchParams(location.search);
  const season = document.getElementById('points-history-season').value;
  const query = document.getElementById('points-history-search').value.trim();
  if (season) params.set('season', season); else params.delete('season');
  if (query) params.set('q', query); else params.delete('q');
  window.history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}#historical-systems`);
}
document.getElementById('points-history-filters').addEventListener('submit', event => event.preventDefault());
document.getElementById('points-history-search').addEventListener('input', () => { renderHistoricalSystems(); updateHistoryUrl(); });
document.getElementById('points-history-season').addEventListener('change', () => { renderHistoricalSystems(); updateHistoryUrl(); });
document.getElementById('points-history-clear').addEventListener('click', () => {
  document.getElementById('points-history-search').value = '';
  document.getElementById('points-history-season').value = '';
  renderHistoricalSystems(); updateHistoryUrl();
});
['points-compare-first', 'points-compare-second'].forEach(id => document.getElementById(id).addEventListener('change', () => renderHistoricalComparison({ updateUrl: true })));
document.getElementById('points-compare-copy').addEventListener('click', async event => {
  renderHistoricalComparison({ updateUrl: true });
  try {
    await navigator.clipboard.writeText(location.href);
    const original = event.currentTarget.textContent; event.currentTarget.textContent = 'Copied';
    setTimeout(() => { event.currentTarget.textContent = original; }, 1400);
  } catch { event.currentTarget.textContent = 'Copy unavailable'; }
});
function updatePointsLocalNav() {
  const section = location.hash === '#compare-systems' ? 'compare' : location.hash === '#your-systems' ? 'custom' : 'history';
  document.querySelectorAll('[data-points-nav]').forEach(link => {
    if (link.dataset.pointsNav === section) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}
document.querySelectorAll('[data-points-nav]').forEach(link => link.addEventListener('click', () => requestAnimationFrame(updatePointsLocalNav)));
window.addEventListener('hashchange', updatePointsLocalNav);
updatePointsLocalNav();
document.getElementById('points-community-search').addEventListener('input', renderSystems);
document.querySelectorAll('[data-add-points-position]').forEach(button => button.addEventListener('click', () => { pointEditors[button.dataset.addPointsPosition].push(0); renderPositionEditor(button.dataset.addPointsPosition); updatePreview(); }));
systemForm.addEventListener('input', event => { if (event.target.matches('[data-point-field]')) pointEditors[event.target.dataset.pointField][Number(event.target.dataset.pointIndex)] = event.target.value === '' ? NaN : Number(event.target.value); updatePreview(); });
systemForm.addEventListener('click', event => { const button = event.target.closest('[data-remove-point]'); if (!button) return; pointEditors[button.dataset.removePoint].splice(Number(button.dataset.pointIndex), 1); renderPositionEditor(button.dataset.removePoint); updatePreview(); });
systemForm.addEventListener('submit', async event => {
  event.preventDefault(); const payload = systemPayload(), validation = validateSystem(payload), id = systemForm.elements.id.value, message = document.getElementById('points-system-message'), submit = systemForm.querySelector('[type="submit"]');
  if (validation) { message.textContent = validation; return; }
  submit.disabled = true; submit.textContent = 'Saving…'; message.textContent = '';
  try {
    const response = await fetch(id ? `/api/points-systems/${encodeURIComponent(id)}` : '/api/points-systems', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to save points system.');
    try { sessionStorage.removeItem(pointsDraftKey); } catch {} await loadSystems(); applySystemToForm(data); document.getElementById('delete-system-button').hidden = false; document.getElementById('points-form-kicker').textContent = 'SAVED RULESET'; document.getElementById('points-form-title').textContent = data.name; message.textContent = 'Points system saved. It is ready to use in every simulator tool.';
  } catch (error) { message.textContent = error.message; } finally { submit.textContent = 'Save points system'; updatePreview({ saveDraft: false }); }
});
document.getElementById('delete-system-button').addEventListener('click', async () => {
  const id = systemForm.elements.id.value, message = document.getElementById('points-system-message'), button = document.getElementById('delete-system-button'); if (!id || !window.confirm('Delete this points system?')) return;
  button.disabled = true; button.textContent = 'Deleting…';
  try { const response = await fetch(`/api/points-systems/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Unable to delete points system.'); } systemForm.hidden = true; try { sessionStorage.removeItem(pointsDraftKey); } catch {} await loadSystems(); }
  catch (error) { message.textContent = error.message; } finally { button.disabled = false; button.textContent = 'Delete system'; }
});

initialise();
