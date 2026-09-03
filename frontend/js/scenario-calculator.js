const SCENARIO_SYSTEMS = {
  modern: { name: 'Modern', race: [25,18,15,12,10,8,6,4,2,1], sprint: [8,7,6,5,4,3,2,1] },
  2003: { name: '2003–2009', race: [10,8,6,5,4,3,2,1], sprint: [] },
  1991: { name: '1991–2002', race: [10,6,4,3,2,1], sprint: [] },
  classic: { name: 'Classic', race: [9,6,4,3,2,1], sprint: [] }
};
const isF2Scenario = window.location.pathname.startsWith('/f2/');
const isAcademyScenario = window.location.pathname.startsWith('/academy/');
const isF3Scenario = window.location.pathname.startsWith('/f3/') || isAcademyScenario;
if (isF2Scenario) SCENARIO_SYSTEMS.modern = { name: 'Formula 2 · current', race: [25,18,15,12,10,8,6,4,2,1], sprint: [10,8,6,5,4,3,2,1], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10 };
if (isF3Scenario) {
  SCENARIO_SYSTEMS.modern = { name: 'Formula 3 · current', race: [25,18,15,12,10,8,6,4,2,1], sprint: [10,9,8,7,6,5,4,3,2,1], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10 };
  SCENARIO_SYSTEMS['f3-legacy'] = { name: 'Formula 3 · 2019–2021', race: [25,18,15,12,10,8,6,4,2,1], sprint: [15,12,10,8,6,5,4,3,2,1], poleBonus: 4, fastestLapBonus: 2, fastestLapMaxPosition: 10 };
}
if (isAcademyScenario) SCENARIO_SYSTEMS.modern = { name: 'F1 Academy · official', race: [25,18,15,12,10,8,6,4,2,1], sprint: [10,8,6,5,4,3,2,1], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10, sprintFastestLapMaxPosition: 8 };

let scenarioData = null;
let predictions = new Map();
let sprintPredictions = new Map();
let polePredictions = new Map();
let fastestLapPredictions = new Map();
let sprintFastestLapPredictions = new Map();
let academyEvents = [];
let academyPredictions = new Map();
let academyPolePredictions = new Map();
let academyFastestLapPredictions = new Map();
let scenarioDirty = false;

function scenarioBase() {
  if (isAcademyScenario) return '/academy';
  if (window.location.pathname.startsWith('/f3/')) return '/f3';
  if (isF2Scenario) return '/f2';
  return '';
}
function scenarioSystem() { return SCENARIO_SYSTEMS[document.getElementById('scenario-points').value]; }
function awarded(position, scale = []) { const index = Number(position) - 1; return index >= 0 && index < scale.length ? Number(scale[index]) : 0; }
function cutoff() { return Number(document.getElementById('scenario-cutoff').value || 0); }
function academyCutoff() { return Number(document.getElementById('scenario-cutoff').value ?? -1); }
function positionValue(value) { return value === 'dnf' ? 0 : value ? Number(value) : null; }
function positionSort(value) { return value === null || value === undefined ? 98 : Number(value) > 0 ? Number(value) : 99; }
function signed(value) { const number = Number(value || 0); return number ? `${number > 0 ? '+' : '−'}${fmtNumber(Math.abs(number))}` : '—'; }
function maximumRoundScore(system = scenarioSystem()) { return Number(system.race?.[0] || 0) + Number(system.sprint?.[0] || 0) + Number(system.poleBonus || 0) + Number(system.fastestLapBonus || 0) * (system.sprint?.length ? 2 : 1); }
function scenarioStorageKey() { return `racelytic:scenario:${scenarioBase() || 'f1'}:${document.getElementById('scenario-season').value}:${document.getElementById('scenario-cutoff').value}`; }

function mapToObject(map) { return Object.fromEntries([...map].map(([key, value]) => [String(key), value instanceof Map ? Object.fromEntries(value) : value])); }
function restoreNestedMap(target, source) {
  Object.entries(source || {}).forEach(([key, values]) => {
    const current = target.get(Number.isNaN(Number(key)) ? key : Number(key));
    if (!current) return;
    Object.entries(values || {}).forEach(([id, value]) => { if (current.has(id)) current.set(id, value); });
  });
}
function saveScenarioState() {
  try {
    const state = isAcademyScenario
      ? { academyPredictions: mapToObject(academyPredictions), academyPolePredictions: mapToObject(academyPolePredictions), academyFastestLapPredictions: mapToObject(academyFastestLapPredictions) }
      : { predictions: mapToObject(predictions), sprintPredictions: mapToObject(sprintPredictions), polePredictions: mapToObject(polePredictions), fastestLapPredictions: mapToObject(fastestLapPredictions), sprintFastestLapPredictions: mapToObject(sprintFastestLapPredictions) };
    sessionStorage.setItem(scenarioStorageKey(), JSON.stringify(state));
  } catch {}
}
function restoreScenarioState() {
  try {
    const state = JSON.parse(sessionStorage.getItem(scenarioStorageKey()) || 'null');
    if (!state) return false;
    if (isAcademyScenario) {
      restoreNestedMap(academyPredictions, state.academyPredictions);
      Object.entries(state.academyPolePredictions || {}).forEach(([key, value]) => academyPolePredictions.set(key, value));
      Object.entries(state.academyFastestLapPredictions || {}).forEach(([key, value]) => academyFastestLapPredictions.set(key, value));
    } else {
      restoreNestedMap(predictions, state.predictions);
      restoreNestedMap(sprintPredictions, state.sprintPredictions);
      Object.entries(state.polePredictions || {}).forEach(([key, value]) => polePredictions.set(Number(key), value));
      Object.entries(state.fastestLapPredictions || {}).forEach(([key, value]) => fastestLapPredictions.set(Number(key), value));
      Object.entries(state.sprintFastestLapPredictions || {}).forEach(([key, value]) => sprintFastestLapPredictions.set(Number(key), value));
    }
    scenarioDirty = true;
    return true;
  } catch { return false; }
}
function markScenarioChanged() { scenarioDirty = true; saveScenarioState(); syncScenarioUrl(); }
function clearSavedScenario() { try { sessionStorage.removeItem(scenarioStorageKey()); } catch {} }

