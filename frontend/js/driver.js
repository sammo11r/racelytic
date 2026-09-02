const driverDetail = window.DRIVER_DETAIL || {
  series: 'f1', name: 'Formula 1', shortName: 'F1', root: '',
  titleLabel: 'World titles', championLabel: 'World champion', winnerLabel: 'Grand Prix winner'
};
const juniorDriverDetail = driverDetail.series !== 'f1';
const driverSeriesQuery = juniorDriverDetail ? `&series=${encodeURIComponent(driverDetail.series)}` : '';
let driverResultRows = [];
let driverResultSearch = '';
let driverResultSeason = '';
let driverResultOutcome = 'all';
let driverResultPage = 1;

function detailStat(label, value, highlight = false, note = '') {
  return `<div class="detail-stat${highlight ? ' highlight' : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
}

function driverIsTrue(value) {
  return value === true || Number(value) === 1 || String(value).toLowerCase() === 'true';
}

function driverSeasonTeams(standing) {
  return String(standing.teams || '').split('||').filter(Boolean);
}

function normalizeDriverProfile(data) {
  if (!juniorDriverDetail) return data;
  const standings = data.standings.map(season => ({
    ...season, teams: season.teams || String(season.constructorName || '').split(' / ').join('||'),
    totalRaceStarts: season.starts, totalRaceWins: season.wins, totalPodiums: season.podiums,
    totalPolePositions: season.poles, totalFastestLaps: season.fastestLaps
  }));
  let nationalityCountryName = data.driver.countryCode || '';
  try { nationalityCountryName = nationalityCountryName ? new Intl.DisplayNames(['en'], { type: 'region' }).of(nationalityCountryName.toUpperCase()) : ''; } catch { /* Preserve unknown source codes. */ }
  const driver = { ...data.driver, nationalityCountryName, permanentNumber: data.driver.latestNumber };
  for (const field of ['totalRaceStarts', 'totalRaceWins', 'totalPodiums', 'totalPolePositions', 'totalFastestLaps']) {
    driver[field] = standings.reduce((total, season) => total + Number(season[field] || 0), 0);
  }
  driver.totalPoints = standings.reduce((total, season) => total + Number(season.points || 0), 0);
  driver.totalChampionshipWins = standings.filter(season => driverIsTrue(season.championshipWon)).length;
  return { ...data, driver, standings };
}

function renderDriverProfile(data) {
  const driver = data.driver;
  const standings = data.standings;
  const firstSeason = standings.length ? Number(standings.at(-1).year) : null;
  const lastSeason = standings.length ? Number(standings[0].year) : null;
  const latestTeams = driver.latestConstructorName ? [driver.latestConstructorName] : standings.length ? driverSeasonTeams(standings[0]) : [];
  const active = Number(lastSeason) === Number(driver.currentSeason);
  const starts = Number(driver.totalRaceStarts || 0);
  const wins = Number(driver.totalRaceWins || 0);
  const winRate = starts ? `${(wins / starts * 100).toFixed(1)}%` : '—';
  const titles = Number(driver.totalChampionshipWins || 0);

  document.title = `${driver.name} · ${driverDetail.name} · Racelytic`;
  const head = document.getElementById('driver-head');
  head.setAttribute('aria-busy', 'false');
  head.innerHTML = `<section class="detail-hero profile-hero driver-profile-hero">
    <div class="profile-hero-copy">
      <h1>${esc(driver.name)}</h1>
      <div class="detail-sub">${juniorDriverDetail ? esc(driver.nationalityCountryName) : `${esc(driver.fullName || driver.name)}${driver.nationalityCountryName ? ` · ${esc(driver.nationalityCountryName)}` : ''}`}</div>
      <div class="driver-profile-badges">${titles ? `<strong>${titles > 1 ? `${fmtNumber(titles)}× ` : ''}${esc(driverDetail.championLabel)}</strong>` : wins ? `<strong>${esc(driverDetail.winnerLabel)}</strong>` : ''}</div>
      <div class="profile-meta">
        ${driver.dateOfBirth ? `<span>Born ${esc(fmtDate(driver.dateOfBirth))}</span>` : ''}
        ${driver.placeOfBirth ? `<span>${esc(driver.placeOfBirth)}</span>` : ''}
        ${driver.dateOfDeath ? `<span>Died ${esc(fmtDate(driver.dateOfDeath))}</span>` : ''}
        ${firstSeason ? `<span>${esc(driverDetail.shortName)} career ${firstSeason}–${lastSeason}</span>` : ''}
        ${latestTeams.length ? `<span>${active ? 'Current' : 'Latest'} constructor ${esc(latestTeams.join(' · '))}</span>` : ''}
      </div>
    </div>
    ${driver.permanentNumber ? `<div class="profile-number" aria-label="${juniorDriverDetail ? 'Latest number' : 'Permanent number'} ${esc(driver.permanentNumber)}">${esc(driver.permanentNumber)}</div>` : ''}
  </section>`;

  const stats = document.getElementById('driver-stats');
  stats.setAttribute('aria-busy', 'false');
  stats.innerHTML = [
    detailStat(driverDetail.titleLabel, fmtNumber(titles), titles > 0),
    detailStat('Race wins', fmtNumber(wins), wins > 0),
    detailStat('Podiums', fmtNumber(driver.totalPodiums || 0)),
    detailStat('Pole positions', fmtNumber(driver.totalPolePositions || 0)),
    detailStat('Race starts', fmtNumber(starts)),
    detailStat('Fastest laps', fmtNumber(driver.totalFastestLaps || 0)),
    detailStat('Career points', fmtNumber(driver.totalPoints || 0)),
    detailStat('Win rate', winRate, wins > 0, starts ? `${fmtNumber(wins)} from ${fmtNumber(starts)} starts` : '')
  ].join('');

  document.getElementById('driver-career-span').textContent = firstSeason ? `${firstSeason}–${lastSeason} · ${standings.length} season${standings.length === 1 ? '' : 's'}` : '';
  const timeline = document.getElementById('driver-seasons');
  const ordered = [...standings].reverse();
  timeline.setAttribute('aria-busy', 'false');
  timeline.innerHTML = ordered.length ? `<div class="career-timeline driver-career-timeline" role="list" aria-label="Career by season">${ordered.map((season, index) => {
    const teams = driverSeasonTeams(season);
    const champion = driverIsTrue(season.championshipWon);
    const current = Number(season.year) === Number(driver.currentSeason);
    return `<a role="listitem" class="career-timeline-item driver-season-item${champion ? ' champion' : ''}${current ? ' current' : ''}" href="${driverDetail.root}/season?year=${encodeURIComponent(season.year)}">
      <div class="timeline-marker"><i></i></div><span class="timeline-year">${esc(season.year)}</span>
      <strong>${champion ? esc(driverDetail.championLabel) : Number(season.positionNumber) > 0 ? `Championship P${esc(season.positionNumber)}` : 'Not classified'}</strong><small>${fmtNumber(season.points)} points</small>
      <div class="timeline-context">${teams.length ? esc(teams.join(' · ')) : 'Constructor unavailable'}</div>
      <div class="driver-season-record"><span>${fmtNumber(season.totalRaceStarts || 0)} starts</span><span>${fmtNumber(season.totalRaceWins || 0)} wins</span><span>${fmtNumber(season.totalPodiums || 0)} podiums</span><span>${fmtNumber(season.totalPolePositions || 0)} poles</span></div>
      ${current ? '<em>Current season</em>' : index === 0 ? `<em>${esc(driverDetail.shortName)} debut season</em>` : index === ordered.length - 1 ? '<em>Final recorded season</em>' : ''}
    </a>`;
  }).join('')}</div>` : '<div class="empty-state">No championship history available.</div>';
  bindDriverTimeline();
}

function bindDriverTimeline() {
  const timeline = document.querySelector('.driver-career-timeline');
  const previous = document.getElementById('driver-timeline-previous');
  const next = document.getElementById('driver-timeline-next');
  if (!timeline) return;
  const update = () => {
    previous.disabled = timeline.scrollLeft <= 2;
    next.disabled = timeline.scrollLeft + timeline.clientWidth >= timeline.scrollWidth - 2;
  };
  previous.addEventListener('click', () => timeline.scrollBy({ left: -Math.max(220, timeline.clientWidth * .8), behavior: 'smooth' }));
  next.addEventListener('click', () => timeline.scrollBy({ left: Math.max(220, timeline.clientWidth * .8), behavior: 'smooth' }));
  timeline.addEventListener('scroll', update, { passive: true });
  update();
}

function driverResultIsRetirement(result) {
  const reason = String(result.reasonRetired || '').trim();
  if (juniorDriverDetail) return /\b(?:DNF|RET|RETIRED|RETIREMENT)\b/i.test(reason);
  return Boolean(reason) && !/^(finished|classified|running)$/i.test(reason);
}

function driverResultMovement(result) {
  if (Number(result.positionNumber) >= 999 || Number(result.gridPositionNumber) >= 999) return null;
  return result.positionsGained === null || result.positionsGained === undefined ? null : Number(result.positionsGained);
}

function driverResultGrid(result) {
  if (result.gridPositionText === 'PL') return 'Pit lane';
  const grid = Number(result.gridPositionNumber);
  if (Number.isInteger(grid) && grid > 0 && grid < 999) return String(grid);
  if (result.gridPositionText && !(Number(result.gridPositionText) >= 999)) return result.gridPositionText;
  return /^(DNS|DNQ|DNPQ)$/.test(String(result.positionText || '')) ? result.positionText : '—';
}

function driverResultGridMarkup(result) {
  const label = driverResultGrid(result);
  return result.gridSource === 'derived' && label !== '—'
    ? `<span title="${esc(result.gridNote || 'Derived from available classifications')}">${esc(label)}</span>`
    : esc(label);
}

function driverResultMovementText(movement) {
  return movement === null ? '—' : `${movement > 0 ? '+' : ''}${movement}`;
}

function driverResultFinish(result) {
  if (Number(result.positionNumber) >= 999 || Number(result.positionText) >= 999) {
    const status = result.reasonRetired || result.status || result.positionText;
    if (/^(DNF|RET|RETIRED|DNS|DNQ|DNPQ|DSQ|DQ|DISQ|EXC|NC)$/i.test(String(status || ''))) return status;
    return Number(result.positionNumber || result.positionText) === 999 ? 'DNF' : 'NC';
  }
  return result.positionText || result.positionNumber || (driverResultIsRetirement(result) ? 'RET' : '—');
}

function driverResultAwards(result) {
  return [driverIsTrue(result.fastestLap) ? '<span>Fastest lap</span>' : '', driverIsTrue(result.polePosition) ? '<span>Pole</span>' : '', driverIsTrue(result.driverOfTheDay) ? '<span>Driver of the day</span>' : ''].join('');
}

function filteredDriverResults() {
  return driverResultRows.filter(result => {
    const haystack = [displayRaceName(result), result.sessionLabel, result.circuitName, result.constructorName, result.year].filter(Boolean).join(' ').toLowerCase();
    if (driverResultSearch && !haystack.includes(driverResultSearch)) return false;
    if (driverResultSeason && String(result.year) !== driverResultSeason) return false;
    const finish = Number(result.positionNumber || 0);
    if (driverResultOutcome === 'wins' && finish !== 1) return false;
    if (driverResultOutcome === 'podiums' && !(finish >= 1 && finish <= 3)) return false;
    if (driverResultOutcome === 'points' && Number(result.points || 0) <= 0) return false;
    if (driverResultOutcome === 'retirements' && !driverResultIsRetirement(result)) return false;
    return true;
  });
}

function renderDriverResults() {
  const visible = filteredDriverResults();
  const paged = pageItems(visible, driverResultPage, 25);
  driverResultPage = paged.page;
  const results = document.getElementById('driver-results');
  results.setAttribute('aria-busy', 'false');
  document.getElementById('driver-result-count').textContent = `${fmtNumber(visible.length)} race${visible.length === 1 ? '' : 's'} shown`;
  if (!visible.length) {
    results.innerHTML = '<div class="empty-state">No race results match these filters.</div>';
  } else {
    const rows = paged.items.map(result => {
      const finish = Number(result.positionNumber || 0);
      const movement = driverResultMovement(result);
      return `<tr><td><a href="${driverDetail.root}/season?year=${encodeURIComponent(result.year)}">${esc(result.year)}</a></td>
        <td><a href="${driverDetail.root}/race?id=${encodeURIComponent(result.raceId)}">${esc(displayRaceName(result))}</a><small>${esc(fmtDate(result.date))}${result.sessionLabel ? ` · ${esc(result.sessionLabel)}` : ''}${result.circuitName ? ` · ${esc(result.circuitName)}` : ''}</small><div class="driver-result-awards">${driverResultAwards(result)}</div></td>
        <td>${result.constructorName ? `<a href="${driverDetail.root}/constructor?id=${encodeURIComponent(result.constructorId)}">${esc(result.constructorName)}</a>` : '—'}</td>
        <td>${driverResultGridMarkup(result)}</td><td><span class="finish-position${finish > 0 && finish <= 3 ? ' podium' : ''}${driverResultIsRetirement(result) ? ' retired' : ''}">${esc(driverResultFinish(result))}</span>${driverResultIsRetirement(result) ? `<small>${esc(result.reasonRetired)}</small>` : ''}</td>
        <td class="driver-result-movement ${movement > 0 ? 'gain' : movement < 0 ? 'loss' : ''}">${esc(driverResultMovementText(movement))}</td><td class="result-points-total">${fmtNumber(result.points)}</td></tr>`;
    }).join('');
    const cards = paged.items.map(result => {
      const finish = Number(result.positionNumber || 0), movement = driverResultMovement(result);
      return `<article class="driver-result-card"><div><span>${esc(result.year)} · Round ${esc(result.round)}${result.sessionLabel ? ` · ${esc(result.sessionLabel)}` : ''}</span><strong><a href="${driverDetail.root}/race?id=${encodeURIComponent(result.raceId)}">${esc(displayRaceName(result))}</a></strong><small>${esc(fmtDate(result.date))}${result.constructorName ? ` · ${esc(result.constructorName)}` : ''}</small></div><b class="finish-position${finish > 0 && finish <= 3 ? ' podium' : ''}${driverResultIsRetirement(result) ? ' retired' : ''}">${esc(driverResultFinish(result))}</b><div class="driver-result-card-meta"><span>Grid ${driverResultGridMarkup(result)}</span><span>${esc(driverResultMovementText(movement))} positions</span><span>${fmtNumber(result.points)} pts</span>${driverResultIsRetirement(result) ? `<span>${esc(result.reasonRetired)}</span>` : ''}</div><div class="driver-result-awards">${driverResultAwards(result)}</div></article>`;
    }).join('');
    results.innerHTML = `<table><caption>${esc(driverDetail.name)} race results</caption><thead><tr><th>Season</th><th>Race</th><th>Constructor</th><th>Grid</th><th>Finish</th><th>Change</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table><div class="driver-result-cards">${cards}</div>`;
  }
  renderPagination('driver-results', visible.length, driverResultPage, 25, page => { driverResultPage = page; renderDriverResults(); results.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

function populateDriverResultFilters() {
  const seasons = [...new Set(driverResultRows.map(result => Number(result.year)).filter(Boolean))].sort((a, b) => b - a);
  document.getElementById('driver-result-season').innerHTML = '<option value="">All seasons</option>' + seasons.map(year => `<option value="${year}">${year}</option>`).join('');
}

function bindDriverResultFilters() {
  document.getElementById('driver-result-search').addEventListener('input', event => { driverResultSearch = event.target.value.toLowerCase().trim(); driverResultPage = 1; renderDriverResults(); });
  document.getElementById('driver-result-season').addEventListener('change', event => { driverResultSeason = event.target.value; driverResultPage = 1; renderDriverResults(); });
  document.getElementById('driver-result-outcome').addEventListener('change', event => { driverResultOutcome = event.target.value; driverResultPage = 1; renderDriverResults(); });
  document.getElementById('driver-result-clear').addEventListener('click', () => {
    driverResultSearch = ''; driverResultSeason = ''; driverResultOutcome = 'all'; driverResultPage = 1;
    document.getElementById('driver-result-search').value = ''; document.getElementById('driver-result-season').value = ''; document.getElementById('driver-result-outcome').value = 'all'; renderDriverResults();
  });
}

async function loadDriverResults(id) {
  try {
    driverResultRows = await getJSON(`/api/drivers/${encodeURIComponent(id)}/results${juniorDriverDetail ? `?series=${encodeURIComponent(driverDetail.series)}` : ''}`);
    populateDriverResultFilters(); renderDriverResults();
  } catch (error) {
    document.getElementById('driver-results').setAttribute('aria-busy', 'false');
    document.getElementById('driver-result-count').textContent = 'Race history unavailable';
    setError('driver-results', error.message);
  }
}

async function loadDriver() {
  const id = params().get('id');
  const returnPath = params().get('return');
  const archivePath = `${driverDetail.root}/drivers`;
  if (returnPath && (returnPath === archivePath || returnPath.startsWith(`${archivePath}?`))) document.getElementById('driver-back-link').href = returnPath;
  if (!id) return showDriverError('No driver selected.');
  bindDriverResultFilters();
  try {
    const data = await getJSON(`/api/drivers/${encodeURIComponent(id)}?summary=1${driverSeriesQuery}`);
    renderDriverProfile(normalizeDriverProfile(data));
    loadDriverResults(id);
  } catch (error) {
    showDriverError(error.message);
  }
}

function showDriverError(message) {
  ['driver-head', 'driver-stats', 'driver-seasons', 'driver-results'].forEach(target => {
    document.getElementById(target).setAttribute('aria-busy', 'false');
    setError(target, target === 'driver-head' ? message : 'Driver information unavailable.');
  });
  document.getElementById('driver-result-count').textContent = 'Race history unavailable';
}

loadDriver();
