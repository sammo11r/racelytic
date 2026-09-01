const juniorRaceConfig = window.RacelyticJuniorRaceDetail;
let juniorRaceData = null;
let activeJuniorSessionId = null;

function juniorSessionKind(session) {
  const name = String(session.name || '').toLowerCase();
  if (session.isRace) return 'race';
  if (name.includes('grid')) return 'grid';
  if (name.includes('qualif')) return 'qualifying';
  return 'practice';
}

function juniorSessionName(session) {
  return String(session.displayName || session.name || 'Session');
}

function juniorResultValue(value) {
  return value === null || value === undefined || value === '' ? '—' : esc(value);
}

function juniorGap(result, useTimeFallback = true) {
  if (Number(result.gapLaps || 0) > 0) return `+${fmtNumber(result.gapLaps)} lap${Number(result.gapLaps) === 1 ? '' : 's'}`;
  if (Number(result.gapMillis || 0) > 0) return `+${(Number(result.gapMillis) / 1000).toFixed(3)}s`;
  return (useTimeFallback ? result.time : null) || result.status || '—';
}

function juniorResultStatusClass(result) {
  const status = String(result.status || '').toUpperCase();
  if (/DSQ|DQ|DISQ|EXC/.test(status)) return ' disqualified';
  if (/DNS|DID NOT START/.test(status)) return ' did-not-start';
  if (/DNF|RET|NC/.test(status) || (!Number(result.positionNumber) && status)) return ' retired';
  if (Number(result.positionNumber) <= 3 && Number(result.positionNumber) > 0) return ' podium';
  return '';
}

function juniorResultMarkers(result) {
  return `${result.polePosition ? '<span class="result-marker pole" title="Pole position">PP</span>' : ''}${result.fastestLap ? '<span class="result-marker fastest" title="Fastest lap">FL</span>' : ''}`;
}

function juniorGridMovement(result) {
  const finish = Number(result.positionNumber);
  const grid = Number(result.gridPositionNumber);
  if (!finish || !grid) return '—';
  const places = grid - finish;
  if (!places) return '<span class="grid-movement same" title="Finished in the starting position">—</span>';
  return `<span class="grid-movement ${places > 0 ? 'gained' : 'lost'}" title="${Math.abs(places)} place${Math.abs(places) === 1 ? '' : 's'} ${places > 0 ? 'gained' : 'lost'}">${places > 0 ? '↑' : '↓'}${Math.abs(places)}</span>`;
}

function juniorTeamLink(result) {
  const name = esc(result.constructorName || '—');
  return result.constructorId
    ? `<a href="${juniorRaceConfig.path}/${juniorRaceConfig.teamPage}?id=${encodeURIComponent(result.constructorId)}">${name}</a>`
    : name;
}

function juniorDriverLink(result) {
  return `<a href="${juniorRaceConfig.path}/driver?id=${encodeURIComponent(result.driverId)}"><strong>${esc(result.driverName || 'Unknown driver')}</strong></a>`;
}

function juniorRaceStatus() {
  const raceSessions = juniorRaceData.sessions.filter(session => session.isRace && !session.cancelled);
  const completed = raceSessions.filter(session => session.results.length);
  if (raceSessions.length && completed.length === raceSessions.length) return 'completed';
  if (juniorRaceData.sessions.some(session => session.results.length)) return 'in-progress';
  const date = juniorRaceData.race.endDate || juniorRaceData.race.date;
  const eventDate = date ? new Date(`${String(date).slice(0, 10)}T23:59:59`) : null;
  if (eventDate && !Number.isNaN(eventDate.getTime()) && eventDate >= new Date()) return 'upcoming';
  return 'no-result';
}

function juniorRaceStatusLabel(status) {
  return { completed: 'Completed', 'in-progress': 'Weekend in progress', upcoming: 'Upcoming', 'no-result': 'No result' }[status];
}

function availableJuniorSessions() {
  return juniorRaceData.sessions.filter(session => session.cancelled || session.results.length);
}

function activeJuniorSession() {
  return availableJuniorSessions().find(session => String(session.id) === String(activeJuniorSessionId)) || availableJuniorSessions()[0];
}

function preferredJuniorRaceSession() {
  const races = juniorRaceData.sessions.filter(session => session.isRace && session.results.length);
  return races.find(session => session.raceType === 'F') || races.at(-1) || null;
}

function juniorRaceSummaryResult() {
  const session = preferredJuniorRaceSession();
  return session?.results.find(result => Number(result.positionNumber) === 1) || session?.results[0] || null;
}

