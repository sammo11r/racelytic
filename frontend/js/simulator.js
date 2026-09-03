const POINT_SYSTEMS = { ...F1_POINTS_SYSTEMS };
const isF2Simulator = window.location.pathname.startsWith('/f2/');
const isF3Simulator = window.location.pathname.startsWith('/f3/');
const isAcademySimulator = window.location.pathname.startsWith('/academy/');
const F2_POINTS_SYSTEM = { name: 'Formula 2 · current', race: [25,18,15,12,10,8,6,4,2,1], sprint: [10,8,6,5,4,3,2,1], qualifying: [], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10, countBest: Infinity, preserveOfficialPointsFrom: 2022 };
const F3_POINTS_SYSTEM = { name: 'Formula 3 · current', race: [25,18,15,12,10,8,6,4,2,1], sprint: [10,9,8,7,6,5,4,3,2,1], qualifying: [], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10, countBest: Infinity, preserveOfficialPointsFrom: 2022 };
const F3_LEGACY_POINTS_SYSTEM = { name: 'Formula 3 · 2019–2021', race: [25,18,15,12,10,8,6,4,2,1], sprint: [15,12,10,8,6,5,4,3,2,1], qualifying: [], poleBonus: 4, fastestLapBonus: 2, fastestLapMaxPosition: 10, countBest: Infinity };
const ACADEMY_POINTS_SYSTEM = { name: 'F1 Academy · current', race: [25,18,15,12,10,8,6,4,2,1], sprint: [10,8,6,5,4,3,2,1], qualifying: [], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10, countBest: Infinity, preserveOfficialPointsFrom: 2023 };
if (isF2Simulator) POINT_SYSTEMS['f2-current'] = F2_POINTS_SYSTEM;
if (isF3Simulator) {
  POINT_SYSTEMS['f3-current'] = F3_POINTS_SYSTEM;
  POINT_SYSTEMS['f3-legacy'] = F3_LEGACY_POINTS_SYSTEM;
}
if (isAcademySimulator) POINT_SYSTEMS['academy-current'] = ACADEMY_POINTS_SYSTEM;

let simulationData = null;
let simulationRequest = 0;
let customSystems = [];
let simulationMode = 'drivers';

function simulatorBase() {
  if (isAcademySimulator) return '/academy';
  if (isF3Simulator) return '/f3';
  if (isF2Simulator) return '/f2';
  return '';
}

function signedNumber(value) {
  const number = Number(value || 0);
  if (!number) return '0';
  return `${number > 0 ? '+' : '−'}${fmtNumber(Math.abs(number))}`;
}

function marginDescription(value) {
  const margin = Number(value || 0);
  return margin ? `by ${fmtNumber(margin)} point${margin === 1 ? '' : 's'}` : 'on countback';
}

function pointsDifferenceDescription(value) {
  const difference = Number(value || 0);
  if (!difference) return 'the same points total';
  return `${fmtNumber(Math.abs(difference))} point${Math.abs(difference) === 1 ? '' : 's'} ${difference > 0 ? 'more' : 'fewer'}`;
}

function selectedSystemKind(key) {
  if (key.startsWith('custom:')) return 'Custom rules';
  if (key.includes('current') || key === '2025-present') return 'Official current rules';
  return 'Official historical rules';
}

function countingDescription(system, isDrivers) {
  if (!isDrivers && system.constructorCountBest !== undefined) {
    return system.constructorCountBest === Infinity ? 'Every result' : `Best ${system.constructorCountBest} results`;
  }
  if (system.bestFirstRounds || system.bestLastRounds) {
    const parts = [];
    if (system.bestFirstRounds) parts.push(`best ${system.bestFirstRounds} of first ${system.firstRoundsWindow}`);
    if (system.bestLastRounds) parts.push(`best ${system.bestLastRounds} of last ${system.lastRoundsWindow}`);
    return parts.join(' · ');
  }
  return system.countBest === Infinity ? 'Every round' : `Best ${system.countBest} rounds`;
}

