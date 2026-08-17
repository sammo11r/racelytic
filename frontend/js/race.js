let raceData = null;
let activeSession = 'race';
let activeVariants = {};

const SESSION_LABELS = { race: 'Race', sprint: 'Sprint', qualifying: 'Qualifying', practice: 'Practice' };
const VARIANT_LABELS = {
  qualifying: 'Qualifying', qualifying1: 'Qualifying 1', qualifying2: 'Qualifying 2',
  sprintQualifying: 'Sprint qualifying', preQualifying: 'Pre-qualifying',
  practice1: 'Practice 1', practice2: 'Practice 2', practice3: 'Practice 3',
  practice4: 'Practice 4', warmingUp: 'Warm-up'
};

function hasRows(value) {
  return Array.isArray(value) ? value.length > 0 : Object.values(value || {}).some(rows => rows.length);
}

function sessionRows() {
  const session = raceData.sessions[activeSession];
  if (Array.isArray(session)) return session;
  const available = Object.keys(session).filter(key => session[key].length);
  const variant = activeVariants[activeSession] && session[activeVariants[activeSession]]?.length
    ? activeVariants[activeSession] : available[0];
  activeVariants[activeSession] = variant;
  return session[variant] || [];
}

function resultCell(value) {
  return value === null || value === undefined || value === '' ? '—' : esc(value);
}

function renderSessionTable() {
  const rows = sessionRows();
  const variant = activeVariants[activeSession];
  document.getElementById('session-title').textContent = `${variant ? VARIANT_LABELS[variant] : SESSION_LABELS[activeSession]} classification`;
  const variants = raceData.sessions[activeSession];
  document.getElementById('session-variants').innerHTML = !Array.isArray(variants) && Object.values(variants).filter(hasRows).length > 1
    ? Object.entries(variants).filter(([, values]) => values.length).map(([key]) => `<button type="button" class="session-variant${key === variant ? ' active' : ''}" data-variant="${key}">${VARIANT_LABELS[key]}</button>`).join('') : '';

  const isRace = activeSession === 'race' || activeSession === 'sprint';
  const isQualifying = activeSession === 'qualifying';
  document.getElementById('race-results').innerHTML = rows.length ? `
    <table class="session-results-table">
      <thead><tr><th>Pos.</th><th>Driver</th><th>Constructor</th>${isRace ? '<th>Grid</th><th>Laps</th><th>Time / status</th><th>Points</th>' : isQualifying ? '<th>Q1</th><th>Q2</th><th>Q3</th><th>Time</th><th>Laps</th>' : '<th>Time</th><th>Gap</th><th>Laps</th>'}</tr></thead>
      <tbody>${rows.map(result => `<tr>
        <td><span class="finish-position${Number(result.positionNumber) <= 3 ? ' podium' : ''}">${resultCell(result.positionText || result.positionNumber)}</span></td>
        <td><a href="/driver.html?id=${encodeURIComponent(result.driverId)}"><strong>${esc(result.driverName)}</strong></a>${result.driverNumber ? `<small>#${esc(result.driverNumber)}</small>` : ''}</td>
        <td><a href="/constructor.html?id=${encodeURIComponent(result.constructorId)}">${esc(result.constructorName || '—')}</a></td>
        ${isRace ? `<td>${resultCell(result.gridPositionNumber)}</td><td>${resultCell(result.laps)}</td><td>${resultCell(result.time || result.gap || result.reasonRetired)}</td><td class="result-points-total">${fmtNumber(result.points)}</td>`
          : isQualifying ? `<td>${resultCell(result.q1)}</td><td>${resultCell(result.q2)}</td><td>${resultCell(result.q3)}</td><td>${resultCell(result.time)}</td><td>${resultCell(result.laps)}</td>`
          : `<td>${resultCell(result.time)}</td><td>${resultCell(result.gap || result.interval)}</td><td>${resultCell(result.laps)}</td>`}
      </tr>`).join('')}</tbody>
    </table>` : '<div class="empty-state">No results are available for this session.</div>';

  document.querySelectorAll('[data-variant]').forEach(button => button.addEventListener('click', () => {
    activeVariants[activeSession] = button.dataset.variant;
    renderSessionTable();
  }));
}

function renderSessionTabs() {
  document.getElementById('session-tabs').innerHTML = Object.keys(SESSION_LABELS).filter(key => hasRows(raceData.sessions[key])).map(key => `
    <button class="standings-mode-button${key === activeSession ? ' active' : ''}" type="button" role="tab" data-session="${key}" aria-selected="${key === activeSession}">${SESSION_LABELS[key]}</button>`).join('');
  document.querySelectorAll('[data-session]').forEach(button => button.addEventListener('click', () => {
    activeSession = button.dataset.session;
    renderSessionTabs();
    renderSessionTable();
  }));
}

async function loadRace() {
  const id = params().get('id');
  if (!id) return setError('race-head', 'No race selected.');

  try {
    const data = await getJSON(`/api/races/${encodeURIComponent(id)}`);
    raceData = data;
    const race = data.race;
    document.title = `${race.officialName} — Racelytics`;
    document.getElementById('race-head').innerHTML = `
      <div class="detail-hero">
        <div class="eyebrow">ROUND ${esc(race.round)} · ${esc(race.year)}</div>
        <h1>${esc(race.officialName)}</h1>
        <div class="detail-sub">${esc(race.circuitName || '')}${race.countryName ? ` · ${esc(race.countryName)}` : ''} · ${esc(fmtDate(race.date))}</div>
        <div class="race-hero-facts"><span>${fmtNumber(race.laps)} laps</span><span>${fmtNumber(race.distance)} km</span><span>${esc(race.qualifyingFormat ? race.qualifyingFormat.replaceAll('_', ' ').toLowerCase() : 'Grand Prix')}</span></div>
      </div>`;
    renderSessionTabs();
    renderSessionTable();
  } catch (error) {
    setError('race-head', error.message);
  }
}

loadRace();
