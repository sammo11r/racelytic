(function initialiseWecSeason() {
  const state = {
    data: null,
    seasonStandings: null,
    seasonStandingType: 'manufacturer',
    seasonStandingId: ''
  };

  const byId = id => document.getElementById(id);
  const slugify = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const entityPath = (type, id) => `/wec/${type}/${encodeURIComponent(id)}`;

  function seasonLabel(season) {
    if (season.id === 'wec-2018-2019' || /^2018[-–]2019/.test(season.name || '')) return '2018/19';
    if (season.id === 'wec-2019-2020' || /^2019[-–]2020/.test(season.name || '')) return '2019/20';
    return String(season.year);
  }

  function className(classId, championship = null) {
    const base = state.data.classes.find(item => item.id === classId)?.name || 'Overall';
    return championship?.id.includes('pro-am') ? `${base} Pro/Am` : base;
  }

  function titleLabel(championship) {
    if (championship.entityType === 'manufacturer') return 'Manufacturers';
    if (championship.entityType === 'team') return 'Teams';
    if (championship.entityType === 'competitor') return 'Teams';
    return 'Drivers';
  }

  function entityCollection(championship) {
    if (championship.entityType === 'driver') return 'drivers';
    if (championship.entityType === 'manufacturer') return 'manufacturers';
    if (championship.entityType === 'team') return 'teams';
    return 'entries';
  }

  function renderHeader() {
    const { season, navigation } = state.data;
    byId('wec-season-year').textContent = seasonLabel(season);
    byId('wec-season-name').textContent = season.name;
    document.title = `${season.name} · Racelytic`;
    const seasonLink = (item, direction) => item
      ? `<a class="${direction}" href="/wec/seasons/${encodeURIComponent(item.year)}"><span>${direction === 'previous' ? 'Previous season' : 'Next season'}</span><strong>${esc(seasonLabel(item))}</strong></a>`
      : '<span></span>';
    byId('wec-season-navigation').innerHTML = `${seasonLink(navigation.previous, 'previous')}${seasonLink(navigation.next, 'next')}`;
  }

  function renderChampions() {
    const showLeaders = state.data.season.status !== 'completed';
    const groups = new Map();
    state.data.championships.forEach(championship => {
      const honours = championship.standings.filter(row => showLeaders ? row.position === 1 : row.championshipWon);
      if (!honours.length) return;
      const category = className(championship.classId, championship);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push({ championship, honours });
    });
    const heading = byId('wec-champions-title');
    const eyebrow = heading.previousElementSibling;
    heading.textContent = showLeaders ? 'Current leaders by category' : 'Champions by category';
    eyebrow.textContent = showLeaders ? 'Championship leaders' : 'Season honours';
    byId('wec-champions').innerHTML = groups.size ? [...groups.entries()].map(([category, titles], index) => `
      <article class="wec-champion-card${index === 0 ? ' is-primary' : ''}">
        <div class="wec-champion-category"><span>${String(index + 1).padStart(2, '0')}</span><h3>${esc(category)}</h3></div>
        <dl>${titles.map(({ championship, honours }) => {
          const collection = entityCollection(championship);
          return `<div class="wec-champion-title wec-champion-title--${esc(championship.entityType)}"><dt>${esc(titleLabel(championship))}</dt><dd>${honours.map(row => `<a href="${entityPath(collection, row.entityId)}">${row.carNumber ? `<span>#${esc(row.carNumber)}</span>` : ''}${esc(row.entityName || row.entityId)}</a>`).join('<i> / </i>')}${showLeaders ? `<small>${esc(rowPoints(honours[0].points))} pts</small>` : ''}</dd></div>`;
        }).join('')}</dl>
      </article>`).join('') : `<p class="empty-state">${showLeaders ? 'Current championship leaders are not available yet.' : 'Official champions are not available for this season.'}</p>`;
  }

  function rowPoints(value) {
    const points = Number(value);
    return Number.isInteger(points) ? String(points) : points.toFixed(1).replace(/\.0$/, '');
  }

  function renderRaceResults(data) {
    const categoryHeadings = data.categories.map(category => `<th scope="col">${esc(category.name)} winners</th>`).join('');
    const rows = data.events.map(event => {
      const winners = new Map(event.winners.map(winner => [winner.categoryId, winner]));
      const winnerCells = data.categories.map(category => {
        const winner = winners.get(category.id);
        if (!winner) return '<td class="wec-race-winner is-empty">—</td>';
        return `<td class="wec-race-winner">
          <a class="wec-race-winning-team" href="${entityPath('entries', winner.competitorId)}"><span>#${esc(winner.carNumber)}</span>${esc(winner.team.name)}</a>
          <ul>${winner.crew.map(driver => `<li><a href="${entityPath('drivers', driver.id)}">${esc(driver.name)}</a></li>`).join('')}</ul>
        </td>`;
      }).join('');
      return `<tr>
        <td class="wec-race-round">${esc(event.round)}</td>
        <th scope="row" class="wec-race-circuit"><a href="/wec/races/${encodeURIComponent(event.id)}/${slugify(event.name)}">${esc(event.circuit.name)}</a><span>${esc(event.name)}</span></th>
        ${winnerCells}
      </tr>`;
    }).join('');
    byId('wec-race-results').innerHTML = `<table class="wec-race-results-table">
      <caption>Race-winning teams and drivers by championship category</caption>
      <thead><tr><th scope="col">Rd</th><th scope="col">Circuit</th>${categoryHeadings}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function standingsEventCode(event) {
    const known = { sebring: 'SEB', spa: 'SPA', 'le-mans': 'LMS', monza: 'MNZ', fuji: 'FUJ', bahrain: 'BHR', portimao: 'POR', silverstone: 'SIL', shanghai: 'SHA', cota: 'COTA', nurburgring: 'NÜR', mexico: 'MEX', imola: 'IMO', lusail: 'QAT', 'sao-paulo': 'SAO' };
    const source = slugify(`${event.name} ${event.circuitName} ${event.placeName || ''}`);
    const match = Object.keys(known).find(key => source.includes(key));
    return match ? known[match] : String(event.placeName || event.name).slice(0, 3).toUpperCase();
  }

  function standingResult(result) {
    if (!result) return { label: '—', className: 'is-absent', title: 'Did not participate' };
    const statuses = {
      retired: ['Ret', 'Retired'],
      'not-classified': ['NC', 'Not classified'],
      disqualified: ['DSQ', 'Disqualified'],
      excluded: ['EX', 'Excluded'],
      'not-started': ['DNS', 'Did not start']
    };
    if (result.status !== 'classified' && statuses[result.status]) {
      const [label, title] = statuses[result.status];
      return { label, title, className: `status-${result.status}` };
    }
    return { label: result.position || '—', title: result.position ? `Finished ${result.position} in class` : 'No classified result', className: result.position ? `position-${Math.min(result.position, 4)}` : 'is-absent' };
  }

  function selectedSeasonStanding() {
    return state.seasonStandings?.championships.find(item => item.id === state.seasonStandingId) || null;
  }

  function restoreSeasonStandingSelection() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('standings');
    const championshipId = params.get('championship');
    if (type === 'driver' || type === 'manufacturer' || type === 'team' || type === 'competitor') state.seasonStandingType = type;
    if (championshipId) state.seasonStandingId = championshipId;
  }

  function persistSeasonStandingSelection() {
    const url = new URL(window.location.href);
    url.searchParams.set('standings', state.seasonStandingType);
    url.searchParams.set('championship', state.seasonStandingId);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function renderSeasonStandingControls(resetChampionship = false) {
    const availableTypes = [...new Set(state.seasonStandings.championships.map(item => item.entityType))];
    if (!availableTypes.includes(state.seasonStandingType)) state.seasonStandingType = availableTypes[0] || 'manufacturer';
    const typeLabels = { driver: 'Drivers', manufacturer: 'Manufacturers', team: 'Team trophies', competitor: 'Team entries' };
    byId('wec-standings-types').innerHTML = availableTypes.map(type => `<button type="button" data-standing-type="${esc(type)}" aria-pressed="${type === state.seasonStandingType}">${esc(typeLabels[type] || type)}</button>`).join('');
    const titles = state.seasonStandings.championships.filter(item => item.entityType === state.seasonStandingType);
    if (resetChampionship || !titles.some(item => item.id === state.seasonStandingId)) state.seasonStandingId = titles[0]?.id || '';
    byId('wec-standings-championships').innerHTML = titles.map(item => `<button type="button" data-standing-championship="${esc(item.id)}" aria-pressed="${item.id === state.seasonStandingId}">${esc(item.label)}</button>`).join('');
  }

  function renderSeasonStandings() {
    const championship = selectedSeasonStanding();
    if (!championship) {
      byId('wec-season-standings').innerHTML = '<p class="empty-state">No standings are available.</p>';
      return;
    }
    const eventHeadings = state.seasonStandings.events.map(event => `<th scope="col" class="wec-standing-event" title="${esc(event.name)}"><span>${esc(standingsEventCode(event))}</span><small>R${esc(event.round)}</small></th>`).join('');
    const entityTypeLabel = { driver: 'Driver', manufacturer: 'Manufacturer', team: 'Team', competitor: 'Team entry' }[championship.entityType] || 'Entry';
    const entityCollection = { driver: 'drivers', manufacturer: 'manufacturers', team: 'teams', competitor: 'entries' }[championship.entityType] || 'teams';
    const rows = championship.standings.map(row => {
      const results = state.seasonStandings.events.map(event => {
        const result = standingResult(row.results[event.id]);
        return `<td class="wec-standing-result ${result.className}" title="${esc(result.title)}">${esc(result.label)}</td>`;
      }).join('');
      const entityName = championship.entityType === 'competitor'
        ? `${row.carNumber ? `<span class="wec-standing-car-number">#${esc(row.carNumber)}</span>` : ''}${esc(row.entityName || row.entityId)}`
        : esc(row.entityName || row.entityId);
      return `<tr>
        <td class="wec-standing-position">${esc(row.position)}</td>
        <th scope="row"><a href="${entityPath(entityCollection, row.entityId)}">${entityName}</a></th>
        ${championship.entityType === 'driver' ? `<td class="wec-standing-team">${esc(row.teamName || '—')}</td>` : ''}
        ${results}
        <td class="wec-standing-points">${esc(row.points)}</td>
      </tr>`;
    }).join('');
    byId('wec-season-standings').innerHTML = `<table class="wec-season-standings-table">
      <caption>${esc(championship.name)}</caption>
      <thead><tr><th scope="col">Pos</th><th scope="col">${entityTypeLabel}</th>${championship.entityType === 'driver' ? '<th scope="col">Team</th>' : ''}${eventHeadings}<th scope="col">Points</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function bindSeasonStandings() {
    byId('wec-standings-types').addEventListener('click', event => {
      const button = event.target.closest('button[data-standing-type]');
      if (!button) return;
      state.seasonStandingType = button.dataset.standingType;
      renderSeasonStandingControls(true);
      renderSeasonStandings();
      persistSeasonStandingSelection();
    });
    byId('wec-standings-championships').addEventListener('click', event => {
      const button = event.target.closest('button[data-standing-championship]');
      if (!button) return;
      state.seasonStandingId = button.dataset.standingChampionship;
      renderSeasonStandingControls();
      renderSeasonStandings();
      persistSeasonStandingSelection();
    });
  }

  async function load() {
    const match = window.location.pathname.match(/\/wec\/seasons\/(\d{4})/);
    if (!match) return;
    byId('wec-season-year').textContent = match[1];
    try {
      state.data = await getJSON(`/api/wec/seasons/${encodeURIComponent(match[1])}/header`);
      renderHeader();
      renderChampions();
    } catch (error) {
      const message = error.status === 404 ? 'This WEC season is not available.' : 'The WEC season could not be loaded.';
      byId('wec-champions').innerHTML = `<p class="error-state">${message}</p>`;
      return;
    }

    const standingsRequest = getJSON(`/api/wec/seasons/${encodeURIComponent(match[1])}/standings`)
      .then(data => {
        state.seasonStandings = data;
        restoreSeasonStandingSelection();
        renderSeasonStandingControls();
        renderSeasonStandings();
        bindSeasonStandings();
        persistSeasonStandingSelection();
      })
      .catch(() => { byId('wec-season-standings').innerHTML = '<p class="error-state">Standings could not be loaded.</p>'; });
    const resultsRequest = getJSON(`/api/wec/seasons/${encodeURIComponent(match[1])}/results`)
      .then(renderRaceResults)
      .catch(() => { byId('wec-race-results').innerHTML = '<p class="error-state">Race results could not be loaded.</p>'; });
    await Promise.allSettled([standingsRequest, resultsRequest]);
  }

  load();
})();