function renderRuleSummary(system, isDrivers, notice = '') {
  const key = document.getElementById('simulation-points').value;
  const raceScale = isDrivers ? system.race : system.constructorRace || system.race;
  const fastestLapBonus = Number(!isDrivers && system.constructorFastestLapBonus !== undefined
    ? system.constructorFastestLapBonus : system.fastestLapBonus ?? (system.fastestLap ? 1 : 0));
  const fastestLap = fastestLapBonus
    ? `${fmtNumber(fastestLapBonus)} pt${fastestLapBonus === 1 ? '' : 's'}${system.fastestLapMaxPosition ? ` · Top ${system.fastestLapMaxPosition}` : ''}`
    : 'None';
  document.getElementById('simulation-explanation').innerHTML = `
    <div class="simulation-rules-heading">
      <div><span>${esc(selectedSystemKind(key))}</span><strong>${esc(system.name)}</strong></div>
      <small>Updates automatically</small>
    </div>
    <dl class="simulation-rule-grid">
      <div><dt>Race points</dt><dd>${raceScale?.length ? raceScale.join('–') : 'None'}</dd></div>
      <div><dt>Sprint points</dt><dd>${system.sprint?.length ? system.sprint.join('–') : 'None'}</dd></div>
      <div><dt>Pole bonus</dt><dd>${Number(system.poleBonus || 0) ? `${fmtNumber(system.poleBonus)} pts` : 'None'}</dd></div>
      <div><dt>Fastest lap</dt><dd>${fastestLap}</dd></div>
      <div><dt>Results counted</dt><dd>${esc(countingDescription(system, isDrivers))}</dd></div>
    </dl>
    ${notice ? `<p class="simulation-rule-notice">${notice}</p>` : ''}`;
}

function ruleMethodNotice(system, isDrivers) {
  const notes = [];
  if (system.qualifying?.length) notes.push(`Qualifying awards ${system.qualifying.join('–')} points.`);
  if (!isDrivers && system.constructorScoringCars === 1) notes.push('Only the highest-scoring car counts for each constructor at each race.');
  if (preservesOfficialPoints(system, simulationData?.year)) notes.push('Recorded session points are retained, including shortened-race scales, penalties and classification adjustments.');
  if (system.doublePointsFinalRound) notes.push('The final race awards double points.');
  return notes.join(' ');
}