function renderJuniorRaceHero(status) {
  const race = juniorRaceData.race;
  const winner = juniorRaceSummaryResult();
  const latest = availableJuniorSessions().at(-1);
  const highlight = status === 'completed'
    ? `<span>Race winner</span><strong>${esc(winner?.driverName || 'Classification recorded')}</strong><small>${esc(winner?.constructorName || '')}</small>`
    : status === 'in-progress'
      ? `<span>Latest available</span><strong>${esc(latest ? juniorSessionName(latest) : 'Weekend session')}</strong><small>Final race result pending</small>`
      : `<span>Event date</span><strong>${esc(fmtDate(race.date))}</strong><small>${status === 'upcoming' ? 'Race weekend ahead' : 'Classification unavailable'}</small>`;
  const facts = [
    `${fmtNumber(juniorRaceData.sessions.length)} sessions`,
    race.lengthMeters ? `${fmtNumber(Number(race.lengthMeters) / 1000)} km circuit` : null,
    race.turns ? `${fmtNumber(race.turns)} turns` : null,
    race.circuitType ? String(race.circuitType) : null,
    race.direction ? String(race.direction) : null
  ].filter(Boolean);
  document.title = `${race.year} ${race.name} · ${juniorRaceConfig.name} · Racelytic`;
  const head = document.getElementById('junior-race-head');
  head.innerHTML = `<div class="detail-hero race-detail-hero" data-status="${status}">
    <div class="race-detail-hero-copy"><div class="race-detail-kicker"><span class="race-status-badge ${status}">${juniorRaceStatusLabel(status)}</span><a href="${juniorRaceConfig.path}/season?year=${encodeURIComponent(race.year)}">Round ${esc(race.round)} · ${esc(race.year)}</a></div>
      <h1>${esc(race.name)}</h1>
      <div class="detail-sub"><a href="${juniorRaceConfig.path}/circuit?id=${encodeURIComponent(race.circuitId)}">${esc(race.circuitName || 'Circuit')}</a>${race.placeName ? ` · ${esc(race.placeName)}` : ''} · ${esc(fmtDate(race.date))}</div>
      <div class="race-hero-facts">${facts.map(fact => `<span>${esc(fact)}</span>`).join('')}</div>
    </div>
    <aside class="race-hero-highlight">${highlight}</aside>
  </div>`;
  head.setAttribute('aria-busy', 'false');
}

function renderJuniorRaceOverview(status) {
  const overview = document.getElementById('junior-race-overview');
  const session = preferredJuniorRaceSession();
  if (!session || (status !== 'completed' && status !== 'in-progress')) {
    overview.innerHTML = '';
    return;
  }
  const podium = session.results.filter(result => Number(result.positionNumber) >= 1 && Number(result.positionNumber) <= 3).slice(0, 3);
  const winner = podium[0] || session.results[0];
  const runnerUp = podium[1] || session.results[1];
  const pole = juniorRaceData.sessions.flatMap(item => item.results).find(result => result.polePosition);
  const fastest = session.results.find(result => result.fastestLap);
  const retirements = session.results.filter(result => /DNF|DNS|DSQ|DQ|DISQ|RET|NC|EXC/i.test(String(result.status || ''))).length;
  overview.innerHTML = `<section class="race-summary-grid">
    <div class="race-podium-card"><div class="eyebrow">${esc(juniorSessionName(session).toUpperCase())} PODIUM</div><ol>${podium.map(result => `<li><span>${result.positionNumber}</span><div>${juniorDriverLink(result)}<small>${esc(result.constructorName || '—')}</small></div></li>`).join('')}</ol></div>
    <div class="race-summary-facts">
      <div><span>Winner</span><strong>${esc(winner?.driverName || '—')}</strong><small>${winner?.constructorName ? esc(winner.constructorName) : 'Classification pending'}</small></div>
      <div><span>Winning margin</span><strong>${esc(runnerUp ? juniorGap(runnerUp, false) : winner?.time || '—')}</strong><small>${runnerUp ? 'To second place' : 'Winner’s race time'}</small></div>
      <div><span>Pole position</span><strong>${esc(pole?.driverName || '—')}</strong><small>${pole?.constructorName ? esc(pole.constructorName) : 'Not recorded'}</small></div>
      <div><span>Fastest lap</span><strong>${esc(fastest?.driverName || '—')}</strong><small>${fastest?.fastestLapTime ? esc(fastest.fastestLapTime) : fastest?.constructorName ? esc(fastest.constructorName) : 'Not recorded'}</small></div>
      <div><span>Race attrition</span><strong>${fmtNumber(retirements)} retirement${retirements === 1 ? '' : 's'}</strong><small>${fmtNumber(session.results.length - retirements)} classified</small></div>
    </div>
  </section>`;
}

