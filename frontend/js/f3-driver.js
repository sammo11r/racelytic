function f3DriverStat(label, value, highlight = false) {
  return `<div class="detail-stat${highlight ? ' highlight' : ''}"><span>${esc(label)}</span><strong>${fmtNumber(value)}</strong></div>`;
}

function f3ProfileCountry(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || String(code).toUpperCase();
  } catch {
    return String(code).toUpperCase();
  }
}

function f3RaceLabel(result) {
  const name = String(result.sessionName || '').trim();
  if (document.body.classList.contains('academy-mode')) return name || 'Race';
  if (/feature/i.test(name)) return 'Feature race';
  if (/sprint/i.test(name)) return name;
  if (name.toLowerCase() !== 'race') return name || 'Race';
  const sessionNumber = Number(result.sessionNumber || 0);
  const year = Number(result.year);
  if (year <= 2020) return sessionNumber <= 4 ? 'Feature race' : 'Sprint race';
  if (year === 2021) return sessionNumber >= 8 ? 'Feature race' : `Sprint race ${sessionNumber <= 4 ? 1 : 2}`;
  return sessionNumber >= 6 ? 'Feature race' : 'Sprint race';
}

function f3FinishText(result) {
  return Number(result.positionNumber || 0) > 0 ? result.positionNumber : result.status || '—';
}

async function loadF3Driver() {
  const id = params().get('id');
  if (!id) return setError('f3-driver-head', 'No F3 driver selected.');
  try {
    const data = await getJSON(`/api/drivers/${encodeURIComponent(id)}?series=f3`);
    const driver = data.driver;
    const standings = data.standings;
    const firstSeason = standings.length ? standings.at(-1).year : null;
    const lastSeason = standings.length ? standings[0].year : null;
    const latestTeam = standings[0]?.constructorName || '';
    const totals = standings.reduce((summary, season) => ({
      titles: summary.titles + (season.championshipWon ? 1 : 0), starts: summary.starts + Number(season.starts || 0),
      wins: summary.wins + Number(season.wins || 0), podiums: summary.podiums + Number(season.podiums || 0),
      poles: summary.poles + Number(season.poles || 0), fastestLaps: summary.fastestLaps + Number(season.fastestLaps || 0),
      points: summary.points + Number(season.points || 0)
    }), { titles: 0, starts: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, points: 0 });

    document.title = `${driver.name} · Formula 3 · Racelytic`;
    document.getElementById('f3-driver-head').innerHTML = `<section class="detail-hero profile-hero"><div class="profile-hero-copy"><div class="eyebrow">FORMULA 3 DRIVER</div><h1>${esc(driver.name)}</h1><div class="detail-sub">${esc(f3ProfileCountry(driver.countryCode))}${latestTeam ? ` · ${esc(latestTeam)}` : ''}</div><div class="profile-meta">${firstSeason ? `<span>F3 career ${esc(firstSeason)}–${esc(lastSeason)}</span>` : ''}${standings.length ? `<span>${fmtNumber(standings.length)} championship season${standings.length === 1 ? '' : 's'}</span>` : ''}${totals.titles ? `<span>${fmtNumber(totals.titles)} F3 title${totals.titles === 1 ? '' : 's'}</span>` : ''}</div></div>${driver.latestNumber ? `<div class="profile-number" aria-label="Latest Formula 3 number ${esc(driver.latestNumber)}">${esc(driver.latestNumber)}</div>` : ''}</section>`;
    document.getElementById('f3-driver-stats').innerHTML = [f3DriverStat('F3 titles', totals.titles, totals.titles > 0), f3DriverStat('Race starts', totals.starts), f3DriverStat('Race wins', totals.wins, totals.wins > 0), f3DriverStat('Podiums', totals.podiums), f3DriverStat('Pole positions', totals.poles), f3DriverStat('Career points', totals.points)].join('');
    document.getElementById('f3-driver-career-span').textContent = firstSeason ? `${firstSeason}–${lastSeason} · ${standings.length} season${standings.length === 1 ? '' : 's'}` : '';
    const timeline = [...standings].reverse();
    document.getElementById('f3-driver-seasons').innerHTML = timeline.length ? `<div class="career-timeline" role="list" aria-label="Formula 3 career by season">${timeline.map((season, index) => `<a role="listitem" class="career-timeline-item f2-career-item${season.championshipWon ? ' champion' : ''}" href="/f3/season?year=${encodeURIComponent(season.year)}"><div class="timeline-marker"><i></i></div><span class="timeline-year">${esc(season.year)}</span><strong>${season.championshipWon ? 'F3 champion' : `Championship P${esc(season.positionNumber || '—')}`}</strong><small>${fmtNumber(season.points)} points</small><div class="timeline-context">${esc(season.constructorName || 'Team not recorded')}</div><div class="f2-season-record"><span>${fmtNumber(season.wins)} wins</span><span>${fmtNumber(season.podiums)} podiums</span><span>${fmtNumber(season.poles)} poles</span></div>${index === 0 ? '<em>F3 debut season</em>' : index === timeline.length - 1 ? '<em>Latest F3 season</em>' : ''}</a>`).join('')}</div>` : '<div class="empty-state">No championship history available.</div>';

    let resultPage = 1;
    const renderResults = () => {
      const paged = pageItems(data.results, resultPage, 30);
      resultPage = paged.page;
      document.getElementById('f3-driver-results').innerHTML = data.results.length ? `<table><thead><tr><th>Season</th><th>Event</th><th>Race</th><th>Team</th><th>Finish</th><th>Points</th></tr></thead><tbody>${paged.items.map(result => `<tr><td><a href="/f3/season?year=${encodeURIComponent(result.year)}">${esc(result.year)}</a></td><td><a href="/f3/race?id=${encodeURIComponent(result.raceId)}"><strong>${esc(result.raceName)}</strong></a><small>Round ${esc(result.round)} · ${esc(fmtDate(result.date))}</small></td><td>${esc(f3RaceLabel(result))}</td><td>${esc(result.constructorName || '—')}</td><td><span class="finish-position${Number(result.positionNumber) <= 3 && Number(result.positionNumber) > 0 ? ' podium' : ''}">${esc(f3FinishText(result))}</span></td><td class="result-points-total">${fmtNumber(result.points)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">No race results available.</div>';
      renderPagination('f3-driver-results', data.results.length, resultPage, 30, page => { resultPage = page; renderResults(); document.getElementById('f3-driver-results').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    renderResults();
  } catch (error) {
    setError('f3-driver-head', error.message);
  }
}

loadF3Driver();