function syncScenarioUrl() {
  const url = new URL(window.location.href);
  const fields = { year: 'scenario-season', cutoff: 'scenario-cutoff', points: 'scenario-points', race: 'scenario-race' };
  Object.entries(fields).forEach(([key, id]) => {
    const value = document.getElementById(id)?.value;
    if (value !== undefined && value !== '') url.searchParams.set(key, value); else url.searchParams.delete(key);
  });
  history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function renderScenarioRules() {
  const system = scenarioSystem();
  if (!system) return;
  const note = isAcademyScenario
    ? 'Each remaining race is edited separately, including its eligible pole and fastest-lap bonuses.'
    : isF3Scenario
      ? 'Sprint and feature classifications plus their bonus recipients are editable for every remaining round.'
      : isF2Scenario
        ? 'Feature-race finish and available bonuses are editable. Recorded sprint classifications are retained where available.'
        : Number(system.poleBonus || 0) || Number(system.fastestLapBonus || 0)
          ? 'Grand Prix finish and available bonuses are editable. Recorded sprint classifications are retained where available.'
          : 'Grand Prix finish is editable. Recorded sprint classifications are retained where available.';
  document.getElementById('scenario-rules').innerHTML = `
    <div><span>Selected rules</span><strong>${esc(system.name)}</strong></div>
    <div><span>Race points</span><strong>${system.race?.join('–') || 'None'}</strong></div>
    <div><span>Sprint points</span><strong>${system.sprint?.join('–') || 'None'}</strong></div>
    <div><span>Bonuses</span><strong>${Number(system.poleBonus || 0)} pole · ${Number(system.fastestLapBonus || 0)} fastest lap</strong></div>
    <div><span>Scoring ceiling</span><strong>${isAcademyScenario ? 'Varies by race type' : `${fmtNumber(maximumRoundScore(system))} pts per round`}</strong></div>
    <p class="scenario-rules-note">${note}</p>`;
}

function initialisePredictions() {
  predictions = new Map(); sprintPredictions = new Map(); polePredictions = new Map(); fastestLapPredictions = new Map(); sprintFastestLapPredictions = new Map();
  scenarioData.calendar.forEach(race => {
    const round = new Map(), sprintRound = new Map();
    let pole = null, fastest = null, sprintFastest = null;
    scenarioData.driverChampionship.forEach(driver => {
      const id = String(driver.driverId), result = driver.raceResults?.[String(race.round)];
      round.set(id, result?.position ? Number(result.position) : null);
      sprintRound.set(id, result?.sprintPosition && Number(result.sprintPosition) < 999 ? Number(result.sprintPosition) : null);
      if (result?.polePosition) pole = id;
      if (result?.fastestLap) fastest = id;
      if (result?.sprintFastestLap) sprintFastest = id;
    });
    predictions.set(Number(race.round), round); sprintPredictions.set(Number(race.round), sprintRound);
    polePredictions.set(Number(race.round), pole); fastestLapPredictions.set(Number(race.round), fastest); sprintFastestLapPredictions.set(Number(race.round), sprintFastest);
  });
  scenarioDirty = false;
}
function resetStandardRound(round) {
  const race = scenarioData.calendar.find(item => Number(item.round) === Number(round));
  if (!race) return;
  let pole = null, fastest = null, sprintFastest = null;
  scenarioData.driverChampionship.forEach(driver => {
    const id = String(driver.driverId), result = driver.raceResults?.[String(round)];
    predictions.get(round).set(id, result?.position ? Number(result.position) : null);
    sprintPredictions.get(round).set(id, result?.sprintPosition && Number(result.sprintPosition) < 999 ? Number(result.sprintPosition) : null);
    if (result?.polePosition) pole = id;
    if (result?.fastestLap) fastest = id;
    if (result?.sprintFastestLap) sprintFastest = id;
  });
  polePredictions.set(round, pole); fastestLapPredictions.set(round, fastest); sprintFastestLapPredictions.set(round, sprintFastest);
}
function updatePrediction(positions, driverId, next) {
  const old = positions.get(driverId);
  if (Number(next) > 0) {
    const other = [...positions.entries()].find(([id, position]) => id !== driverId && position === next);
    if (other) positions.set(other[0], old ?? null);
  }
  positions.set(driverId, next);
}
function positionOptions(drivers, value) {
  return `<option value=""${value == null ? ' selected' : ''}>Unassigned</option><option value="dnf"${value === 0 ? ' selected' : ''}>DNF</option>${drivers.map((_, index) => `<option value="${index + 1}"${value === index + 1 ? ' selected' : ''}>P${index + 1}</option>`).join('')}`;
}
function bonusOptions(drivers, value) {
  return `<option value=""${value == null ? ' selected' : ''}>Unassigned</option><option value="none"${value === 0 ? ' selected' : ''}>No bonus</option>${drivers.map(driver => `<option value="${esc(driver.driverId)}"${String(value) === String(driver.driverId) ? ' selected' : ''}>${esc(driver.name)}</option>`).join('')}`;
}
function bonusValue(value) { return value === 'none' ? 0 : value || null; }

function futureScore(result, position, system, sprintPosition, driverId, round) {
  let points = awarded(position, system.race);
  if (String(polePredictions.get(round)) === String(driverId)) points += Number(system.poleBonus || 0);
  if (String(fastestLapPredictions.get(round)) === String(driverId) && (!system.fastestLapMaxPosition || Number(position) <= system.fastestLapMaxPosition)) points += Number(system.fastestLapBonus || 0);
  points += awarded(sprintPosition, system.sprint || []);
  if (String(sprintFastestLapPredictions.get(round)) === String(driverId) && (!system.fastestLapMaxPosition || Number(sprintPosition) <= system.fastestLapMaxPosition)) points += Number(system.fastestLapBonus || 0);
  return points;
}
function finishCounts(driver, throughRound) {
  const counts = {};
  scenarioData.calendar.filter(race => Number(race.round) <= throughRound).forEach(race => {
    const result = driver.raceResults?.[String(race.round)], past = Number(race.round) <= cutoff();
    const position = past ? result?.position : predictions.get(Number(race.round))?.get(String(driver.driverId));
    const sprintPosition = past ? result?.sprintPosition : sprintPredictions.get(Number(race.round))?.get(String(driver.driverId));
    [position, sprintPosition].forEach(value => { if (Number(value) > 0 && Number(value) < 999) counts[value] = (counts[value] || 0) + 1; });
  });
  return counts;
}
function projectedPoints(driver, throughRound = Infinity) {
  const system = scenarioSystem(), id = String(driver.driverId);
  return scenarioData.calendar.filter(race => Number(race.round) <= throughRound).reduce((sum, race) => {
    const result = driver.raceResults?.[String(race.round)];
    if (Number(race.round) <= cutoff()) return sum + Number(result?.points || 0) + Number(result?.sprintPoints || 0);
    return sum + futureScore(result, predictions.get(Number(race.round))?.get(id), system, isF3Scenario ? sprintPredictions.get(Number(race.round))?.get(id) : result?.sprintPosition, id, Number(race.round));
  }, 0);
}
function standings(throughRound = Infinity) {
  return scenarioData.driverChampionship.map(driver => ({ ...driver, projectedPoints: projectedPoints(driver, throughRound), finishes: finishCounts(driver, throughRound) })).sort((a, b) => {
    if (b.projectedPoints !== a.projectedPoints) return b.projectedPoints - a.projectedPoints;
    for (let position = 1; position <= 30; position += 1) { const difference = (b.finishes[position] || 0) - (a.finishes[position] || 0); if (difference) return difference; }
    return a.name.localeCompare(b.name);
  });
}
function clinchingRound() {
  const future = scenarioData.calendar.filter(race => Number(race.round) > cutoff()), maximum = maximumRoundScore();
  for (const [index, race] of future.entries()) {
    const table = standings(Number(race.round)), remaining = future.length - index - 1, leader = table[0];
    const challengerMaximum = Math.max(...table.slice(1).map(driver => driver.projectedPoints + remaining * maximum));
    if (leader.projectedPoints > challengerMaximum) return race;
  }
  return null;
}
function incompleteStandardRounds() {
  const system = scenarioSystem();
  return scenarioData.calendar.filter(race => Number(race.round) > cutoff()).filter(race => {
    const round = Number(race.round), positions = predictions.get(round);
    return [...positions.values()].some(value => value == null)
      || (Number(system.poleBonus || 0) > 0 && polePredictions.get(round) == null)
      || (Number(system.fastestLapBonus || 0) > 0 && fastestLapPredictions.get(round) == null)
      || (isF3Scenario && Number(system.fastestLapBonus || 0) > 0 && sprintFastestLapPredictions.get(round) == null);
  }).length;
}

function renderScenarioGrid() {
  const round = Number(document.getElementById('scenario-race').value), race = scenarioData.calendar.find(item => Number(item.round) === round), positions = predictions.get(round), sprintPositions = sprintPredictions.get(round);
  const container = document.getElementById('scenario-grid');
  if (!race) { container.innerHTML = '<div class="empty-state">The selected cutoff leaves no races to predict.</div>'; return; }
  const drivers = [...scenarioData.driverChampionship].sort((a, b) => positionSort(positions.get(String(a.driverId))) - positionSort(positions.get(String(b.driverId))) || a.name.localeCompare(b.name));
  const assigned = [...positions.values()].filter(value => value != null).length;
  container.innerHTML = `
    <div class="scenario-race-meta"><div class="scenario-race-identity"><span>Round ${race.round}</span><strong>${esc(displayRaceName(race))}</strong><small>${esc(fmtDate(race.date))}</small></div><div class="scenario-race-progress"><strong>${assigned} of ${drivers.length} assigned</strong><small>${drivers.length - assigned ? 'Scenario incomplete' : 'Race classification complete'}</small></div></div>
    <div class="scenario-race-tools">
      <button type="button" data-scenario-action="official">Use official result</button><button type="button" data-scenario-action="clear">Clear race</button><button type="button" data-scenario-action="dnf">Mark remaining DNF</button><button type="button" data-scenario-action="reset">Reset this race</button>
      ${Number(scenarioSystem().poleBonus || 0) ? `<label>Pole recipient<select data-scenario-bonus="pole">${bonusOptions(drivers, polePredictions.get(round))}</select></label>` : ''}
      ${Number(scenarioSystem().fastestLapBonus || 0) ? `<label>Fastest lap<select data-scenario-bonus="fastest">${bonusOptions(drivers, fastestLapPredictions.get(round))}</select></label>` : ''}
      ${isF3Scenario && Number(scenarioSystem().fastestLapBonus || 0) ? `<label>Sprint fastest lap<select data-scenario-bonus="sprint-fastest">${bonusOptions(drivers, sprintFastestLapPredictions.get(round))}</select></label>` : ''}
    </div>
    ${isF3Scenario ? '<div class="scenario-position-heading"><span>Driver</span><span>Sprint</span><span>Feature</span></div>' : ''}
    <div class="scenario-driver-grid">${drivers.map(driver => {
      const id = String(driver.driverId), value = positions.get(id), sprintValue = sprintPositions.get(id);
      const status = value == null ? 'Prediction needed' : value === 0 ? 'Predicted DNF' : `Predicted P${value}`;
      return `<label class="${value == null ? 'is-unassigned' : value === 0 ? 'is-dnf' : ''}"><span><strong>${esc(driver.name)}</strong><small>${status}${!isF3Scenario && driver.raceResults?.[String(round)]?.sprintPosition ? ` · recorded sprint P${driver.raceResults[String(round)].sprintPosition}` : ''}</small></span>${isF3Scenario ? `<div class="scenario-position-selects"><select aria-label="${esc(driver.name)} sprint position" data-scenario-sprint="${esc(id)}">${positionOptions(drivers, sprintValue)}</select><select aria-label="${esc(driver.name)} feature position" data-scenario-driver="${esc(id)}">${positionOptions(drivers, value)}</select></div>` : `<select aria-label="${esc(driver.name)} finishing position" data-scenario-driver="${esc(id)}">${positionOptions(drivers, value)}</select>`}</label>`;
    }).join('')}</div>`;
  container.querySelectorAll('[data-scenario-driver]').forEach(select => select.addEventListener('change', () => { updatePrediction(positions, String(select.dataset.scenarioDriver), positionValue(select.value)); markScenarioChanged(); renderScenarioGrid(); renderScenarioOutlook(); }));
  container.querySelectorAll('[data-scenario-sprint]').forEach(select => select.addEventListener('change', () => { updatePrediction(sprintPositions, String(select.dataset.scenarioSprint), positionValue(select.value)); markScenarioChanged(); renderScenarioGrid(); renderScenarioOutlook(); }));
  container.querySelectorAll('[data-scenario-bonus]').forEach(select => select.addEventListener('change', () => {
    const target = select.dataset.scenarioBonus === 'pole' ? polePredictions : select.dataset.scenarioBonus === 'fastest' ? fastestLapPredictions : sprintFastestLapPredictions;
    target.set(round, bonusValue(select.value)); markScenarioChanged(); renderScenarioOutlook();
  }));
  container.querySelectorAll('[data-scenario-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.scenarioAction;
    if (action === 'official' || action === 'reset') resetStandardRound(round);
    if (action === 'clear') { positions.forEach((_, id) => positions.set(id, null)); sprintPositions.forEach((_, id) => sprintPositions.set(id, null)); polePredictions.set(round, null); fastestLapPredictions.set(round, null); sprintFastestLapPredictions.set(round, null); }
    if (action === 'dnf') { positions.forEach((value, id) => { if (value == null) positions.set(id, 0); }); if (isF3Scenario) sprintPositions.forEach((value, id) => { if (value == null) sprintPositions.set(id, 0); }); }
    markScenarioChanged(); renderScenarioGrid(); renderScenarioOutlook();
  }));
}

