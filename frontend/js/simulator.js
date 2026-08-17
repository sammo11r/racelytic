const POINT_SYSTEMS = {
  modern: {
    name: 'Modern', race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    sprint: [8, 7, 6, 5, 4, 3, 2, 1], fastestLap: false, countBest: Infinity
  },
  'modern-fastest': {
    name: 'Modern with fastest lap', race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    sprint: [8, 7, 6, 5, 4, 3, 2, 1], fastestLap: true, countBest: Infinity
  },
  2003: {
    name: '2003–2009', race: [10, 8, 6, 5, 4, 3, 2, 1],
    sprint: [], fastestLap: false, countBest: Infinity
  },
  1991: {
    name: '1991–2002', race: [10, 6, 4, 3, 2, 1],
    sprint: [], fastestLap: false, countBest: Infinity
  },
  'classic-11': {
    name: 'Classic · best 11', race: [9, 6, 4, 3, 2, 1],
    sprint: [], fastestLap: false, countBest: 11
  },
  'classic-8': {
    name: 'Classic · best 8', race: [9, 6, 4, 3, 2, 1],
    sprint: [], fastestLap: false, countBest: 8
  },
  'classic-6': {
    name: 'Classic · best 6', race: [9, 6, 4, 3, 2, 1],
    sprint: [], fastestLap: false, countBest: 6
  }
};

let simulationData = null;
let simulationRequest = 0;
let customSystems = [];
let simulationMode = 'drivers';

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

function scoreResult(result, system) {
  if (!result) return { racePoints: 0, sprintPoints: 0, points: 0 };
  let racePoints = pointsFor(result.position, system.race);
  const qualifyingPoints = pointsFor(result.qualifyingPosition, system.qualifying || []);
  const sprintPoints = pointsFor(result.sprintPosition, system.sprint);
  if (result.polePosition) racePoints += Number(system.poleBonus || 0);
  const fastestBonus = Number(system.fastestLapBonus ?? (system.fastestLap ? 1 : 0));
  const fastestEligible = system.fastestLapMaxPosition == null
    || Number(result.position) <= Number(system.fastestLapMaxPosition);
  if (fastestBonus && result.fastestLap && fastestEligible) racePoints += fastestBonus;
  racePoints += qualifyingPoints;
  return { racePoints, sprintPoints, qualifyingPoints, points: racePoints + sprintPoints };
}

