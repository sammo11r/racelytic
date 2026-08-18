function f2CircuitStat(label, value, suffix = '') {
  const display = value === null || value === undefined || value === '' ? '—' : `${fmtNumber(value)}${suffix}`;
  return `<div class="detail-stat"><span>${esc(label)}</span><strong>${esc(display)}</strong></div>`;
}

function f2CircuitRaceSummary(race) {
  const raceSessions = race.sessions.filter(session => session.isRace || (session.cancelled && /race/i.test(session.name)));
  if (!raceSessions.length) return '<small>No race sessions recorded</small>';
  return raceSessions.map(session => {
    if (session.cancelled) return `<small><strong>${esc(session.name)}:</strong> Cancelled</small>`;
    if (!session.winnerName) return `<small><strong>${esc(session.name)}:</strong> No result</small>`;
    return `<small><strong>${esc(session.name)}:</strong> <a href="/f2/driver?id=${encodeURIComponent(session.winnerDriverId)}">${esc(session.winnerName)}</a>${session.winnerConstructorName ? ` · ${esc(session.winnerConstructorName)}` : ''}</small>`;
  }).join('');
}

async function loadF2Circuit() {
  const id = params().get('id');
  if (!id) return setError('f2-circuit-head', 'No Formula 2 circuit selected.');
  try {
    const data = await getJSON(`/api/circuits/${encodeURIComponent(id)}?series=f2`);
    const circuit = data.circuit;
    const imageId = f2CircuitImageId(circuit.id);
    document.title = `${circuit.name} · Formula 2 · Racelytic`;
    document.getElementById('f2-circuit-head').innerHTML = `
      <section class="detail-hero profile-hero circuit-hero">
        <div class="profile-hero-copy">
          <div class="eyebrow">FORMULA 2 CIRCUIT</div>
          <h1>${esc(circuit.name)}</h1>
          <div class="detail-sub">${esc(circuit.placeName || 'Location not recorded')}</div>
          <div class="profile-meta">${circuit.type ? `<span>${esc(circuit.type)}</span>` : ''}${circuit.direction ? `<span>${esc(circuit.direction)}</span>` : ''}</div>
        </div>
        ${imageId ? `<div class="circuit-hero-visual"><img class="circuit-hero-map" src="/assets/circuits/${encodeURIComponent(imageId)}.svg" alt="Track map of ${esc(circuit.name)}"></div>` : ''}
      </section>`;
    document.getElementById('f2-circuit-stats').innerHTML = [
      f2CircuitStat('Length', circuit.lengthMeters ? Number(circuit.lengthMeters) / 1000 : null, ' km'),
      f2CircuitStat('Turns', circuit.turns),
      f2CircuitStat('F2 weekends', circuit.totalRacesHeld),
      f2CircuitStat('First season', circuit.firstYear),
      f2CircuitStat('Latest season', circuit.lastYear)
    ].join('');
    document.getElementById('f2-circuit-years').textContent = circuit.firstYear
      ? `${circuit.firstYear}${circuit.lastYear !== circuit.firstYear ? `–${circuit.lastYear}` : ''} · ${fmtNumber(data.races.length)} weekends`
      : '';
    let racePage = 1;
    const renderRaces = () => {
      const paged = pageItems(data.races, racePage, 20);
      racePage = paged.page;
      document.getElementById('f2-circuit-races').innerHTML = paged.items.length ? paged.items.map(race => `
        <article class="circuit-race-card">
          <div class="circuit-race-year">${esc(race.year)}</div>
          <div class="circuit-race-copy">
            <a href="/f2/race?id=${encodeURIComponent(race.id)}"><strong>${esc(race.name)}</strong></a>
            <span>Round ${esc(race.round)} · ${esc(fmtDate(race.date))}</span>
            ${f2CircuitRaceSummary(race)}
          </div>
          <a class="text-link" href="/f2/season?year=${encodeURIComponent(race.year)}">Season <span aria-hidden="true">→</span></a>
        </article>`).join('') : '<div class="empty-state">No Formula 2 weekends found for this circuit.</div>';
      renderPagination('f2-circuit-races', data.races.length, racePage, 20, page => {
        racePage = page;
        renderRaces();
        document.getElementById('f2-circuit-races').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    renderRaces();
  } catch (error) {
    setError('f2-circuit-head', error.message);
  }
}

loadF2Circuit();
