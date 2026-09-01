let f3StandingsMode = 'points';

function renderF3PodiumPlace(id, driver) {
  document.getElementById(`f3-season-${id}`).textContent = driver?.name || '—';
  document.getElementById(`f3-season-${id}-points`).textContent = driver ? `${fmtNumber(driver.points)} points` : '—';
}

function f3SessionType(session, sessionIndex, sessionCount, year) {
  const name = String(session.name || '').toLowerCase();
  if (document.body.classList.contains('academy-mode')) {
    if (name.includes('reverse')) return 'S';
    if (name.includes('feature') || name.includes('opening')) return 'F';
    if (Number(year) === 2023 && sessionCount === 3 && sessionIndex === 1) return 'S';
    if (Number(year) === 2025 && ((sessionCount === 2 && sessionIndex === 0) || (sessionCount === 3 && sessionIndex === 1))) return 'S';
    return 'F';
  }
  if (name.includes('feature')) return 'F';
  if (name.includes('sprint')) return 'S';
  const sessionNumber = Number(session.sessionNumber || 0);
  if (sessionNumber) {
    if (Number(year) <= 2020) return sessionNumber <= 4 ? 'F' : 'S';
    if (Number(year) === 2021) return sessionNumber >= 8 ? 'F' : 'S';
    return sessionNumber >= 6 ? 'F' : 'S';
  }
  return sessionIndex === sessionCount - 1 ? 'F' : 'S';
}

function f3SessionLabel(race, session, sessionIndex, sessionCount, year) {
  const code = race.code || `R${race.round}`;
  if (document.body.classList.contains('academy-mode')) {
    return sessionCount === 1 ? code : `${code} R${sessionIndex + 1}`;
  }
  const type = f3SessionType(session, sessionIndex, sessionCount, year);
  if (sessionCount === 1) return code;
  if (Number(year) === 2021 && type === 'S') return `${code} S${sessionIndex + 1}`;
  return `${code} ${type}`;
}

