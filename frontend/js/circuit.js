function circuitStat(label, value, suffix = '', formatNumber = true) {
  const display = value === null || value === undefined || value === ''
    ? '—'
    : `${formatNumber ? fmtNumber(value) : value}${suffix}`;
  return `<div class="detail-stat"><span>${esc(label)}</span><strong>${esc(display)}</strong></div>`;
}

function titleCase(value) {
  return String(value || '').toLowerCase().replace(/(^|[_\s-])\w/g, match => match.toUpperCase()).replaceAll('_', ' ');
}

async function loadCircuit() {
  const id = params().get('id');
  if (!id) return setError('circuit-head', 'No circuit selected.');

  try {
    const data = await getJSON(`/api/circuits/${encodeURIComponent(id)}`);
    const c = data.circuit;
    const years = data.races.map(race => Number(race.year)).filter(Number.isFinite);
    const firstYear = years.length ? Math.min(...years) : null;
    const lastYear = years.length ? Math.max(...years) : null;

    document.title = 'Racelytics';
    document.getElementById('circuit-head').innerHTML = `
      <section class="detail-hero profile-hero circuit-hero">
        <div class="profile-hero-copy">
          <div class="eyebrow">CIRCUIT</div>
          <h1>${esc(c.name)}</h1>
          <div class="detail-sub">${esc(c.fullName || '')}${c.countryName ? ` · ${esc(c.countryName)}` : ''}</div>
          <div class="profile-meta">
            ${c.placeName ? `<span>${esc(c.placeName)}</span>` : ''}
            ${c.type ? `<span>${esc(titleCase(c.type))} circuit</span>` : ''}
            ${c.direction ? `<span>${esc(titleCase(c.direction))}</span>` : ''}
          </div>
        </div>
        <div class="circuit-hero-visual">
          ${c.layoutId ? `<img class="circuit-hero-map" src="/assets/circuits/${encodeURIComponent(c.layoutId)}.svg" alt="Track map of ${esc(c.name)}">` : ''}
          <div class="circuit-coordinate" aria-label="Circuit coordinates"><span>${Number(c.latitude).toFixed(3)}°</span><span>${Number(c.longitude).toFixed(3)}°</span></div>
        </div>
      </section>`;

    document.getElementById('circuit-stats').innerHTML = [
      circuitStat('Length', c.length, ' km'),
      circuitStat('Turns', c.turns),
      circuitStat('Races held', c.totalRacesHeld),
      circuitStat('First race', firstYear, '', false),
      circuitStat('Latest race', lastYear, '', false)
    ].join('');

    document.getElementById('circuit-years').textContent = firstYear
      ? `${firstYear}–${lastYear} · ${data.races.length} races`
      : '';
    let racePage = 1;
    const renderCircuitRaces = () => {
      const paged = pageItems(data.races, racePage, 20);
      racePage = paged.page;
      document.getElementById('circuit-races').innerHTML = data.races.length
      ? paged.items.map(r => `
        <article class="circuit-race-card">
          <div class="circuit-race-year">${esc(r.year)}</div>
          <div class="circuit-race-copy">
            <a href="/race.html?id=${encodeURIComponent(r.id)}"><strong>${esc(r.officialName)}</strong></a>
            <span>Round ${esc(r.round)} · ${esc(fmtDate(r.date))}${r.laps ? ` · ${fmtNumber(r.laps)} laps` : ''}</span>
            ${r.winnerName ? `<small>Won by <a href="/driver.html?id=${encodeURIComponent(r.winnerDriverId)}">${esc(r.winnerName)}</a>${r.winnerConstructorName ? ` for <a href="/constructor.html?id=${encodeURIComponent(r.winnerConstructorId)}">${esc(r.winnerConstructorName)}</a>` : ''}</small>` : ''}
          </div>
          <a class="text-link" href="/season.html?year=${encodeURIComponent(r.year)}">Season <span aria-hidden="true">→</span></a>
        </article>`).join('')
      : '<div class="empty-state">No races found for this circuit.</div>';
      renderPagination('circuit-races', data.races.length, racePage, 20, page => { racePage = page; renderCircuitRaces(); document.getElementById('circuit-races').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    renderCircuitRaces();
  } catch (error) {
    setError('circuit-head', error.message);
  }
}

loadCircuit();