function syncSimulationUrl() {
  const year = document.getElementById('simulation-season').value;
  const points = document.getElementById('simulation-points').value;
  if (!year || !points) return;
  const url = new URL(window.location.href);
  url.searchParams.set('year', year);
  url.searchParams.set('points', points);
  if (simulationMode === 'constructors') url.searchParams.set('mode', 'constructors');
  else url.searchParams.delete('mode');
  if (document.getElementById('simulation-changes-only').checked) url.searchParams.set('changed', '1');
  else url.searchParams.delete('changed');
  history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function preservesOfficialPoints(system, year) {
  return system.preserveOfficialPointsFrom && Number(year) >= Number(system.preserveOfficialPointsFrom);
}

function simulationCoverage(data) {
  const rounds = new Set();
  let officialPoints = 0;
  let detailedPoints = 0;
  data.driverChampionship.forEach(driver => {
    officialPoints += Number(driver.points || 0);
    Object.entries(driver.raceResults || {}).forEach(([round, result]) => {
      rounds.add(String(round));
      detailedPoints += Number(result.points || 0) + Number(result.sprintPoints || 0);
    });
  });
  const ratio = officialPoints > 0 ? detailedPoints / officialPoints : 1;
  return {
    availableRounds: rounds.size,
    complete: ratio >= .9,
    detailedPoints,
    officialPoints,
    ratio
  };
}

function pointsFor(position, scale) {
  scale = scale || [];
  const index = Number(position) - 1;
  return index >= 0 && index < scale.length ? scale[index] : 0;
}

function compareCountback(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  for (let position = 1; position <= 20; position += 1) {
    const difference = (b.finishes[position] || 0) - (a.finishes[position] || 0);
    if (difference) return difference;
  }
  return a.name.localeCompare(b.name);
}

function scoreResult(result, system, mode = 'drivers', isFinalRound = false) {
  if (!result) return { racePoints: 0, sprintPoints: 0, points: 0 };
  if (preservesOfficialPoints(system, simulationData?.year)) {
    const racePoints = Number(result.points || 0);
    const sprintPoints = Number(result.sprintPoints || 0);
    return { racePoints, sprintPoints, qualifyingPoints: 0, points: racePoints + sprintPoints };
  }
  const raceScale = mode === 'constructors' && system.constructorRace ? system.constructorRace : system.race;
  let racePoints = pointsFor(result.position, raceScale);
  const qualifyingPoints = pointsFor(result.qualifyingPosition, system.qualifying || []);
  const sprintResults = Array.isArray(result.sprintResults)
    ? result.sprintResults
    : result.sprintPosition ? [{ position: result.sprintPosition, fastestLap: result.sprintFastestLap }] : [];
  let sprintPoints = sprintResults.reduce((total, sprint) => total + pointsFor(sprint.position, system.sprint), 0);
  if (result.polePosition) racePoints += Number(system.poleBonus || 0);
  const fastestBonus = Number(mode === 'constructors' && system.constructorFastestLapBonus !== undefined
    ? system.constructorFastestLapBonus
    : system.fastestLapBonus ?? (system.fastestLap ? 1 : 0));
  const fastestEligible = system.fastestLapMaxPosition == null
    || Number(result.position) <= Number(system.fastestLapMaxPosition);
  if (fastestBonus && result.fastestLap && fastestEligible) racePoints += fastestBonus;
  sprintResults.forEach(sprint => {
    const sprintFastestEligible = system.fastestLapMaxPosition == null
      || Number(sprint.position) <= Number(system.fastestLapMaxPosition);
    if (fastestBonus && sprint.fastestLap && sprintFastestEligible) sprintPoints += fastestBonus;
  });
  racePoints += qualifyingPoints;
  if (system.doublePointsFinalRound && isFinalRound) racePoints *= 2;
  return { racePoints, sprintPoints, qualifyingPoints, points: racePoints + sprintPoints };
}

function countRounds(rounds, system, mode = 'drivers') {
  const sprintCountsTowardRound = system.sprintCountsTowardRound !== false;
  const score = round => sprintCountsTowardRound ? round.points : round.racePoints;
  const constructorOverride = mode === 'constructors' && system.constructorCountBest !== undefined;
  const countBest = constructorOverride ? system.constructorCountBest : system.countBest;
  const bestFirstRounds = constructorOverride ? null : system.bestFirstRounds;
  const firstRoundsWindow = constructorOverride ? null : system.firstRoundsWindow;
  const bestLastRounds = constructorOverride ? null : system.bestLastRounds;
  const lastRoundsWindow = constructorOverride ? null : system.lastRoundsWindow;
  let counted;
  if (bestFirstRounds || bestLastRounds) {
    const selected = new Set();
    const firstWindow = Math.min(Number(firstRoundsWindow || 0), rounds.length);
    const lastWindow = Math.min(Number(lastRoundsWindow || 0), rounds.length);
    rounds.forEach((round, index) => {
      const inFirst = firstWindow && index < firstWindow;
      const inLast = lastWindow && index >= rounds.length - lastWindow;
      if (!inFirst && !inLast && !system.countOnlySegments) selected.add(index);
    });
    if (firstWindow) [...rounds.slice(0, firstWindow).keys()]
      .sort((a, b) => score(rounds[b]) - score(rounds[a]))
      .slice(0, Number(bestFirstRounds)).forEach(index => selected.add(index));
    if (lastWindow) rounds.map((round, index) => index).slice(rounds.length - lastWindow)
      .sort((a, b) => score(rounds[b]) - score(rounds[a]))
      .slice(0, Number(bestLastRounds)).forEach(index => selected.add(index));
    counted = [...selected].map(index => rounds[index]);
  } else {
    counted = [...rounds].sort((a, b) => score(b) - score(a)).slice(0, countBest ?? Infinity);
  }
  const points = counted.reduce((sum, round) => sum + (sprintCountsTowardRound ? round.points : round.racePoints), 0)
    + (sprintCountsTowardRound ? 0 : rounds.reduce((sum, round) => sum + round.sprintPoints, 0));
  return { points, droppedPoints: rounds.reduce((sum, round) => sum + round.points, 0) - points };
}

function rankStandings(entries) {
  return entries.sort(compareCountback).map((entry, index) => ({
    ...entry, simulatedPosition: index + 1, change: entry.originalPosition - (index + 1)
  }));
}

function simulateDrivers(data, system) {
  if (preservesOfficialPoints(system, data.year)) {
    return data.driverChampionship.map((driver, index) => ({
      id: driver.driverId, name: driver.name, abbreviation: driver.abbreviation,
      originalPosition: Number(driver.position), originalPoints: Number(driver.points),
      simulatedPosition: index + 1, change: 0, points: Number(driver.points), droppedPoints: 0, finishes: {}
    }));
  }
  return rankStandings(data.driverChampionship.map(driver => {
    const finishes = {};
    const rounds = data.calendar.map((race, index) => {
      const result = driver.raceResults?.[String(race.round)] || null;
      if (result?.position) finishes[result.position] = (finishes[result.position] || 0) + 1;
      (result?.sprintResults || []).forEach(sprint => {
        if (sprint.position) finishes[sprint.position] = (finishes[sprint.position] || 0) + 1;
      });
      return { round: race.round, ...scoreResult(result, system, 'drivers', index === data.calendar.length - 1) };
    });
    return {
      id: driver.driverId, name: driver.name, abbreviation: driver.abbreviation,
      originalPosition: Number(driver.position), originalPoints: Number(driver.points),
      ...countRounds(rounds, system, 'drivers'), finishes
    };
  }));
}

function simulateConstructors(data, system) {
  if (preservesOfficialPoints(system, data.year)) {
    return data.constructorChampionship.map((constructor, index) => ({
      id: constructor.constructorId, name: constructor.name,
      originalPosition: Number(constructor.position), originalPoints: Number(constructor.points),
      simulatedPosition: index + 1, change: 0, points: Number(constructor.points), droppedPoints: 0, finishes: {}
    }));
  }
  const constructors = new Map(data.constructorChampionship.map(constructor => [String(constructor.constructorId), {
    id: constructor.constructorId, name: constructor.name,
    originalPosition: Number(constructor.position), originalPoints: Number(constructor.points), finishes: {},
    rounds: new Map(data.calendar.map(race => [Number(race.round), { round: Number(race.round), racePoints: 0, sprintPoints: 0, points: 0 }]))
  }]));

  data.driverChampionship.forEach(driver => Object.entries(driver.raceResults || {}).forEach(([roundNumber, result]) => {
    const roundIndex = data.calendar.findIndex(race => Number(race.round) === Number(roundNumber));
    const score = scoreResult(result, system, 'constructors', roundIndex === data.calendar.length - 1);
    const raceConstructor = constructors.get(String(result.constructorId));
    const sprintConstructor = constructors.get(String(result.sprintConstructorId || result.constructorId));
    if (raceConstructor) {
      const round = raceConstructor.rounds.get(Number(roundNumber));
      if (system.constructorScoringCars === 1) {
        round.racePoints = Math.max(round.racePoints, score.racePoints);
        round.points = round.racePoints + round.sprintPoints;
      } else {
        round.racePoints += score.racePoints;
        round.points += score.racePoints;
      }
      if (result.position) raceConstructor.finishes[result.position] = (raceConstructor.finishes[result.position] || 0) + 1;
    }
    if (sprintConstructor) {
      const round = sprintConstructor.rounds.get(Number(roundNumber));
      round.sprintPoints += score.sprintPoints;
      round.points += score.sprintPoints;
    }
  }));

  return rankStandings([...constructors.values()].map(({ rounds, ...constructor }) => ({
    ...constructor, ...countRounds([...rounds.values()], system, 'constructors')
  })));
}

function movement(change) {
  if (change > 0) return `<span class="position-change up" aria-label="Up ${change} positions">↑ ${change}</span>`;
  if (change < 0) return `<span class="position-change down" aria-label="Down ${Math.abs(change)} positions">↓ ${Math.abs(change)}</span>`;
  return '<span class="position-change same" aria-label="No position change">—</span>';
}

function renderSimulation() {
  if (!simulationData) return;
  const system = POINT_SYSTEMS[document.getElementById('simulation-points').value];
  const isDrivers = simulationMode === 'drivers';
  const coverage = simulationCoverage(simulationData);
  const methodNotice = ruleMethodNotice(system, isDrivers);
  renderRuleSummary(system, isDrivers, methodNotice);
  syncSimulationUrl();
  if (!preservesOfficialPoints(system, simulationData.year) && !coverage.complete) {
    const championshipLabel = isDrivers ? 'Driver' : (isF3Simulator || isAcademySimulator) ? 'Team' : 'Constructor';
    const roundLabel = coverage.availableRounds === 1 ? 'round' : 'rounds';
    document.getElementById('simulation-championship-title').textContent = `${championshipLabel} championship`;
    document.getElementById('simulation-status').textContent = `${simulationData.year} · incomplete classifications`;
    renderRuleSummary(system, isDrivers, `${methodNotice} <strong>${esc(system.name)} cannot be applied reliably.</strong> The official standings are newer than the detailed race classifications currently available in Racelytic.`.trim());
    document.getElementById('simulation-summary').innerHTML = '';
    document.getElementById('simulation-results').innerHTML = `<div class="empty-state">Alternate scoring is unavailable for ${esc(simulationData.year)} because detailed results are available for only ${coverage.availableRounds} ${roundLabel}. Choose the official current system or a season with complete classifications.</div>`;
    return;
  }
  if (!isDrivers && system.constructorsAvailable === false) {
    document.getElementById('simulation-championship-title').textContent = isF3Simulator ? 'Team championship' : 'Constructor championship';
    document.getElementById('simulation-status').textContent = `${simulationData.year} · constructors`;
    renderRuleSummary(system, isDrivers, `${methodNotice} ${esc(system.name)} predates the World Constructors’ Championship, which began in 1958.`.trim());
    document.getElementById('simulation-summary').innerHTML = '';
    document.getElementById('simulation-results').innerHTML = '<div class="empty-state">No Constructors’ Championship was awarded under this points system.</div>';
    return;
  }
  const standings = isDrivers ? simulateDrivers(simulationData, system) : simulateConstructors(simulationData, system);
  const champion = standings[0];
  const originalChampion = (isDrivers ? simulationData.driverChampionship : simulationData.constructorChampionship)[0];
  const originalChampionId = isDrivers ? originalChampion.driverId : originalChampion.constructorId;
  const changedChampion = String(champion.id) !== String(originalChampionId);
  const simulatedRunnerUp = standings[1];
  const originalStandings = isDrivers ? simulationData.driverChampionship : simulationData.constructorChampionship;
  const originalRunnerUp = originalStandings[1];
  const simulatedMargin = simulatedRunnerUp ? champion.points - simulatedRunnerUp.points : 0;
  const originalMargin = originalRunnerUp ? Number(originalChampion.points) - Number(originalRunnerUp.points) : 0;
  const championPointsChange = champion.points - champion.originalPoints;
  const label = isDrivers ? 'Driver' : (isF3Simulator || isAcademySimulator) ? 'Team' : 'Constructor';
  const link = isDrivers
    ? isAcademySimulator ? 'academy/driver' : isF3Simulator ? 'f3/driver' : isF2Simulator ? 'f2/driver' : 'driver'
    : isAcademySimulator ? 'academy/team' : isF3Simulator ? 'f3/team' : isF2Simulator ? 'f2/constructor' : 'constructor';
  document.getElementById('simulation-championship-title').textContent = `${label} championship`;
  const changedCount = standings.filter(entry => entry.change).length;
  const changesOnly = document.getElementById('simulation-changes-only').checked;
  const displayedStandings = changesOnly ? standings.filter(entry => entry.change) : standings;
  document.getElementById('simulation-status').textContent = `${simulationData.year} · ${changesOnly ? `${displayedStandings.length} of ` : ''}${standings.length} ${(isF3Simulator || isAcademySimulator) && !isDrivers ? 'teams' : simulationMode}${changedCount ? ` · ${changedCount} changed` : ''}`;
  document.getElementById('simulation-summary').innerHTML = `
    <div class="simulation-champion">
      <span>Simulated champion</span>
      <strong>${esc(champion.name)}</strong>
      <small>${fmtNumber(champion.points)} points · wins ${marginDescription(simulatedMargin)}</small>
    </div>
    <div class="simulation-outcome${changedChampion ? ' changed' : ''}">
      <span>${changedChampion ? 'Championship changes hands' : 'Champion unchanged'}</span>
      <strong>${changedChampion ? `${esc(originalChampion.name)} → ${esc(champion.name)}` : esc(champion.name)}</strong>
      <small>Official result: ${esc(originalChampion.name)} won ${marginDescription(originalMargin)} · ${esc(champion.name)} scores ${pointsDifferenceDescription(championPointsChange)}</small>
    </div>`;

  document.getElementById('simulation-results').innerHTML = displayedStandings.length ? `
    <table class="simulation-table">
      <thead><tr><th>Pos.</th><th>${label}</th><th>Simulated</th><th>Official</th><th>Difference</th></tr></thead>
      <tbody>${displayedStandings.map(entry => `<tr${entry.simulatedPosition === 1 ? ' class="simulated-leader"' : entry.change ? ' class="simulation-changed"' : ''}>
        <td class="simulation-position" data-label="Simulated position">${entry.simulatedPosition}</td>
        <td data-label="${label}"><a href="/${link}?id=${encodeURIComponent(entry.id)}"><strong>${esc(entry.name)}</strong>${entry.abbreviation ? `<small>${esc(entry.abbreviation)}</small>` : ''}</a></td>
        <td class="simulated-points" data-label="Simulated">${fmtNumber(entry.points)} pts${entry.droppedPoints ? `<small>${fmtNumber(entry.droppedPoints)} dropped</small>` : ''}</td>
        <td data-label="Official"><span class="original-result">P${entry.originalPosition}</span><small>${fmtNumber(entry.originalPoints)} pts</small></td>
        <td data-label="Difference">${movement(entry.change)}<small class="simulation-points-change">${signedNumber(entry.points - entry.originalPoints)} pts</small></td>
      </tr>`).join('')}</tbody>
    </table>` : '<div class="empty-state">No championship positions changed under this points system.</div>';
}

async function loadSimulationSeason() {
  const year = document.getElementById('simulation-season').value;
  if (!year) return;
  const request = ++simulationRequest;
  simulationData = null;
  document.querySelector('.simulator-results').setAttribute('aria-busy', 'true');
  document.getElementById('simulation-status').textContent = `Loading ${year}…`;
  try {
    const data = await getJSON(`/api/seasons/${encodeURIComponent(year)}`);
    if (request !== simulationRequest || String(data.year) !== String(document.getElementById('simulation-season').value)) return;
    simulationData = data;
    renderSimulation();
  } catch (error) {
    setError('simulation-results', error.message);
  } finally {
    if (request !== simulationRequest) return;
    document.querySelector('.simulator-results').setAttribute('aria-busy', 'false');
  }
}

async function initialiseSimulator() {
  try {
    const [seasons, systems] = await Promise.all([getJSON('/api/seasons'), getJSON('/api/points-systems')]);
    const select = document.getElementById('simulation-season');
    select.innerHTML = seasons.map(season => `<option value="${esc(season.year)}">${esc(season.year)}</option>`).join('');
    const requestedPreview = new URLSearchParams(window.location.search);
    const requestedYear = requestedPreview.get('year');
    if (seasons.some(season => String(season.year) === requestedYear)) select.value = requestedYear;
    customSystems = systems;
    const pointsSelect = document.getElementById('simulation-points');
    const historicalGroup = document.createElement('optgroup');
    historicalGroup.label = isAcademySimulator ? 'Official F1 Academy system' : isF3Simulator ? 'Official Formula 3 systems' : isF2Simulator ? 'Official Formula 2 system' : 'Official Formula One systems';
    const officialSystems = isAcademySimulator
      ? {'academy-current': ACADEMY_POINTS_SYSTEM}
      : isF3Simulator
      ? {'f3-current': F3_POINTS_SYSTEM, 'f3-legacy': F3_LEGACY_POINTS_SYSTEM}
      : isF2Simulator ? {'f2-current':F2_POINTS_SYSTEM} : F1_POINTS_SYSTEMS;
    Object.entries(officialSystems).forEach(([key, system]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = system.name;
      historicalGroup.append(option);
    });
    pointsSelect.append(historicalGroup);
    pointsSelect.value = isAcademySimulator ? 'academy-current' : isF3Simulator ? 'f3-current' : isF2Simulator ? 'f2-current' : '2025-present';
    if (customSystems.length) {
      const group = document.createElement('optgroup');
      group.label = 'Custom points systems';
      customSystems.forEach(saved => {
        const key = `custom:${saved.id}`;
        POINT_SYSTEMS[key] = {
          name: saved.name,
          race: saved.racePoints,
          sprint: saved.sprintPoints,
          qualifying: saved.qualifyingPoints,
          poleBonus: saved.poleBonus,
          fastestLapBonus: saved.fastestLapBonus,
          fastestLapMaxPosition: saved.fastestLapMaxPosition,
          countBest: saved.countBestRounds ?? Infinity,
          bestFirstRounds: saved.bestFirstRounds,
          firstRoundsWindow: saved.firstRoundsWindow,
          bestLastRounds: saved.bestLastRounds,
          lastRoundsWindow: saved.lastRoundsWindow,
          sprintCountsTowardRound: saved.sprintCountsTowardRound
        };
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${saved.name}${saved.owned ? ' · yours' : ` · ${saved.ownerName}`}`;
        group.append(option);
      });
      pointsSelect.append(group);
    }
    const requestedPoints = requestedPreview.get('points');
    if ([...pointsSelect.options].some(option => option.value === requestedPoints)) pointsSelect.value = requestedPoints;
    if (requestedPreview.get('mode') === 'constructors') simulationMode = 'constructors';
    document.querySelectorAll('[data-simulation-mode]').forEach(option => {
      const active = option.dataset.simulationMode === simulationMode;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('simulation-changes-only').checked = requestedPreview.get('changed') === '1';
    document.getElementById('manage-points-systems').href = `${simulatorBase()}/points-systems`;
    await loadSimulationSeason();
  } catch (error) {
    setError('simulation-results', error.message);
  }
}

document.getElementById('simulation-season').addEventListener('change', loadSimulationSeason);
document.getElementById('simulation-points').addEventListener('change', () => simulationData && renderSimulation());
document.getElementById('simulation-changes-only').addEventListener('change', () => simulationData && renderSimulation());
document.querySelectorAll('[data-simulation-mode]').forEach(button => button.addEventListener('click', () => {
  simulationMode = button.dataset.simulationMode;
  document.querySelectorAll('[data-simulation-mode]').forEach(option => {
    const active = option === button;
    option.classList.toggle('active', active);
    option.setAttribute('aria-pressed', String(active));
  });
  if (simulationData) renderSimulation();
}));
initialiseSimulator();