function renderScenarioOutlook() {
  const table = standings(), leader = table[0], runnerUp = table[1], currentTable = standings(cutoff()), currentLeader = currentTable[0], roundsLeft = scenarioData.calendar.filter(race => Number(race.round) > cutoff()).length;
  const currentById = new Map(currentTable.map((driver, index) => [String(driver.driverId), { position: index + 1, points: driver.projectedPoints }]));
  const maximum = maximumRoundScore() * roundsLeft, incomplete = incompleteStandardRounds(), clinch = incomplete ? null : clinchingRound(), margin = runnerUp ? leader.projectedPoints - runnerUp.projectedPoints : 0;
  document.getElementById('scenario-summary').innerHTML = `
    <div class="scenario-summary-primary"><span>Projected champion</span><strong>${esc(leader.name)}</strong><small>${fmtNumber(leader.projectedPoints)} points · ${margin ? `leads by ${fmtNumber(margin)} points` : 'ahead on countback'}</small></div>
    <div><span>Official leader at cutoff</span><strong>${esc(currentLeader.name)}</strong><small>${fmtNumber(currentLeader.projectedPoints)} points after round ${cutoff()}</small></div>
    <div><span>Remaining</span><strong>${roundsLeft} round${roundsLeft === 1 ? '' : 's'}</strong><small>Optimistic maximum: ${fmtNumber(maximum)} points</small></div>
    <div><span>Scenario status</span><strong>${incomplete ? `${incomplete} incomplete race${incomplete === 1 ? '' : 's'}` : 'All races assigned'}</strong><small>${incomplete ? 'Unassigned entries score zero for now' : clinch ? `Earliest projected clinch: R${clinch.round} · ${esc(displayRaceName(clinch))}` : 'Title remains open through the final round'}</small></div>`;
  const driverPath = isAcademyScenario ? '/academy/driver' : window.location.pathname.startsWith('/f3/') ? '/f3/driver' : isF2Scenario ? '/f2/driver' : '/driver';
  document.getElementById('scenario-standings').innerHTML = `<div class="scenario-standing-list">${table.map((driver, index) => {
    const current = currentById.get(String(driver.driverId)) || { position: index + 1, points: 0 }, gain = driver.projectedPoints - current.points, maxTotal = current.points + maximum, canReach = maxTotal >= leader.projectedPoints;
    return `<a href="${driverPath}?id=${encodeURIComponent(driver.driverId)}"><b>${index + 1}</b><span><strong>${esc(driver.name)}</strong><small>P${current.position} → P${index + 1} <i class="scenario-standing-movement">${signed(current.position - (index + 1))}</i> · ${gain ? `+${fmtNumber(gain)} predicted` : 'no predicted points'} · max ${fmtNumber(maxTotal)} · ${canReach ? 'can reach leader’s total' : 'maximum below leader'}</small></span><em>${fmtNumber(driver.projectedPoints)}</em></a>`;
  }).join('')}</div>`;
  renderScenarioRules(); syncScenarioUrl();
}

