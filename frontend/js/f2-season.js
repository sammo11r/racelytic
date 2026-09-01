let f2StandingsMode = 'points';

function renderPodiumPlace(id, driver) {
  document.getElementById(`f2-season-${id}`).textContent = driver?.name || '—';
  document.getElementById(`f2-season-${id}-points`).textContent = driver ? `${fmtNumber(driver.points)} points` : '—';
}

function f2ResultPoints(result, session, year) {
  if (!result) return '';
  if (result.points !== null && result.points !== undefined) {
    return Number(result.points) > 0 ? fmtNumber(result.points) : '';
  }
  const featurePoints = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const sprintPoints = Number(year) <= 2021
    ? [15, 12, 10, 8, 6, 4, 2, 1]
    : [10, 8, 6, 5, 4, 3, 2, 1];
  const position = Number(result.position || 0);
  const scale = session.type === 'F' ? featurePoints : sprintPoints;
  let points = position > 0 ? Number(scale[position - 1] || 0) : 0;
  if (result.fastestLap && position > 0 && position <= 10) {
    points += Number(year) <= 2021 ? 2 : 1;
  }
  if (result.polePosition) points += Number(year) <= 2021 ? 4 : 2;
  return points > 0 ? fmtNumber(points) : '';
}

function setF2StandingsMode(mode) {
  f2StandingsMode = mode === 'position' ? 'position' : 'points';
  document.querySelectorAll('[data-standings-mode]').forEach(button => {
    const active = button.dataset.standingsMode === f2StandingsMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const table = document.getElementById('driver-table');
  if (table) table.dataset.valueMode = f2StandingsMode;
  document.querySelectorAll('#driver-table .result-value').forEach(value => {
    value.textContent = f2StandingsMode === 'position'
      ? value.dataset.position
      : value.dataset.points;
  });
}

function f2RaceType(session, sessionIndex, sessionCount, year) {
  const name = String(session.name || '').toLowerCase();
  if (name.includes('feature')) return 'F';
  if (name.includes('sprint')) {
    const number = name.match(/\d+/)?.[0];
    return number ? `S${number}` : 'S';
  }
  const sessionNumber = Number(session.sessionNumber || 0);
  if (sessionNumber) {
    if (Number(year) <= 2020) return sessionNumber <= 4 ? 'F' : 'S';
    return sessionNumber >= 6 ? 'F' : 'S';
  }
  if (Number(year) <= 2020) return sessionIndex === 0 ? 'F' : 'S';
  return sessionIndex === sessionCount - 1 ? 'F' : 'S';
}

function f2RaceCode(race, session, sessionIndex, sessionCount, year) {
  const code = race.code || `R${race.round}`;
  if (sessionCount === 1) return code;
  return `${code} ${f2RaceType(session, sessionIndex, sessionCount, year)}`;
}

function f2SessionHeading(session) {
  return `${esc(session.label)}${session.cancelled ? '<small class="cancelled-label">Cancelled</small>' : ''}`;
}

function f2ResultClass(result) {
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

function f2ResultLabel(result) {
  if (!result) return '';
  return result?.positionText || result?.position || 'â€”';
}

function f2ConstructorResultClass(result) {
  if (!result) return 'result-empty';
  const bestPosition = Number(result.bestPosition || 0);
  if (bestPosition === 1) return 'result-win';
  if (bestPosition > 1 && bestPosition <= 3) return 'result-podium';
  if (Number(result.points || 0) > 0) return 'result-points';
  if (Number(result.classified || 0) > 0) return 'result-finish';
  return 'result-empty';
}

function renderF2ConstructorTable(constructors, raceSessions) {
  document.getElementById('f2-constructor-head').innerHTML = `<tr>
    <th class="position-column">Pos.</th><th class="name-column">Constructor</th>
    ${raceSessions.map(session => `<th class="race-column${session.cancelled ? ' cancelled-session' : ''}" title="${esc(session.race.name)} · ${esc(session.name)}${session.cancelled ? ' · Cancelled' : ''}">${f2SessionHeading(session)}</th>`).join('')}
    <th class="points-column">Points</th></tr>`;

  document.getElementById('f2-constructor-body').innerHTML = constructors.map(constructor => `
    <tr>
      <td class="position-column">${esc(constructor.position)}</td>
      <td class="name-column"><a href="/f2/constructor?id=${encodeURIComponent(constructor.constructorId)}">${esc(constructor.name)}</a></td>
      ${raceSessions.map(session => {
        const result = constructor.raceResults?.[session.id];
        const points = Number(result?.points ?? result ?? 0);
        return `<td class="race-point constructor-points ${f2ConstructorResultClass(result)}"><span>${points > 0 ? fmtNumber(points) : ''}</span></td>`;
      }).join('')}
      <td class="points-column total-points">${fmtNumber(constructor.points)}</td>
    </tr>`).join('');
}

function renderF2Season(data) {
  document.title = `${data.year} Formula 2 Season · Racelytic`;
  document.getElementById('f2-season-year').textContent = data.year;
  const completed = Boolean(data.summary.completed);
  document.getElementById('f2-season-first-label').textContent = completed ? 'Formula 2 champion' : 'Championship leader';
  document.getElementById('f2-season-second-label').textContent = completed ? 'Runner-up' : 'Second place';
  document.getElementById('f2-season-third-label').textContent = 'Third place';
  document.getElementById('f2-season-constructor-label').textContent = completed ? 'Teams’ champion' : 'Leading team';
  document.getElementById('f2-season-constructor').textContent = data.summary.constructorLeader?.name || '—';
  document.getElementById('f2-season-races').textContent = fmtNumber(data.summary.races);
  document.getElementById('f2-season-laps').textContent = fmtNumber(data.summary.laps);
  document.getElementById('f2-team-count').textContent = `${fmtNumber(data.summary.teams)} teams`;
  renderPodiumPlace('first', data.summary.first);
  renderPodiumPlace('second', data.summary.second);
  renderPodiumPlace('third', data.summary.third);

  const raceSessions = data.calendar.flatMap(race => race.sessions.map((session, sessionIndex) => ({
    ...session,
    race,
    type: f2RaceType(session, sessionIndex, race.sessions.length, data.year),
    label: f2RaceCode(race, session, sessionIndex, race.sessions.length, data.year)
  })));

  document.getElementById('f2-standings-head').innerHTML = `<tr>
    <th class="position-column">Pos.</th><th class="name-column">Driver</th>
    ${raceSessions.map(session => `<th class="race-column${session.cancelled ? ' cancelled-session' : ''}" title="${esc(session.race.name)} · ${esc(session.name)}${session.cancelled ? ' · Cancelled' : ''}">${f2SessionHeading(session)}</th>`).join('')}
    <th class="points-column">Points</th></tr>`;

  document.getElementById('f2-standings-body').innerHTML = data.championship.map(driver => `
    <tr>
      <td class="position-column">${esc(driver.position)}</td>
      <td class="name-column"><a href="/f2/driver?id=${encodeURIComponent(driver.driverId)}"><span class="driver-name">${esc(driver.name)}<small>${esc(driver.constructor || 'Independent entry')}</small></span></a></td>
      ${raceSessions.map(session => {
        const result = driver.raceResults?.[session.id];
        if (result) {
          const position = Number(result.position || 0);
          result.pointsLimit = session.type === 'F' ? 10 : 8;
          result.fastestLap = Boolean(result.fastestLap && position > 0 && position <= 10);
          result.polePosition = session.type === 'F' && Boolean(result.polePosition);
        }
        return `<td class="race-point ${f2ResultClass(result)}" title="${esc(session.race.name)} · ${esc(session.name)}: finished ${esc(f2ResultLabel(result))}"><span class="result-value">${esc(f2ResultLabel(result))}</span>${result?.fastestLap ? '<sup class="result-marker" title="Fastest lap">F</sup>' : ''}</td>`;
      }).join('')}
      <td class="points-column total-points">${fmtNumber(driver.points)}</td>
    </tr>`).join('');

  const resultValues = [...document.querySelectorAll('#driver-table .result-value')];
  let resultValueIndex = 0;
  data.championship.forEach(driver => raceSessions.forEach(session => {
    const result = driver.raceResults?.[session.id];
    const value = resultValues[resultValueIndex];
    resultValueIndex += 1;
    value.dataset.position = f2ResultLabel(result);
    value.dataset.points = f2ResultPoints(result, session, data.year);
  }));
  setF2StandingsMode(f2StandingsMode);
  renderF2ConstructorTable(data.constructorChampionship || [], raceSessions);

  document.getElementById('f2-race-calendar').innerHTML = data.calendar.map(race => `
    <article class="calendar-race f2-calendar-race" data-round="${esc(race.round)}">
      <div class="calendar-round">${esc(race.round)}</div>
      <div class="calendar-date">${fmtDate(race.date)}</div>
      <div class="calendar-name"><strong>${esc(race.name)}</strong><small>${esc(race.circuitName || race.placeName || '')}</small></div>
      <div class="f2-calendar-sessions">${race.sessions.map(session => `<span${session.cancelled ? ' class="cancelled-session"' : ''}>${esc(session.name)}: ${session.cancelled ? 'Cancelled' : esc(session.winner || 'No winner')}</span>`).join('')}</div>
    </article>`).join('');
  window.renderJuniorSeasonMap?.('f2-season-map', data.calendar, { year: data.year, seriesName: 'Formula 2' });
}

async function loadF2Season() {
  const year = new URLSearchParams(window.location.search).get('year');
  if (!/^\d{4}$/.test(year || '')) {
    setError('f2-season-error', 'Choose a valid Formula 2 season.');
    return;
  }
  try {
    renderF2Season(await getJSON(`/api/seasons/${encodeURIComponent(year)}?series=f2`));
  } catch (error) {
    console.error('F2 season error:', error);
    setError('f2-season-error', error.message);
  }
}

document.querySelectorAll('[data-standings-mode]').forEach(button => {
  button.addEventListener('click', () => setF2StandingsMode(button.dataset.standingsMode));
});

loadF2Season();
