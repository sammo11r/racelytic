let raceData = null;
let activeSession = null;
let activeVariants = {};

const SESSION_LABELS = { race: 'Race', sprint: 'Sprint', qualifying: 'Qualifying', practice: 'Practice' };
const SESSION_PRIORITY = ['race', 'sprint', 'qualifying', 'practice'];
const VARIANT_LABELS = {
  qualifying: 'Qualifying', qualifying1: 'Qualifying 1', qualifying2: 'Qualifying 2',
  sprintQualifying: 'Sprint qualifying', preQualifying: 'Pre-qualifying',
  practice1: 'Practice 1', practice2: 'Practice 2', practice3: 'Practice 3',
  practice4: 'Practice 4', warmingUp: 'Warm-up'
};

function hasRows(value) {
  return Array.isArray(value) ? value.length > 0 : Object.values(value || {}).some(rows => rows.length);
}

function availableSessionKeys() {
  return SESSION_PRIORITY.filter(key => hasRows(raceData.sessions[key]));
}

function firstAvailableVariant(sessionKey) {
  const variants = raceData.sessions[sessionKey];
  if (Array.isArray(variants)) return null;
  return Object.keys(variants).find(key => variants[key].length) || null;
}

function sessionRows() {
  if (!activeSession) return [];
  const session = raceData.sessions[activeSession];
  if (Array.isArray(session)) return session;
  const available = Object.keys(session).filter(key => session[key].length);
  const variant = activeVariants[activeSession] && session[activeVariants[activeSession]]?.length
    ? activeVariants[activeSession] : available[0];
  activeVariants[activeSession] = variant;
  return session[variant] || [];
}