function populateScenarioRaces() {
  const future = scenarioData.calendar.filter(race => Number(race.round) > cutoff()), select = document.getElementById('scenario-race'), requested = new URLSearchParams(window.location.search).get('race'), previous = select.value;
  select.innerHTML = future.map(race => `<option value="${race.round}">R${race.round} · ${esc(displayRaceName(race))}</option>`).join('');
  if ([...select.options].some(option => option.value === requested)) select.value = requested; else if ([...select.options].some(option => option.value === previous)) select.value = previous;
  renderScenarioGrid(); renderScenarioOutlook();
}
async function loadScenarioSeason() {
  const year = document.getElementById('scenario-season').value; if (!year) return;
  document.getElementById('scenario-grid').innerHTML = '<div class="loading-state">Loading championship…</div>';
  try {
    scenarioData = await getJSON(`/api/seasons/${encodeURIComponent(year)}`);
    const select = document.getElementById('scenario-cutoff'), classified = scenarioData.calendar.filter(race => scenarioData.driverChampionship.some(driver => driver.raceResults?.[String(race.round)]?.position)), cutoffRaces = classified.filter(race => Number(race.round) < Number(scenarioData.calendar.at(-1)?.round)), suggested = cutoffRaces.at(-1)?.round || 0, requested = new URLSearchParams(window.location.search).get('cutoff');
    select.innerHTML = `<option value="0">Before round 1</option>${cutoffRaces.map(race => `<option value="${race.round}">After R${race.round} · ${esc(displayRaceName(race))}</option>`).join('')}`;
    select.value = [...select.options].some(option => option.value === requested) ? requested : String(suggested);
    initialisePredictions(); restoreScenarioState(); populateScenarioRaces();
  } catch (error) { setError('scenario-grid', error.message); }
}

