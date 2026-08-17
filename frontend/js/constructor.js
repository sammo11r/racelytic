function constructorStat(label, value, highlight = false) {
  return `<div class="detail-stat${highlight ? ' highlight' : ''}"><span>${esc(label)}</span><strong>${fmtNumber(value)}</strong></div>`;
}

async function loadConstructor() {
  const id = params().get('id');
  if (!id) return setError('constructor-head', 'No constructor selected.');

  try {
    const data = await getJSON(`/api/constructors/${encodeURIComponent(id)}`);
    const c = data.constructor;
    const firstSeason = data.standings.length ? data.standings[data.standings.length - 1].year : null;
    const lastSeason = data.standings.length ? data.standings[0].year : null;

    document.title = 'Racelytics';
    document.getElementById('constructor-head').innerHTML = `
      <section class="detail-hero profile-hero">
        <div class="profile-hero-copy">
          <div class="eyebrow">CONSTRUCTOR</div>
          <h1>${esc(c.name)}</h1>
          <div class="detail-sub">${esc(c.fullName || '')}${c.countryName ? ` · ${esc(c.countryName)}` : ''}</div>
          <div class="profile-meta">
            ${firstSeason ? `<span>Active in F1 ${esc(firstSeason)}–${esc(lastSeason)}</span>` : ''}
            ${c.bestChampionshipPosition ? `<span>Best championship: P${esc(c.bestChampionshipPosition)}</span>` : ''}
          </div>
        </div>
        <div class="profile-monogram" aria-hidden="true">${esc((c.name || '').slice(0, 2).toUpperCase())}</div>
      </section>`;

    document.getElementById('constructor-stats').innerHTML = [
      constructorStat('World titles', c.totalChampionshipWins, Number(c.totalChampionshipWins) > 0),
      constructorStat('Race wins', c.totalRaceWins, Number(c.totalRaceWins) > 0),
      constructorStat('Podiums', c.totalPodiums),
      constructorStat('Pole positions', c.totalPolePositions),
      constructorStat('Fastest laps', c.totalFastestLaps),
      constructorStat('Career points', c.totalPoints)
    ].join('');

    document.getElementById('constructor-career-span').textContent = firstSeason
      ? `${firstSeason}–${lastSeason} · ${data.standings.length} seasons`
      : '';
    const constructorTimeline = [...data.standings].reverse();
    document.getElementById('constructor-seasons').innerHTML = constructorTimeline.length
      ? `<div class="career-timeline constructor-career-timeline" role="list" aria-label="Constructor career by season">${constructorTimeline.map((s, index) => {
          const drivers = String(s.drivers || '').split('||').filter(Boolean);
          const chassis = String(s.chassis || '').split('||').filter(Boolean);
          return `<a role="listitem" class="career-timeline-item${s.championshipWon ? ' champion' : ''}" href="/season.html?year=${encodeURIComponent(s.year)}">
            <div class="timeline-marker"><i></i></div><span class="timeline-year">${esc(s.year)}</span>
            <strong>${s.championshipWon ? 'World champion' : `Championship P${esc(s.positionNumber || '—')}`}</strong>
            <small>${fmtNumber(s.points)} points</small>
            <div class="timeline-context">${chassis.length ? esc(chassis.join(' · ')) : 'Chassis unavailable'}</div>
            <div class="timeline-people">${drivers.length ? esc(drivers.join(', ')) : 'Drivers unavailable'}</div>
            ${index === 0 ? '<em>First recorded season</em>' : index === constructorTimeline.length - 1 ? '<em>Latest recorded season</em>' : ''}
          </a>`;
        }).join('')}</div>`
      : '<div class="empty-state">No championship history available.</div>';

    document.getElementById('constructor-driver-count').textContent = `${fmtNumber(data.drivers.length)} drivers`;
    let driverPage = 1;
    const renderConstructorDrivers = () => {
      const paged = pageItems(data.drivers, driverPage, 24);
      driverPage = paged.page;
      document.getElementById('constructor-drivers').innerHTML = data.drivers.length
      ? paged.items.map(driver => `
        <a class="constructor-driver-card" href="/driver.html?id=${encodeURIComponent(driver.driverId)}">
          <div class="constructor-driver-years">${driver.firstYear === driver.lastYear ? esc(driver.firstYear) : `${esc(driver.firstYear)}–${esc(driver.lastYear)}`}</div>
          <strong>${esc(driver.driverName)}</strong>
          <span>${fmtNumber(driver.starts)} starts · ${fmtNumber(driver.points)} points</span>
          <div class="constructor-driver-record"><small>${fmtNumber(driver.wins)} wins</small><small>${fmtNumber(driver.podiums)} podiums</small><small>${fmtNumber(driver.seasons)} seasons</small></div>
        </a>`).join('')
      : '<div class="empty-state">No driver history available.</div>';
      renderPagination('constructor-drivers', data.drivers.length, driverPage, 24, page => { driverPage = page; renderConstructorDrivers(); document.getElementById('constructor-drivers').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    renderConstructorDrivers();

    document.getElementById('constructor-chassis-count').textContent = `${fmtNumber(data.chassis.length)} chassis`;
    let chassisPage = 1;
    const renderConstructorChassis = () => {
      const paged = pageItems(data.chassis, chassisPage, 12);
      chassisPage = paged.page;
      document.getElementById('constructor-chassis').innerHTML = data.chassis.length
      ? paged.items.map(chassis => `
        <article class="constructor-chassis-card">
          <div class="chassis-card-heading">
            <div><span>${chassis.firstYear === chassis.lastYear ? esc(chassis.firstYear) : `${esc(chassis.firstYear)}–${esc(chassis.lastYear)}`}</span><h3>${esc(chassis.chassisFullName || chassis.chassisName)}</h3></div>
            ${chassis.seasons > 1 ? `<small>${fmtNumber(chassis.seasons)} seasons</small>` : ''}
          </div>
          <div class="chassis-engine-block">
            <span>ENGINE${chassis.engines.length === 1 ? '' : 'S'}</span>
            ${chassis.engines.length
              ? `<ul>${chassis.engines.map(engine => `<li>${esc(engine)}</li>`).join('')}</ul>`
              : `<p>${chassis.engineManufacturers.length ? esc(chassis.engineManufacturers.join(', ')) : 'Engine information unavailable'}</p>`}
          </div>
        </article>`).join('')
      : '<div class="empty-state">No chassis history available.</div>';
      renderPagination('constructor-chassis', data.chassis.length, chassisPage, 12, page => { chassisPage = page; renderConstructorChassis(); document.getElementById('constructor-chassis').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    renderConstructorChassis();

    let resultPage = 1;
    const renderConstructorResults = () => {
      const paged = pageItems(data.results, resultPage, 30);
      resultPage = paged.page;
      document.getElementById('constructor-results').innerHTML = data.results.length
      ? `<table><thead><tr><th>Season</th><th>Race</th><th>Driver</th><th>Grid</th><th>Finish</th><th>Points</th></tr></thead>
        <tbody>${paged.items.map(r => `<tr>
          <td><a href="/season.html?year=${encodeURIComponent(r.year)}">${esc(r.year)}</a></td>
          <td><a href="/race.html?id=${encodeURIComponent(r.raceId)}">${esc(r.officialName)}</a><small>${esc(fmtDate(r.date))}</small></td>
          <td><a href="/driver.html?id=${encodeURIComponent(r.driverId)}">${esc(r.driverName)}</a></td>
          <td>${esc(r.gridPositionNumber ?? '—')}</td>
          <td><span class="finish-position${Number(r.positionNumber) <= 3 ? ' podium' : ''}">${esc(r.positionText || r.positionNumber || '—')}</span></td>
          <td class="result-points-total">${fmtNumber(r.points)}</td>
        </tr>`).join('')}</tbody></table>`
      : '<div class="empty-state">No race results available.</div>';
      renderPagination('constructor-results', data.results.length, resultPage, 30, page => { resultPage = page; renderConstructorResults(); document.getElementById('constructor-results').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    renderConstructorResults();
  } catch (error) {
    setError('constructor-head', error.message);
  }
}

loadConstructor();