function renderJuniorDesktopResults(session) {
  const kind = juniorSessionKind(session);
  const heading = kind === 'race'
    ? '<th>Pos.</th><th>Driver</th><th>Team</th><th>Grid</th><th>Change</th><th>Laps</th><th>Time / status</th><th>Points</th>'
    : kind === 'grid'
      ? '<th>Pos.</th><th>Driver</th><th>Team</th><th>Number</th>'
      : '<th>Pos.</th><th>Driver</th><th>Team</th><th>Time</th><th>Gap</th><th>Laps</th>';
  return `<div class="table-wrap race-results-table-wrap"><table class="session-results-table"><thead><tr>${heading}</tr></thead><tbody>${session.results.map(result => {
    const position = juniorResultValue(result.positionNumber || result.status);
    const driver = `${juniorDriverLink(result)}${result.driverNumber ? `<small>#${esc(result.driverNumber)}${result.abbreviation ? ` · ${esc(result.abbreviation)}` : ''}</small>` : ''}`;
    const rowClass = juniorResultStatusClass(result).trim();
    const positionCell = `<span class="finish-position${juniorResultStatusClass(result)}">${position}</span>`;
    if (kind === 'race') return `<tr class="${rowClass}"><td>${positionCell}</td><td>${driver}${juniorResultMarkers(result)}</td><td>${juniorTeamLink(result)}</td><td>${juniorResultValue(result.gridPositionNumber)}</td><td>${juniorGridMovement(result)}</td><td>${juniorResultValue(result.laps)}</td><td>${esc(juniorGap(result))}</td><td class="result-points-total">${result.points === null ? '—' : fmtNumber(result.points)}</td></tr>`;
    if (kind === 'grid') return `<tr class="${rowClass}"><td>${positionCell}</td><td>${driver}</td><td>${juniorTeamLink(result)}</td><td>${juniorResultValue(result.driverNumber)}</td></tr>`;
    return `<tr class="${rowClass}"><td>${positionCell}</td><td>${driver}${juniorResultMarkers(result)}</td><td>${juniorTeamLink(result)}</td><td>${juniorResultValue(result.time)}</td><td>${esc(juniorGap(result, false))}</td><td>${juniorResultValue(result.laps)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderJuniorMobileResults(session) {
  const kind = juniorSessionKind(session);
  return `<div class="session-result-cards">${session.results.map(result => {
    const details = kind === 'race'
      ? [['Grid', juniorResultValue(result.gridPositionNumber)], ['Change', juniorGridMovement(result)], ['Laps', juniorResultValue(result.laps)], ['Time / status', esc(juniorGap(result))], ['Points', result.points === null ? '—' : fmtNumber(result.points)]]
      : kind === 'grid'
        ? [['Grid number', juniorResultValue(result.driverNumber)]]
        : [['Time', juniorResultValue(result.time)], ['Gap', esc(juniorGap(result, false))], ['Laps', juniorResultValue(result.laps)]];
    return `<article class="session-result-card${juniorResultStatusClass(result)}">
      <div class="session-result-card-head"><span class="finish-position${juniorResultStatusClass(result)}">${juniorResultValue(result.positionNumber || result.status)}</span><div>${juniorDriverLink(result)}<small>${esc(result.constructorName || '—')}${result.driverNumber ? ` · #${esc(result.driverNumber)}` : ''}</small></div><div class="result-card-markers">${juniorResultMarkers(result)}</div></div>
      <dl>${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    </article>`;
  }).join('')}</div>`;
}

function syncJuniorRaceUrl() {
  const id = params().get('id');
  if (!id || !activeJuniorSessionId) return;
  history.replaceState(null, '', `${juniorRaceConfig.path}/race?id=${encodeURIComponent(id)}&session=${encodeURIComponent(activeJuniorSessionId)}`);
}

function renderJuniorSessionResults() {
  const session = activeJuniorSession();
  if (!session) return;
  document.getElementById('junior-session-title').textContent = juniorSessionName(session);
  document.getElementById('junior-session-summary').textContent = session.cancelled
    ? 'Session cancelled'
    : `${fmtNumber(session.results.length)} entries${session.startTimeUtc ? ` · ${fmtDate(session.startTimeUtc)}` : ''}${session.gridNote ? ` · ${session.gridNote}` : ''}`;
  const panel = document.getElementById('junior-race-results');
  panel.setAttribute('aria-labelledby', `junior-session-tab-${session.id}`);
  if (session.cancelled) {
    panel.innerHTML = '<div class="junior-cancelled-session"><strong>Cancelled</strong><p>No classification was issued for this session.</p></div>';
  } else {
    panel.innerHTML = session.results.length
      ? `${renderJuniorDesktopResults(session)}${renderJuniorMobileResults(session)}`
      : '<div class="empty-state">No classification is available for this session.</div>';
  }
  syncJuniorRaceUrl();
}

function activateJuniorSession(sessionId) {
  activeJuniorSessionId = String(sessionId);
  renderJuniorSessionTabs();
  renderJuniorSessionResults();
}

function renderJuniorSessionTabs() {
  const sessions = availableJuniorSessions();
  const tabs = document.getElementById('junior-session-tabs');
  tabs.innerHTML = sessions.map(session => `<button id="junior-session-tab-${esc(session.id)}" type="button" role="tab" class="standings-mode-button${String(session.id) === String(activeJuniorSessionId) ? ' active' : ''}${session.cancelled ? ' cancelled' : ''}" data-junior-session="${esc(session.id)}" aria-controls="junior-race-results" aria-selected="${String(session.id) === String(activeJuniorSessionId)}" tabindex="${String(session.id) === String(activeJuniorSessionId) ? '0' : '-1'}">${esc(juniorSessionName(session))}</button>`).join('');
  tabs.querySelectorAll('[data-junior-session]').forEach((button, index) => {
    button.addEventListener('click', () => activateJuniorSession(button.dataset.juniorSession));
    button.addEventListener('keydown', event => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % sessions.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + sessions.length) % sessions.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = sessions.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      activateJuniorSession(sessions[nextIndex].id);
      document.getElementById(`junior-session-tab-${sessions[nextIndex].id}`).focus();
    });
  });
}

function renderJuniorRoundNavigation(races, race) {
  const sorted = [...races].filter(item => Number(item.year) === Number(race.year)).sort((first, second) => Number(first.round) - Number(second.round));
  const index = sorted.findIndex(item => String(item.id) === String(race.id));
  const previous = index > 0 ? sorted[index - 1] : null;
  const next = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null;
  document.getElementById('junior-race-round-navigation').innerHTML = `${previous ? `<a href="${juniorRaceConfig.path}/race?id=${encodeURIComponent(previous.id)}"><span>← Previous</span><strong>R${esc(previous.round)} · ${esc(previous.name)}</strong></a>` : '<span></span>'}${next ? `<a href="${juniorRaceConfig.path}/race?id=${encodeURIComponent(next.id)}"><span>Next →</span><strong>R${esc(next.round)} · ${esc(next.name)}</strong></a>` : ''}`;
}

async function loadJuniorRaceDetail() {
  const id = params().get('id');
  if (!id) {
    document.getElementById('junior-race-head').setAttribute('aria-busy', 'false');
    return setError('junior-race-head', `Choose a ${juniorRaceConfig.shortName} race from the archive.`);
  }
  try {
    juniorRaceData = await getJSON(`/api/races/${encodeURIComponent(id)}?series=${encodeURIComponent(juniorRaceConfig.series)}`);
    const status = juniorRaceStatus();
    renderJuniorRaceHero(status);
    renderJuniorRaceOverview(status);
    const sessions = availableJuniorSessions();
    const requested = params().get('session');
    const preferred = preferredJuniorRaceSession() || sessions.at(-1);
    activeJuniorSessionId = sessions.some(session => String(session.id) === requested) ? requested : preferred?.id || null;
    if (activeJuniorSessionId) {
      document.getElementById('junior-race-session-results').hidden = false;
      renderJuniorSessionTabs();
      renderJuniorSessionResults();
    }
    getJSON(`/api/races?series=${encodeURIComponent(juniorRaceConfig.series)}&year=${encodeURIComponent(juniorRaceData.race.year)}`)
      .then(races => renderJuniorRoundNavigation(races, juniorRaceData.race))
      .catch(() => {});
  } catch (error) {
    document.getElementById('junior-race-head').setAttribute('aria-busy', 'false');
    document.getElementById('junior-race-overview').innerHTML = '';
    document.getElementById('junior-race-session-results').hidden = true;
    setError('junior-race-head', error.message);
  }
}

loadJuniorRaceDetail();