function normaliseRaceDuration(value) {
  if (value === null || value === undefined || value === '') return '—';
  const text = String(value);
  const match = text.match(/^(\d+):(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  return match ? `${match[1]}:${match[2].padStart(2, '0')}:${match[3]}` : text;
}

function resultCell(value) {
  return value === null || value === undefined || value === '' ? '—' : esc(normaliseRaceDuration(value));
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
}

function racePageStatus() {
  if (raceData.sessions.race.length) return 'completed';
  if (availableSessionKeys().length) return 'in-progress';
  const raceDate = raceData.race.date ? new Date(`${String(raceData.race.date).slice(0, 10)}T23:59:59`) : null;
  if (raceDate && !Number.isNaN(raceDate.getTime()) && raceDate >= new Date()) return 'upcoming';
  return 'no-result';
}

function raceStatusLabel(status) {
  return { completed: 'Completed', 'in-progress': 'Weekend in progress', upcoming: 'Upcoming', 'no-result': 'No result' }[status];
}

function resultStatusClass(result) {
  const text = String(result.positionText || '').toUpperCase();
  if (/DSQ|DQ|DISQ|EXC/.test(text)) return ' disqualified';
  if (/DNS|DID NOT START/.test(text)) return ' did-not-start';
  if (/DNF|RET|NC/.test(text) || (result.reasonRetired && !Number(result.positionNumber))) return ' retired';
  if (Number(result.positionNumber) <= 3) return ' podium';
  return '';
}

function resultMarkers(result) {
  return `${result.polePosition ? '<span class="result-marker pole" title="Pole position">PP</span>' : ''}${result.fastestLap ? '<span class="result-marker fastest" title="Fastest lap">FL</span>' : ''}`;
}

function gridMovement(result) {
  const finish = Number(result.positionNumber);
  const grid = Number(result.gridPositionNumber);
  if (!finish || !grid) return '';
  const places = grid - finish;
  if (!places) return '<span class="grid-movement same" title="Finished in the starting position">—</span>';
  return `<span class="grid-movement ${places > 0 ? 'gained' : 'lost'}" title="${Math.abs(places)} place${Math.abs(places) === 1 ? '' : 's'} ${places > 0 ? 'gained' : 'lost'}">${places > 0 ? '↑' : '↓'}${Math.abs(places)}</span>`;
}

function raceResultValue(result) {
  return result.time || result.gap || result.reasonRetired || result.positionText;
}

function qualifyingHasSegments(rows) {
  return rows.some(result => result.q1 || result.q2 || result.q3);
}

function renderDesktopResults(rows) {
  const isRace = activeSession === 'race' || activeSession === 'sprint';
  const isQualifying = activeSession === 'qualifying';
  const segmented = isQualifying && qualifyingHasSegments(rows);
  const headers = isRace
    ? '<th>Pos.</th><th>Driver</th><th>Constructor</th><th>Grid</th><th>Change</th><th>Laps</th><th>Time / status</th><th>Points</th>'
    : segmented
      ? '<th>Pos.</th><th>Driver</th><th>Constructor</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Laps</th>'
      : '<th>Pos.</th><th>Driver</th><th>Constructor</th><th>Time</th><th>Gap</th><th>Laps</th>';
  return `<div class="table-wrap race-results-table-wrap"><table class="session-results-table">
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows.map(result => `<tr class="${resultStatusClass(result).trim()}">
      <td><span class="finish-position${resultStatusClass(result)}">${resultCell(result.positionText || result.positionNumber)}</span></td>
      <td><a href="/driver?id=${encodeURIComponent(result.driverId)}"><strong>${esc(result.driverName)}</strong></a>${result.driverNumber ? `<small>#${esc(result.driverNumber)}</small>` : ''}${resultMarkers(result)}</td>
      <td><a href="/constructor?id=${encodeURIComponent(result.constructorId)}">${esc(result.constructorName || '—')}</a></td>
      ${isRace
        ? `<td>${resultCell(result.gridPositionNumber)}</td><td>${gridMovement(result)}</td><td>${resultCell(result.laps)}</td><td>${resultCell(raceResultValue(result))}</td><td class="result-points-total">${fmtNumber(result.points)}</td>`
        : segmented
          ? `<td>${resultCell(result.q1)}</td><td>${resultCell(result.q2)}</td><td>${resultCell(result.q3)}</td><td>${resultCell(result.laps)}</td>`
          : `<td>${resultCell(result.time)}</td><td>${resultCell(result.gap || result.interval)}</td><td>${resultCell(result.laps)}</td>`}
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderMobileResults(rows) {
  const isRace = activeSession === 'race' || activeSession === 'sprint';
  const isQualifying = activeSession === 'qualifying';
  const segmented = isQualifying && qualifyingHasSegments(rows);
  return `<div class="session-result-cards">${rows.map(result => {
    const details = isRace
      ? [['Grid', result.gridPositionNumber], ['Change', gridMovement(result)], ['Laps', result.laps], ['Status', resultCell(raceResultValue(result))], ['Points', fmtNumber(result.points)]]
      : segmented
        ? [['Q1', resultCell(result.q1)], ['Q2', resultCell(result.q2)], ['Q3', resultCell(result.q3)], ['Laps', resultCell(result.laps)]]
        : [['Time', resultCell(result.time)], ['Gap', resultCell(result.gap || result.interval)], ['Laps', resultCell(result.laps)]];
    return `<article class="session-result-card${resultStatusClass(result)}">
      <div class="session-result-card-head"><span class="finish-position${resultStatusClass(result)}">${resultCell(result.positionText || result.positionNumber)}</span><div><a href="/driver?id=${encodeURIComponent(result.driverId)}">${esc(result.driverName)}</a><small>${esc(result.constructorName || '—')}${result.driverNumber ? ` · #${esc(result.driverNumber)}` : ''}</small></div><div class="result-card-markers">${resultMarkers(result)}</div></div>
      <dl>${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${label === 'Change' ? value || '—' : value}</dd></div>`).join('')}</dl>
    </article>`;
  }).join('')}</div>`;
}

function syncRaceSessionUrl() {
  const id = params().get('id');
  if (!id || !activeSession) return;
  const query = new URLSearchParams({ id, session: activeSession });
  const variant = activeVariants[activeSession];
  if (variant) query.set('variant', variant);
  history.replaceState(null, '', `/race?${query}`);
}

function renderSessionTable() {
  const rows = sessionRows();
  const variant = activeVariants[activeSession];
  const label = variant ? VARIANT_LABELS[variant] : SESSION_LABELS[activeSession];
  document.getElementById('session-title').textContent = `${label} classification`;
  const variants = raceData.sessions[activeSession];
  document.getElementById('session-variants').innerHTML = !Array.isArray(variants) && Object.values(variants).filter(hasRows).length > 1
    ? Object.entries(variants).filter(([, values]) => values.length).map(([key]) => `<button type="button" class="session-variant${key === variant ? ' active' : ''}" data-variant="${key}" aria-pressed="${key === variant}">${VARIANT_LABELS[key]}</button>`).join('') : '';
  const panel = document.getElementById('race-results');
  panel.setAttribute('aria-labelledby', `session-tab-${activeSession}`);
  panel.innerHTML = rows.length
    ? `${renderDesktopResults(rows)}${renderMobileResults(rows)}`
    : '<div class="empty-state">No results are available for this session.</div>';
  document.querySelectorAll('[data-variant]').forEach(button => button.addEventListener('click', () => {
    activeVariants[activeSession] = button.dataset.variant;
    renderSessionTable();
  }));
  syncRaceSessionUrl();
}

function activateSession(session) {
  activeSession = session;
  renderSessionTabs();
  renderSessionTable();
}

function renderSessionTabs() {
  const available = availableSessionKeys();
  const tabs = document.getElementById('session-tabs');
  tabs.innerHTML = available.map(key => `<button id="session-tab-${key}" class="standings-mode-button${key === activeSession ? ' active' : ''}" type="button" role="tab" data-session="${key}" aria-controls="race-results" aria-selected="${key === activeSession}" tabindex="${key === activeSession ? '0' : '-1'}">${SESSION_LABELS[key]}</button>`).join('');
  tabs.querySelectorAll('[data-session]').forEach((button, index) => {
    button.addEventListener('click', () => activateSession(button.dataset.session));
    button.addEventListener('keydown', event => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % available.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + available.length) % available.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = available.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      activateSession(available[nextIndex]);
      document.getElementById(`session-tab-${available[nextIndex]}`).focus();
    });
  });
}

function findPoleSitter() {
  const racePole = raceData.sessions.race.find(result => result.polePosition);
  if (racePole) return racePole;
  const qualifying = raceData.sessions.qualifying;
  const preferred = qualifying.qualifying?.length ? qualifying.qualifying : Object.values(qualifying).find(hasRows) || [];
  return preferred.find(result => Number(result.positionNumber) === 1) || preferred[0];
}

function renderRaceOverview(status) {
  const race = raceData.race;
  const results = raceData.sessions.race;
  const overview = document.getElementById('race-overview');
  if (status === 'upcoming' || status === 'no-result') {
    overview.innerHTML = '';
    return;
  }
  const podium = results.filter(result => Number(result.positionNumber) >= 1 && Number(result.positionNumber) <= 3).slice(0, 3);
  const winner = podium[0] || results[0];
  const runnerUp = podium[1] || results[1];
  const pole = findPoleSitter();
  const fastest = results.find(result => result.fastestLap);
  const retirements = results.filter(result => /DNF|DNS|DSQ|DQ|RET|NC|EXC/i.test(String(result.positionText || '')) || (result.reasonRetired && !Number(result.positionNumber))).length;
  overview.innerHTML = `<section class="race-summary-grid">
    <div class="race-podium-card"><div class="eyebrow">RACE PODIUM</div><ol>${podium.map(result => `<li><span>${result.positionNumber}</span><div><a href="/driver?id=${encodeURIComponent(result.driverId)}">${esc(result.driverName)}</a><small>${esc(result.constructorName || '—')}</small></div></li>`).join('')}</ol></div>
    <div class="race-summary-facts">
      <div><span>Winner</span><strong>${esc(winner?.driverName || '—')}</strong><small>${winner?.constructorName ? esc(winner.constructorName) : 'Classification pending'}</small></div>
      <div><span>Winning margin</span><strong>${esc(normaliseRaceDuration(runnerUp?.gap || winner?.time || '—'))}</strong><small>${runnerUp?.gap ? 'To second place' : 'Winner’s race time'}</small></div>
      <div><span>Pole position</span><strong>${esc(pole?.driverName || '—')}</strong><small>${pole?.constructorName ? esc(pole.constructorName) : 'Not recorded'}</small></div>
      <div><span>Fastest lap</span><strong>${esc(fastest?.driverName || '—')}</strong><small>${fastest?.constructorName ? esc(fastest.constructorName) : 'Not recorded'}</small></div>
      <div><span>Race attrition</span><strong>${fmtNumber(retirements)} retirement${retirements === 1 ? '' : 's'}</strong><small>${fmtNumber(results.length - retirements)} classified</small></div>
    </div>
  </section>`;
}

function formatCircuitLength(value) {
  const length = Number(value);
  if (!Number.isFinite(length) || length <= 0) return null;
  return length > 100 ? `${(length / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} km circuit` : `${length.toLocaleString(undefined, { maximumFractionDigits: 3 })} km circuit`;
}

function renderRaceHero(status) {
  const race = raceData.race;
  const name = displayRaceName(race);
  const showOfficialName = race.officialName && race.officialName !== name;
  const winner = raceData.sessions.race.find(result => Number(result.positionNumber) === 1) || raceData.sessions.race[0];
  const highlight = status === 'completed'
    ? `<span>Race winner</span><strong>${esc(winner?.driverName || 'Classification recorded')}</strong><small>${esc(winner?.constructorName || '')}${winner?.time ? ` · ${esc(normaliseRaceDuration(winner.time))}` : ''}</small>`
    : status === 'in-progress'
      ? `<span>Latest available</span><strong>${esc(SESSION_LABELS[availableSessionKeys()[0]] || 'Weekend session')}</strong><small>Race result pending</small>`
    : `<span>${status === 'upcoming' ? 'Race day' : 'Event date'}</span><strong>${esc(fmtDate(race.date))}</strong><small>${race.time ? `${esc(String(race.time).slice(0, 5))} scheduled start` : 'Start time to be confirmed'}</small>`;
  const facts = [
    race.laps ? `${fmtNumber(race.laps)} laps` : null,
    race.distance ? `${fmtNumber(race.distance)} km` : null,
    formatCircuitLength(race.courseLength),
    race.turns ? `${fmtNumber(race.turns)} turns` : null,
    race.qualifyingFormat ? `Qualifying: ${titleCase(race.qualifyingFormat)}` : null
  ].filter(Boolean);
  document.title = `${race.year} ${name} · Formula 1 · Racelytic`;
  const head = document.getElementById('race-head');
  head.innerHTML = `<div class="detail-hero race-detail-hero" data-status="${status}">
    <div class="race-detail-hero-copy"><div class="race-detail-kicker"><span class="race-status-badge ${status}">${raceStatusLabel(status)}</span><a href="/season?year=${encodeURIComponent(race.year)}">Round ${esc(race.round)} · ${esc(race.year)}</a></div>
      <h1>${esc(name)}</h1>
      <div class="detail-sub"><a href="/circuit?id=${encodeURIComponent(race.circuitId)}">${esc(race.circuitName || 'Circuit')}</a>${race.countryName ? ` · ${esc(race.countryName)}` : ''} · ${esc(fmtDate(race.date))}</div>
      ${showOfficialName ? `<div class="detail-official-name">${esc(race.officialName)}</div>` : ''}
      <div class="race-hero-facts">${facts.map(fact => `<span>${esc(fact)}</span>`).join('')}</div>
    </div>
    <aside class="race-hero-highlight">${highlight}</aside>
  </div>`;
  head.setAttribute('aria-busy', 'false');
}

function renderRoundNavigation(races, race) {
  const sorted = [...races].filter(item => Number(item.year) === Number(race.year)).sort((first, second) => Number(first.round) - Number(second.round));
  const index = sorted.findIndex(item => String(item.id) === String(race.id));
  const previous = index > 0 ? sorted[index - 1] : null;
  const next = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null;
  document.getElementById('race-round-navigation').innerHTML = `${previous ? `<a href="/race?id=${encodeURIComponent(previous.id)}"><span>← Previous</span><strong>R${esc(previous.round)} · ${esc(displayRaceName(previous, true))}</strong></a>` : '<span></span>'}${next ? `<a href="/race?id=${encodeURIComponent(next.id)}"><span>Next →</span><strong>R${esc(next.round)} · ${esc(displayRaceName(next, true))}</strong></a>` : ''}`;
}

async function loadRace() {
  const id = params().get('id');
  if (!id) {
    document.getElementById('race-head').setAttribute('aria-busy', 'false');
    return setError('race-head', 'Choose a race from the archive to view its weekend.');
  }
  try {
    raceData = await getJSON(`/api/races/${encodeURIComponent(id)}`);
    const status = racePageStatus();
    renderRaceHero(status);
    renderRaceOverview(status);
    const available = availableSessionKeys();
    const requested = params().get('session');
    activeSession = available.includes(requested) ? requested : available[0] || null;
    if (activeSession) {
      const requestedVariant = params().get('variant');
      const variants = raceData.sessions[activeSession];
      if (!Array.isArray(variants) && requestedVariant && variants[requestedVariant]?.length) activeVariants[activeSession] = requestedVariant;
      else if (!Array.isArray(variants)) activeVariants[activeSession] = firstAvailableVariant(activeSession);
      document.getElementById('race-session-results').hidden = false;
      renderSessionTabs();
      renderSessionTable();
    }
    getJSON(`/api/races?year=${encodeURIComponent(raceData.race.year)}`)
      .then(races => renderRoundNavigation(races, raceData.race))
      .catch(() => {});
  } catch (error) {
    document.getElementById('race-head').setAttribute('aria-busy', 'false');
    document.getElementById('race-overview').innerHTML = '';
    document.getElementById('race-session-results').hidden = true;
    setError('race-head', error.message);
  }
}

loadRace();