function countRounds(rounds, system) {
  const sprintCountsTowardRound = system.sprintCountsTowardRound !== false;
  const score = round => sprintCountsTowardRound ? round.points : round.racePoints;
  let counted;
  if (system.bestFirstRounds || system.bestLastRounds) {
    const selected = new Set();
    const firstWindow = Math.min(Number(system.firstRoundsWindow || 0), rounds.length);
    const lastWindow = Math.min(Number(system.lastRoundsWindow || 0), rounds.length);
    rounds.forEach((round, index) => {
      const inFirst = firstWindow && index < firstWindow;
      const inLast = lastWindow && index >= rounds.length - lastWindow;
      if (!inFirst && !inLast) selected.add(index);
    });
    if (firstWindow) [...rounds.slice(0, firstWindow).keys()]
      .sort((a, b) => score(rounds[b]) - score(rounds[a]))
      .slice(0, Number(system.bestFirstRounds)).forEach(index => selected.add(index));
    if (lastWindow) rounds.map((round, index) => index).slice(rounds.length - lastWindow)
      .sort((a, b) => score(rounds[b]) - score(rounds[a]))
      .slice(0, Number(system.bestLastRounds)).forEach(index => selected.add(index));
    counted = [...selected].map(index => rounds[index]);
  } else {
    counted = [...rounds].sort((a, b) => score(b) - score(a)).slice(0, system.countBest);
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
  return rankStandings(data.driverChampionship.map(driver => {
    const finishes = {};
    const rounds = data.calendar.map(race => {
      const result = driver.raceResults?.[String(race.round)] || null;
      if (result?.position) finishes[result.position] = (finishes[result.position] || 0) + 1;
      return { round: race.round, ...scoreResult(result, system) };
    });
    return {
      id: driver.driverId, name: driver.name, abbreviation: driver.abbreviation,
      originalPosition: Number(driver.position), originalPoints: Number(driver.points),
      ...countRounds(rounds, system), finishes
    };
  }));
}

function simulateConstructors(data, system) {
  const constructors = new Map(data.constructorChampionship.map(constructor => [String(constructor.constructorId), {
    id: constructor.constructorId, name: constructor.name,
    originalPosition: Number(constructor.position), originalPoints: Number(constructor.points), finishes: {},
    rounds: new Map(data.calendar.map(race => [Number(race.round), { round: Number(race.round), racePoints: 0, sprintPoints: 0, points: 0 }]))
  }]));

  data.driverChampionship.forEach(driver => Object.entries(driver.raceResults || {}).forEach(([roundNumber, result]) => {
    const score = scoreResult(result, system);
    const raceConstructor = constructors.get(String(result.constructorId));
    const sprintConstructor = constructors.get(String(result.sprintConstructorId || result.constructorId));
    if (raceConstructor) {
      const round = raceConstructor.rounds.get(Number(roundNumber));
      round.racePoints += score.racePoints;
      round.points += score.racePoints;
      if (result.position) raceConstructor.finishes[result.position] = (raceConstructor.finishes[result.position] || 0) + 1;
    }
    if (sprintConstructor) {
      const round = sprintConstructor.rounds.get(Number(roundNumber));
      round.sprintPoints += score.sprintPoints;
      round.points += score.sprintPoints;
    }
  }));

  return rankStandings([...constructors.values()].map(({ rounds, ...constructor }) => ({
    ...constructor, ...countRounds([...rounds.values()], system)
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
  const standings = isDrivers ? simulateDrivers(simulationData, system) : simulateConstructors(simulationData, system);
  const champion = standings[0];
  const originalChampion = (isDrivers ? simulationData.driverChampionship : simulationData.constructorChampionship)[0];
  const originalChampionId = isDrivers ? originalChampion.driverId : originalChampion.constructorId;
  const changedChampion = String(champion.id) !== String(originalChampionId);
  const label = isDrivers ? 'Driver' : 'Constructor';
  const link = isDrivers ? 'driver' : 'constructor';

  document.getElementById('simulation-championship-title').textContent = `${label} championship`;
  document.getElementById('simulation-status').textContent = `${simulationData.year} · ${standings.length} ${simulationMode}`;
  document.getElementById('simulation-explanation').innerHTML = `
    <strong>${esc(system.name)}</strong> awards ${system.race.join('–')} points in races${system.sprint.length ? ` and ${system.sprint.join('–')} in sprints` : ', with sprint races excluded'}.
    ${system.qualifying?.length ? `Qualifying awards ${system.qualifying.join('–')} points.` : 'No qualifying points are awarded.'}
    ${Number(system.poleBonus || 0) ? `Pole position earns ${fmtNumber(system.poleBonus)} bonus points.` : 'No pole-position bonus is awarded.'}
    ${Number(system.fastestLapBonus ?? (system.fastestLap ? 1 : 0)) ? `Fastest lap earns ${fmtNumber(system.fastestLapBonus ?? 1)} bonus points${system.fastestLapMaxPosition ? ` when finishing in the top ${system.fastestLapMaxPosition}` : ''}.` : 'No fastest-lap bonus is awarded.'}
    ${system.bestFirstRounds || system.bestLastRounds
      ? `${system.bestFirstRounds ? `The best ${system.bestFirstRounds} of the first ${system.firstRoundsWindow} races count.` : ''} ${system.bestLastRounds ? `The best ${system.bestLastRounds} of the last ${system.lastRoundsWindow} races count.` : ''}`
      : system.countBest === Infinity ? 'Every round counts.' : `Only each ${label.toLowerCase()}’s best ${system.countBest} round totals count.`}`;
  document.getElementById('simulation-summary').innerHTML = `
    <div class="simulation-champion">
      <span>Simulated champion</span>
      <strong>${esc(champion.name)}</strong>
      <small>${fmtNumber(champion.points)} points</small>
    </div>
    <div class="simulation-outcome${changedChampion ? ' changed' : ''}">
      <span>${changedChampion ? 'Championship changes hands' : 'Champion unchanged'}</span>
      <strong>${changedChampion ? `${esc(originalChampion.name)} → ${esc(champion.name)}` : esc(champion.name)}</strong>
      <small>Original champion: ${esc(originalChampion.name)} · ${fmtNumber(originalChampion.points)} points</small>
    </div>`;

  document.getElementById('simulation-results').innerHTML = `
    <table class="simulation-table">
      <thead><tr><th>Pos.</th><th>${label}</th><th>Simulated points</th><th>Original</th><th>Change</th></tr></thead>
      <tbody>${standings.map(entry => `<tr${entry.simulatedPosition === 1 ? ' class="simulated-leader"' : ''}>
        <td class="simulation-position">${entry.simulatedPosition}</td>
        <td><a href="/${link}?id=${encodeURIComponent(entry.id)}"><strong>${esc(entry.name)}</strong>${entry.abbreviation ? `<small>${esc(entry.abbreviation)}</small>` : ''}</a></td>
        <td class="simulated-points">${fmtNumber(entry.points)}${entry.droppedPoints ? `<small>${fmtNumber(entry.droppedPoints)} dropped</small>` : ''}</td>
        <td><span class="original-result">P${entry.originalPosition}</span><small>${fmtNumber(entry.originalPoints)} pts</small></td>
        <td>${movement(entry.change)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

async function loadSimulationSeason() {
  const year = document.getElementById('simulation-season').value;
  if (!year) return;
  const request = ++simulationRequest;
  const button = document.getElementById('run-simulation');
  simulationData = null;
  button.disabled = true;
  button.textContent = 'Simulating…';
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
    button.disabled = false;
    button.textContent = 'Run simulation';
  }
}

async function initialiseSimulator() {
  try {
    const [seasons, systems] = await Promise.all([getJSON('/api/seasons'), getJSON('/api/points-systems')]);
    const select = document.getElementById('simulation-season');
    select.innerHTML = seasons.map(season => `<option value="${esc(season.year)}">${esc(season.year)}</option>`).join('');
    customSystems = systems;
    const pointsSelect = document.getElementById('simulation-points');
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
    await loadSimulationSeason();
  } catch (error) {
    setError('simulation-results', error.message);
  }
}

document.getElementById('run-simulation').addEventListener('click', loadSimulationSeason);
document.getElementById('simulation-season').addEventListener('change', loadSimulationSeason);
document.getElementById('simulation-points').addEventListener('change', () => simulationData && renderSimulation());
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
