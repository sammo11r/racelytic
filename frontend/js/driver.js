function detailStat(label, value, highlight = false) {
  return `<div class="detail-stat${highlight ? ' highlight' : ''}"><span>${esc(label)}</span><strong>${fmtNumber(value)}</strong></div>`;
}

async function loadDriver() {
  const id = params().get('id');
  if (!id) return setError('driver-head', 'No driver selected.');

  try {
    const data = await getJSON(`/api/drivers/${encodeURIComponent(id)}`);
    const d = data.driver;
    const firstSeason = data.standings.length ? data.standings[data.standings.length - 1].year : null;
    const lastSeason = data.standings.length ? data.standings[0].year : null;

    document.title = 'Racelytics';
    document.getElementById('driver-head').innerHTML = `
      <section class="detail-hero profile-hero">
        <div class="profile-hero-copy">
          <div class="eyebrow">DRIVER</div>
          <h1>${esc(d.name)}</h1>
          <div class="detail-sub">${esc(d.fullName || '')}${d.nationalityCountryName ? ` · ${esc(d.nationalityCountryName)}` : ''}</div>
          <div class="profile-meta">
            ${d.dateOfBirth ? `<span>Born ${esc(fmtDate(d.dateOfBirth))}</span>` : ''}
            ${d.placeOfBirth ? `<span>${esc(d.placeOfBirth)}</span>` : ''}
            ${firstSeason ? `<span>F1 career ${esc(firstSeason)}–${esc(lastSeason)}</span>` : ''}
          </div>
        </div>
        ${d.permanentNumber ? `<div class="profile-number" aria-label="Permanent number ${esc(d.permanentNumber)}">${esc(d.permanentNumber)}</div>` : ''}
      </section>`;

    document.getElementById('driver-stats').innerHTML = [
      detailStat('World titles', d.totalChampionshipWins, Number(d.totalChampionshipWins) > 0),
      detailStat('Race wins', d.totalRaceWins, Number(d.totalRaceWins) > 0),
      detailStat('Podiums', d.totalPodiums),
      detailStat('Pole positions', d.totalPolePositions),
      detailStat('Fastest laps', d.totalFastestLaps),
      detailStat('Career points', d.totalPoints)
    ].join('');

    document.getElementById('driver-career-span').textContent = firstSeason
      ? `${firstSeason}–${lastSeason} · ${data.standings.length} seasons`
      : '';
    const driverTimeline = [...data.standings].reverse();
    document.getElementById('driver-seasons').innerHTML = driverTimeline.length
      ? `<div class="career-timeline" role="list" aria-label="Career by season">${driverTimeline.map((s, index) => {
          const teams = String(s.teams || '').split('||').filter(Boolean);
          return `<a role="listitem" class="career-timeline-item${s.championshipWon ? ' champion' : ''}" href="/season.html?year=${encodeURIComponent(s.year)}">
            <div class="timeline-marker"><i></i></div><span class="timeline-year">${esc(s.year)}</span>
            <strong>${s.championshipWon ? 'World champion' : `Championship P${esc(s.positionNumber || '—')}`}</strong>
            <small>${fmtNumber(s.points)} points</small>
            <div class="timeline-context">${teams.length ? esc(teams.join(' · ')) : 'Constructor unavailable'}</div>
            ${index === 0 ? '<em>F1 debut season</em>' : index === driverTimeline.length - 1 ? '<em>Final recorded season</em>' : ''}
          </a>`;
        }).join('')}</div>`
      : '<div class="empty-state">No championship history available.</div>';

    let resultPage = 1;
    const renderResults = () => {
      const paged = pageItems(data.results, resultPage, 30);
      resultPage = paged.page;
      document.getElementById('driver-results').innerHTML = data.results.length
      ? `<table><thead><tr><th>Season</th><th>Race</th><th>Constructor</th><th>Grid</th><th>Finish</th><th>Points</th></tr></thead>
        <tbody>${paged.items.map(r => `<tr>
          <td><a href="/season.html?year=${encodeURIComponent(r.year)}">${esc(r.year)}</a></td>
          <td><a href="/race.html?id=${encodeURIComponent(r.raceId)}">${esc(r.officialName)}</a><small>${esc(fmtDate(r.date))}</small></td>
          <td>${r.constructorName ? `<a href="/constructor.html?id=${encodeURIComponent(r.constructorId)}">${esc(r.constructorName)}</a>` : '—'}</td>
          <td>${esc(r.gridPositionNumber ?? '—')}</td>
          <td><span class="finish-position${Number(r.positionNumber) <= 3 ? ' podium' : ''}">${esc(r.positionText || r.positionNumber || '—')}</span></td>
          <td class="result-points-total">${fmtNumber(r.points)}</td>
        </tr>`).join('')}</tbody></table>`
      : '<div class="empty-state">No race results available.</div>';
      renderPagination('driver-results', data.results.length, resultPage, 30, page => { resultPage = page; renderResults(); document.getElementById('driver-results').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    renderResults();
  } catch (error) {
    setError('driver-head', error.message);
  }
}

loadDriver();