function academyInitialisePredictions() {
  academyPredictions = new Map(); academyPolePredictions = new Map(); academyFastestLapPredictions = new Map();
  academyEvents.forEach(event => {
    const positions = new Map(); let pole = null, fastest = null;
    scenarioData.driverChampionship.forEach(driver => {
      const id = String(driver.driverId), result = event.resultByDriver.get(id);
      positions.set(id, Number(result?.positionNumber) > 0 ? Number(result.positionNumber) : null);
      if (result?.polePosition) pole = id; if (result?.fastestLap) fastest = id;
    });
    academyPredictions.set(event.id, positions); academyPolePredictions.set(event.id, pole); academyFastestLapPredictions.set(event.id, fastest);
  });
  scenarioDirty = false;
}
function resetAcademyEvent(event) {
  const positions = academyPredictions.get(event.id); let pole = null, fastest = null;
  scenarioData.driverChampionship.forEach(driver => { const id = String(driver.driverId), result = event.resultByDriver.get(id); positions.set(id, Number(result?.positionNumber) > 0 ? Number(result.positionNumber) : null); if (result?.polePosition) pole = id; if (result?.fastestLap) fastest = id; });
  academyPolePredictions.set(event.id, pole); academyFastestLapPredictions.set(event.id, fastest);
}
function academyFinishCounts(driver, throughIndex = Infinity) {
  const counts = {};
  academyEvents.forEach((event, index) => { if (index > throughIndex) return; const result = event.resultByDriver.get(String(driver.driverId)), position = index <= academyCutoff() ? result?.positionNumber : academyPredictions.get(event.id)?.get(String(driver.driverId)); if (Number(position) > 0) counts[position] = (counts[position] || 0) + 1; });
  return counts;
}
function academyProjectedPoints(driver, throughIndex = Infinity) {
  const system = scenarioSystem(), id = String(driver.driverId);
  return academyEvents.reduce((sum, event, index) => {
    if (index > throughIndex) return sum;
    const result = event.resultByDriver.get(id);
    if (index <= academyCutoff()) return sum + Number(result?.points || 0);
    const scenarioResult = { ...result, polePosition: String(academyPolePredictions.get(event.id)) === id, fastestLap: String(academyFastestLapPredictions.get(event.id)) === id };
    return sum + ScenarioScoring.academyEventScore(event, scenarioResult, academyPredictions.get(event.id)?.get(id), system);
  }, 0);
}
function academyStandings(throughIndex = Infinity) {
  return scenarioData.driverChampionship.map(driver => ({ ...driver, projectedPoints: academyProjectedPoints(driver, throughIndex), finishes: academyFinishCounts(driver, throughIndex) })).sort((a, b) => { if (b.projectedPoints !== a.projectedPoints) return b.projectedPoints - a.projectedPoints; for (let position = 1; position <= 30; position += 1) { const difference = (b.finishes[position] || 0) - (a.finishes[position] || 0); if (difference) return difference; } return a.name.localeCompare(b.name); });
}
function academyMaximumRemaining(afterIndex) { return academyEvents.reduce((sum, event, index) => index > afterIndex ? sum + ScenarioScoring.academyEventMaximum(event, scenarioSystem()) : sum, 0); }
function academyClinchingEvent() { for (let index = academyCutoff() + 1; index < academyEvents.length; index += 1) { const table = academyStandings(index), leader = table[0], remaining = academyMaximumRemaining(index), challengerMaximum = Math.max(...table.slice(1).map(driver => driver.projectedPoints + remaining)); if (leader.projectedPoints > challengerMaximum) return academyEvents[index]; } return null; }
function incompleteAcademyEvents() {
  const system = scenarioSystem();
  return academyEvents.filter((event, index) => index > academyCutoff()).filter(event => [...academyPredictions.get(event.id).values()].some(value => value == null) || (ScenarioScoring.academyPoleEligible(event) && Number(system.poleBonus || 0) > 0 && academyPolePredictions.get(event.id) == null) || (Number(system.fastestLapBonus || 0) > 0 && academyFastestLapPredictions.get(event.id) == null)).length;
}
function academyRenderGrid() {
  const event = academyEvents.find(item => item.id === document.getElementById('scenario-race').value), container = document.getElementById('scenario-grid');
  if (!event) { container.innerHTML = '<div class="empty-state">The selected cutoff leaves no races to predict.</div>'; return; }
  const positions = academyPredictions.get(event.id), drivers = [...scenarioData.driverChampionship].sort((a, b) => positionSort(positions.get(String(a.driverId))) - positionSort(positions.get(String(b.driverId))) || a.name.localeCompare(b.name)), assigned = [...positions.values()].filter(value => value != null).length;
  container.innerHTML = `
    <div class="scenario-race-meta"><div class="scenario-race-identity"><span>Round ${event.round} · ${esc(event.sessionName)}</span><strong>${esc(event.raceName)}</strong><small>${esc(fmtDate(event.date))}</small></div><div class="scenario-race-progress"><strong>${assigned} of ${drivers.length} assigned</strong><small>${drivers.length - assigned ? 'Scenario incomplete' : 'Race classification complete'}</small></div></div>
    <div class="scenario-race-tools"><button type="button" data-academy-action="official">Use official result</button><button type="button" data-academy-action="clear">Clear race</button><button type="button" data-academy-action="dnf">Mark remaining DNF</button><button type="button" data-academy-action="reset">Reset this race</button>${ScenarioScoring.academyPoleEligible(event) && Number(scenarioSystem().poleBonus || 0) ? `<label>Pole recipient<select data-academy-bonus="pole">${bonusOptions(drivers, academyPolePredictions.get(event.id))}</select></label>` : ''}${Number(scenarioSystem().fastestLapBonus || 0) ? `<label>Fastest lap<select data-academy-bonus="fastest">${bonusOptions(drivers, academyFastestLapPredictions.get(event.id))}</select></label>` : ''}</div>
    <div class="scenario-position-heading"><span>Driver</span><span>Finish</span></div><div class="scenario-driver-grid">${drivers.map(driver => { const id = String(driver.driverId), value = positions.get(id), status = value == null ? 'Prediction needed' : value === 0 ? 'Predicted DNF' : `Predicted P${value}`; return `<label class="${value == null ? 'is-unassigned' : value === 0 ? 'is-dnf' : ''}"><span><strong>${esc(driver.name)}</strong><small>${status}</small></span><select aria-label="${esc(driver.name)} ${esc(event.sessionName)} position" data-academy-scenario-driver="${esc(id)}">${positionOptions(drivers, value)}</select></label>`; }).join('')}</div>`;
  container.querySelectorAll('[data-academy-scenario-driver]').forEach(select => select.addEventListener('change', () => { updatePrediction(positions, String(select.dataset.academyScenarioDriver), positionValue(select.value)); markScenarioChanged(); academyRenderGrid(); academyRenderOutlook(); }));
  container.querySelectorAll('[data-academy-bonus]').forEach(select => select.addEventListener('change', () => { (select.dataset.academyBonus === 'pole' ? academyPolePredictions : academyFastestLapPredictions).set(event.id, bonusValue(select.value)); markScenarioChanged(); academyRenderOutlook(); }));
  container.querySelectorAll('[data-academy-action]').forEach(button => button.addEventListener('click', () => { const action = button.dataset.academyAction; if (action === 'official' || action === 'reset') resetAcademyEvent(event); if (action === 'clear') { positions.forEach((_, id) => positions.set(id, null)); academyPolePredictions.set(event.id, null); academyFastestLapPredictions.set(event.id, null); } if (action === 'dnf') positions.forEach((value, id) => { if (value == null) positions.set(id, 0); }); markScenarioChanged(); academyRenderGrid(); academyRenderOutlook(); }));
}
function academyRenderOutlook() {
  const table = academyStandings(), leader = table[0], runnerUp = table[1], currentTable = academyStandings(academyCutoff()), currentLeader = currentTable[0], currentById = new Map(currentTable.map((driver, index) => [String(driver.driverId), { position: index + 1, points: driver.projectedPoints }]));
  const remainingEvents = academyEvents.length - academyCutoff() - 1, maximum = academyMaximumRemaining(academyCutoff()), incomplete = incompleteAcademyEvents(), clinch = incomplete ? null : academyClinchingEvent(), margin = runnerUp ? leader.projectedPoints - runnerUp.projectedPoints : 0;
  document.getElementById('scenario-summary').innerHTML = `<div class="scenario-summary-primary"><span>Projected champion</span><strong>${esc(leader.name)}</strong><small>${fmtNumber(leader.projectedPoints)} points · ${margin ? `leads by ${fmtNumber(margin)} points` : 'ahead on countback'}</small></div><div><span>Official leader at cutoff</span><strong>${esc(currentLeader.name)}</strong><small>${fmtNumber(currentLeader.projectedPoints)} points</small></div><div><span>Remaining</span><strong>${remainingEvents} race${remainingEvents === 1 ? '' : 's'}</strong><small>Optimistic maximum: ${fmtNumber(maximum)} points</small></div><div><span>Scenario status</span><strong>${incomplete ? `${incomplete} incomplete race${incomplete === 1 ? '' : 's'}` : 'All races assigned'}</strong><small>${incomplete ? 'Unassigned entries score zero for now' : clinch ? `Earliest projected clinch: R${clinch.round} · ${esc(clinch.raceName)}` : 'Title remains open through the final race'}</small></div>`;
  document.getElementById('scenario-standings').innerHTML = `<div class="scenario-standing-list">${table.map((driver, index) => { const current = currentById.get(String(driver.driverId)) || { position: index + 1, points: 0 }, gain = driver.projectedPoints - current.points, maxTotal = current.points + maximum, canReach = maxTotal >= leader.projectedPoints; return `<a href="/academy/driver?id=${encodeURIComponent(driver.driverId)}"><b>${index + 1}</b><span><strong>${esc(driver.name)}</strong><small>P${current.position} → P${index + 1} <i class="scenario-standing-movement">${signed(current.position - (index + 1))}</i> · ${gain ? `+${fmtNumber(gain)} predicted` : 'no predicted points'} · max ${fmtNumber(maxTotal)} · ${canReach ? 'can reach leader’s total' : 'maximum below leader'}</small></span><em>${fmtNumber(driver.projectedPoints)}</em></a>`; }).join('')}</div>`;
  renderScenarioRules(); syncScenarioUrl();
}
function academyPopulateRaces() {
  const future = academyEvents.filter((_, index) => index > academyCutoff()), select = document.getElementById('scenario-race'), requested = new URLSearchParams(window.location.search).get('race'), previous = select.value;
  select.innerHTML = future.map(event => `<option value="${esc(event.id)}">R${event.round} · ${esc(event.raceName)} · ${esc(event.sessionName)}</option>`).join('');
  if ([...select.options].some(option => option.value === requested)) select.value = requested; else if ([...select.options].some(option => option.value === previous)) select.value = previous;
  academyRenderGrid(); academyRenderOutlook();
}
async function academyLoadSeason() {
  const year = document.getElementById('scenario-season').value; if (!year) return;
  document.getElementById('scenario-grid').innerHTML = '<div class="loading-state">Loading championship and race sessions…</div>';
  try {
    scenarioData = await getJSON(`/api/seasons/${encodeURIComponent(year)}`);
    const weekends = await Promise.all(scenarioData.calendar.map(race => getJSON(`/api/races/${encodeURIComponent(race.id)}`)));
    academyEvents = weekends.flatMap(weekend => weekend.sessions.filter(session => session.isRace && !session.cancelled).map(session => ({ id: `${weekend.race.id}::${session.id}`, raceId: weekend.race.id, sessionId: session.id, year: Number(weekend.race.year), round: Number(weekend.race.round), raceName: weekend.race.name, sessionName: session.displayName || session.name, raceType: session.raceType, date: session.startTimeUtc || weekend.race.date, results: session.results || [], resultByDriver: new Map((session.results || []).map(result => [String(result.driverId), result])) }))).sort((a, b) => a.round - b.round || new Date(a.date) - new Date(b.date));
    const select = document.getElementById('scenario-cutoff'), eligible = academyEvents.map((event, index) => ({ event, index })).filter(({ event, index }) => event.results.length && index < academyEvents.length - 1), suggested = eligible.at(-1)?.index ?? -1, requested = new URLSearchParams(window.location.search).get('cutoff');
    select.innerHTML = `<option value="-1">Before the first race</option>${eligible.map(({ event, index }) => `<option value="${index}">After R${event.round} · ${esc(event.raceName)} · ${esc(event.sessionName)}</option>`).join('')}`;
    select.value = [...select.options].some(option => option.value === requested) ? requested : String(suggested);
    academyInitialisePredictions(); restoreScenarioState(); academyPopulateRaces();
  } catch (error) { setError('scenario-grid', error.message); }
}