function f3ResultPoints(result, session, year) {
  if (!result) return '';
  if (result.points !== null && result.points !== undefined) return Number(result.points) > 0 ? fmtNumber(result.points) : '';
  const feature = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const sprint = Number(year) <= 2021 ? [15, 12, 10, 8, 6, 5, 4, 3, 2, 1] : [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const position = Number(result.position || 0);
  let points = Number((session.type === 'F' ? feature : sprint)[position - 1] || 0);
  if (result.fastestLap && position > 0 && position <= 10) points += Number(year) <= 2021 ? 2 : 1;
  if (result.polePosition && session.type === 'F') points += Number(year) <= 2021 ? 4 : 2;
  return points > 0 ? fmtNumber(points) : '';
}

function setF3StandingsMode(mode) {
  f3StandingsMode = mode === 'position' ? 'position' : 'points';
  document.querySelectorAll('[data-f3-standings-mode]').forEach(button => {
    const active = button.dataset.f3StandingsMode === f3StandingsMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('driver-table').dataset.valueMode = f3StandingsMode;
  document.querySelectorAll('#driver-table .result-value').forEach(value => {
    value.textContent = f3StandingsMode === 'position' ? value.dataset.position : value.dataset.points;
  });
}

function f3ResultClass(result) {
  if (!result) return 'result-empty';
  if (/\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC)\b/i.test(String(result.positionText || result.status || ''))) {
    return 'result-disqualified';
  }
  const position = Number(result.position || 0);
  let resultClass = 'result-retired';
  if (position === 1) resultClass = 'result-win';
  else if (position >= 2 && position <= 3) resultClass = 'result-podium';
  else if (Number(result.points || 0) > 0 || (position > 0 && position <= result.pointsLimit)) resultClass = 'result-points';
  else if (position > 0) resultClass = 'result-finish';
  return result.polePosition ? `${resultClass} pole-position` : resultClass;
}

function f3ResultLabel(result) {
  return result?.positionText || result?.position || '';
}

function f3SessionHeading(session) {
  return `${esc(session.label)}${session.cancelled ? '<small class="cancelled-label">Cancelled</small>' : ''}`;
}

function f3ConstructorResultClass(result) {
  if (!result) return 'result-empty';
  const bestPosition = Number(result.bestPosition || 0);
  if (bestPosition === 1) return 'result-win';
  if (bestPosition > 1 && bestPosition <= 3) return 'result-podium';
  if (Number(result.points || 0) > 0) return 'result-points';
  if (Number(result.classified || 0) > 0) return 'result-finish';
  return 'result-empty';
}

function renderF3ConstructorTable(constructors, raceSessions) {
  document.getElementById('f3-constructor-head').innerHTML = `<tr><th class="position-column">Pos.</th><th class="name-column">Constructor</th>${raceSessions.map(session => `<th class="race-column${session.cancelled ? ' cancelled-session' : ''}" title="${esc(session.race.name)} · ${esc(session.name)}${session.cancelled ? ' · Cancelled' : ''}">${f3SessionHeading(session)}</th>`).join('')}<th class="points-column">Points</th></tr>`;
  document.getElementById('f3-constructor-body').innerHTML = constructors.map(constructor => `
    <tr><td class="position-column">${esc(constructor.position)}</td><td class="name-column"><a href="/f3/team?id=${encodeURIComponent(constructor.constructorId)}">${esc(constructor.name)}</a></td>${raceSessions.map(session => {
      const result = constructor.raceResults?.[session.id];
      const points = Number(result?.points ?? result ?? 0);
      return `<td class="race-point constructor-points ${f3ConstructorResultClass(result)}"><span>${points > 0 ? fmtNumber(points) : ''}</span></td>`;
    }).join('')}<td class="points-column total-points">${fmtNumber(constructor.points)}</td></tr>`).join('');
}

function renderF3Season(data) {
  document.title = `${data.year} Formula 3 Season · Racelytic`;
  document.getElementById('f3-season-year').textContent = data.year;
  const academy = document.body.classList.contains('academy-mode');
  const completed = Boolean(data.summary.completed);
  const seriesName = academy ? 'F1 Academy' : 'Formula 3';
  document.getElementById('f3-team-count').textContent = `${fmtNumber(data.summary.teams)} teams`;
  document.getElementById('f3-season-first-label').textContent = completed ? `${seriesName} champion` : 'Championship leader';
  document.getElementById('f3-season-second-label').textContent = completed ? 'Runner-up' : 'Second place';
  document.getElementById('f3-season-third-label').textContent = 'Third place';
  document.getElementById('f3-season-constructor-label').textContent = completed ? 'Teams’ champion' : 'Leading team';
  document.getElementById('f3-season-constructor').textContent = data.summary.constructorLeader?.name || '—';
  document.getElementById('f3-season-races').textContent = fmtNumber(data.summary.races);
  document.getElementById('f3-season-laps').textContent = fmtNumber(data.summary.laps);
  renderF3PodiumPlace('first', data.summary.first);
  renderF3PodiumPlace('second', data.summary.second);
  renderF3PodiumPlace('third', data.summary.third);

  const raceSessions = data.calendar.flatMap(race => race.sessions.map((session, sessionIndex) => ({
    ...session, race,
    type: f3SessionType(session, sessionIndex, race.sessions.length, data.year),
    label: f3SessionLabel(race, session, sessionIndex, race.sessions.length, data.year)
  })));
  document.getElementById('f3-standings-head').innerHTML = `<tr><th class="position-column">Pos.</th><th class="name-column">Driver</th>${raceSessions.map(session => `<th class="race-column${session.cancelled ? ' cancelled-session' : ''}" title="${esc(session.race.name)} · ${esc(session.name)}${session.cancelled ? ' · Cancelled' : ''}">${f3SessionHeading(session)}</th>`).join('')}<th class="points-column">Points</th></tr>`;
  document.getElementById('f3-standings-body').innerHTML = data.championship.map(driver => `
    <tr><td class="position-column">${esc(driver.position)}</td><td class="name-column"><a href="/f3/driver?id=${encodeURIComponent(driver.driverId)}"><span class="driver-name">${esc(driver.name)}<small>${esc(driver.constructor || 'Independent entry')}</small></span></a></td>${raceSessions.map(session => {
      const result = driver.raceResults?.[session.id];
      if (result) {
        const position = Number(result.position || 0);
        result.pointsLimit = session.type === 'F' || Number(data.year) >= 2021 ? 10 : 8;
        result.fastestLap = Boolean(result.fastestLap && position > 0 && position <= 10);
        result.polePosition = session.type === 'F' && Boolean(result.polePosition);
      }
      return `<td class="race-point ${f3ResultClass(result)}" title="${esc(session.race.name)} · ${esc(session.name)}${result ? `: finished ${f3ResultLabel(result)}` : ''}"><span class="result-value">${esc(f3ResultLabel(result))}</span>${result?.fastestLap ? '<sup class="result-marker" title="Fastest lap">F</sup>' : ''}</td>`;
    }).join('')}<td class="points-column total-points">${fmtNumber(driver.points)}</td></tr>`).join('');

  const values = [...document.querySelectorAll('#driver-table .result-value')];
  let valueIndex = 0;
  data.championship.forEach(driver => raceSessions.forEach(session => {
    const result = driver.raceResults?.[session.id];
    values[valueIndex].dataset.position = f3ResultLabel(result);
    values[valueIndex].dataset.points = f3ResultPoints(result, session, data.year);
    valueIndex += 1;
  }));
  setF3StandingsMode(f3StandingsMode);
  renderF3ConstructorTable(data.constructorChampionship || [], raceSessions);
  document.getElementById('f3-race-calendar').innerHTML = data.calendar.map(race => `
    <article class="calendar-race f2-calendar-race" data-round="${esc(race.round)}"><div class="calendar-round">${esc(race.round)}</div><div class="calendar-date">${fmtDate(race.date)}</div><div class="calendar-name"><strong>${esc(race.name)}</strong><small>${esc(race.circuitName || race.placeName || '')}</small></div><div class="f2-calendar-sessions">${race.sessions.map(session => `<span${session.cancelled ? ' class="cancelled-session"' : ''}>${esc(session.name)}: ${session.cancelled ? 'Cancelled' : esc(session.winner || 'No winner')}</span>`).join('')}</div></article>`).join('');
  window.renderJuniorSeasonMap?.('f3-season-map', data.calendar, { year: data.year, seriesName });
}

async function loadF3Season() {
  const year = new URLSearchParams(window.location.search).get('year');
  if (!/^\d{4}$/.test(year || '')) return setError('f3-season-error', 'Choose a valid Formula 3 season.');
  try {
    renderF3Season(await getJSON(`/api/seasons/${encodeURIComponent(year)}?series=f3`));
  } catch (error) {
    console.error('F3 season error:', error);
    setError('f3-season-error', error.message);
  }
}

document.querySelectorAll('[data-f3-standings-mode]').forEach(button => button.addEventListener('click', () => setF3StandingsMode(button.dataset.f3StandingsMode)));
loadF3Season();
