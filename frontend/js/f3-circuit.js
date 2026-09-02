function f3CircuitStat(label, value, suffix = '', formatNumber = true) {
  const formatted = formatNumber ? fmtNumber(value) : String(value);
  const display = value === null || value === undefined || value === '' ? '—' : `${formatted}${suffix}`;
  return `<div class="detail-stat"><span>${esc(label)}</span><strong>${esc(display)}</strong></div>`;
}

function f3CircuitSessionName(session, race) {
  const name = String(session.name || 'Session');
  if (name.toLowerCase() !== 'race') return name;
  const raceSessions = race.sessions.filter(item => item.isRace || (item.cancelled && /race/i.test(item.name)));
  const index = raceSessions.findIndex(item => item.id === session.id);
  if (document.body.classList.contains('academy-mode')) return `Race ${index + 1}`;
  const year = Number(race.year);
  if (year === 2021 && index < raceSessions.length - 1) return `Sprint Race ${index + 1}`;
  if (year <= 2020) return index === 0 ? 'Feature Race' : 'Sprint Race';
  return index === raceSessions.length - 1 ? 'Feature Race' : 'Sprint Race';
}

function f3CircuitRaceSummary(race) {
  const raceSessions = race.sessions.filter(session => session.isRace || (session.cancelled && /race/i.test(session.name)));
  if (!raceSessions.length) return '<small>No race sessions recorded</small>';
  return raceSessions.map(session => {
    const name = f3CircuitSessionName(session, race);
    if (session.cancelled) return `<small><strong>${esc(name)}:</strong> Cancelled</small>`;
    if (!session.winnerName) return `<small><strong>${esc(name)}:</strong> No result</small>`;
    return `<small><strong>${esc(name)}:</strong> <a href="/f3/driver?id=${encodeURIComponent(session.winnerDriverId)}">${esc(session.winnerName)}</a>${session.winnerConstructorName ? ` · ${esc(session.winnerConstructorName)}` : ''}</small>`;
  }).join('');
}

async function loadF3Circuit() {
  const returnPath = params().get('return');
  if (returnPath === '/f3/circuits' || returnPath?.startsWith('/f3/circuits?')) document.getElementById('circuit-back-link').href = returnPath;
  const id = params().get('id');
  if (!id) return setError('f3-circuit-head', 'No Formula 3 circuit selected.');
  try {
    const data = await getJSON(`/api/circuits/${encodeURIComponent(id)}?series=f3`);
    const circuit = data.circuit;
    const imageId = f2CircuitImageId(circuit.id);
    document.title = `${circuit.name} · Formula 3 · Racelytic`;
    document.getElementById('f3-circuit-head').innerHTML = `<section class="detail-hero profile-hero circuit-hero"><div class="profile-hero-copy"><div class="eyebrow">FORMULA 3 CIRCUIT</div><h1>${esc(circuit.name)}</h1><div class="detail-sub">${esc(circuit.placeName || 'Location not recorded')}</div><div class="profile-meta">${circuit.type ? `<span>${esc(circuit.type)}</span>` : ''}${circuit.direction ? `<span>${esc(circuit.direction)}</span>` : ''}</div></div>${imageId ? `<div class="circuit-hero-visual"><img class="circuit-hero-map" src="/assets/circuits/${encodeURIComponent(imageId)}.svg" alt="Track map of ${esc(circuit.name)}"></div>` : ''}</section>`;
    document.getElementById('f3-circuit-stats').innerHTML = [f3CircuitStat('Length', circuit.lengthMeters ? Number(circuit.lengthMeters) / 1000 : null, ' km'), f3CircuitStat('Turns', circuit.turns), f3CircuitStat('F3 weekends', circuit.totalRacesHeld), f3CircuitStat('First season', circuit.firstYear, '', false), f3CircuitStat('Latest season', circuit.lastYear, '', false)].join('');
    document.getElementById('f3-circuit-years').textContent = circuit.firstYear ? `${circuit.firstYear}${circuit.lastYear !== circuit.firstYear ? `–${circuit.lastYear}` : ''} · ${fmtNumber(data.races.length)} weekends` : '';
    let racePage = 1;
    const renderRaces = () => {
      const paged = pageItems(data.races, racePage, 20);
      racePage = paged.page;
      document.getElementById('f3-circuit-races').innerHTML = paged.items.length ? paged.items.map(race => `<article class="circuit-race-card"><div class="circuit-race-year">${esc(race.year)}</div><div class="circuit-race-copy"><a href="/f3/race?id=${encodeURIComponent(race.id)}"><strong>${esc(race.name)}</strong></a><span>Round ${esc(race.round)} · ${esc(fmtDate(race.date))}</span>${f3CircuitRaceSummary(race)}</div><a class="text-link" href="/f3/season?year=${encodeURIComponent(race.year)}">Season <span aria-hidden="true">→</span></a></article>`).join('') : '<div class="empty-state">No Formula 3 weekends found for this circuit.</div>';
      renderPagination('f3-circuit-races', data.races.length, racePage, 20, page => { racePage = page; renderRaces(); document.getElementById('f3-circuit-races').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    renderRaces();
  } catch (error) {
    setError('f3-circuit-head', error.message);
  }
}

loadF3Circuit();