async function initialiseScenario() {
  try {
    const [seasons, systems] = await Promise.all([getJSON('/api/seasons'), getJSON('/api/points-systems')]);
    const params = new URLSearchParams(window.location.search), seasonSelect = document.getElementById('scenario-season');
    seasonSelect.innerHTML = seasons.map(season => `<option value="${season.year}">${season.year}</option>`).join('');
    if ([...seasonSelect.options].some(option => option.value === params.get('year'))) seasonSelect.value = params.get('year');
    if (isF2Scenario) document.getElementById('scenario-points').innerHTML = '<option value="modern">Formula 2 · current</option>';
    if (isF3Scenario && !isAcademyScenario) document.getElementById('scenario-points').innerHTML = '<option value="modern">Formula 3 · current</option><option value="f3-legacy">Formula 3 · 2019–2021</option>';
    if (isAcademyScenario) document.getElementById('scenario-points').innerHTML = '<option value="modern">F1 Academy · official</option>';
    systems.forEach(saved => { const key = `custom:${saved.id}`; SCENARIO_SYSTEMS[key] = { name: saved.name, race: saved.racePoints, sprint: saved.sprintPoints, poleBonus: saved.poleBonus, fastestLapBonus: saved.fastestLapBonus, fastestLapMaxPosition: saved.fastestLapMaxPosition, sprintFastestLapMaxPosition: isAcademyScenario ? 8 : undefined }; document.getElementById('scenario-points').insertAdjacentHTML('beforeend', `<option value="${esc(key)}">${esc(saved.name)} · custom</option>`); });
    if ([...document.getElementById('scenario-points').options].some(option => option.value === params.get('points'))) document.getElementById('scenario-points').value = params.get('points');
    document.getElementById('scenario-manage-rules').href = `${scenarioBase()}/points-systems`;
    renderScenarioRules();
    await (isAcademyScenario ? academyLoadSeason() : loadScenarioSeason());
  } catch (error) { setError('scenario-grid', error.message); }
}

document.getElementById('scenario-season').addEventListener('change', () => isAcademyScenario ? academyLoadSeason() : loadScenarioSeason());
document.getElementById('scenario-cutoff').addEventListener('change', () => {
  if (isAcademyScenario) { academyInitialisePredictions(); restoreScenarioState(); academyPopulateRaces(); }
  else { initialisePredictions(); restoreScenarioState(); populateScenarioRaces(); }
});
document.getElementById('scenario-race').addEventListener('change', () => { if (isAcademyScenario) academyRenderGrid(); else renderScenarioGrid(); syncScenarioUrl(); });
document.getElementById('scenario-points').addEventListener('change', () => { renderScenarioRules(); if (scenarioData) isAcademyScenario ? academyRenderOutlook() : renderScenarioOutlook(); });
document.getElementById('reset-scenario').addEventListener('click', () => {
  clearSavedScenario(); scenarioDirty = false;
  if (isAcademyScenario) { academyInitialisePredictions(); academyRenderGrid(); academyRenderOutlook(); }
  else { initialisePredictions(); renderScenarioGrid(); renderScenarioOutlook(); }
});
initialiseScenario();
