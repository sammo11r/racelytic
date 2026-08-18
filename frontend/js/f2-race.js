let f2RaceData = null;
let activeF2SessionId = null;

function f2SessionKind(session) {
  const name = String(session.name || '').toLowerCase();
  if (session.isRace) return 'race';
  if (name.includes('grid')) return 'grid';
  if (name.includes('qualif')) return 'qualifying';
  return 'practice';
}

function f2SessionName(session) {
  const originalName = String(session.name || 'Session');
  if (originalName.toLowerCase() !== 'race') return originalName;
  const raceSessions = f2RaceData.sessions.filter(item => item.isRace);
  const index = raceSessions.findIndex(item => item.id === session.id);
  const year = Number(f2RaceData.race.year);
  if (year === 2021 && index < raceSessions.length - 1) return `Sprint Race ${index + 1}`;
  if (year <= 2020) return index === 0 ? 'Feature Race' : 'Sprint Race';
  return index === raceSessions.length - 1 ? 'Feature Race' : 'Sprint Race';
}

function f2ResultValue(value) {
  return value === null || value === undefined || value === '' ? '—' : esc(value);
}

function f2Gap(result, useTimeFallback = true) {
  if (Number(result.gapLaps || 0) > 0) return `+${fmtNumber(result.gapLaps)} lap${Number(result.gapLaps) === 1 ? '' : 's'}`;
  if (Number(result.gapMillis || 0) > 0) return `+${(Number(result.gapMillis) / 1000).toFixed(3)}s`;
  return (useTimeFallback ? result.time : null) || result.status || '—';
}

function f2SessionTabLabel(session) {
  return `${esc(f2SessionName(session))}${session.cancelled ? '<small>Cancelled</small>' : session.results.length ? `<small>${fmtNumber(session.results.length)} classified</small>` : '<small>No data</small>'}`;
}

function renderF2SessionTabs() {
  document.getElementById('f2-session-tabs').innerHTML = f2RaceData.sessions.map(session => `
    <button type="button" role="tab" class="f2-session-tab${session.id === activeF2SessionId ? ' active' : ''}${session.cancelled ? ' cancelled' : ''}" data-f2-session="${esc(session.id)}" aria-selected="${session.id === activeF2SessionId}">${f2SessionTabLabel(session)}</button>`).join('');
  document.querySelectorAll('[data-f2-session]').forEach(button => button.addEventListener('click', () => {
    activeF2SessionId = button.dataset.f2Session;
    renderF2SessionTabs();
    renderF2SessionResults();
  }));
}

function renderF2SessionResults() {
  const session = f2RaceData.sessions.find(item => item.id === activeF2SessionId) || f2RaceData.sessions[0];
  if (!session) {
    document.getElementById('f2-session-title').textContent = 'Weekend schedule';
    document.getElementById('f2-session-summary').textContent = 'Sessions not yet available';
    document.getElementById('f2-race-results').innerHTML = '<div class="empty-state">Session details will appear when the weekend schedule is available.</div>';
    return;
  }
  const kind = f2SessionKind(session);
  document.getElementById('f2-session-title').textContent = f2SessionName(session);
  document.getElementById('f2-session-summary').textContent = session.cancelled
    ? 'Session cancelled'
    : `${fmtNumber(session.results.length)} classified${session.startTimeUtc ? ` · ${fmtDate(session.startTimeUtc)}` : ''}`;
  if (session.cancelled) {
    document.getElementById('f2-race-results').innerHTML = '<div class="f2-cancelled-session"><strong>Cancelled</strong><p>This session remained on the weekend schedule but no classification was issued.</p></div>';
    return;
  }

  const rows = session.results;
  const heading = kind === 'race'
    ? '<th>Pos.</th><th>Driver</th><th>Team</th><th>Laps</th><th>Time / status</th><th>Points</th>'
    : kind === 'grid'
      ? '<th>Pos.</th><th>Driver</th><th>Team</th><th>Number</th>'
      : '<th>Pos.</th><th>Driver</th><th>Team</th><th>Time</th><th>Gap</th><th>Laps</th>';
  document.getElementById('f2-race-results').innerHTML = rows.length ? `
    <table class="session-results-table"><thead><tr>${heading}</tr></thead><tbody>${rows.map(result => {
      const position = f2ResultValue(result.positionNumber || result.status);
      const driver = `<a href="/f2/driver?id=${encodeURIComponent(result.driverId)}"><strong>${esc(result.driverName || 'Unknown driver')}</strong></a>${result.driverNumber ? `<small>#${esc(result.driverNumber)}${result.abbreviation ? ` · ${esc(result.abbreviation)}` : ''}</small>` : ''}`;
      const awards = `${result.polePosition ? '<span class="f2-session-award">PP</span>' : ''}${result.fastestLap ? '<span class="f2-session-award">F</span>' : ''}`;
      if (kind === 'race') return `<tr><td><span class="finish-position${Number(result.positionNumber) <= 3 && Number(result.positionNumber) > 0 ? ' podium' : ''}">${position}</span></td><td>${driver}${awards}</td><td>${esc(result.constructorName || '—')}</td><td>${f2ResultValue(result.laps)}</td><td>${esc(f2Gap(result))}</td><td class="result-points-total">${result.points === null ? '—' : fmtNumber(result.points)}</td></tr>`;
      if (kind === 'grid') return `<tr><td><span class="finish-position${Number(result.positionNumber) <= 3 ? ' podium' : ''}">${position}</span></td><td>${driver}</td><td>${esc(result.constructorName || '—')}</td><td>${f2ResultValue(result.driverNumber)}</td></tr>`;
      return `<tr><td><span class="finish-position${Number(result.positionNumber) <= 3 ? ' podium' : ''}">${position}</span></td><td>${driver}${awards}</td><td>${esc(result.constructorName || '—')}</td><td>${f2ResultValue(result.time)}</td><td>${esc(f2Gap(result, false))}</td><td>${f2ResultValue(result.laps)}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty-state">No classification is available for this session.</div>';
}

async function loadF2Race() {
  const id = params().get('id');
  if (!id) return setError('f2-race-head', 'No Formula 2 weekend selected.');
  try {
    f2RaceData = await getJSON(`/api/races/${encodeURIComponent(id)}?series=f2`);
    const race = f2RaceData.race;
    document.title = `${race.year} ${race.name} · Formula 2 · Racelytic`;
    document.getElementById('f2-race-head').innerHTML = `
      <div class="detail-hero f2-race-hero">
        <div class="eyebrow">ROUND ${esc(race.round)} · ${esc(race.year)}</div>
        <h1>${esc(race.name)}</h1>
        <div class="detail-sub">${esc(race.circuitName || '')}${race.placeName ? ` · ${esc(race.placeName)}` : ''} · ${esc(fmtDate(race.date))}</div>
        <div class="race-hero-facts"><span>${fmtNumber(f2RaceData.sessions.length)} sessions</span>${race.lengthMeters ? `<span>${fmtNumber(Number(race.lengthMeters) / 1000)} km circuit</span>` : ''}${race.turns ? `<span>${fmtNumber(race.turns)} turns</span>` : ''}</div>
      </div>`;
    const preferred = f2RaceData.sessions.find(session => /feature/i.test(session.name) && session.results.length)
      || [...f2RaceData.sessions].reverse().find(session => session.isRace && session.results.length)
      || f2RaceData.sessions.find(session => session.results.length)
      || f2RaceData.sessions[0];
    activeF2SessionId = preferred?.id || null;
    renderF2SessionTabs();
    renderF2SessionResults();
  } catch (error) {
    setError('f2-race-head', error.message);
  }
}

loadF2Race();
