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
    return `/wec/${type}/${encodeURIComponent(id)}`;
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
    const match = window.location.pathname.match(/\/wec\/(drivers|teams|manufacturers|car-models|entries)\/([^/]+)/);
    if (!match) return;
    const [, type, encodedId] = match;
    const target = document.getElementById('wec-entity-history');
    try {
      const data = await getJSON(`/api/wec/entities/${type}/${encodeURIComponent(decodeURIComponent(encodedId))}`);
      const label = type === 'entries' ? `#${data.entity.carNumber} ${data.entity.name}` : data.entity.name;
      document.title = `${label} · WEC · Racelytic`;
      document.querySelector('#wec-entity-heading h1').textContent = label;
      document.querySelector('#wec-entity-heading > p:last-child').innerHTML = type === 'entries' ? `<a href="${entityPath('manufacturers', data.entity.manufacturerId)}">${esc(data.entity.manufacturerName)}</a> · <a href="${entityPath('car-models', data.entity.carModelId)}">${esc(data.entity.carModelName)}</a>` : type === 'car-models' ? `${flag(data.entity.countryCode, data.entity.countryName)}<a href="${entityPath('manufacturers', data.entity.manufacturerId)}">${esc(data.entity.manufacturerName)}</a> · ${esc(data.entity.regulation)}` : `${flag(data.entity.countryCode, data.entity.countryName)}${esc(data.entity.countryName || `${type.slice(0, -1)} profile`)}`;
      document.getElementById('wec-entity-stats').innerHTML = `<dl><div><dt>Starts</dt><dd>${esc(data.stats.starts)}</dd></div><div><dt>Overall wins</dt><dd>${esc(data.stats.overallWins)}</dd></div><div><dt>Class wins</dt><dd>${esc(data.stats.classWins)}</dd></div><div><dt>Class podiums</dt><dd>${esc(data.stats.podiums)}</dd></div></dl>${data.championships.length ? `<div>${data.championships.map(item => `<p${item.championshipWon ? ' class="is-champion"' : ''}><strong>${esc(item.year)} · P${esc(item.position)} · ${esc(item.points)} pts</strong><span>${esc(item.name)}</span></p>`).join('')}</div>` : ''}`;
      const appearanceFilters = document.getElementById('wec-entity-filters');
      const classes = [...new Set(data.appearances.map(item => item.classCode))];
      let activeClass = 'all';
      const paintAppearances = () => {
        const rows = activeClass === 'all' ? data.appearances : data.appearances.filter(item => item.classCode === activeClass);
        target.innerHTML = rows.length ? rows.map(item => `<a class="wec-event-card wec-history-card" href="/wec/races/${encodeURIComponent(item.eventId)}/${slug(item.eventName)}"><span class="wec-round">${esc(String(item.round).padStart(2, '0'))}</span><div><small>${esc(item.year)} · ${esc(fmtDate(item.date))} · ${esc(item.classCode)}</small><h3>${esc(item.eventName)}</h3><p>#${esc(item.carNumber)} · ${esc(item.teamName)} · ${esc(item.carModelName)}</p></div><div class="wec-event-format"><strong>${item.classPosition ? `P${esc(item.classPosition)} class` : esc(item.status || 'Not classified')}</strong><span>${item.overallPosition ? `P${esc(item.overallPosition)} overall · ` : ''}${esc(item.laps)} laps</span></div></a>`).join('') : '<p class="empty-state">No appearances match this class.</p>';
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
      target.innerHTML = `<p class="error-state">${error.status === 404 ? 'This WEC profile is not available.' : 'The WEC profile could not be loaded.'}</p>`;
    }
  }

  if (view === 'home') loadHome();
  if (view === 'seasons') loadSeasons();
  if (view === 'season') loadSeasonPage();
  if (view === 'race') loadRacePage();
  if (view === 'entity') loadEntityPage();
})();
