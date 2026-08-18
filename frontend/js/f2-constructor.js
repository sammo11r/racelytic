function f2ConstructorStat(label, value, highlight = false) {
  return `<div class="detail-stat${highlight ? ' highlight' : ''}"><span>${esc(label)}</span><strong>${fmtNumber(value)}</strong></div>`;
}

async function loadF2Constructor() {
  const id = params().get('id');
  if (!id) return setError('f2-constructor-head', 'No Formula 2 constructor selected.');
  try {
    const data = await getJSON(`/api/constructors/${encodeURIComponent(id)}?series=f2`);
    const constructor = data.constructor;
    const titles = data.standings.filter(season => season.championshipWon).length;
    const firstSeason = data.standings.length ? data.standings[data.standings.length - 1].year : constructor.firstYear;
    const lastSeason = data.standings.length ? data.standings[0].year : constructor.lastYear;
    document.title = `${constructor.name} · Formula 2 · Racelytic`;
    document.getElementById('f2-constructor-head').innerHTML = `
      <section class="detail-hero profile-hero">
        <div class="profile-hero-copy"><div class="eyebrow">FORMULA 2 CONSTRUCTOR</div><h1>${esc(constructor.name)}</h1><div class="detail-sub">${esc(constructor.abbreviation || '')}</div><div class="profile-meta">${firstSeason ? `<span>Active in F2 ${esc(firstSeason)}${lastSeason !== firstSeason ? `–${esc(lastSeason)}` : ''}</span>` : ''}${constructor.countryCode ? `<span>${esc(String(constructor.countryCode).toUpperCase())}</span>` : ''}</div></div>
        <div class="profile-monogram" aria-hidden="true">${esc((constructor.abbreviation || constructor.name).slice(0, 4).toUpperCase())}</div>
      </section>`;
    document.getElementById('f2-constructor-stats').innerHTML = [
      f2ConstructorStat('Team titles', titles, titles > 0),
      f2ConstructorStat('Race wins', constructor.totalRaceWins, Number(constructor.totalRaceWins) > 0),
      f2ConstructorStat('Podiums', constructor.totalPodiums),
      f2ConstructorStat('Fastest laps', constructor.totalFastestLaps),
      f2ConstructorStat('Race points', constructor.totalRacePoints),
      f2ConstructorStat('Drivers', data.drivers.length)
    ].join('');
    document.getElementById('f2-constructor-career-span').textContent = firstSeason ? `${firstSeason}${lastSeason !== firstSeason ? `–${lastSeason}` : ''} · ${data.standings.length} seasons` : '';
    document.getElementById('f2-constructor-seasons').innerHTML = data.standings.length ? `<div class="career-timeline constructor-career-timeline" role="list">${[...data.standings].reverse().map(season => {
      const drivers = String(season.drivers || '').split('||').filter(Boolean);
      const chassis = String(season.chassis || '').split('||').filter(Boolean);
      return `<a role="listitem" class="career-timeline-item${season.championshipWon ? ' champion' : ''}" href="/f2/season?year=${encodeURIComponent(season.year)}"><div class="timeline-marker"><i></i></div><span class="timeline-year">${esc(season.year)}</span><strong>${season.championshipWon ? 'Teams’ champion' : `Championship P${esc(season.positionNumber || '—')}`}</strong><small>${fmtNumber(season.points)} points</small><div class="timeline-context">${esc(chassis.join(' · ') || 'Chassis unavailable')}</div><div class="timeline-people">${esc(drivers.join(', ') || 'Drivers unavailable')}</div></a>`;
    }).join('')}</div>` : '<div class="empty-state">No championship history available.</div>';
    document.getElementById('f2-constructor-driver-count').textContent = `${fmtNumber(data.drivers.length)} drivers`;
    document.getElementById('f2-constructor-drivers').innerHTML = data.drivers.map(driver => `<a class="constructor-driver-card" href="/f2/driver?id=${encodeURIComponent(driver.driverId)}"><div class="constructor-driver-years">${driver.firstYear === driver.lastYear ? esc(driver.firstYear) : `${esc(driver.firstYear)}–${esc(driver.lastYear)}`}</div><strong>${esc(driver.driverName)}</strong><span>${fmtNumber(driver.starts)} starts · ${fmtNumber(driver.points)} points</span><div class="constructor-driver-record"><small>${fmtNumber(driver.wins)} wins</small><small>${fmtNumber(driver.podiums)} podiums</small><small>${fmtNumber(driver.seasons)} seasons</small></div></a>`).join('') || '<div class="empty-state">No driver history available.</div>';
    let resultPage = 1;
    const renderResults = () => {
      const paged = pageItems(data.results, resultPage, 30);
      resultPage = paged.page;
      document.getElementById('f2-constructor-results').innerHTML = paged.items.length ? `<table><thead><tr><th>Season</th><th>Weekend</th><th>Session</th><th>Driver</th><th>Finish</th><th>Points</th></tr></thead><tbody>${paged.items.map(result => `<tr><td><a href="/f2/season?year=${encodeURIComponent(result.year)}">${esc(result.year)}</a></td><td><a href="/f2/race?id=${encodeURIComponent(result.raceId)}">${esc(result.raceName)}</a><small>${esc(fmtDate(result.date))}</small></td><td>${esc(result.sessionName)}</td><td><a href="/f2/driver?id=${encodeURIComponent(result.driverId)}">${esc(result.driverName)}</a></td><td><span class="finish-position${Number(result.positionNumber) <= 3 && Number(result.positionNumber) > 0 ? ' podium' : ''}">${esc(result.positionNumber || result.status || '—')}</span></td><td class="result-points-total">${fmtNumber(result.points)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">No race results available.</div>';
      renderPagination('f2-constructor-results', data.results.length, resultPage, 30, page => { resultPage = page; renderResults(); document.getElementById('f2-constructor-results').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    renderResults();
  } catch (error) {
    setError('f2-constructor-head', error.message);
  }
}

loadF2Constructor();
