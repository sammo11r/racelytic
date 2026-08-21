function f3TeamStat(label, value, highlight = false) {
  return `<div class="detail-stat${highlight ? ' highlight' : ''}"><span>${esc(label)}</span><strong>${fmtNumber(value)}</strong></div>`;
}

function f3TeamCountry(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || String(code).toUpperCase();
  } catch {
    return String(code).toUpperCase();
  }
}

async function loadF3Team() {
  const id = params().get('id');
  if (!id) return setError('f3-team-head', 'No Formula 3 team selected.');
  try {
    const data = await getJSON(`/api/constructors/${encodeURIComponent(id)}?series=f3`);
    const team = data.constructor;
    const titles = data.standings.filter(season => season.championshipWon).length;
    const firstSeason = data.standings.length ? data.standings.at(-1).year : team.firstYear;
    const lastSeason = data.standings.length ? data.standings[0].year : team.lastYear;
    document.title = `${team.name} · Formula 3 · Racelytic`;
    document.getElementById('f3-team-head').innerHTML = `<section class="detail-hero profile-hero"><div class="profile-hero-copy"><div class="eyebrow">FORMULA 3 TEAM</div><h1>${esc(team.name)}</h1><div class="detail-sub">${esc(team.abbreviation || '')}</div><div class="profile-meta">${firstSeason ? `<span>Active in F3 ${esc(firstSeason)}${lastSeason !== firstSeason ? `–${esc(lastSeason)}` : ''}</span>` : ''}${team.countryCode ? `<span>${esc(f3TeamCountry(team.countryCode))}</span>` : ''}</div></div><div class="profile-monogram" aria-hidden="true">${esc((team.abbreviation || team.name).slice(0, 4).toUpperCase())}</div></section>`;
    document.getElementById('f3-team-stats').innerHTML = [f3TeamStat('Team titles', titles, titles > 0), f3TeamStat('Race wins', team.totalRaceWins, Number(team.totalRaceWins) > 0), f3TeamStat('Podiums', team.totalPodiums), f3TeamStat('Race points', team.totalRacePoints), f3TeamStat('Drivers', data.drivers.length), f3TeamStat('Seasons', data.standings.length)].join('');
    document.getElementById('f3-team-career-span').textContent = firstSeason ? `${firstSeason}${lastSeason !== firstSeason ? `–${lastSeason}` : ''} · ${data.standings.length} season${data.standings.length === 1 ? '' : 's'}` : '';
    document.getElementById('f3-team-seasons').innerHTML = data.standings.length ? `<div class="career-timeline constructor-career-timeline" role="list">${[...data.standings].reverse().map(season => { const drivers = String(season.drivers || '').split('||').filter(Boolean); const chassis = String(season.chassis || '').split('||').filter(Boolean); return `<a role="listitem" class="career-timeline-item${season.championshipWon ? ' champion' : ''}" href="/f3/season?year=${encodeURIComponent(season.year)}"><div class="timeline-marker"><i></i></div><span class="timeline-year">${esc(season.year)}</span><strong>${season.championshipWon ? 'Teams’ champion' : `Championship P${esc(season.positionNumber || '—')}`}</strong><small>${fmtNumber(season.points)} points</small><div class="timeline-context">${esc(chassis.join(' · ') || 'Chassis unavailable')}</div><div class="timeline-people">${esc(drivers.join(', ') || 'Drivers unavailable')}</div></a>`; }).join('')}</div>` : '<div class="empty-state">No championship history available.</div>';
    document.getElementById('f3-team-driver-count').textContent = `${fmtNumber(data.drivers.length)} drivers`;
    document.getElementById('f3-team-drivers').innerHTML = data.drivers.map(driver => `<a class="constructor-driver-card" href="/f3/driver?id=${encodeURIComponent(driver.driverId)}"><div class="constructor-driver-years">${driver.firstYear === driver.lastYear ? esc(driver.firstYear) : `${esc(driver.firstYear)}–${esc(driver.lastYear)}`}</div><strong>${esc(driver.driverName)}</strong><span>${fmtNumber(driver.starts)} starts · ${fmtNumber(driver.points)} points</span><div class="constructor-driver-record"><small>${fmtNumber(driver.wins)} wins</small><small>${fmtNumber(driver.podiums)} podiums</small><small>${fmtNumber(driver.seasons)} seasons</small></div></a>`).join('') || '<div class="empty-state">No driver history available.</div>';
    let resultPage = 1;
    const renderResults = () => {
      const paged = pageItems(data.results, resultPage, 30);
      resultPage = paged.page;
      document.getElementById('f3-team-results').innerHTML = paged.items.length ? `<table><thead><tr><th>Season</th><th>Weekend</th><th>Session</th><th>Driver</th><th>Finish</th><th>Points</th></tr></thead><tbody>${paged.items.map(result => `<tr><td><a href="/f3/season?year=${encodeURIComponent(result.year)}">${esc(result.year)}</a></td><td><a href="/f3/race?id=${encodeURIComponent(result.raceId)}">${esc(result.raceName)}</a><small>${esc(fmtDate(result.date))}</small></td><td>${esc(result.sessionName)}</td><td><a href="/f3/driver?id=${encodeURIComponent(result.driverId)}">${esc(result.driverName)}</a></td><td><span class="finish-position${Number(result.positionNumber) <= 3 && Number(result.positionNumber) > 0 ? ' podium' : ''}">${esc(result.positionNumber || result.status || '—')}</span></td><td class="result-points-total">${fmtNumber(result.points)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">No race results available.</div>';
      renderPagination('f3-team-results', data.results.length, resultPage, 30, page => { resultPage = page; renderResults(); document.getElementById('f3-team-results').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    renderResults();
  } catch (error) {
    setError('f3-team-head', error.message);
  }
}

loadF3Team();
