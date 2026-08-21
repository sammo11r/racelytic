let f3RaceData = null;
let activeF3SessionId = null;

function f3SessionKind(session) {
  const name = String(session.name || '').toLowerCase();
  if (session.isRace) return 'race';
  if (name.includes('grid')) return 'grid';
  if (name.includes('qualif')) return 'qualifying';
  return 'practice';
}

function f3SessionName(session) {
  const originalName = String(session.name || 'Session');
  if (originalName.toLowerCase() !== 'race') return originalName;
  const raceSessions = f3RaceData.sessions.filter(item => item.isRace);
  const index = raceSessions.findIndex(item => item.id === session.id);
  const year = Number(f3RaceData.race.year);
  if (year === 2021 && index < raceSessions.length - 1) return `Sprint Race ${index + 1}`;
  if (year <= 2020) return index === 0 ? 'Feature Race' : 'Sprint Race';
  return index === raceSessions.length - 1 ? 'Feature Race' : 'Sprint Race';
}

function f3ResultValue(value) {
  return value === null || value === undefined || value === '' ? '—' : esc(value);
}

function f3Gap(result, useTimeFallback = true) {
  if (Number(result.gapLaps || 0) > 0) return `+${fmtNumber(result.gapLaps)} lap${Number(result.gapLaps) === 1 ? '' : 's'}`;
  if (Number(result.gapMillis || 0) > 0) return `+${(Number(result.gapMillis) / 1000).toFixed(3)}s`;
  return (useTimeFallback ? result.time : null) || result.status || '—';
}

function f3SessionTabLabel(session) {
  return `${esc(f3SessionName(session))}${session.cancelled ? '<small>Cancelled</small>' : session.results.length ? `<small>${fmtNumber(session.results.length)} classified</small>` : '<small>No data</small>'}`;
}

function renderF3SessionTabs() {
  document.getElementById('f3-session-tabs').innerHTML = f3RaceData.sessions.map(session => `
    <button type="button" role="tab" class="junior-session-tab${session.id === activeF3SessionId ? ' active' : ''}${session.cancelled ? ' cancelled' : ''}" data-f3-session="${esc(session.id)}" aria-selected="${session.id === activeF3SessionId}">${f3SessionTabLabel(session)}</button>`).join('');
  document.querySelectorAll('[data-f3-session]').forEach(button => button.addEventListener('click', () => {
    activeF3SessionId = button.dataset.f3Session;
    renderF3SessionTabs();
    renderF3SessionResults();
  }));
}

function renderF3SessionResults() {
  const session = f3RaceData.sessions.find(item => item.id === activeF3SessionId) || f3RaceData.sessions[0];
  if (!session) {
    document.getElementById('f3-session-title').textContent = 'Weekend schedule';
    document.getElementById('f3-session-summary').textContent = 'Sessions not yet available';
    document.getElementById('f3-race-results').innerHTML = '<div class="empty-state">Session details will appear when the weekend schedule is available.</div>';
    return;
  }
  const kind = f3SessionKind(session);
  document.getElementById('f3-session-title').textContent = f3SessionName(session);
  document.getElementById('f3-session-summary').textContent = session.cancelled
    ? 'Session cancelled'
    : `${fmtNumber(session.results.length)} classified${session.startTimeUtc ? ` · ${fmtDate(session.startTimeUtc)}` : ''}`;
  if (session.cancelled) {
    document.getElementById('f3-race-results').innerHTML = '<div class="junior-cancelled-session"><strong>Cancelled</strong><p>This session remained on the weekend schedule but no classification was issued.</p></div>';
    return;
  }

  const heading = kind === 'race'
    ? '<th>Pos.</th><th>Driver</th><th>Team</th><th>Laps</th><th>Time / status</th><th>Points</th>'
    : kind === 'grid'
      ? '<th>Pos.</th><th>Driver</th><th>Team</th><th>Number</th>'
      : '<th>Pos.</th><th>Driver</th><th>Team</th><th>Time</th><th>Gap</th><th>Laps</th>';
  document.getElementById('f3-race-results').innerHTML = session.results.length ? `
    <table class="session-results-table"><thead><tr>${heading}</tr></thead><tbody>${session.results.map(result => {
      const position = f3ResultValue(result.positionNumber || result.status);
      const driver = `<strong>${esc(result.driverName || 'Unknown driver')}</strong>${result.driverNumber ? `<small>#${esc(result.driverNumber)}${result.abbreviation ? ` · ${esc(result.abbreviation)}` : ''}</small>` : ''}`;
      const awards = `${result.polePosition ? '<span class="junior-session-award">PP</span>' : ''}${result.fastestLap ? '<span class="junior-session-award">F</span>' : ''}`;
      if (kind === 'race') return `<tr><td><span class="finish-position${Number(result.positionNumber) <= 3 && Number(result.positionNumber) > 0 ? ' podium' : ''}">${position}</span></td><td>${driver}${awards}</td><td>${esc(result.constructorName || '—')}</td><td>${f3ResultValue(result.laps)}</td><td>${esc(f3Gap(result))}</td><td class="result-points-total">${result.points === null ? '—' : fmtNumber(result.points)}</td></tr>`;
      if (kind === 'grid') return `<tr><td><span class="finish-position${Number(result.positionNumber) <= 3 ? ' podium' : ''}">${position}</span></td><td>${driver}</td><td>${esc(result.constructorName || '—')}</td><td>${f3ResultValue(result.driverNumber)}</td></tr>`;
      return `<tr><td><span class="finish-position${Number(result.positionNumber) <= 3 ? ' podium' : ''}">${position}</span></td><td>${driver}</td><td>${esc(result.constructorName || '—')}</td><td>${f3ResultValue(result.time)}</td><td>${esc(f3Gap(result, false))}</td><td>${f3ResultValue(result.laps)}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty-state">No classification is available for this session.</div>';
}

async function loadF3Race() {
  const id = params().get('id');
  if (!id) return setError('f3-race-head', 'No Formula 3 weekend selected.');
  try {
    f3RaceData = await getJSON(`/api/races/${encodeURIComponent(id)}?series=f3`);
    const race = f3RaceData.race;
    document.title = `${race.year} ${race.name} · Formula 3 · Racelytic`;
    document.getElementById('f3-race-head').innerHTML = `
      <div class="detail-hero">
        <div class="eyebrow">ROUND ${esc(race.round)} · ${esc(race.year)}</div>
        <h1>${esc(race.name)}</h1>
        <div class="detail-sub">${esc(race.circuitName || '')}${race.placeName ? ` · ${esc(race.placeName)}` : ''} · ${esc(fmtDate(race.date))}</div>
        <div class="race-hero-facts"><span>${fmtNumber(f3RaceData.sessions.length)} sessions</span>${race.lengthMeters ? `<span>${fmtNumber(Number(race.lengthMeters) / 1000)} km circuit</span>` : ''}${race.turns ? `<span>${fmtNumber(race.turns)} turns</span>` : ''}</div>
      </div>`;
    const preferred = [...f3RaceData.sessions].reverse().find(session => session.isRace && session.results.length)
      || f3RaceData.sessions.find(session => session.results.length)
      || f3RaceData.sessions[0];
    activeF3SessionId = preferred?.id || null;
    renderF3SessionTabs();
    renderF3SessionResults();
  } catch (error) {
    setError('f3-race-head', error.message);
  }
}

loadF3Race();
