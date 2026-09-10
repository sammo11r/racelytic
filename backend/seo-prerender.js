const { all: SERIES } = require('../frontend/js/series-config');
const constructorLineageView = require('../frontend/js/constructor-lineage-view');
const { baseConstructorColor, constructorTextColor } = require('../frontend/js/team-colors');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function formatNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? new Intl.NumberFormat('en').format(number) : '0';
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
    }).format(date);
}

function countryName(code) {
    if (!code) return '';
    try {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || '';
    } catch {
        return String(code).toUpperCase();
    }
}

function stat(label, value, highlight = false, note = '') {
    return `<div class="detail-stat${highlight ? ' highlight' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`;
}

function titleCase(value) {
    return String(value || '').toLowerCase().replace(/(^|[_\s-])\w/g, match => match.toUpperCase()).replaceAll('_', ' ');
}

function detailValue(label, value, suffix = '') {
    const display = value === null || value === undefined || value === '' ? '—' : `${formatNumber(value)}${suffix}`;
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(display)}</dd></div>`;
}

function driverLabels(seriesKey) {
    if (seriesKey === 'f1') return { title: 'World titles', champion: 'World champion', winner: 'Grand Prix winner' };
    const shortName = SERIES[seriesKey].shortName;
    return { title: `${shortName} titles`, champion: `${shortName} champion`, winner: 'Race winner' };
}

function renderDriverContent(html, initial) {
    const driver = initial.driver;
    const series = SERIES[initial.series];
    const labels = driverLabels(initial.series);
    const titles = Number(driver.totalChampionshipWins || 0);
    const wins = Number(driver.totalRaceWins || 0);
    const starts = Number(driver.totalRaceStarts || 0);
    const firstSeason = Number(driver.firstSeason || 0) || null;
    const lastSeason = Number(driver.lastSeason || 0) || null;
    const active = lastSeason && Number(lastSeason) === Number(driver.currentSeason);
    const nationality = driver.nationalityCountryName || countryName(driver.countryCode);
    const subtitle = initial.series === 'f1'
        ? `${escapeHtml(driver.fullName || driver.name)}${nationality ? ` · ${escapeHtml(nationality)}` : ''}`
        : escapeHtml(nationality);
    const metadata = [
        driver.dateOfBirth ? `Born ${formatDate(driver.dateOfBirth)}` : '',
        driver.placeOfBirth || '',
        driver.dateOfDeath ? `Died ${formatDate(driver.dateOfDeath)}` : '',
        firstSeason ? `${series.shortName} career ${firstSeason}–${lastSeason}` : '',
        driver.latestConstructorName ? `${active ? 'Current' : 'Latest'} constructor ${driver.latestConstructorName}` : ''
    ].filter(Boolean);
    const badge = titles
        ? `<strong>${titles > 1 ? `${formatNumber(titles)}× ` : ''}${escapeHtml(labels.champion)}</strong>`
        : wins ? `<strong>${escapeHtml(labels.winner)}</strong>` : '';
    const head = `<div id="driver-head" aria-busy="false"><section class="detail-hero profile-hero driver-profile-hero">
    <div class="profile-hero-copy">
      <h1>${escapeHtml(driver.name)}</h1>
      <div class="detail-sub">${subtitle}</div>
      <div class="driver-profile-badges">${badge}</div>
      <div class="profile-meta">${metadata.map(value => `<span>${escapeHtml(value)}</span>`).join('')}</div>
    </div>
    ${driver.permanentNumber || driver.latestNumber ? `<div class="profile-number" aria-label="${initial.series === 'f1' ? 'Permanent' : 'Latest'} number ${escapeHtml(driver.permanentNumber || driver.latestNumber)}">${escapeHtml(driver.permanentNumber || driver.latestNumber)}</div>` : ''}
  </section></div>`;
    const winRate = starts ? `${(wins / starts * 100).toFixed(1)}%` : '—';
    const stats = `<div id="driver-stats" class="detail-stat-grid driver-stat-grid" aria-busy="false">${[
        stat(labels.title, formatNumber(titles), titles > 0),
        stat('Race wins', formatNumber(wins), wins > 0),
        stat('Podiums', formatNumber(driver.totalPodiums)),
        stat('Pole positions', formatNumber(driver.totalPolePositions)),
        stat('Race starts', formatNumber(starts)),
        stat('Fastest laps', formatNumber(driver.totalFastestLaps)),
        stat('Career points', formatNumber(driver.totalPoints)),
        stat('Win rate', winRate, wins > 0, starts ? `${formatNumber(wins)} from ${formatNumber(starts)} starts` : '')
    ].join('')}</div>`;
    return html
        .replace(/<div id="driver-head" aria-busy="true">[\s\S]*?<\/section><\/div>/, head)
        .replace(/<div id="driver-stats" class="detail-stat-grid driver-stat-grid" aria-busy="true">(?:<div class="detail-stat driver-stat-skeleton"><\/div>){8}<\/div>/, stats);
}

function renderConstructorContent(html, initial) {
    const constructor = initial.constructor;
    const series = SERIES[initial.series];
    const titleLabel = initial.series === 'f1' ? 'Constructors’' : 'Teams’';
    const subtitle = [constructor.fullName && constructor.fullName !== constructor.name ? constructor.fullName : constructor.abbreviation,
        constructor.countryName || countryName(constructor.countryCode)].filter(Boolean).join(' · ');
    const years = constructor.firstYear
        ? Number(constructor.firstYear) === Number(constructor.lastYear) ? String(constructor.firstYear) : `${constructor.firstYear}–${constructor.lastYear}`
        : 'Years not recorded';
    const titles = Number(constructor.totalChampionshipWins || 0);
    const head = `<div id="constructor-head" aria-busy="false"><section class="detail-hero constructor-profile-hero"><div><h1>${escapeHtml(constructor.name)}</h1>
    ${subtitle ? `<p class="detail-sub">${escapeHtml(subtitle)}</p>` : ''}
    <div class="driver-profile-badges">${titles ? `<strong>${formatNumber(titles)}× ${titleLabel} champion</strong>` : ''}</div>
    <div class="profile-meta"><span>${escapeHtml(years)}</span><span>${formatNumber(constructor.seasons)} recorded season${Number(constructor.seasons) === 1 ? '' : 's'}</span></div></div></section></div>`;
    const stats = `<div id="constructor-stats" aria-busy="false"><dl class="constructor-stat-strip">${[
        detailValue(`${titleLabel} titles`, constructor.totalChampionshipWins), detailValue('Race starts', constructor.totalRaceStarts),
        detailValue('Race wins', constructor.totalRaceWins), detailValue('Podiums', constructor.totalPodiums),
        detailValue('Pole positions', constructor.totalPolePositions), detailValue('Career points', constructor.totalPoints)
    ].join('')}</dl></div>`;
    let rendered = html
        .replace(/<div id="constructor-head" aria-busy="true">[\s\S]*?<\/div><\/div>/, head)
        .replace(/<div id="constructor-stats" aria-busy="true">[\s\S]*?<\/div><\/div>/, stats);
    const segments = initial.lineage?.segments || [];
    if (initial.series === 'f1' && segments.length > 1) {
        const chart = constructorLineageView.chart(segments);
        const minimumWidth = Math.max(620, chart.items.length * 104);
        const lineage = `<section id="constructor-lineage" class="constructor-plain-section constructor-lineage-section" aria-labelledby="constructor-lineage-title">
    <header class="section-heading"><div><div class="eyebrow">IDENTITY</div><h2 id="constructor-lineage-title">Team history</h2></div></header>
    <div id="constructor-lineage-timeline"><div class="constructor-lineage-scroll"><div class="constructor-lineage-chart" style="min-width:${minimumWidth}px">
      <div class="constructor-lineage-bar" role="list" aria-label="Constructor identity by year">${chart.items.map(segment => {
        const color = baseConstructorColor(segment.constructorId), label = `${segment.name}, ${constructorLineageView.years(segment)}`;
        const content = `<span class="constructor-lineage-years">${escapeHtml(constructorLineageView.years(segment))}</span><span class="constructor-lineage-name">${escapeHtml(segment.name)}</span>`;
        return segment.current
            ? `<span class="constructor-lineage-segment current" data-lineage-segment role="listitem" aria-current="page" aria-label="${escapeHtml(label)}" style="--team-color:${color};--team-ink:${constructorTextColor(color)};--lineage-weight:${segment.span}">${content}</span>`
            : `<a class="constructor-lineage-segment" data-lineage-segment role="listitem" href="/constructors/${encodeURIComponent(segment.constructorId)}" aria-label="${escapeHtml(label)}" style="--team-color:${color};--team-ink:${constructorTextColor(color)};--lineage-weight:${segment.span}">${content}</a>`;
      }).join('')}</div>
    </div></div></div>${initial.lineage?.identityScope?.note ? `<p class="constructor-lineage-scope">${escapeHtml(initial.lineage.identityScope.note)}</p>` : ''}
  </section>`;
        rendered = rendered
            .replace('id="constructor-lineage-link" href="#constructor-lineage" hidden', 'id="constructor-lineage-link" href="#constructor-lineage"')
            .replace(/<section id="constructor-lineage"[\s\S]*?<\/section>/, lineage);
    }
    return rendered;
}

function renderCircuitContent(html, initial) {
    const circuit = initial.circuit;
    const base = initial.series === 'f1' ? '' : `/${initial.series}`;
    const place = [circuit.placeName, circuit.countryName].filter(Boolean).join(' · ');
    const metadata = [circuit.type ? `${titleCase(circuit.type)} circuit` : '', circuit.direction ? titleCase(circuit.direction) : ''].filter(Boolean);
    const length = circuit.layoutLength ?? circuit.length ?? (Number(circuit.lengthMeters) > 0 ? Number(circuit.lengthMeters) / 1000 : null);
    const turns = circuit.layoutTurns ?? circuit.turns;
    const map = circuit.layoutId
        ? `<img id="circuit-detail-map" src="/assets/circuits/${encodeURIComponent(circuit.layoutId)}.svg" width="320" height="190" alt="Track outline of ${escapeHtml(circuit.name)}" decoding="async">`
        : '<span>Layout unavailable</span>';
    const head = `<div id="circuit-head" aria-busy="false"><section class="detail-hero circuit-detail-hero"><div><h1>${escapeHtml(circuit.name)}</h1><p class="detail-sub">${escapeHtml(place)}</p><div class="circuit-detail-meta">${metadata.map(value => `<span>${escapeHtml(value)}</span>`).join('')}</div></div><figure>${map}<figcaption>Current / last recorded layout</figcaption></figure></section></div>`;
    const stats = `<div id="circuit-stats" class="circuit-facts"><dl>${[
        detailValue('Length', Number(length) > 0 ? length : null, ' km'), detailValue('Turns', Number(turns) > 0 ? turns : null),
        detailValue('Races hosted', circuit.totalRacesHeld),
        `<div><dt>First race</dt><dd>${escapeHtml(circuit.firstHeldYear || '—')}</dd></div>`,
        `<div><dt>Latest race</dt><dd>${escapeHtml(circuit.lastHeldYear || '—')}</dd></div>`
    ].join('')}</dl></div>`;
    return html
        .replace(/<div id="circuit-head" aria-busy="true">[\s\S]*?<\/div><\/div>/, head)
        .replace(/<div id="circuit-stats" class="circuit-facts">[\s\S]*?<\/div><\/div>/, stats)
        .replace(/(<a id="circuit-analysis-link"[^>]+href=")[^"]*(")/, `$1${base}/circuit-analysis?id=${encodeURIComponent(circuit.id)}$2`);
}

function replaceElementText(html, id, value) {
    return html.replace(new RegExp(`(<[^>]+id="${id}"[^>]*>)[^<]*(<\\/[^>]+>)`), `$1${escapeHtml(value)}$2`);
}

function renderSeasonContent(html, initial) {
    const prefix = initial.series === 'f1' ? 'season' : initial.series === 'f2' ? 'f2-season' : 'f3-season';
    const completed = Boolean(initial.completed);
    const labels = initial.series === 'f1'
        ? { first: completed ? 'World champion' : 'Championship leader', constructor: completed ? 'Constructors’ champion' : 'Leading constructor' }
        : { first: completed ? `${SERIES[initial.series].shortName} champion` : 'Championship leader', constructor: completed ? 'Teams’ champion' : 'Leading team' };
    const values = {
        [`${prefix}-year`]: initial.year,
        [`${prefix}-first-label`]: labels.first,
        [`${prefix}-first`]: initial.first?.name || '—',
        [`${prefix}-first-points`]: initial.first ? `${formatNumber(initial.first.points)} points` : '—',
        [`${prefix}-second`]: initial.second?.name || '—',
        [`${prefix}-second-points`]: initial.second ? `${formatNumber(initial.second.points)} points` : '—',
        [`${prefix}-third`]: initial.third?.name || '—',
        [`${prefix}-third-points`]: initial.third ? `${formatNumber(initial.third.points)} points` : '—',
        [`${prefix}-constructor-label`]: labels.constructor,
        [`${prefix}-constructor`]: initial.constructor?.name || '—',
        [`${prefix}-races`]: formatNumber(initial.races),
        [`${prefix}-laps`]: formatNumber(initial.laps)
    };
    return Object.entries(values).reduce((content, [id, value]) => replaceElementText(content, id, value), html);
}

function raceStatus(initial) {
    if (initial.hasResults) return 'completed';
    if (initial.inProgress) return 'in-progress';
    const date = initial.endDate || initial.date;
    const timestamp = date ? new Date(`${String(date).slice(0, 10)}T23:59:59Z`).getTime() : NaN;
    return Number.isFinite(timestamp) && timestamp >= Date.now() ? 'upcoming' : 'no-result';
}

function renderRaceContent(html, initial) {
    const race = initial.race;
    const series = SERIES[initial.series];
    const base = initial.series === 'f1' ? '' : `/${initial.series}`;
    const status = raceStatus(initial);
    const statusLabel = { completed: 'Completed', 'in-progress': 'Weekend in progress', upcoming: 'Upcoming', 'no-result': 'No result' }[status];
    const facts = initial.series === 'f1'
        ? [race.laps ? `${formatNumber(race.laps)} laps` : '', race.distance ? `${formatNumber(race.distance)} km` : '',
            race.courseLength ? `${formatNumber(Number(race.courseLength) > 100 ? Number(race.courseLength) / 1000 : race.courseLength)} km circuit` : '', race.turns ? `${formatNumber(race.turns)} turns` : '']
        : [race.sessionCount ? `${formatNumber(race.sessionCount)} sessions` : '', race.lengthMeters ? `${formatNumber(Number(race.lengthMeters) / 1000)} km circuit` : '',
            race.turns ? `${formatNumber(race.turns)} turns` : '', race.circuitType || '', race.direction || ''];
    const highlight = status === 'completed'
        ? `<span>Race winner</span><strong>${escapeHtml(initial.winnerName || 'Classification recorded')}</strong><small>${escapeHtml(initial.winnerConstructorName || '')}</small>`
        : status === 'in-progress'
            ? '<span>Latest available</span><strong>Weekend session</strong><small>Final race result pending</small>'
        : `<span>${status === 'upcoming' ? initial.series === 'f1' ? 'Race day' : 'Event date' : 'Event date'}</span><strong>${escapeHtml(formatDate(race.date))}</strong><small>${status === 'upcoming' ? initial.series === 'f1' ? 'Start time to be confirmed' : 'Race weekend ahead' : 'Classification unavailable'}</small>`;
    const id = initial.series === 'f1' ? 'race-head' : 'junior-race-head';
    const name = race.displayName || race.name;
    const head = `<section id="${id}" aria-busy="false"><div class="detail-hero race-detail-hero" data-status="${status}">
    <div class="race-detail-hero-copy"><div class="race-detail-kicker"><span class="race-status-badge ${status}">${statusLabel}</span><a href="${base}/seasons/${encodeURIComponent(race.year)}">Round ${escapeHtml(race.round)} · ${escapeHtml(race.year)}</a></div>
      <h1>${escapeHtml(name)}</h1>
      <div class="detail-sub"><a href="${base}/circuits/${encodeURIComponent(race.circuitId)}">${escapeHtml(race.circuitName || 'Circuit')}</a>${race.countryName || race.placeName ? ` · ${escapeHtml(race.countryName || race.placeName)}` : ''} · ${escapeHtml(formatDate(race.date))}</div>
      <div class="race-hero-facts">${facts.filter(Boolean).map(fact => `<span>${escapeHtml(fact)}</span>`).join('')}</div>
    </div><aside class="race-hero-highlight">${highlight}</aside>
  </div></section>`;
    return html.replace(new RegExp(`<section id="${id}" aria-busy="true">[\\s\\S]*?<\\/section>`), head);
}

function renderInitialSeoContent(html, initial) {
    if (!initial) return html;
    if (initial.kind === 'driver') return renderDriverContent(html, initial);
    if (initial.kind === 'constructor') return renderConstructorContent(html, initial);
    if (initial.kind === 'circuit') return renderCircuitContent(html, initial);
    if (initial.kind === 'season') return renderSeasonContent(html, initial);
    if (initial.kind === 'race') return renderRaceContent(html, initial);
    return html;
}

module.exports = { renderInitialSeoContent };
