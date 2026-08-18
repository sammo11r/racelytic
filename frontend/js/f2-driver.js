function f2DriverStat(label, value, highlight = false) {
  return `<div class="detail-stat${highlight ? ' highlight' : ''}"><span>${esc(label)}</span><strong>${fmtNumber(value)}</strong></div>`;
}

function f2ProfileCountry(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || String(code).toUpperCase();
  } catch {
    return String(code).toUpperCase();
  }
}

function f2RaceLabel(result) {
  const name = String(result.sessionName || '').trim();
  if (/feature/i.test(name)) return 'Feature race';
  if (/sprint/i.test(name)) return 'Sprint race';
  return name || 'Race';
}

function f2FinishText(result) {
  if (Number(result.positionNumber || 0) > 0) return result.positionNumber;
  return result.status || '—';
}

async function loadF2Driver() {
  const id = params().get('id');
  if (!id) return setError('f2-driver-head', 'No F2 driver selected.');

  try {
    const data = await getJSON(`/api/drivers/${encodeURIComponent(id)}?series=f2`);
    const driver = data.driver;
    const standings = data.standings;
    const firstSeason = standings.length ? standings[standings.length - 1].year : null;
    const lastSeason = standings.length ? standings[0].year : null;
    const latestTeam = standings[0]?.constructorName || '';
    const totals = standings.reduce((summary, season) => ({
      titles: summary.titles + (season.championshipWon ? 1 : 0),
      starts: summary.starts + Number(season.starts || 0),
      wins: summary.wins + Number(season.wins || 0),
      podiums: summary.podiums + Number(season.podiums || 0),
      poles: summary.poles + Number(season.poles || 0),
      fastestLaps: summary.fastestLaps + Number(season.fastestLaps || 0),
      points: summary.points + Number(season.points || 0)
    }), { titles: 0, starts: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, points: 0 });

    document.title = `${driver.name} · Formula 2 · Racelytic`;
    document.getElementById('f2-driver-head').innerHTML = `
      <section class="detail-hero profile-hero f2-driver-profile-hero">
        <div class="profile-hero-copy">
          <div class="eyebrow">FORMULA 2 DRIVER</div>
          <h1>${esc(driver.name)}</h1>
          <div class="detail-sub">${esc(f2ProfileCountry(driver.countryCode))}${latestTeam ? ` · ${esc(latestTeam)}` : ''}</div>
          <div class="profile-meta">
            ${firstSeason ? `<span>F2 career ${esc(firstSeason)}–${esc(lastSeason)}</span>` : ''}
            ${standings.length ? `<span>${fmtNumber(standings.length)} championship season${standings.length === 1 ? '' : 's'}</span>` : ''}
            ${totals.titles ? `<span>${fmtNumber(totals.titles)} F2 title${totals.titles === 1 ? '' : 's'}</span>` : ''}
          </div>
        </div>
        ${driver.latestNumber ? `<div class="profile-number" aria-label="Latest Formula 2 number ${esc(driver.latestNumber)}">${esc(driver.latestNumber)}</div>` : ''}
      </section>`;

    document.getElementById('f2-driver-stats').innerHTML = [
      f2DriverStat('F2 titles', totals.titles, totals.titles > 0),
      f2DriverStat('Race starts', totals.starts),
      f2DriverStat('Race wins', totals.wins, totals.wins > 0),
      f2DriverStat('Podiums', totals.podiums),
      f2DriverStat('Pole positions', totals.poles),
      f2DriverStat('Career points', totals.points)
    ].join('');

    document.getElementById('f2-driver-career-span').textContent = firstSeason
      ? `${firstSeason}–${lastSeason} · ${standings.length} season${standings.length === 1 ? '' : 's'}`
      : '';
    const timeline = [...standings].reverse();
    document.getElementById('f2-driver-seasons').innerHTML = timeline.length
      ? `<div class="career-timeline" role="list" aria-label="Formula 2 career by season">${timeline.map((season, index) => `
          <a role="listitem" class="career-timeline-item f2-career-item${season.championshipWon ? ' champion' : ''}" href="/f2/season?year=${encodeURIComponent(season.year)}">
            <div class="timeline-marker"><i></i></div>
            <span class="timeline-year">${esc(season.year)}</span>
            <strong>${season.championshipWon ? 'F2 champion' : `Championship P${esc(season.positionNumber || '—')}`}</strong>
            <small>${fmtNumber(season.points)} points</small>
            <div class="timeline-context">${esc(season.constructorName || 'Team not recorded')}</div>
            <div class="f2-season-record"><span>${fmtNumber(season.wins)} wins</span><span>${fmtNumber(season.podiums)} podiums</span><span>${fmtNumber(season.poles)} poles</span></div>
            ${index === 0 ? '<em>F2 debut season</em>' : index === timeline.length - 1 ? '<em>Latest F2 season</em>' : ''}
          </a>`).join('')}</div>`
      : '<div class="empty-state">No championship history available.</div>';

    let resultPage = 1;
    const renderResults = () => {
      const paged = pageItems(data.results, resultPage, 30);
      resultPage = paged.page;
      document.getElementById('f2-driver-results').innerHTML = data.results.length
        ? `<table><thead><tr><th>Season</th><th>Event</th><th>Race</th><th>Team</th><th>Finish</th><th>Points</th></tr></thead><tbody>${paged.items.map(result => `
          <tr>
            <td><a href="/f2/season?year=${encodeURIComponent(result.year)}">${esc(result.year)}</a></td>
            <td><strong>${esc(result.raceName)}</strong><small>Round ${esc(result.round)} · ${esc(fmtDate(result.date))}</small></td>
            <td>${esc(f2RaceLabel(result))}</td>
            <td>${esc(result.constructorName || '—')}</td>
            <td><span class="finish-position${Number(result.positionNumber) <= 3 && Number(result.positionNumber) > 0 ? ' podium' : ''}">${esc(f2FinishText(result))}</span></td>
            <td class="result-points-total">${fmtNumber(result.points)}${result.polePosition ? '<sub class="f2-result-award">PP</sub>' : ''}${result.fastestLap ? '<sup class="f2-result-award">F</sup>' : ''}</td>
          </tr>`).join('')}</tbody></table>`
        : '<div class="empty-state">No race results available.</div>';
      renderPagination('f2-driver-results', data.results.length, resultPage, 30, page => {
        resultPage = page;
        renderResults();
        document.getElementById('f2-driver-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    renderResults();
  } catch (error) {
    setError('f2-driver-head', error.message);
  }
}

loadF2Driver();
