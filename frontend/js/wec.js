(function initialiseWecArchive() {
  const view = document.body.dataset.wecView;

  function eventFormat(event) {
    if (event.formatType === 'distance') return `${fmtNumber(event.scheduledDistanceKm)} km`;
    const hours = Number(event.scheduledMinutes || 0) / 60;
    return `${fmtNumber(hours)} hour${hours === 1 ? '' : 's'}`;
  }

  function coverageMessage(coverage) {
    if (coverage.classifications && coverage.standings) return 'Calendar, classifications and championship standings are available.';
    if (coverage.classificationEvents) return `Calendar and classes are complete; ${fmtNumber(coverage.classificationEvents)} of ${fmtNumber(coverage.totalEvents)} race classifications are available.`;
    return 'Calendar and class structure available. Entry crews, classifications and standings are the next data milestone.';
  }

  function flag(countryCode, countryName) {
    const code = String(countryCode || '').toLowerCase();
    return /^[a-z]{2}$/.test(code) ? `<img class="wec-flag" src="/assets/flags/${encodeURIComponent(code)}.svg" alt="${esc(countryName || code.toUpperCase())} flag" loading="lazy">` : '';
  }

  function circuitMap(event, className = '') {
    if (!event.layoutId) return '';
    return `<figure class="wec-circuit-map ${className}"><img src="/assets/circuits/${encodeURIComponent(event.layoutId)}.svg" alt="Track outline of ${esc(event.circuitName)}" loading="lazy" decoding="async"><figcaption>${esc(event.layoutVersion === 'current' ? 'Current / last recorded layout' : `Layout ${event.layoutVersion}`)}</figcaption></figure>`;
  }

  function circuitDirection(value) {
    return String(value || '').toLowerCase().replaceAll('_', '-').replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`);
  }

  function circuitLocationLink(event) {
    const latitude = Number(event.latitude), longitude = Number(event.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
    return `<a href="https://www.openstreetmap.org/?mlat=${latitude}&amp;mlon=${longitude}#map=14/${latitude}/${longitude}" target="_blank" rel="noopener noreferrer">View location ↗</a>`;
  }

  function renderEvents(events) {
    return events.map(event => `<a class="wec-event-card" href="/wec/races/${encodeURIComponent(event.id)}/${slug(event.name)}">
      <span class="wec-round">${esc(String(event.round).padStart(2, '0'))}</span>
      ${circuitMap(event, 'compact')}
      <div><small>${esc(fmtDate(event.date))} · ${flag(event.countryCode, event.countryName)}${esc(event.countryName || event.countryId)}</small><h3>${esc(event.name)}</h3><p>${esc(event.circuitName)} · ${esc(event.placeName)}</p></div>
      <div class="wec-event-format"><strong>${esc(eventFormat(event))}</strong><span>${event.hasClassification ? `Winner · #${esc(event.winnerCarNumber)} ${esc(event.winnerTeamName)}` : esc(event.pointsScale === 'le-mans' ? 'Le Mans points' : event.pointsScale === 'extended' ? 'Extended points' : 'Standard points')}</span></div>
    </a>`).join('');
  }

  function standingsLabel(championship) {
    if (championship.entityType === 'manufacturer') return 'Manufacturers';
    if (championship.entityType === 'team') return 'Teams';
    const classLabel = championship.classId.endsWith('lmgte-am') ? 'LMGTE Am'
      : championship.classId.endsWith('lmgt3') ? 'LMGT3'
        : championship.classId.endsWith('lmp2') ? 'LMP2' : 'Hypercar';
    if (championship.entityType === 'competitor') return classLabel === 'Hypercar' ? 'Hypercar World Cup' : `${classLabel} teams`;
    return `${classLabel} drivers`;
  }

  function renderStandings(championship, roundNumber) {
    if (!championship) return '<p class="empty-state">Official standings are not available.</p>';
    const round = championship.rounds.find(item => item.round === Number(roundNumber)) || championship.rounds.at(-1);
    const final = round.round === championship.rounds.at(-1).round;
    const entityType = championship.entityType === 'driver' ? 'drivers' : championship.entityType === 'manufacturer' ? 'manufacturers' : championship.entityType === 'team' ? 'teams' : 'entries';
    return `<div class="wec-standing-head"><p>${esc(championship.name)}</p><span>${final ? 'Final · ' : ''}After round ${esc(round.round)}</span></div><ol class="wec-standing-list">${round.standings.map(row => `<li${row.championshipWon ? ' class="is-champion"' : ''}><strong>${esc(row.position)}</strong>${row.carNumber ? `<span class="wec-standing-number">#${esc(row.carNumber)}</span>` : ''}<div><b><a href="${entityPath(entityType, row.entityId)}">${esc(row.entityName || row.entityId)}</a></b>${row.manufacturerName ? `<small><a href="${entityPath('manufacturers', slug(row.manufacturerName))}">${esc(row.manufacturerName)}</a></small>` : ''}</div><span>${esc(row.points)} pts</span></li>`).join('')}</ol>`;
  }

  function slug(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function entityPath(type, id) {
    if (type === 'car-models') return `/wec/cars/${encodeURIComponent(id)}`;
    return `/wec/${type}/${encodeURIComponent(id)}`;
  }

  function appearanceOutcome(item) {
    const statusLabels = {
      retired: 'Retired',
      'not-classified': 'Not classified',
      'not-started': 'Did not start',
      disqualified: 'Disqualified',
      excluded: 'Excluded'
    };
    const laps = `${fmtNumber(item.laps || 0)} laps`;
    if (item.status !== 'classified') return { primary: statusLabels[item.status] || item.status || 'Not classified', secondary: laps };
    return {
      primary: item.classPosition ? `P${item.classPosition} class` : 'Classified',
      secondary: `${item.overallPosition ? `P${item.overallPosition} overall · ` : ''}${laps}`
    };
  }

  function wecProfileClassLabel(code) {
    return ({ HYPERCAR: 'Hypercar', LMP1: 'LMP1', LMP2: 'LMP2', 'LMGTE PRO': 'LMGTE Pro', 'LMGTE AM': 'LMGTE Am', LMGT3: 'LMGT3' })[String(code || '').toUpperCase()] || String(code || '').replaceAll('-', ' ');
  }

  function wecIsLeMans(item) {
    return /-le-mans$/i.test(String(item.eventId || ''));
  }

  function wecSeasonLabel(season) {
    const match = String(season.seasonId || '').match(/wec-(\d{4})-(\d{4})/i);
    return match ? `${match[1]}–${match[2].slice(2)}` : String(season.year || '');
  }

  function wecChampionshipLabel(championship) {
    const classLabel = wecProfileClassLabel(championship.classCode);
    if (classLabel === 'Hypercar') return 'Hypercar World Endurance Drivers’ Championship';
    if (classLabel === 'LMP1' && /WORLD CHAMPIONSHIP/i.test(championship.name || '')) return 'World Endurance Drivers’ Championship';
    if (classLabel === 'LMP1') return 'LMP World Endurance Drivers’ Championship';
    if (classLabel) return `${classLabel} Drivers’ Championship`;
    return String(championship.name || 'WEC Drivers’ Championship')
      .replace(/\s+(?:CLASSIFICATION|STANDINGS)\s+(?:AFTER|FOLLOWING).+$/i, '')
      .replace(/^\d{4}\s+/, '').replace(/\s+/g, ' ').trim();
  }

  function wecDriverStat(label, value, highlight = false, note = '') {
    return `<div class="detail-stat${highlight ? ' highlight' : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
  }

  function wecDriverSeasons(data) {
    const seasons = new Map();
    data.appearances.forEach(item => {
      if (!seasons.has(item.year)) seasons.set(item.year, { year: item.year, seasonId: item.seasonId, appearances: [], teams: new Map(), classes: new Set(), starts: 0, wins: 0, podiums: 0 });
      const season = seasons.get(item.year);
      season.appearances.push(item);
      season.teams.set(item.teamId, item.teamName);
      season.classes.add(item.classCode);
      if (item.status !== 'not-started') season.starts += 1;
      if (item.status === 'classified' && Number(item.classPosition) === 1) season.wins += 1;
      if (item.status === 'classified' && Number(item.classPosition) >= 1 && Number(item.classPosition) <= 3) season.podiums += 1;
    });
    data.championships.forEach(championship => {
      if (!seasons.has(championship.year)) seasons.set(championship.year, { year: championship.year, seasonId: championship.seasonId, appearances: [], teams: new Map(), classes: new Set(), starts: 0, wins: 0, podiums: 0 });
      const season = seasons.get(championship.year);
      season.championships ||= [];
      season.championships.push(championship);
      if (championship.classCode) season.classes.add(championship.classCode);
    });
    return [...seasons.values()].sort((left, right) => left.year - right.year);
  }

  function bindWecDriverTimeline() {
    const timeline = document.querySelector('.wec-driver-career-timeline');
    const previous = document.getElementById('wec-driver-timeline-previous');
    const next = document.getElementById('wec-driver-timeline-next');
    if (!timeline) return;
    const update = () => {
      previous.disabled = timeline.scrollLeft <= 2;
      next.disabled = timeline.scrollLeft + timeline.clientWidth >= timeline.scrollWidth - 2;
    };
    previous.addEventListener('click', () => timeline.scrollBy({ left: -Math.max(230, timeline.clientWidth * .8), behavior: 'smooth' }));
    next.addEventListener('click', () => timeline.scrollBy({ left: Math.max(230, timeline.clientWidth * .8), behavior: 'smooth' }));
    timeline.addEventListener('scroll', update, { passive: true });
    update();
  }

  function wecConnectionList(title, rows, pathType, unit = 'race') {
    return `<article><span>${esc(title)}</span><ol>${rows.length ? rows.map(row => `<li><a href="${entityPath(pathType, row.id)}">${esc(row.name)}</a><strong>${fmtNumber(row.count)} ${esc(unit)}${row.count === 1 ? '' : 's'}</strong></li>`).join('') : '<li class="empty-state">No data available</li>'}</ol></article>`;
  }

  function renderWecDriverConnections(data) {
    const countEntities = (idField, nameField) => {
      const values = new Map();
      data.appearances.forEach(item => {
        if (!item[idField]) return;
        const row = values.get(item[idField]) || { id: item[idField], name: item[nameField], count: 0 };
        row.count += 1;
        values.set(item[idField], row);
      });
      return [...values.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)).slice(0, 6);
    };
    const teammates = new Map();
    data.crew.forEach(item => {
      const row = teammates.get(item.driverId) || { id: item.driverId, name: item.driverName, count: 0 };
      row.count += 1;
      teammates.set(item.driverId, row);
    });
    const teammateRows = [...teammates.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)).slice(0, 6);
    const target = document.getElementById('wec-driver-connections');
    target.setAttribute('aria-busy', 'false');
    target.innerHTML = wecConnectionList('Teams', countEntities('teamId', 'teamName'), 'teams')
      + wecConnectionList('Manufacturers', countEntities('manufacturerId', 'manufacturerName'), 'manufacturers')
      + wecConnectionList('Cars', countEntities('carModelId', 'carModelName'), 'car-models')
      + wecConnectionList('Frequent teammates', teammateRows, 'drivers');
  }

  function renderWecDriverResults(data) {
    const state = { search: '', season: '', classCode: '', outcome: 'all', page: 1 };
    const pageSize = 20;
    const seasons = [...new Set(data.appearances.map(item => item.year))].sort((left, right) => right - left);
    const classes = [...new Set(data.appearances.map(item => item.classCode))].sort();
    document.getElementById('wec-driver-result-season').innerHTML = '<option value="">All seasons</option>' + seasons.map(year => {
      const appearance = data.appearances.find(item => item.year === year);
      return `<option value="${year}">${esc(wecSeasonLabel(appearance || { year }))}</option>`;
    }).join('');
    document.getElementById('wec-driver-result-class').innerHTML = '<option value="">All classes</option>' + classes.map(code => `<option value="${esc(code)}">${esc(wecProfileClassLabel(code))}</option>`).join('');
    const crewByAppearance = new Map();
    data.crew.forEach(driver => {
      const key = `${driver.eventId}|${driver.entryId}`;
      if (!crewByAppearance.has(key)) crewByAppearance.set(key, []);
      crewByAppearance.get(key).push(driver);
    });
    const filtered = () => data.appearances.filter(item => {
      const haystack = [item.eventName, item.teamName, item.manufacturerName, item.carModelName, item.classCode, item.year].join(' ').toLowerCase();
      if (state.search && !haystack.includes(state.search)) return false;
      if (state.season && String(item.year) !== state.season) return false;
      if (state.classCode && item.classCode !== state.classCode) return false;
      if (state.outcome === 'overall-wins' && !(item.status === 'classified' && Number(item.overallPosition) === 1)) return false;
      if (state.outcome === 'class-wins' && !(item.status === 'classified' && Number(item.classPosition) === 1)) return false;
      if (state.outcome === 'podiums' && !(item.status === 'classified' && Number(item.classPosition) >= 1 && Number(item.classPosition) <= 3)) return false;
      if (state.outcome === 'retirements' && !['retired', 'not-classified', 'disqualified', 'excluded'].includes(item.status)) return false;
      if (state.outcome === 'le-mans' && !wecIsLeMans(item)) return false;
      return true;
    });
    const paint = () => {
      const rows = filtered();
      const paged = pageItems(rows, state.page, pageSize);
      state.page = paged.page;
      const target = document.getElementById('wec-driver-results');
      target.setAttribute('aria-busy', 'false');
      document.getElementById('wec-driver-result-count').textContent = `${fmtNumber(rows.length)} race${rows.length === 1 ? '' : 's'} shown`;
      target.innerHTML = paged.items.length ? paged.items.map(item => {
        const outcome = appearanceOutcome(item);
        const eventUrl = `/wec/races/${encodeURIComponent(item.eventId)}/${slug(item.eventName)}`;
        const teammates = crewByAppearance.get(`${item.eventId}|${item.entryId}`) || [];
        const podium = item.status === 'classified' && Number(item.classPosition) >= 1 && Number(item.classPosition) <= 3;
        return `<article class="wec-driver-result-card${podium ? ' podium' : ''}">
          <span class="wec-round">${esc(String(item.round).padStart(2, '0'))}</span>
          <div class="wec-driver-result-copy"><small>${esc(wecSeasonLabel(item))} · ${esc(fmtDate(item.date))} · ${esc(wecProfileClassLabel(item.classCode))}</small><h3><a href="${eventUrl}">${esc(item.eventName)}</a></h3>
            <p><b>#${esc(item.carNumber)}</b> · <a href="${entityPath('teams', item.teamId)}">${esc(item.teamName)}</a> · <a href="${entityPath('car-models', item.carModelId)}">${esc(item.carModelName)}</a></p>
            ${teammates.length ? `<div class="wec-driver-result-crew"><span>With</span>${teammates.map(driver => `<a href="${entityPath('drivers', driver.driverId)}">${esc(driver.driverName)}</a>`).join('')}</div>` : ''}
          </div><div class="wec-event-format"><strong>${esc(outcome.primary)}</strong><span>${esc(outcome.secondary)}</span></div>
        </article>`;
      }).join('') : '<div class="wec-driver-empty"><p class="eyebrow">NO MATCHES</p><h2>No races found</h2><p>Try another search, season, class or result.</p></div>';
      renderPagination('wec-driver-results', rows.length, state.page, pageSize, page => { state.page = page; paint(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    const bind = (id, eventName, field, transform = value => value) => document.getElementById(id).addEventListener(eventName, event => { state[field] = transform(event.target.value); state.page = 1; paint(); });
    bind('wec-driver-result-search', 'input', 'search', value => value.trim().toLowerCase());
    bind('wec-driver-result-season', 'change', 'season');
    bind('wec-driver-result-class', 'change', 'classCode');
    bind('wec-driver-result-outcome', 'change', 'outcome');
    document.getElementById('wec-driver-result-clear').addEventListener('click', () => {
      Object.assign(state, { search: '', season: '', classCode: '', outcome: 'all', page: 1 });
      document.getElementById('wec-driver-result-search').value = '';
      document.getElementById('wec-driver-result-season').value = '';
      document.getElementById('wec-driver-result-class').value = '';
      document.getElementById('wec-driver-result-outcome').value = 'all';
      paint();
    });
    paint();
  }

  function renderWecDriverProfile(data) {
    const appearances = data.appearances;
    const seasons = wecDriverSeasons(data);
    const latest = appearances[0];
    const firstYear = seasons[0]?.year;
    const lastYear = seasons.at(-1)?.year;
    const titleCount = data.championships.filter(item => item.championshipWon).length;
    const classes = [...new Set(appearances.map(item => item.classCode))];
    const podiumRate = data.stats.starts ? `${(data.stats.podiums / data.stats.starts * 100).toFixed(1)}%` : '—';
    const leMansWins = appearances.filter(item => wecIsLeMans(item) && item.status === 'classified' && Number(item.classPosition) === 1).length;
    document.getElementById('wec-generic-profile').hidden = true;
    document.getElementById('wec-driver-profile').hidden = false;
    const backLink = document.getElementById('wec-entity-back-link');
    backLink.innerHTML = '<span aria-hidden="true">←</span> All WEC drivers';
    backLink.href = '/wec/drivers';
    const returnPath = params().get('return');
    if (returnPath && (returnPath === '/wec/drivers' || returnPath.startsWith('/wec/drivers?'))) backLink.href = returnPath;

    const head = document.getElementById('wec-driver-head');
    head.setAttribute('aria-busy', 'false');
    head.innerHTML = `<section class="detail-hero profile-hero driver-profile-hero wec-driver-profile-hero"><div class="profile-hero-copy"><div class="eyebrow">WEC DRIVER</div><h1>${esc(data.entity.name)}</h1><div class="detail-sub">${flag(data.entity.countryCode, data.entity.countryName)}${esc(data.entity.countryName || 'World Endurance Championship')}</div><div class="driver-profile-badges">${titleCount ? `<strong>${titleCount > 1 ? `${fmtNumber(titleCount)}× ` : ''}WEC title winner</strong>` : data.stats.overallWins ? '<strong>Overall race winner</strong>' : ''}${classes.map(code => `<em>${esc(wecProfileClassLabel(code))}</em>`).join('')}</div><div class="profile-meta">${firstYear ? `<span>WEC career ${esc(firstYear)}–${esc(lastYear)}</span>` : ''}${latest ? `<span>Latest appearance ${esc(latest.year)} · ${esc(latest.teamName)}</span><span>${esc(latest.carModelName)}</span>` : ''}</div></div>${latest?.carNumber ? `<div class="profile-number" aria-label="Latest car number ${esc(latest.carNumber)}">${esc(latest.carNumber)}</div>` : ''}</section>`;

    const stats = document.getElementById('wec-driver-stats');
    stats.setAttribute('aria-busy', 'false');
    stats.innerHTML = [
      wecDriverStat('WEC titles', fmtNumber(titleCount), titleCount > 0),
      wecDriverStat('Overall wins', fmtNumber(data.stats.overallWins), data.stats.overallWins > 0),
      wecDriverStat('Class wins', fmtNumber(data.stats.classWins), data.stats.classWins > 0),
      wecDriverStat('Class podiums', fmtNumber(data.stats.podiums)),
      wecDriverStat('Race starts', fmtNumber(data.stats.starts)),
      wecDriverStat('Seasons', fmtNumber(seasons.length), false, firstYear ? `${firstYear}–${lastYear}` : ''),
      wecDriverStat('Le Mans wins', fmtNumber(leMansWins), leMansWins > 0, 'Class victories'),
      wecDriverStat('Podium rate', podiumRate, false, data.stats.starts ? `${fmtNumber(data.stats.podiums)} from ${fmtNumber(data.stats.starts)} starts` : '')
    ].join('');

    document.getElementById('wec-driver-career-span').textContent = firstYear ? `${firstYear}–${lastYear} · ${seasons.length} season${seasons.length === 1 ? '' : 's'}` : '';
    const timeline = document.getElementById('wec-driver-seasons');
    timeline.setAttribute('aria-busy', 'false');
    timeline.innerHTML = seasons.length ? `<div class="career-timeline wec-driver-career-timeline" role="list" aria-label="WEC career by season">${seasons.map((season, index) => {
      const championships = (season.championships || []).sort((left, right) => Number(right.championshipWon) - Number(left.championshipWon) || left.position - right.position);
      const standing = championships[0];
      const champion = championships.some(item => item.championshipWon);
      const teams = [...season.teams.values()];
      return `<a role="listitem" class="career-timeline-item driver-season-item${champion ? ' champion' : ''}" href="/wec/seasons/${encodeURIComponent(season.year)}"><div class="timeline-marker"><i></i></div><span class="timeline-year">${esc(wecSeasonLabel(season))}</span><strong>${champion ? 'WEC title winner' : standing ? `Championship P${esc(standing.position)}` : `${fmtNumber(season.starts)} start${season.starts === 1 ? '' : 's'}`}</strong><small>${standing ? `${fmtNumber(standing.points)} points · ${esc(wecChampionshipLabel(standing))}` : [...season.classes].map(wecProfileClassLabel).join(' · ')}</small><div class="timeline-context">${esc(teams.join(' · ') || 'Team unavailable')}</div><div class="driver-season-record"><span>${fmtNumber(season.starts)} start${season.starts === 1 ? '' : 's'}</span><span>${fmtNumber(season.wins)} class win${season.wins === 1 ? '' : 's'}</span><span>${fmtNumber(season.podiums)} podium${season.podiums === 1 ? '' : 's'}</span></div>${index === 0 ? '<em>WEC debut season</em>' : index === seasons.length - 1 ? '<em>Latest appearance</em>' : ''}</a>`;
    }).join('')}</div>` : '<div class="empty-state">No season history available.</div>';
    bindWecDriverTimeline();
    renderWecDriverConnections(data);
    renderWecDriverResults(data);
  }

  function wecTeamChampionshipLabel(championship) {
    const classLabel = wecProfileClassLabel(championship.classCode);
    const scope = championship.entityType === 'competitor' ? 'Teams’ Trophy' : 'Teams’ Championship';
    if (classLabel === 'Hypercar') return championship.entityType === 'competitor' ? 'Hypercar Teams’ World Cup' : 'Hypercar Teams’ Championship';
    if (classLabel) return `${classLabel} ${scope}`;
    return String(championship.name || 'WEC Teams’ Championship')
      .replace(/\s+(?:CLASSIFICATION|STANDINGS|TROPHY)\s+(?:AFTER|FOLLOWING).+$/i, '')
      .replace(/\s+AFTER\s+.+$/i, '').replace(/^\d{4}(?:-\d{4})?\s+/, '').replace(/\s+/g, ' ').trim();
  }

  function wecTeamSeasons(data) {
    const seasons = new Map();
    const ensure = (year, seasonId) => {
      if (!seasons.has(year)) seasons.set(year, { year, seasonId, appearances: [], events: new Set(), classes: new Set(), manufacturers: new Map(), cars: new Map(), entries: new Set(), starts: 0, wins: 0, podiums: 0, championships: [] });
      return seasons.get(year);
    };
    data.appearances.forEach(item => {
      const season = ensure(item.year, item.seasonId);
      season.appearances.push(item);
      season.events.add(item.eventId);
      season.classes.add(item.classCode);
      season.manufacturers.set(item.manufacturerId, item.manufacturerName);
      season.cars.set(item.carModelId, item.carModelName);
      season.entries.add(item.competitorId || item.entryId);
      if (item.status !== 'not-started') season.starts += 1;
      if (item.status === 'classified' && Number(item.classPosition) === 1) season.wins += 1;
      if (item.status === 'classified' && Number(item.classPosition) >= 1 && Number(item.classPosition) <= 3) season.podiums += 1;
    });
    data.championships.forEach(championship => {
      const season = ensure(championship.year, championship.seasonId);
      season.championships.push(championship);
      if (championship.classCode) season.classes.add(championship.classCode);
    });
    return [...seasons.values()].sort((left, right) => left.year - right.year);
  }

  function bindWecTeamTimeline() {
    const timeline = document.querySelector('.wec-team-career-timeline');
    const previous = document.getElementById('wec-team-timeline-previous');
    const next = document.getElementById('wec-team-timeline-next');
    if (!timeline) return;
    const update = () => {
      previous.disabled = timeline.scrollLeft <= 2;
      next.disabled = timeline.scrollLeft + timeline.clientWidth >= timeline.scrollWidth - 2;
    };
    previous.addEventListener('click', () => timeline.scrollBy({ left: -Math.max(230, timeline.clientWidth * .8), behavior: 'smooth' }));
    next.addEventListener('click', () => timeline.scrollBy({ left: Math.max(230, timeline.clientWidth * .8), behavior: 'smooth' }));
    timeline.addEventListener('scroll', update, { passive: true });
    update();
  }

  function renderWecTeamConnections(data) {
    const count = (rows, idField, nameField) => {
      const values = new Map();
      rows.forEach(item => {
        if (!item[idField]) return;
        const row = values.get(item[idField]) || { id: item[idField], name: item[nameField], count: 0 };
        row.count += 1;
        values.set(item[idField], row);
      });
      return [...values.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)).slice(0, 8);
    };
    const target = document.getElementById('wec-team-connections');
    target.setAttribute('aria-busy', 'false');
    const entries = count(data.appearances, 'competitorId', 'carNumber').map(row => ({ ...row, name: `#${row.name}` }));
    target.innerHTML = wecConnectionList('Drivers', count(data.crew, 'driverId', 'driverName'), 'drivers', 'appearance')
      + wecConnectionList('Manufacturers', count(data.appearances, 'manufacturerId', 'manufacturerName'), 'manufacturers', 'entry')
      + wecConnectionList('Car models', count(data.appearances, 'carModelId', 'carModelName'), 'car-models', 'entry')
      + wecConnectionList('Entry identities', entries, 'entries', 'event');
  }

  function renderWecTeamChampionships(data) {
    const titles = data.championships.filter(item => item.championshipWon);
    const other = data.championships.filter(item => !item.championshipWon);
    const appearanceByCompetitor = new Map(data.appearances.map(item => [item.competitorId, item]));
    const card = item => {
      const appearance = appearanceByCompetitor.get(item.entityId);
      const scope = item.entityType === 'competitor' ? `Entry${appearance?.carNumber ? ` #${appearance.carNumber}` : ''}` : 'Team';
      return `<article${item.championshipWon ? ' class="is-champion"' : ''}><span>${esc(wecSeasonLabel(item))}</span><strong>${item.championshipWon ? 'Champion' : `P${esc(item.position)}`}</strong><p>${esc(wecTeamChampionshipLabel(item))}</p><small>${esc(scope)} · ${fmtNumber(item.points)} points</small></article>`;
    };
    document.getElementById('wec-team-championship-count').textContent = `${fmtNumber(titles.length)} title${titles.length === 1 ? '' : 's'} · ${fmtNumber(data.championships.length)} recorded finishes`;
    const target = document.getElementById('wec-team-championships');
    target.setAttribute('aria-busy', 'false');
    target.innerHTML = `${titles.length ? `<div class="wec-team-title-grid">${titles.map(card).join('')}</div>` : '<p class="empty-state">No championship titles are recorded.</p>'}${other.length ? `<details><summary>Other championship finishes <span>${fmtNumber(other.length)}</span></summary><div class="wec-team-standing-grid">${other.map(card).join('')}</div></details>` : ''}`;
  }

  function renderWecTeamResults(data) {
    const state = { search: '', season: '', classCode: '', outcome: 'all', page: 1 };
    const pageSize = 12;
    const crewByAppearance = new Map();
    data.crew.forEach(driver => {
      const key = `${driver.eventId}|${driver.entryId}`;
      if (!crewByAppearance.has(key)) crewByAppearance.set(key, []);
      crewByAppearance.get(key).push(driver);
    });
    const groups = new Map();
    data.appearances.forEach(item => {
      if (!groups.has(item.eventId)) groups.set(item.eventId, { ...item, entries: [] });
      groups.get(item.eventId).entries.push(item);
    });
    const events = [...groups.values()];
    const seasons = [...new Set(events.map(item => item.year))].sort((left, right) => right - left);
    const classes = [...new Set(data.appearances.map(item => item.classCode))].sort();
    document.getElementById('wec-team-result-season').innerHTML = '<option value="">All seasons</option>' + seasons.map(year => `<option value="${year}">${esc(wecSeasonLabel(events.find(item => item.year === year) || { year }))}</option>`).join('');
    document.getElementById('wec-team-result-class').innerHTML = '<option value="">All classes</option>' + classes.map(code => `<option value="${esc(code)}">${esc(wecProfileClassLabel(code))}</option>`).join('');
    const matchesOutcome = item => {
      if (state.outcome === 'overall-wins') return item.status === 'classified' && Number(item.overallPosition) === 1;
      if (state.outcome === 'class-wins') return item.status === 'classified' && Number(item.classPosition) === 1;
      if (state.outcome === 'podiums') return item.status === 'classified' && Number(item.classPosition) >= 1 && Number(item.classPosition) <= 3;
      if (state.outcome === 'retirements') return ['retired', 'not-classified', 'disqualified', 'excluded'].includes(item.status);
      return true;
    };
    const visibleEntries = event => event.entries.filter(item => {
      if (state.classCode && item.classCode !== state.classCode) return false;
      if (!matchesOutcome(item)) return false;
      if (state.search) {
        const crew = crewByAppearance.get(`${item.eventId}|${item.entryId}`) || [];
        const haystack = [item.eventName, item.manufacturerName, item.carModelName, item.classCode, item.carNumber, item.year, ...crew.map(driver => driver.driverName)].join(' ').toLowerCase();
        if (!haystack.includes(state.search)) return false;
      }
      return true;
    });
    const filtered = () => events.map(event => ({ ...event, visibleEntries: visibleEntries(event) })).filter(event => {
      if (state.season && String(event.year) !== state.season) return false;
      if (state.outcome === 'le-mans' && !wecIsLeMans(event)) return false;
      return event.visibleEntries.length > 0;
    });
    const paint = () => {
      const rows = filtered();
      const entryCount = rows.reduce((total, event) => total + event.visibleEntries.length, 0);
      const paged = pageItems(rows, state.page, pageSize);
      state.page = paged.page;
      document.getElementById('wec-team-result-count').textContent = `${fmtNumber(rows.length)} event${rows.length === 1 ? '' : 's'} · ${fmtNumber(entryCount)} entr${entryCount === 1 ? 'y' : 'ies'} shown`;
      const target = document.getElementById('wec-team-results');
      target.setAttribute('aria-busy', 'false');
      target.innerHTML = paged.items.length ? paged.items.map(event => `<article class="wec-team-event-card"><header><span class="wec-round">${esc(String(event.round).padStart(2, '0'))}</span><div><small>${esc(wecSeasonLabel(event))} · ${esc(fmtDate(event.date))}</small><h3><a href="/wec/races/${encodeURIComponent(event.eventId)}/${slug(event.eventName)}">${esc(event.eventName)}</a></h3></div><strong>${fmtNumber(event.visibleEntries.length)} entr${event.visibleEntries.length === 1 ? 'y' : 'ies'}</strong></header><div class="wec-team-event-entries">${event.visibleEntries.map(item => {
        const outcome = appearanceOutcome(item);
        const crew = crewByAppearance.get(`${item.eventId}|${item.entryId}`) || [];
        return `<div><b>#${esc(item.carNumber)}</b><span><small>${esc(wecProfileClassLabel(item.classCode))} · <a href="${entityPath('manufacturers', item.manufacturerId)}">${esc(item.manufacturerName)}</a></small><strong><a href="${entityPath('car-models', item.carModelId)}">${esc(item.carModelName)}</a></strong>${crew.length ? `<em>${crew.map(driver => `<a href="${entityPath('drivers', driver.driverId)}">${esc(driver.driverName)}</a>`).join(' · ')}</em>` : ''}</span><span class="wec-team-entry-outcome"><strong>${esc(outcome.primary)}</strong><small>${esc(outcome.secondary)}</small></span></div>`;
      }).join('')}</div></article>`).join('') : '<div class="wec-driver-empty"><p class="eyebrow">NO MATCHES</p><h2>No events found</h2><p>Try another search, season, class or result.</p></div>';
      renderPagination('wec-team-results', rows.length, state.page, pageSize, page => { state.page = page; paint(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    const bind = (id, eventName, field, transform = value => value) => document.getElementById(id).addEventListener(eventName, event => { state[field] = transform(event.target.value); state.page = 1; paint(); });
    bind('wec-team-result-search', 'input', 'search', value => value.trim().toLowerCase());
    bind('wec-team-result-season', 'change', 'season');
    bind('wec-team-result-class', 'change', 'classCode');
    bind('wec-team-result-outcome', 'change', 'outcome');
    document.getElementById('wec-team-result-clear').addEventListener('click', () => {
      Object.assign(state, { search: '', season: '', classCode: '', outcome: 'all', page: 1 });
      ['wec-team-result-search', 'wec-team-result-season', 'wec-team-result-class'].forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('wec-team-result-outcome').value = 'all';
      paint();
    });
    paint();
  }

  function renderWecTeamProfile(data) {
    const appearances = data.appearances;
    const seasons = wecTeamSeasons(data);
    const latestSeason = seasons.at(-1);
    const latest = appearances[0];
    const firstYear = seasons[0]?.year;
    const lastYear = latestSeason?.year;
    const titles = data.championships.filter(item => item.championshipWon);
    const classes = [...new Set(appearances.map(item => item.classCode))];
    const eventStarts = new Set(appearances.filter(item => item.status !== 'not-started').map(item => item.eventId)).size;
    const manufacturers = [...new Set(appearances.map(item => item.manufacturerName))];
    const latestEntries = latestSeason ? [...new Map(latestSeason.appearances.map(item => [item.competitorId || item.entryId, item])).values()] : [];
    const leMansWins = appearances.filter(item => wecIsLeMans(item) && item.status === 'classified' && Number(item.classPosition) === 1).length;
    document.getElementById('wec-generic-profile').hidden = true;
    document.getElementById('wec-driver-profile').hidden = true;
    document.getElementById('wec-team-profile').hidden = false;
    const backLink = document.getElementById('wec-entity-back-link');
    backLink.innerHTML = '<span aria-hidden="true">←</span> All WEC teams';
    backLink.href = '/wec/teams';
    const returnPath = params().get('return');
    if (returnPath && (returnPath === '/wec/teams' || returnPath.startsWith('/wec/teams?'))) backLink.href = returnPath;

    const head = document.getElementById('wec-team-head');
    head.setAttribute('aria-busy', 'false');
    head.innerHTML = `<section class="detail-hero profile-hero driver-profile-hero wec-driver-profile-hero wec-team-profile-hero"><div class="profile-hero-copy"><div class="eyebrow">WEC TEAM</div><h1>${esc(data.entity.name)}</h1><div class="detail-sub">${flag(data.entity.countryCode, data.entity.countryName)}${esc(data.entity.countryName || 'World Endurance Championship')}</div><div class="driver-profile-badges">${titles.length ? `<strong>${titles.length > 1 ? `${fmtNumber(titles.length)}× ` : ''}WEC title winner</strong>` : data.stats.overallWins ? '<strong>Overall race winner</strong>' : ''}${classes.map(code => `<em>${esc(wecProfileClassLabel(code))}</em>`).join('')}</div><div class="profile-meta">${firstYear ? `<span>WEC record ${esc(firstYear)}–${esc(lastYear)}</span><span>${fmtNumber(seasons.length)} season${seasons.length === 1 ? '' : 's'}</span>` : ''}<span>${esc(manufacturers.join(' · '))}</span></div></div>${latestSeason ? `<aside class="wec-team-latest"><span>Latest recorded season</span><strong>${esc(wecSeasonLabel(latestSeason))}</strong><small>${esc([...latestSeason.classes].map(wecProfileClassLabel).join(' · '))}</small><div>${latestEntries.slice(0, 4).map(item => `<a href="${entityPath('entries', item.competitorId)}">#${esc(item.carNumber)} · ${esc(item.carModelName)}</a>`).join('')}</div></aside>` : ''}</section>`;

    const stats = document.getElementById('wec-team-stats');
    stats.setAttribute('aria-busy', 'false');
    stats.innerHTML = [
      wecDriverStat('WEC titles', fmtNumber(titles.length), titles.length > 0),
      wecDriverStat('Race weekends', fmtNumber(eventStarts), false, 'Distinct WEC events'),
      wecDriverStat('Entry starts', fmtNumber(data.stats.starts), false, 'Individual cars started'),
      wecDriverStat('Overall wins', fmtNumber(data.stats.overallWins), data.stats.overallWins > 0),
      wecDriverStat('Class wins', fmtNumber(data.stats.classWins), data.stats.classWins > 0),
      wecDriverStat('Class podiums', fmtNumber(data.stats.podiums)),
      wecDriverStat('Seasons', fmtNumber(seasons.length), false, firstYear ? `${firstYear}–${lastYear}` : ''),
      wecDriverStat('Le Mans wins', fmtNumber(leMansWins), leMansWins > 0, 'Class victories')
    ].join('');

    document.getElementById('wec-team-career-span').textContent = firstYear ? `${firstYear}–${lastYear} · ${seasons.length} season${seasons.length === 1 ? '' : 's'}` : '';
    const timeline = document.getElementById('wec-team-seasons');
    timeline.setAttribute('aria-busy', 'false');
    timeline.innerHTML = seasons.length ? `<div class="career-timeline wec-team-career-timeline" role="list" aria-label="Team career by season">${seasons.map((season, index) => {
      const standings = season.championships.sort((left, right) => Number(right.championshipWon) - Number(left.championshipWon) || left.position - right.position);
      const best = standings[0];
      const champion = standings.some(item => item.championshipWon);
      return `<a role="listitem" class="career-timeline-item driver-season-item${champion ? ' champion' : ''}" href="/wec/seasons/${encodeURIComponent(season.year)}"><div class="timeline-marker"><i></i></div><span class="timeline-year">${esc(wecSeasonLabel(season))}</span><strong>${champion ? 'Championship winner' : best ? `Best championship P${esc(best.position)}` : `${fmtNumber(season.events.size)} event${season.events.size === 1 ? '' : 's'}`}</strong><small>${esc([...season.classes].map(wecProfileClassLabel).join(' · '))}</small><div class="timeline-context">${esc([...season.cars.values()].join(' · ') || [...season.manufacturers.values()].join(' · '))}</div><div class="driver-season-record"><span>${fmtNumber(season.events.size)} events</span><span>${fmtNumber(season.starts)} entry starts</span><span>${fmtNumber(season.wins)} class wins</span></div>${index === 0 ? '<em>WEC debut season</em>' : index === seasons.length - 1 ? '<em>Latest recorded season</em>' : ''}</a>`;
    }).join('')}</div>` : '<div class="empty-state">No season history available.</div>';
    bindWecTeamTimeline();
    renderWecTeamConnections(data);
    renderWecTeamChampionships(data);
    renderWecTeamResults(data);
  }

  function wecCarSeasons(data) {
    const seasons = new Map();
    data.appearances.forEach(item => {
      if (!seasons.has(item.year)) seasons.set(item.year, { year: item.year, seasonId: item.seasonId, appearances: [], events: new Set(), teams: new Map(), classes: new Set(), starts: 0, wins: 0, podiums: 0 });
      const season = seasons.get(item.year);
      season.appearances.push(item);
      season.events.add(item.eventId);
      season.teams.set(item.teamId, item.teamName);
      season.classes.add(item.classCode);
      if (item.status !== 'not-started') season.starts += 1;
      if (item.status === 'classified' && Number(item.classPosition) === 1) season.wins += 1;
      if (item.status === 'classified' && Number(item.classPosition) >= 1 && Number(item.classPosition) <= 3) season.podiums += 1;
    });
    return [...seasons.values()].sort((left, right) => left.year - right.year);
  }

  function bindWecCarTimeline() {
    const timeline = document.querySelector('.wec-car-career-timeline');
    const previous = document.getElementById('wec-car-timeline-previous');
    const next = document.getElementById('wec-car-timeline-next');
    if (!timeline) return;
    const update = () => {
      previous.disabled = timeline.scrollLeft <= 2;
      next.disabled = timeline.scrollLeft + timeline.clientWidth >= timeline.scrollWidth - 2;
    };
    previous.addEventListener('click', () => timeline.scrollBy({ left: -Math.max(230, timeline.clientWidth * .8), behavior: 'smooth' }));
    next.addEventListener('click', () => timeline.scrollBy({ left: Math.max(230, timeline.clientWidth * .8), behavior: 'smooth' }));
    timeline.addEventListener('scroll', update, { passive: true });
    update();
  }

  function renderWecCarConnections(data) {
    const countRows = (rows, idField, nameField) => {
      const values = new Map();
      rows.forEach(item => {
        if (!item[idField]) return;
        const row = values.get(item[idField]) || { id: item[idField], name: item[nameField], count: 0 };
        row.count += 1;
        values.set(item[idField], row);
      });
      return [...values.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)).slice(0, 6);
    };
    const related = (data.relatedCars || []).slice(0, 6);
    const target = document.getElementById('wec-car-connections');
    target.setAttribute('aria-busy', 'false');
    target.innerHTML = `<a class="wec-car-manufacturer-card" href="${entityPath('manufacturers', data.entity.manufacturerId)}"><span>Constructor / marque</span><strong>${esc(data.entity.manufacturerName)}</strong><small>${flag(data.entity.countryCode, data.entity.countryName)}${esc(data.entity.countryName || '')}</small></a>`
      + wecConnectionList('Teams', countRows(data.appearances, 'teamId', 'teamName'), 'teams', 'entry')
      + wecConnectionList('Drivers', countRows(data.crew, 'driverId', 'driverName'), 'drivers', 'entry')
      + `<article><span>Related cars</span><ol>${related.length ? related.map(car => `<li><a href="${entityPath('car-models', car.id)}">${esc(car.name)}</a><strong>${esc(wecProfileClassLabel(car.regulation))}</strong></li>`).join('') : '<li class="empty-state">No related models</li>'}</ol></article>`;
  }

  function renderWecCarResults(data) {
    const state = { search: '', season: '', team: '', outcome: 'all', page: 1 };
    const pageSize = 12;
    const seasons = [...new Set(data.appearances.map(item => item.year))].sort((left, right) => right - left);
    const teams = [...new Map(data.appearances.map(item => [item.teamId, item.teamName])).entries()].sort((left, right) => left[1].localeCompare(right[1]));
    document.getElementById('wec-car-result-season').innerHTML = '<option value="">All seasons</option>' + seasons.map(year => `<option value="${year}">${year}</option>`).join('');
    document.getElementById('wec-car-result-team').innerHTML = '<option value="">All teams</option>' + teams.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
    const matchesOutcome = item => {
      if (state.outcome === 'overall-wins') return item.status === 'classified' && Number(item.overallPosition) === 1;
      if (state.outcome === 'class-wins') return item.status === 'classified' && Number(item.classPosition) === 1;
      if (state.outcome === 'podiums') return item.status === 'classified' && Number(item.classPosition) >= 1 && Number(item.classPosition) <= 3;
      if (state.outcome === 'retirements') return ['retired', 'not-classified', 'disqualified', 'excluded'].includes(item.status);
      if (state.outcome === 'le-mans') return wecIsLeMans(item);
      return true;
    };
    const filteredEvents = () => {
      const events = new Map();
      data.appearances.forEach(item => {
        const haystack = [item.eventName, item.teamName, item.carNumber, item.classCode, item.year].join(' ').toLowerCase();
        if (state.search && !haystack.includes(state.search)) return;
        if (state.season && String(item.year) !== state.season) return;
        if (state.team && item.teamId !== state.team) return;
        if (!matchesOutcome(item)) return;
        if (!events.has(item.eventId)) events.set(item.eventId, { ...item, entries: [] });
        events.get(item.eventId).entries.push(item);
      });
      return [...events.values()];
    };
    const paint = () => {
      const events = filteredEvents();
      const paged = pageItems(events, state.page, pageSize);
      state.page = paged.page;
      const target = document.getElementById('wec-car-results');
      const entryCount = events.reduce((total, event) => total + event.entries.length, 0);
      document.getElementById('wec-car-result-count').textContent = `${fmtNumber(events.length)} event${events.length === 1 ? '' : 's'} · ${fmtNumber(entryCount)} entr${entryCount === 1 ? 'y' : 'ies'}`;
      target.setAttribute('aria-busy', 'false');
      target.innerHTML = paged.items.length ? paged.items.map(event => {
        const eventUrl = `/wec/races/${encodeURIComponent(event.eventId)}/${slug(event.eventName)}`;
        return `<article class="wec-team-event-card"><header><span class="wec-round">${esc(String(event.round).padStart(2, '0'))}</span><div><small>${esc(event.year)} · ${esc(fmtDate(event.date))} · ${esc(wecProfileClassLabel(event.classCode))}</small><h3><a href="${eventUrl}">${esc(event.eventName)}</a></h3></div><strong>${fmtNumber(event.entries.length)} entr${event.entries.length === 1 ? 'y' : 'ies'}</strong></header><div class="wec-team-event-entries">${event.entries.map(item => {
          const outcome = appearanceOutcome(item);
          return `<div><b>#${esc(item.carNumber)}</b><span><small>${esc(wecProfileClassLabel(item.classCode))}</small><strong><a href="${entityPath('teams', item.teamId)}">${esc(item.teamName)}</a></strong></span><span class="wec-team-entry-outcome"><strong>${esc(outcome.primary)}</strong><small>${esc(outcome.secondary)}</small></span></div>`;
        }).join('')}</div></article>`;
      }).join('') : '<div class="wec-car-empty"><p class="eyebrow">NO MATCHES</p><h2>No races found</h2><p>Try another search, season, team or result.</p></div>';
      renderPagination('wec-car-results', events.length, state.page, pageSize, page => { state.page = page; paint(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    };
    const bind = (id, eventName, field, transform = value => value) => document.getElementById(id).addEventListener(eventName, event => { state[field] = transform(event.target.value); state.page = 1; paint(); });
    bind('wec-car-result-search', 'input', 'search', value => value.trim().toLowerCase());
    bind('wec-car-result-season', 'change', 'season');
    bind('wec-car-result-team', 'change', 'team');
    bind('wec-car-result-outcome', 'change', 'outcome');
    document.getElementById('wec-car-result-clear').addEventListener('click', () => {
      Object.assign(state, { search: '', season: '', team: '', outcome: 'all', page: 1 });
      ['wec-car-result-search', 'wec-car-result-season', 'wec-car-result-team'].forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('wec-car-result-outcome').value = 'all';
      paint();
    });
    paint();
  }

  function renderWecCarProfile(data) {
    const seasons = wecCarSeasons(data);
    const firstYear = seasons[0]?.year;
    const lastYear = seasons.at(-1)?.year;
    const classes = [...new Set(data.appearances.map(item => item.classCode))];
    document.getElementById('wec-generic-profile').hidden = true;
    document.getElementById('wec-driver-profile').hidden = true;
    document.getElementById('wec-team-profile').hidden = true;
    document.getElementById('wec-car-profile').hidden = false;
    const backLink = document.getElementById('wec-entity-back-link');
    backLink.innerHTML = '<span aria-hidden="true">←</span> All WEC cars';
    backLink.href = '/wec/cars';
    const returnPath = params().get('return');
    if (returnPath && (returnPath === '/wec/cars' || returnPath.startsWith('/wec/cars?'))) backLink.href = returnPath;
    const head = document.getElementById('wec-car-head');
    head.setAttribute('aria-busy', 'false');
    head.innerHTML = `<section class="detail-hero profile-hero driver-profile-hero wec-driver-profile-hero wec-car-profile-hero"><div class="profile-hero-copy"><div class="eyebrow">WEC CAR</div><h1>${esc(data.entity.name)}</h1><div class="detail-sub">${flag(data.entity.countryCode, data.entity.countryName)}<a href="${entityPath('manufacturers', data.entity.manufacturerId)}">${esc(data.entity.manufacturerName)}</a></div><div class="driver-profile-badges">${data.stats.overallWins ? '<strong>Overall race winner</strong>' : data.stats.classWins ? '<strong>Class winner</strong>' : ''}${classes.map(code => `<em>${esc(wecProfileClassLabel(code))}</em>`).join('')}</div><div class="profile-meta">${firstYear ? `<span>WEC record ${esc(firstYear)}–${esc(lastYear)}</span><span>${fmtNumber(seasons.length)} season${seasons.length === 1 ? '' : 's'}</span>` : ''}<span>${fmtNumber(data.stats.teams)} team${data.stats.teams === 1 ? '' : 's'} · ${fmtNumber(data.stats.drivers)} drivers</span></div></div></section>`;
    const stats = document.getElementById('wec-car-stats');
    stats.setAttribute('aria-busy', 'false');
    stats.innerHTML = [
      wecDriverStat('Race weekends', fmtNumber(data.stats.eventStarts), false, 'Distinct WEC events'),
      wecDriverStat('Entry starts', fmtNumber(data.stats.starts), false, 'Individual cars started'),
      wecDriverStat('Overall wins', fmtNumber(data.stats.overallWins), data.stats.overallWins > 0),
      wecDriverStat('Class wins', fmtNumber(data.stats.classWins), data.stats.classWins > 0),
      wecDriverStat('Class podiums', fmtNumber(data.stats.podiums)),
      wecDriverStat('Seasons', fmtNumber(data.stats.seasons), false, firstYear ? `${firstYear}–${lastYear}` : ''),
      wecDriverStat('Teams', fmtNumber(data.stats.teams)),
      wecDriverStat('Le Mans wins', fmtNumber(data.stats.leMansWins), data.stats.leMansWins > 0, 'Class victories')
    ].join('');
    document.getElementById('wec-car-career-span').textContent = firstYear ? `${firstYear}–${lastYear} · ${seasons.length} season${seasons.length === 1 ? '' : 's'}` : '';
    const timeline = document.getElementById('wec-car-seasons');
    timeline.setAttribute('aria-busy', 'false');
    timeline.innerHTML = seasons.length ? `<div class="career-timeline wec-car-career-timeline" role="list" aria-label="Car model record by season">${seasons.map((season, index) => `<a role="listitem" class="career-timeline-item driver-season-item${season.wins ? ' champion' : ''}" href="/wec/seasons/${encodeURIComponent(season.year)}"><div class="timeline-marker"><i></i></div><span class="timeline-year">${esc(wecSeasonLabel(season))}</span><strong>${fmtNumber(season.events.size)} event${season.events.size === 1 ? '' : 's'}</strong><small>${esc([...season.classes].map(wecProfileClassLabel).join(' · '))}</small><div class="timeline-context">${esc([...season.teams.values()].join(' · '))}</div><div class="driver-season-record"><span>${fmtNumber(season.starts)} starts</span><span>${fmtNumber(season.wins)} wins</span><span>${fmtNumber(season.podiums)} podiums</span></div>${index === 0 ? '<em>WEC debut season</em>' : index === seasons.length - 1 ? '<em>Latest recorded season</em>' : ''}</a>`).join('')}</div>` : '<div class="empty-state">No season history available.</div>';
    bindWecCarTimeline();
    renderWecCarConnections(data);
    renderWecCarResults(data);
  }

  function position(entry, activeClass) {
    const value = activeClass === 'overall' ? entry.overallPosition : entry.classPosition;
    return value === null ? '—' : String(value);
  }

  function renderClassification(entries, activeClass, sessionType) {
    const visible = activeClass === 'overall' ? entries : entries.filter(entry => entry.class.code === activeClass);
    if (!visible.length) return '<p class="empty-state">No classification is available for this view.</p>';
    return visible.map(entry => `<article class="wec-result-card" data-class-code="${esc(entry.class.code.toLowerCase())}">
      <strong class="wec-result-position">${esc(position(entry, activeClass))}</strong>
      <a class="wec-car-number" href="${entityPath('entries', entry.competitorId)}">#${esc(entry.carNumber)}</a>
      <div class="wec-result-identity"><small><span>${esc(entry.class.code)}</span> · <a href="${entityPath('manufacturers', entry.manufacturer.id)}">${esc(entry.manufacturer.name)}</a></small><h2><a href="${entityPath('teams', entry.team.id)}">${esc(entry.team.name)}</a></h2><p><a href="${entityPath('car-models', entry.carModel.id)}">${esc(entry.carModel.name)}</a></p><ul aria-label="Driver crew">${entry.crew.map(driver => `<li>${flag(driver.countryCode, driver.countryName)}<a href="${entityPath('drivers', driver.id)}">${esc(driver.name)}</a>${driver.category ? ` <span>${esc(driver.category)}</span>` : ''}</li>`).join('')}</ul></div>
      <dl><div><dt>Laps</dt><dd>${entry.laps === null ? '—' : esc(entry.laps)}</dd></div><div><dt>${sessionType === 'race' ? 'Time / gap' : 'Best lap / gap'}</dt><dd>${esc(entry.gap || (sessionType === 'race' ? entry.time : entry.bestLap) || '—')}</dd></div><div><dt>Status</dt><dd>${esc(entry.status || 'Classified')}</dd></div></dl>
    </article>`).join('');
  }

  async function loadHome() {
    const target = document.getElementById('wec-season-summary');
    try {
      const data = await getJSON('/api/wec/home');
      target.innerHTML = `<div><p class="eyebrow">${esc(data.season.year)} AT A GLANCE</p><h2><a href="/wec/seasons/${encodeURIComponent(data.season.year)}">${esc(data.season.name)}</a></h2></div><dl><div><dt>Archive</dt><dd>${fmtNumber(data.archiveSeasonCount)} seasons</dd></div><div><dt>Events</dt><dd>${fmtNumber(data.season.eventCount)}</dd></div><div><dt>Classes</dt><dd>${fmtNumber(data.season.classCount)}</dd></div></dl>`;
      const latestEvent = data.latestEvent;
      document.getElementById('wec-home-event').innerHTML = latestEvent ? renderEvents([latestEvent]) : '<p class="empty-state">No events are available.</p>';
      const featured = data.championships.filter(item => item.standings?.some(row => row.championshipWon)).slice(0, 4);
      document.getElementById('wec-home-leaders').innerHTML = featured.map(championship => {
        const champions = championship.standings.filter(row => row.championshipWon);
        const type = championship.entityType === 'driver' ? 'drivers' : championship.entityType === 'manufacturer' ? 'manufacturers' : championship.entityType === 'team' ? 'teams' : 'entries';
        return `<article><small>${esc(standingsLabel(championship))}</small><strong>${champions.map(row => `<a href="${entityPath(type, row.entityId)}">${row.carNumber ? `#${esc(row.carNumber)} ` : ''}${esc(row.entityName)}</a>`).join('<span> / </span>')}</strong><p>${esc(championship.name)}</p></article>`;
      }).join('');
    } catch (error) {
      target.innerHTML = `<p class="error-state">The WEC foundation has not been imported yet. Run <code>npm run import:wec</code> to publish it.</p>`;
    }
  }

  async function loadSeasons() {
    const target = document.getElementById('wec-seasons');
    try {
      const seasons = await getJSON('/api/wec/seasons');
      const search = document.getElementById('wec-season-search');
      const eraFilters = document.getElementById('wec-era-filters');
      const count = document.getElementById('wec-season-count');
      let era = 'all';
      const seasonEra = season => season.year >= 2021 ? 'hypercar' : season.year >= 2018 ? 'super' : 'lmp1';
      const eraLabel = value => value === 'hypercar' ? 'Hypercar era' : value === 'super' ? 'Super-season' : 'LMP1 era';
      const paint = () => {
        const query = search.value.trim().toLowerCase();
        const visible = seasons.filter(season => (era === 'all' || seasonEra(season) === era) && (!query || season.name.toLowerCase().includes(query) || String(season.year).includes(query)));
        count.textContent = `${fmtNumber(visible.length)} of ${fmtNumber(seasons.length)} seasons`;
        target.innerHTML = visible.length ? visible.map(season => `<a class="wec-season-card" href="/wec/seasons/${encodeURIComponent(season.year)}"><span>${esc(eraLabel(seasonEra(season)))}</span><h2>${esc(season.name)}</h2><p>${fmtNumber(season.eventCount)} events · ${fmtNumber(season.classCount)} classes</p><strong>Open season →</strong></a>`).join('') : '<p class="empty-state">No seasons match these filters.</p>';
      };
      search.addEventListener('input', paint);
      eraFilters.addEventListener('click', event => {
        const button = event.target.closest('button[data-era]');
        if (!button) return;
        era = button.dataset.era;
        eraFilters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        paint();
      });
      paint();
    } catch (error) {
      target.innerHTML = '<p class="error-state">The WEC archive could not be loaded.</p>';
    }
  }

  async function loadSeasonPage() {
    const match = window.location.pathname.match(/\/wec\/seasons\/(\d{4})/);
    const year = match?.[1];
    if (!year) return;
    try {
      const data = await loadSeason(year);
      document.title = `${data.season.name} · Racelytic`;
      document.querySelector('#wec-season-heading h1').textContent = data.season.name;
      document.getElementById('wec-coverage').innerHTML = `<strong>Archive coverage</strong><span>${esc(coverageMessage(data.coverage))}</span>`;
      document.getElementById('wec-classes').innerHTML = data.classes.map(item => `<article><span>${esc(item.code)}</span><strong>${esc(item.name)}</strong></article>`).join('');
      document.getElementById('wec-calendar').innerHTML = renderEvents(data.events);
      const filters = document.getElementById('wec-standing-filters');
      const target = document.getElementById('wec-standings');
      const roundSelect = document.getElementById('wec-standing-round');
      let selected = data.championships[0];
      let selectedRound = selected?.rounds.at(-1)?.round;
      filters.innerHTML = data.championships.map((item, index) => `<button type="button" data-championship="${esc(item.id)}" aria-pressed="${index === 0}">${esc(standingsLabel(item))}</button>`).join('');
      const paintStandings = () => {
        roundSelect.innerHTML = selected.rounds.map(item => `<option value="${esc(item.round)}"${item.round === Number(selectedRound) ? ' selected' : ''}>${esc(item.round)}</option>`).join('');
        target.innerHTML = renderStandings(selected, selectedRound);
      };
      paintStandings();
      filters.addEventListener('click', event => {
        const button = event.target.closest('button[data-championship]');
        if (!button) return;
        selected = data.championships.find(item => item.id === button.dataset.championship);
        selectedRound = selected.rounds.at(-1).round;
        filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        paintStandings();
      });
      roundSelect.addEventListener('change', () => { selectedRound = Number(roundSelect.value); paintStandings(); });
    } catch (error) {
      document.getElementById('wec-calendar').innerHTML = `<p class="error-state">${error.status === 404 ? 'This WEC season is not available.' : 'The WEC calendar could not be loaded.'}</p>`;
    }
  }

  async function loadRacePage() {
    const match = window.location.pathname.match(/\/wec\/races\/([^/]+)/);
    const eventId = match?.[1];
    if (!eventId) return;
    const target = document.getElementById('wec-classification');
    const sessionSelect = document.getElementById('wec-session-select');
    const filters = document.getElementById('wec-class-filters');
    let activeClass = 'overall';

    const paintSession = data => {
      const selectedSession = data.sessions.find(session => session.id === data.selectedSessionId);
      document.getElementById('wec-classification-title').textContent = selectedSession?.name || 'Classification';
      sessionSelect.value = data.selectedSessionId || '';
      if (!data.coverage.classifications) {
        document.getElementById('wec-session-summary').innerHTML = '';
        filters.innerHTML = '';
        target.innerHTML = '<p class="empty-state">No entry classification is available for this session.</p>';
        return;
      }
      const classCodes = [...new Set(data.classification.map(entry => entry.class.code))];
      if (activeClass !== 'overall' && !classCodes.includes(activeClass)) activeClass = 'overall';
      const leaders = data.classification.filter(entry => entry.classPosition === 1);
      const fastest = data.classification.filter(entry => entry.bestLapMillis).sort((left, right) => left.bestLapMillis - right.bestLapMillis)[0];
      document.getElementById('wec-session-summary').innerHTML = `${leaders.map(entry => `<a href="${entityPath('entries', entry.competitorId)}"><small>${esc(entry.class.code)} ${selectedSession?.type === 'race' ? 'winner' : 'leader'}</small><strong>#${esc(entry.carNumber)} ${esc(entry.team.name)}</strong></a>`).join('')}${fastest ? `<div><small>Fastest lap</small><strong>#${esc(fastest.carNumber)} · ${esc(fastest.bestLap)}</strong></div>` : ''}`;
      filters.innerHTML = [['overall', 'Overall'], ...classCodes.map(code => [code, code])].map(([value, label]) => `<button type="button" data-class="${esc(value)}" aria-pressed="${value === activeClass}">${esc(label)}</button>`).join('');
      target.innerHTML = renderClassification(data.classification, activeClass, selectedSession?.type);
      filters.onclick = event => {
        const button = event.target.closest('button[data-class]');
        if (!button) return;
        activeClass = button.dataset.class;
        filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        target.innerHTML = renderClassification(data.classification, activeClass, selectedSession?.type);
      };
    };

    const requestSession = async sessionId => {
      target.setAttribute('aria-busy', 'true');
      const query = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
      try {
        const data = await getJSON(`/api/wec/events/${encodeURIComponent(decodeURIComponent(eventId))}${query}`);
        paintSession(data);
        const url = new URL(window.location.href);
        if (sessionId) url.searchParams.set('session', sessionId); else url.searchParams.delete('session');
        window.history.replaceState({}, '', url);
      } catch (error) {
        target.innerHTML = '<p class="error-state">This session classification could not be loaded.</p>';
      } finally {
        target.removeAttribute('aria-busy');
      }
    };

    try {
      const requestedSession = new URLSearchParams(window.location.search).get('session');
      const data = await getJSON(`/api/wec/events/${encodeURIComponent(decodeURIComponent(eventId))}${requestedSession ? `?session=${encodeURIComponent(requestedSession)}` : ''}`);
      document.title = `${data.event.name} · WEC · Racelytic`;
      document.querySelector('#wec-race-heading h1').textContent = data.event.name;
      document.getElementById('wec-race-meta').textContent = `${fmtDate(data.event.date)} · ${data.event.circuitName} · ${data.event.placeName}`;
      document.getElementById('wec-race-circuit').innerHTML = `${circuitMap(data.event)}<div><p class="eyebrow">CIRCUIT</p><h2>${esc(data.event.circuitName)}</h2><p>${flag(data.event.countryCode, data.event.countryName)}${esc(data.event.placeName)} · ${esc(data.event.countryName)}</p><dl><div><dt>Length</dt><dd>${esc(data.event.length)} km</dd></div><div><dt>Turns</dt><dd>${esc(data.event.turns)}</dd></div><div><dt>Direction</dt><dd>${esc(circuitDirection(data.event.direction))}</dd></div></dl><p class="wec-circuit-links">${circuitLocationLink(data.event)}<a href="${esc(data.event.mapSourceUrl)}" target="_blank" rel="noopener noreferrer">Map source ↗</a></p></div>`;
      const backLink = document.querySelector('.back-link');
      backLink.href = `/wec/seasons/${encodeURIComponent(data.event.year)}`;
      backLink.textContent = `← ${data.event.year} season`;
      const navigation = document.getElementById('wec-race-navigation');
      navigation.innerHTML = `${data.navigation?.previous ? `<a href="/wec/races/${encodeURIComponent(data.navigation.previous.id)}/${slug(data.navigation.previous.name)}">← <span>Round ${esc(data.navigation.previous.round)}</span><strong>${esc(data.navigation.previous.name)}</strong></a>` : '<span></span>'}${data.navigation?.next ? `<a class="next" href="/wec/races/${encodeURIComponent(data.navigation.next.id)}/${slug(data.navigation.next.name)}"><span>Round ${esc(data.navigation.next.round)}</span><strong>${esc(data.navigation.next.name)}</strong> →</a>` : ''}`;
      sessionSelect.innerHTML = data.sessions.map(session => `<option value="${esc(session.id)}"${session.id === data.selectedSessionId ? ' selected' : ''}>${esc(session.name)}</option>`).join('');
      sessionSelect.addEventListener('change', () => requestSession(sessionSelect.value));
      paintSession(data);
    } catch (error) {
      target.innerHTML = `<p class="error-state">${error.status === 404 ? 'This WEC event is not available.' : 'The WEC classification could not be loaded.'}</p>`;
    }
  }

  async function loadEntityPage() {
    const match = window.location.pathname.match(/\/wec\/(drivers|teams|manufacturers|cars|car-models|entries)\/([^/]+)/);
    if (!match) return;
    const [, routeType, encodedId] = match;
    const type = routeType === 'cars' ? 'car-models' : routeType;
    const target = document.getElementById('wec-entity-history');
    if (type === 'drivers' || type === 'teams' || type === 'car-models') {
      document.getElementById('wec-generic-profile').hidden = true;
      document.getElementById(type === 'drivers' ? 'wec-driver-profile' : type === 'teams' ? 'wec-team-profile' : 'wec-car-profile').hidden = false;
    }
    try {
      const data = await getJSON(`/api/wec/entities/${type}/${encodeURIComponent(decodeURIComponent(encodedId))}`);
      const label = type === 'entries' ? `#${data.entity.carNumber} ${data.entity.name}` : data.entity.name;
      const profileLabels = { drivers: 'WEC DRIVER', teams: 'WEC TEAM', manufacturers: 'WEC MANUFACTURER', 'car-models': 'WEC CAR MODEL', entries: 'WEC ENTRY' };
      document.title = `${label} · WEC · Racelytic`;
      if (type === 'drivers') {
        renderWecDriverProfile(data);
        return;
      }
      if (type === 'teams') {
        renderWecTeamProfile(data);
        return;
      }
      if (type === 'car-models') {
        renderWecCarProfile(data);
        return;
      }
      document.querySelector('#wec-entity-heading .eyebrow').textContent = profileLabels[type] || 'WEC ARCHIVE PROFILE';
      document.querySelector('#wec-entity-heading h1').textContent = label;
      document.querySelector('#wec-entity-heading > p:last-child').innerHTML = type === 'entries' ? `<a href="${entityPath('manufacturers', data.entity.manufacturerId)}">${esc(data.entity.manufacturerName)}</a> · <a href="${entityPath('car-models', data.entity.carModelId)}">${esc(data.entity.carModelName)}</a>` : type === 'car-models' ? `${flag(data.entity.countryCode, data.entity.countryName)}<a href="${entityPath('manufacturers', data.entity.manufacturerId)}">${esc(data.entity.manufacturerName)}</a> · ${esc(data.entity.regulation)}` : `${flag(data.entity.countryCode, data.entity.countryName)}${esc(data.entity.countryName || `${type.slice(0, -1)} profile`)}`;
      document.getElementById('wec-entity-stats').innerHTML = `<dl><div><dt>Starts</dt><dd>${esc(data.stats.starts)}</dd></div><div><dt>Overall wins</dt><dd>${esc(data.stats.overallWins)}</dd></div><div><dt>Class wins</dt><dd>${esc(data.stats.classWins)}</dd></div><div><dt>Class podiums</dt><dd>${esc(data.stats.podiums)}</dd></div></dl>${data.championships.length ? `<div>${data.championships.map(item => `<p${item.championshipWon ? ' class="is-champion"' : ''}><strong>${esc(item.year)} · P${esc(item.position)} · ${esc(item.points)} pts</strong><span>${esc(item.name)}</span></p>`).join('')}</div>` : ''}`;
      const appearanceFilters = document.getElementById('wec-entity-filters');
      const classes = [...new Set(data.appearances.map(item => item.classCode))];
      let activeClass = 'all';
      const paintAppearances = () => {
        const rows = activeClass === 'all' ? data.appearances : data.appearances.filter(item => item.classCode === activeClass);
        target.innerHTML = rows.length ? rows.map(item => {
          const outcome = appearanceOutcome(item);
          return `<a class="wec-event-card wec-history-card" href="/wec/races/${encodeURIComponent(item.eventId)}/${slug(item.eventName)}"><span class="wec-round">${esc(String(item.round).padStart(2, '0'))}</span><div><small>${esc(item.year)} · ${esc(fmtDate(item.date))} · ${esc(item.classCode)}</small><h3>${esc(item.eventName)}</h3><p>#${esc(item.carNumber)} · ${esc(item.teamName)} · ${esc(item.carModelName)}</p></div><div class="wec-event-format"><strong>${esc(outcome.primary)}</strong><span>${esc(outcome.secondary)}</span></div></a>`;
        }).join('') : '<p class="empty-state">No appearances match this class.</p>';
      };
      appearanceFilters.innerHTML = [['all', 'All classes'], ...classes.map(item => [item, item])].map(([value, label]) => `<button type="button" data-class="${esc(value)}" aria-pressed="${value === activeClass}">${esc(label)}</button>`).join('');
      appearanceFilters.addEventListener('click', event => {
        const button = event.target.closest('button[data-class]');
        if (!button) return;
        activeClass = button.dataset.class;
        appearanceFilters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        paintAppearances();
      });
      paintAppearances();
    } catch (error) {
      const errorTarget = type === 'drivers' ? document.getElementById('wec-driver-head') : type === 'teams' ? document.getElementById('wec-team-head') : type === 'car-models' ? document.getElementById('wec-car-head') : target;
      errorTarget.setAttribute('aria-busy', 'false');
      errorTarget.innerHTML = `<p class="error-state">${error.status === 404 ? 'This WEC profile is not available.' : 'The WEC profile could not be loaded.'}</p>`;
    }
  }

  if (view === 'home') loadHome();
  if (view === 'seasons') loadSeasons();
  if (view === 'season') loadSeasonPage();
  if (view === 'race') loadRacePage();
  if (view === 'entity') loadEntityPage();
})();
