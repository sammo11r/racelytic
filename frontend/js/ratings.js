const ratingNames = { f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy' };
const ratingColours = ['#e32636', '#1677ff', '#8b5cf6', '#d97706'];
const defaultComparisonDrivers = ['max-verstappen', 'charles-leclerc', 'lando-norris', 'george-russell'];
const ratingViews = { '/ratings/leaderboard': 'leaderboard', '/ratings/compare': 'compare', '/ratings/driver': 'driver' };
const ratingView = ratingViews[location.pathname] || 'overview';
const ratingPagePath = ratingView === 'overview' ? '/ratings' : location.pathname;
const ratingState = { series: 'f1', model: 'competitive', year: '', eventId: '', ratingEvents: [], timelineLevel: 'season', minEvents: 3, order: 'current', latestYear: null, leaderboardPage: 1, leaderboardPageSize: 50, chartScale: 'calendar', showUncertainty: false, profileSeason: '', profileTeam: '', profileImpact: '', profilePage: 1, profilePageSize: 10, profileHistory: null, leaderboard: [], selected: [], histories: new Map(), active: '', request: 0 };
if (window.matchMedia('(max-width: 680px)').matches) {
  ratingState.leaderboardPageSize = 10;
}
const ratingElements = {
  year: document.getElementById('ratings-year'), minEvents: document.getElementById('ratings-min-events'),
  order: [...document.querySelectorAll('[data-ratings-order]')], status: document.getElementById('ratings-status'),
  content: document.getElementById('ratings-content'), table: document.getElementById('ratings-table-body'),
  legend: document.getElementById('ratings-legend'), chart: document.getElementById('ratings-chart'),
  summary: document.getElementById('ratings-driver-summary'),
  events: document.getElementById('ratings-events-list'), updated: document.getElementById('ratings-updated'),
  timeline: document.getElementById('ratings-timeline'), timelineRange: document.getElementById('ratings-timeline-range'),
  timelineStart: document.getElementById('ratings-timeline-start'), timelineSpan: document.getElementById('ratings-timeline-span'), timelineEnd: document.getElementById('ratings-timeline-end'),
  timelineEvent: document.getElementById('ratings-timeline-event'), timelineMeta: document.getElementById('ratings-timeline-meta'),
  timelinePrevious: document.getElementById('ratings-timeline-previous'), timelineNext: document.getElementById('ratings-timeline-next'),
  timelineLatest: document.getElementById('ratings-timeline-latest'), timelineBack: document.getElementById('ratings-timeline-back'),
  timelineZoom: document.getElementById('ratings-timeline-zoom'), timelineLabel: document.getElementById('ratings-timeline-label'),
  compareSlots: document.getElementById('ratings-compare-slots'), driverSearch: document.getElementById('ratings-driver-search'),
  driverResults: document.getElementById('ratings-driver-results'), compareSummary: document.getElementById('ratings-compare-summary'),
  chartScale: [...document.querySelectorAll('[data-ratings-chart-scale]')], uncertaintyToggle: document.getElementById('ratings-uncertainty-toggle'),
  profileIdentity: document.getElementById('ratings-profile-identity'), profileSearch: document.getElementById('ratings-profile-search'),
  profileResults: document.getElementById('ratings-profile-results'), profileSummary: document.getElementById('ratings-profile-summary'),
  profileHighlights: document.getElementById('ratings-profile-highlights'), profileSeason: document.getElementById('ratings-profile-season'),
  profileTeam: document.getElementById('ratings-profile-team'), profileImpact: document.getElementById('ratings-profile-impact'),
  model: document.getElementById('ratings-model'), modelControl: document.getElementById('ratings-model-control')
};

function ratingChange(value) {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${number.toFixed(1)}`;
}

function ratingDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function ratingDestination(path, extra = {}) {
  const query = new URLSearchParams({ series: ratingState.series });
  if (ratingState.model === 'team-adjusted') query.set('model', ratingState.model);
  Object.entries(extra).forEach(([key, value]) => { if (value) query.set(key, value); });
  return `${path}?${query}`;
}

function ratingBoardTitle(data) {
  if (ratingState.order === 'peak') return ratingState.year ? `Peaks through ${ratingState.year}` : 'All-time peaks';
  if (ratingState.timelineLevel === 'event' && data.selectedEvent?.name) return `Order after ${data.selectedEvent.name}`;
  if (ratingState.year && !isLatestRatingEvent()) return `Order after the ${ratingState.year} season`;
  return 'Current order';
}

function ratingUrl() {
  const query = new URLSearchParams({ series: ratingState.series });
  if (ratingState.model === 'team-adjusted') query.set('model', ratingState.model);
  if (ratingView === 'leaderboard') {
    if (ratingState.timelineLevel === 'event') {
      if (ratingState.year) query.set('year', ratingState.year);
      if (ratingState.eventId) query.set('event', ratingState.eventId);
      query.set('timeline', 'events');
    } else if (!isLatestRatingEvent() && ratingState.year) {
      query.set('year', ratingState.year);
    }
    if (ratingState.minEvents !== 3) query.set('minEvents', String(ratingState.minEvents));
  }
  if (ratingView === 'leaderboard' && ratingState.order === 'peak') query.set('order', 'peak');
  if (ratingState.selected.length) query.set('drivers', ratingState.selected.join(','));
  if (ratingView === 'driver') {
    query.delete('drivers');
    if (ratingState.selected.length) query.set('driver', ratingState.selected.at(-1));
  }
  history.replaceState(null, '', `${ratingPagePath}?${query}`);
}

function readRatingUrl() {
  const query = new URLSearchParams(location.search);
  ratingState.series = Object.hasOwn(ratingNames, query.get('series')) ? query.get('series') : 'f1';
  ratingState.model = ratingState.series === 'f1' && query.get('model') === 'team-adjusted' ? 'team-adjusted' : 'competitive';
  ratingState.year = ratingView === 'leaderboard' && /^\d{4}$/.test(query.get('year') || '') ? query.get('year') : '';
  ratingState.eventId = ratingView === 'leaderboard' ? String(query.get('event') || '').slice(0, 255) : '';
  ratingState.timelineLevel = ratingView === 'leaderboard' && ratingState.eventId ? 'event' : 'season';
  const requestedMinEvents = Number(query.get('minEvents'));
  ratingState.minEvents = ratingView === 'compare' || ratingView === 'driver'
    ? 1
    : [1, 3, 10, 25].includes(requestedMinEvents) ? requestedMinEvents : 3;
  ratingState.order = ratingView === 'leaderboard' && query.get('order') === 'peak' ? 'peak' : 'current';
  const selected = ratingView === 'driver' ? query.get('driver') || '' : query.get('drivers') || '';
  ratingState.selected = selected.split(',').filter(Boolean).slice(0, ratingView === 'driver' ? 1 : 4);
  if (ratingView === 'compare' && ratingState.series === 'f1' && !ratingState.selected.length) {
    ratingState.selected = [...defaultComparisonDrivers];
  }
  ratingElements.minEvents.value = String(ratingState.minEvents);
  if (ratingElements.model) ratingElements.model.value = ratingState.model;
}

function applyRatingSeriesTheme() {
  if (ratingState.series !== 'f1') ratingState.model = 'competitive';
  if (ratingElements.model) ratingElements.model.value = ratingState.model;
  if (ratingElements.modelControl) ratingElements.modelControl.hidden = ratingState.series !== 'f1';
  document.body.classList.toggle('f2-mode', ratingState.series === 'f2');
  document.body.classList.toggle('f3-mode', ratingState.series === 'f3');
  document.body.classList.toggle('academy-mode', ratingState.series === 'academy');
  document.body.dataset.series = ratingState.series;
  const help = document.getElementById('ratings-model-help');
  if (help) help.textContent = ratingState.model === 'team-adjusted'
    ? 'Beta model combining persistent driver and constructor estimates; it is not a pure talent score.'
    : 'Competitive measures recorded results against the field, including car, strategy and reliability.';
}

function configureRatingView() {
  if (ratingView === 'overview') return;
  document.body.dataset.ratingsView = ratingView;
  const content = {
    leaderboard: ['RATINGS LEADERBOARD', `${ratingNames[ratingState.series]} ratings`, 'See the current order at any point in history, or rank every eligible driver by the highest rating they reached.'],
    compare: ['DRIVER COMPARISON', 'Compare drivers.', 'Plot up to four rating trajectories across calendar time or equivalent career stages.'],
    driver: ['RATING PROFILE', 'Driver rating profile.', 'Follow one driver through every rated event, career landmark and change in competitive strength.']
  }[ratingView];
  document.getElementById('ratings-hero-eyebrow').textContent = content[0];
  document.getElementById('ratings-hero-title').innerHTML = content[1];
  document.getElementById('ratings-hero-intro').textContent = content[2];
  if (ratingView === 'leaderboard') {
    ratingElements.timeline.hidden = false;
  }
  if (ratingView === 'compare') document.getElementById('ratings-controls').hidden = true;
  if (ratingView === 'driver') document.getElementById('ratings-controls').hidden = true;
  const boardHint = document.querySelector('.ratings-board-hint');
  if (boardHint) boardHint.textContent = ratingView === 'driver' ? 'Select one driver to inspect' : ratingView === 'compare' ? 'Select up to four drivers' : 'Select a season above';
}

function renderRatingTable() {
  if (ratingView === 'compare' || ratingView === 'driver') {
    ratingElements.table.replaceChildren();
    return;
  }
  const paged = ratingView === 'leaderboard'
    ? pageItems(ratingState.leaderboard, ratingState.leaderboardPage, ratingState.leaderboardPageSize)
    : { items: ratingState.leaderboard, page: 1 };
  ratingState.leaderboardPage = paged.page;
  ratingElements.table.innerHTML = paged.items.map(driver => {
    const selectedIndex = ratingState.selected.indexOf(driver.driverId);
    const colour = selectedIndex >= 0 ? ratingColours[selectedIndex] : '#c4c8cf';
    const changeClass = driver.change > 0 ? 'positive' : driver.change < 0 ? 'negative' : '';
    const selectable = ratingView !== 'leaderboard';
    const rowAttributes = selectable
      ? ` tabindex="0" role="button" aria-pressed="${selectedIndex >= 0}" data-driver-id="${esc(driver.driverId)}" class="${selectedIndex >= 0 ? 'selected' : ''}" style="--driver-color:${colour}"`
      : '';
    const marker = selectable ? '<i class="ratings-driver-dot"></i>' : '';
    const ratingClass = ratingView !== 'leaderboard' || ratingState.order === 'current' ? ' class="ratings-value"' : '';
    const peakClass = ratingView === 'leaderboard' && ratingState.order === 'peak' ? ' class="ratings-value"' : '';
    const context = driver.components ? `${driver.constructorName || 'Team'} · driver ${Math.round(driver.components.driverRating)} · team ${ratingChange(driver.components.constructorRating)}` : driver.constructorName || driver.lastEvent.name;
    const profileUrl = ratingDestination('/ratings/driver', { driver: driver.driverId });
    const compareUrl = ratingDestination('/ratings/compare', { drivers: driver.driverId });
    return `<tr${rowAttributes}><td data-label="Rank">${driver.rank}</td><td data-label="Driver"><span class="ratings-driver">${marker}<span><a class="ratings-driver-link" href="${profileUrl}">${esc(driver.driverName)}</a><small>${esc(context)}</small><span class="ratings-row-actions"><a href="${profileUrl}">Profile</a><a href="${compareUrl}">Compare</a></span></span></span></td><td data-label="Rating"${ratingClass}>${Math.round(driver.rating)}</td><td data-label="Evidence" class="ratings-uncertainty-column"><span class="ratings-uncertainty"><strong>${esc(driver.uncertaintyLabel)}</strong><small>±${Math.round(driver.uncertainty)}</small></span></td><td data-label="Peak"${peakClass}>${Math.round(driver.peakRating)}</td><td data-label="Events">${driver.events}</td><td data-label="Last change" class="ratings-change ${changeClass}">${ratingChange(driver.change)}</td></tr>`;
  }).join('');
  if (ratingView === 'leaderboard') {
    renderPagination('ratings-board', ratingState.leaderboard.length, paged.page, ratingState.leaderboardPageSize, nextPage => {
      ratingState.leaderboardPage = nextPage;
      renderRatingTable();
      document.getElementById('ratings-board').scrollIntoView({ behavior: 'smooth', block: 'start' });
      requestAnimationFrame(() => document.querySelector('#ratings-board-pagination [aria-current="page"]')?.focus({ preventScroll: true }));
    });
    return;
  }
  ratingElements.table.querySelectorAll('tr[data-driver-id]').forEach(row => {
    const choose = () => toggleRatingDriver(row.dataset.driverId);
    row.addEventListener('click', choose);
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
  });
}

function currentRatingOrder() {
  const latestYear = ratingState.latestYear || Math.max(...ratingState.leaderboard
    .map(driver => Number(driver.lastEvent?.year))
    .filter(Number.isFinite));
  if (!Number.isFinite(latestYear)) return [];
  return ratingState.leaderboard
    .filter(driver => Number(driver.lastEvent?.year) === latestYear)
    .sort((a, b) => b.rating - a.rating || a.driverName.localeCompare(b.driverName));
}

function renderComparePicker() {
  if (ratingView !== 'compare') return;
  const selectedDrivers = ratingState.selected
    .map(id => ratingState.leaderboard.find(driver => driver.driverId === id) || cachedRatingDriver(id))
    .filter(Boolean);
  const slotCount = Math.min(4, Math.max(2, selectedDrivers.length + (selectedDrivers.length < 4 ? 1 : 0)));
  ratingElements.compareSlots.innerHTML = Array.from({ length: slotCount }, (_, index) => {
    const driver = selectedDrivers[index];
    if (!driver) return `<button class="ratings-compare-slot empty" type="button" data-open-driver-picker><span>0${index + 1}</span><strong>${index < 2 ? 'Choose driver' : 'Add driver'}</strong><small>Search the rated field</small></button>`;
    return `<article class="ratings-compare-slot selected" style="--driver-color:${ratingColours[index]}"><span>0${index + 1}</span><div><strong>${esc(driver.driverName)}</strong><small>${esc(driver.constructorName || driver.lastEvent?.name || '')}</small></div><b>${Math.round(driver.rating)}</b><button type="button" data-remove-driver="${esc(driver.driverId)}" aria-label="Remove ${esc(driver.driverName)}">×</button></article>`;
  }).join('');
  ratingElements.compareSlots.querySelectorAll('[data-open-driver-picker]').forEach(button => button.addEventListener('click', () => {
    ratingElements.driverSearch.focus();
    renderDriverResults();
  }));
  ratingElements.compareSlots.querySelectorAll('[data-remove-driver]').forEach(button => button.addEventListener('click', () => toggleRatingDriver(button.dataset.removeDriver)));
  ratingElements.driverSearch.disabled = selectedDrivers.length >= 4;
  ratingElements.driverSearch.placeholder = selectedDrivers.length >= 4 ? 'Four drivers selected' : 'Search by driver or team…';
  if (selectedDrivers.length >= 4) closeDriverResults();
}

function cachedRatingDriver(driverId) {
  const history = [...ratingState.histories.values()].find(item => item?.driver?.id === driverId);
  const latest = history?.timeline?.at(-1);
  if (!history || !latest) return null;
  return {
    driverId, driverName: history.driver.name, constructorName: latest.constructorName,
    rating: history.summary.currentRating, peakRating: history.summary.peakRating,
    lastEvent: { name: latest.eventName }
  };
}

function closeDriverResults() {
  ratingElements.driverResults.hidden = true;
  ratingElements.driverSearch.setAttribute('aria-expanded', 'false');
}

function renderDriverResults() {
  if (ratingView !== 'compare' || ratingElements.driverSearch.disabled) return;
  const term = ratingElements.driverSearch.value.trim().toLocaleLowerCase();
  const candidates = ratingState.leaderboard
    .filter(driver => !ratingState.selected.includes(driver.driverId))
    .filter(driver => !term || `${driver.driverName} ${driver.constructorName || ''}`.toLocaleLowerCase().includes(term))
    .sort((a, b) => b.rating - a.rating || a.driverName.localeCompare(b.driverName))
    .slice(0, 10);
  ratingElements.driverResults.innerHTML = candidates.map(driver => `<button type="button" role="option" data-pick-driver="${esc(driver.driverId)}"><span><strong>${esc(driver.driverName)}</strong><small>${esc(driver.constructorName || driver.lastEvent?.name || 'Rated driver')}</small></span><span><b>${Math.round(driver.rating)}</b><small>peak ${Math.round(driver.peakRating)}</small></span></button>`).join('')
    || '<p>No matching drivers found.</p>';
  ratingElements.driverResults.hidden = false;
  ratingElements.driverSearch.setAttribute('aria-expanded', 'true');
  ratingElements.driverResults.querySelectorAll('[data-pick-driver]').forEach(button => button.addEventListener('click', async () => {
    ratingElements.driverSearch.value = '';
    closeDriverResults();
    await toggleRatingDriver(button.dataset.pickDriver);
  }));
  wireResultKeyboard(ratingElements.driverResults, ratingElements.driverSearch);
}

function wireResultKeyboard(results, search) {
  const buttons = [...results.querySelectorAll('button')];
  buttons.forEach((button, index) => button.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); search.focus(); results.hidden = true; search.setAttribute('aria-expanded', 'false'); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }));
}

function closeProfileResults() {
  ratingElements.profileResults.hidden = true;
  ratingElements.profileSearch.setAttribute('aria-expanded', 'false');
}

function renderProfileResults() {
  if (ratingView !== 'driver') return;
  const term = ratingElements.profileSearch.value.trim().toLocaleLowerCase();
  const candidates = ratingState.leaderboard
    .filter(driver => !term || `${driver.driverName} ${driver.constructorName || ''}`.toLocaleLowerCase().includes(term))
    .sort((a, b) => b.rating - a.rating || a.driverName.localeCompare(b.driverName))
    .slice(0, 10);
  ratingElements.profileResults.innerHTML = candidates.map(driver => `<button type="button" role="option" data-profile-driver="${esc(driver.driverId)}"><span><strong>${esc(driver.driverName)}</strong><small>${esc(driver.constructorName || driver.lastEvent?.name || 'Rated driver')}</small></span><span><b>${Math.round(driver.rating)}</b><small>peak ${Math.round(driver.peakRating)}</small></span></button>`).join('')
    || '<p>No matching drivers found.</p>';
  ratingElements.profileResults.hidden = false;
  ratingElements.profileSearch.setAttribute('aria-expanded', 'true');
  ratingElements.profileResults.querySelectorAll('[data-profile-driver]').forEach(button => button.addEventListener('click', async () => {
    ratingElements.profileSearch.value = '';
    closeProfileResults();
    ratingState.selected = [button.dataset.profileDriver];
    ratingState.active = button.dataset.profileDriver;
    ratingState.profileSeason = '';
    ratingState.profileTeam = '';
    ratingState.profileImpact = '';
    ratingState.profilePage = 1;
    renderRatingTable();
    ratingUrl();
    await renderRatingDetails();
  }));
  wireResultKeyboard(ratingElements.profileResults, ratingElements.profileSearch);
}

async function ratingHistory(driverId) {
  const key = `${ratingState.series}:${ratingState.model}:${ratingState.year || 'all'}:${driverId}`;
  if (ratingState.histories.has(key)) return ratingState.histories.get(key);
  const query = new URLSearchParams({ series: ratingState.series });
  if (ratingState.model === 'team-adjusted') query.set('model', ratingState.model);
  if (ratingState.year) query.set('toYear', ratingState.year);
  const response = await fetch(`/api/ratings/${encodeURIComponent(driverId)}?${query}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Rating history unavailable');
  const data = await response.json();
  ratingState.histories.set(key, data);
  return data;
}

async function toggleRatingDriver(driverId) {
  const index = ratingState.selected.indexOf(driverId);
  if (index >= 0) ratingState.selected.splice(index, 1);
  else if (ratingState.selected.length < (ratingView === 'driver' ? 1 : 4)) ratingState.selected.push(driverId);
  else return;
  ratingState.active = ratingState.selected.includes(ratingState.active) ? ratingState.active : ratingState.selected.at(-1) || '';
  renderRatingTable();
  renderComparePicker();
  ratingUrl();
  await renderRatingDetails();
}

function chartSvg(histories) {
  const careerScale = ratingState.chartScale === 'career';
  const prepared = histories.map(item => ({
    ...item,
    points: item.history.timeline.map((event, index) => ({
      event, index, xValue: careerScale ? index : new Date(event.date).getTime()
    }))
  }));
  const points = prepared.flatMap(item => item.points);
  if (!points.length) return '<p>No rating history is available for this selection.</p>';
  const compactChart = window.matchMedia('(max-width: 680px)').matches;
  const width = Math.max(compactChart ? 340 : 680, Math.round(ratingElements.chart.clientWidth - (compactChart ? 14 : 32)));
  const height = compactChart ? 340 : 400;
  const left = 50, right = 116, top = 24, bottom = 40;
  let minX = Math.min(...points.map(point => point.xValue));
  let maxX = Math.max(...points.map(point => point.xValue));
  if (minX === maxX) maxX += careerScale ? 1 : 86400000;
  let minY = Math.floor((Math.min(1500, ...points.map(point => Number.isFinite(point.event.ratingRange?.low) ? point.event.ratingRange.low : point.event.rating)) - 20) / 50) * 50;
  let maxY = Math.ceil((Math.max(1500, ...points.map(point => Number.isFinite(point.event.ratingRange?.high) ? point.event.ratingRange.high : point.event.rating)) + 20) / 50) * 50;
  if (minY === maxY) maxY += 100;
  const plotRight = width - right;
  const x = value => left + (value - minX) / (maxX - minX) * (plotRight - left);
  const y = value => top + (maxY - value) / (maxY - minY) * (height - top - bottom);
  const yTicks = Array.from({ length: 6 }, (_, index) => minY + index * (maxY - minY) / 5);
  const xTicks = Array.from({ length: 5 }, (_, index) => minX + index * (maxX - minX) / 4);
  const dateSpan = maxX - minX;
  const xLabel = value => careerScale
    ? `Event ${Math.round(value) + 1}`
    : new Intl.DateTimeFormat(undefined, dateSpan > 94608000000 ? { year: 'numeric' } : { month: 'short', year: 'numeric' }).format(new Date(value));
  const grid = yTicks.map(tick => `<line class="grid${Math.abs(tick - 1500) < 1 ? ' baseline' : ''}" x1="${left}" y1="${y(tick)}" x2="${plotRight}" y2="${y(tick)}"></line><text class="axis-label" x="${left - 8}" y="${y(tick) + 3}" text-anchor="end">${Math.round(tick)}</text>`).join('');
  const axes = xTicks.map((tick, index) => `<text class="axis-label" x="${x(tick)}" y="${height - 9}" text-anchor="${index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}">${esc(xLabel(tick))}</text>`).join('');
  const seasonGuides = ratingView === 'driver' && !careerScale ? prepared[0].points.filter((point, index, source) => !index || point.event.year !== source[index - 1].event.year)
    .map(point => `<line class="ratings-season-guide" x1="${x(point.xValue)}" x2="${x(point.xValue)}" y1="${top}" y2="${height - bottom}"></line><text class="ratings-season-label" x="${x(point.xValue) + 4}" y="${top + 10}">${point.event.year}</text>`).join('') : '';
  const lines = prepared.map((item, seriesIndex) => {
    const path = item.points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'}${x(point.xValue).toFixed(1)},${y(point.event.rating).toFixed(1)}`).join(' ');
    const upper = item.points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'}${x(point.xValue).toFixed(1)},${y(point.event.ratingRange?.high ?? point.event.rating).toFixed(1)}`).join(' ');
    const lower = [...item.points].reverse().map(point => `L${x(point.xValue).toFixed(1)},${y(point.event.ratingRange?.low ?? point.event.rating).toFixed(1)}`).join(' ');
    const last = item.points.at(-1);
    const peak = item.points.reduce((best, point) => point.event.rating > best.event.rating ? point : best, item.points[0]);
    const markerStep = Math.max(1, Math.ceil(item.points.length / 48));
    const dots = item.points.filter((point, index) => index % markerStep === 0 || index === item.points.length - 1)
      .map(point => `<circle class="rating-event-point" aria-hidden="true" focusable="false" fill="${ratingColours[seriesIndex]}" cx="${x(point.xValue).toFixed(1)}" cy="${y(point.event.rating).toFixed(1)}" r="3"></circle>`).join('');
    const sourcePoints = item.points.map((point, pointIndex) => `<circle class="rating-source-point" aria-hidden="true" focusable="false" data-series-index="${seriesIndex}" data-point-index="${pointIndex}" cx="${x(point.xValue).toFixed(1)}" cy="${y(point.event.rating).toFixed(1)}" r="0"></circle>`).join('');
    const profileAnnotations = ratingView === 'driver' ? `<circle class="ratings-peak-point" cx="${x(peak.xValue)}" cy="${y(peak.event.rating)}" r="5"><title>Peak rating ${Math.round(peak.event.rating)} · ${esc(peak.event.eventName)}</title></circle><text class="ratings-peak-label" x="${x(peak.xValue) + 8}" y="${y(peak.event.rating) - 9}">Peak ${Math.round(peak.event.rating)}</text>${item.points.filter((point, index) => index && point.event.constructorName && point.event.constructorName !== item.points[index - 1].event.constructorName).map(point => `<rect class="ratings-team-change" x="${x(point.xValue) - 3}" y="${y(point.event.rating) - 3}" width="6" height="6" transform="rotate(45 ${x(point.xValue)} ${y(point.event.rating)})"><title>Joined ${esc(point.event.constructorName)} · ${point.event.year}</title></rect>`).join('')}` : '';
    return `<path class="rating-band" fill="${ratingColours[seriesIndex]}" d="${upper}${lower}Z"></path><path class="rating-line" stroke="${ratingColours[seriesIndex]}" d="${path}"></path>${sourcePoints}${dots}<circle class="rating-point" fill="${ratingColours[seriesIndex]}" cx="${x(last.xValue)}" cy="${y(last.event.rating)}" r="4"></circle><text class="ratings-line-label" fill="${ratingColours[seriesIndex]}" x="${x(last.xValue) + 8}" y="${y(last.event.rating) + 3}">${esc(item.history.driver.name)}</text>${profileAnnotations}<circle class="ratings-hover-point" data-hover-series="${seriesIndex}" fill="${ratingColours[seriesIndex]}" r="5" hidden></circle>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Rating history for selected drivers" data-chart-min-x="${minX}" data-chart-max-x="${maxX}" data-chart-left="${left}" data-chart-right="${plotRight}"><title>Rating history</title><desc>Use the interactive chart area and its arrow keys to inspect ratings at each point.</desc>${grid}${seasonGuides}${axes}${lines}<line class="ratings-chart-crosshair" x1="${left}" x2="${left}" y1="${top}" y2="${height - bottom}" hidden></line><rect class="ratings-chart-overlay" tabindex="0" role="button" aria-label="Inspect rating history. Use left and right arrow keys to move through the timeline." x="${left}" y="${top}" width="${plotRight - left}" height="${height - top - bottom}"></rect></svg><div id="ratings-chart-tooltip" class="ratings-chart-tooltip" role="status" aria-live="polite" hidden></div>`;
}

function renderCompareSummary(histories) {
  if (ratingView !== 'compare') return;
  const currentOrder = currentRatingOrder();
  const bestRating = Math.max(...histories.map(item => item.history.summary.currentRating));
  const bestPeak = Math.max(...histories.map(item => item.history.summary.peakRating));
  ratingElements.compareSummary.innerHTML = histories.map((item, index) => {
    const history = item.history;
    const latest = history.timeline.at(-1);
    const peak = history.timeline.reduce((best, event) => event.rating > best.rating ? event : best, history.timeline[0]);
    const rank = currentOrder.findIndex(driver => driver.driverId === item.id) + 1;
    return `<article style="--driver-color:${ratingColours[index]}"><div><i></i><strong>${esc(history.driver.name)}</strong><small>${latest ? `Through ${ratingDate(latest.date)}` : ''}</small></div><dl><div${history.summary.currentRating === bestRating ? ' class="best"' : ''}><dt>Rating</dt><dd>${Math.round(history.summary.currentRating)}</dd></div><div${history.summary.peakRating === bestPeak ? ' class="best"' : ''}><dt>Peak</dt><dd>${Math.round(history.summary.peakRating)}<small>${ratingDate(peak.date)}</small></dd></div><div><dt>Rank</dt><dd>${rank > 0 ? `#${rank}` : '—'}</dd></div><div><dt>Events</dt><dd>${history.summary.events}</dd></div><div><dt>Range</dt><dd>${Math.round(history.summary.ratingRange.low)}–${Math.round(history.summary.ratingRange.high)}</dd></div><div><dt>Last change</dt><dd class="ratings-change ${latest?.change > 0 ? 'positive' : latest?.change < 0 ? 'negative' : ''}">${ratingChange(latest?.change)}</dd></div></dl></article>`;
  }).join('');
}

function wireRatingChart(histories) {
  const svg = ratingElements.chart.querySelector('svg[data-chart-min-x]');
  const overlay = svg?.querySelector('.ratings-chart-overlay');
  const crosshair = svg?.querySelector('.ratings-chart-crosshair');
  const tooltip = ratingElements.chart.querySelector('.ratings-chart-tooltip');
  if (!svg || !overlay || !crosshair || !tooltip) return;
  const minX = Number(svg.dataset.chartMinX), maxX = Number(svg.dataset.chartMaxX);
  const plotLeft = Number(svg.dataset.chartLeft), plotRight = Number(svg.dataset.chartRight);
  const careerScale = ratingState.chartScale === 'career';
  const positionX = value => plotLeft + (value - minX) / (maxX - minX) * (plotRight - plotLeft);
  const hideHover = () => {
    crosshair.hidden = true;
    tooltip.hidden = true;
    svg.querySelectorAll('.ratings-hover-point').forEach(point => { point.hidden = true; });
  };
  const inspectTarget = (target, localX = null) => {
    const viewX = positionX(target);
    crosshair.setAttribute('x1', viewX);
    crosshair.setAttribute('x2', viewX);
    crosshair.hidden = false;
    const nearest = histories.map((item, index) => {
      const timeline = item.history.timeline;
      const firstX = careerScale ? 0 : new Date(timeline[0].date).getTime();
      const lastX = careerScale ? timeline.length - 1 : new Date(timeline.at(-1).date).getTime();
      const marker = svg.querySelector(`[data-hover-series="${index}"]`);
      if (target < firstX || target > lastX) {
        marker.hidden = true;
        return { item, point: null, index, pointIndex: -1 };
      }
      const pointIndex = careerScale
        ? Math.max(0, Math.min(timeline.length - 1, Math.round(target)))
        : timeline.reduce((best, candidate, candidateIndex) => Math.abs(new Date(candidate.date).getTime() - target) < Math.abs(new Date(timeline[best].date).getTime() - target) ? candidateIndex : best, 0);
      const point = timeline[pointIndex];
      const pointX = careerScale ? pointIndex : new Date(point.date).getTime();
      const sourcePoint = svg.querySelector(`[data-series-index="${index}"][data-point-index="${pointIndex}"]`);
      marker.setAttribute('cx', positionX(pointX));
      marker.setAttribute('cy', sourcePoint?.getAttribute('cy') || 0);
      marker.hidden = false;
      return { item, point, index, pointIndex };
    });
    const heading = careerScale ? `Career event ${Math.max(1, Math.round(target) + 1)}` : ratingDate(new Date(target));
    tooltip.innerHTML = `<strong>${esc(heading)}</strong>${nearest.map(({ item, point, index, pointIndex }) => `<div><i style="--driver-color:${ratingColours[index]}"></i><span><b>${esc(item.history.driver.name)}</b><small>${point ? `${esc(point.eventName)} · ${careerScale ? `event ${pointIndex + 1}` : ratingDate(point.date)}` : 'Not active at this point'}</small></span><b>${point ? Math.round(point.rating) : '—'}</b></div>`).join('')}`;
    tooltip.hidden = false;
    const chartBounds = ratingElements.chart.getBoundingClientRect();
    const tooltipX = localX == null ? (viewX / svg.viewBox.baseVal.width) * chartBounds.width : localX;
    tooltip.style.left = `${Math.max(12, Math.min(chartBounds.width - 12, tooltipX))}px`;
    tooltip.classList.toggle('align-right', tooltipX > chartBounds.width * .62);
    overlay.setAttribute('aria-label', `${heading}. ${nearest.map(({ item, point }) => `${item.history.driver.name} ${point ? Math.round(point.rating) : 'not active'}`).join(', ')}. Use left and right arrow keys to move.`);
  };
  const inspectPointer = event => {
    const bounds = svg.getBoundingClientRect();
    const viewX = Math.max(plotLeft, Math.min(plotRight, (event.clientX - bounds.left) / bounds.width * svg.viewBox.baseVal.width));
    inspectTarget(minX + (viewX - plotLeft) / (plotRight - plotLeft) * (maxX - minX), event.clientX - ratingElements.chart.getBoundingClientRect().left);
  };
  overlay.addEventListener('pointerleave', event => { if (document.activeElement !== overlay && event.pointerType !== 'touch') hideHover(); });
  overlay.addEventListener('pointermove', inspectPointer);
  overlay.addEventListener('click', inspectPointer);
  const inspectionPoints = [...new Set(histories.flatMap(item => item.history.timeline.map((event, index) => careerScale ? index : new Date(event.date).getTime())))].sort((a, b) => a - b);
  let inspectionIndex = Math.max(0, inspectionPoints.length - 1);
  overlay.addEventListener('focus', () => inspectTarget(inspectionPoints[inspectionIndex] ?? maxX));
  overlay.addEventListener('blur', hideHover);
  overlay.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') inspectionIndex = 0;
    else if (event.key === 'End') inspectionIndex = inspectionPoints.length - 1;
    else inspectionIndex = Math.max(0, Math.min(inspectionPoints.length - 1, inspectionIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    inspectTarget(inspectionPoints[inspectionIndex] ?? maxX);
  });
}

function longestPositiveRun(timeline) {
  let current = 0, longest = 0;
  timeline.forEach(event => {
    current = event.change > 0 ? current + 1 : 0;
    longest = Math.max(longest, current);
  });
  return longest;
}

function renderProfileEvents(history) {
  const years = [...new Set(history.timeline.map(event => event.year))].sort((a, b) => b - a);
  const teams = [...new Set(history.timeline.map(event => event.constructorName).filter(Boolean))].sort();
  if (!years.map(String).includes(ratingState.profileSeason)) ratingState.profileSeason = '';
  if (!teams.includes(ratingState.profileTeam)) ratingState.profileTeam = '';
  ratingElements.profileSeason.innerHTML = '<option value="">All seasons</option>' + years.map(year => `<option value="${year}"${String(year) === ratingState.profileSeason ? ' selected' : ''}>${year}</option>`).join('');
  ratingElements.profileTeam.innerHTML = '<option value="">All teams</option>' + teams.map(team => `<option value="${esc(team)}"${team === ratingState.profileTeam ? ' selected' : ''}>${esc(team)}</option>`).join('');
  ratingElements.profileImpact.value = ratingState.profileImpact;
  const filtered = history.timeline.filter(event =>
    (!ratingState.profileSeason || String(event.year) === ratingState.profileSeason)
    && (!ratingState.profileTeam || event.constructorName === ratingState.profileTeam)
    && (!ratingState.profileImpact || (ratingState.profileImpact === 'gain' ? event.change > 0 : event.change < 0)));
  const ordered = [...filtered].reverse();
  const paged = pageItems(ordered, ratingState.profilePage, ratingState.profilePageSize);
  ratingState.profilePage = paged.page;
  ratingElements.events.innerHTML = paged.items.map(event => {
    const changeClass = event.change > 0 ? 'positive' : event.change < 0 ? 'negative' : '';
    const result = event.position ? `P${event.position}` : event.positionText || '—';
    const context = event.explanation || {};
    const rival = context.keyRival ? `<p><strong>Key matchup</strong><span>${context.keyRival.outcome === 'beat' ? 'Finished ahead of' : context.keyRival.outcome === 'lost' ? 'Finished behind' : 'Tied with'} ${esc(context.keyRival.name)} (${Math.round(context.keyRival.rating)})</span></p>` : '';
    const eventWeight = Number.isFinite(context.eventWeight) ? context.eventWeight : 1;
    const completion = Number.isFinite(context.completion) ? context.completion : 1;
    const reduced = eventWeight < .99 || completion < .99 ? `<p><strong>Applied weight</strong><span>${Math.round(eventWeight * 100)}% event weight${completion < .99 ? ` · ${Math.round(completion * 100)}% distance completed` : ''}</span></p>` : '';
    const expected = Number.isFinite(event.expectedPosition) ? `P${event.expectedPosition.toFixed(1)}` : '—';
    const evidence = Number.isFinite(event.evidence) ? event.evidence.toFixed(1) : '—';
    const fieldStrength = Number.isFinite(context.fieldStrength) ? Math.round(context.fieldStrength) : '—';
    return `<details class="ratings-event ratings-profile-event"><summary><span class="ratings-profile-event-name"><strong>${esc(event.eventName)}</strong><small>${ratingDate(event.date)} · ${esc(event.constructorName || ratingSessionLabel(event.sessionType))}</small></span><span data-label="Result">${esc(result)}</span><span data-label="Expected">${expected}</span><span data-label="Change" class="ratings-change ${changeClass}">${ratingChange(event.change)}</span><span data-label="Rating">${Math.round(event.rating)}</span><span data-label="Weight">${Math.round(eventWeight * 100)}%</span></summary><div class="ratings-event-explanation"><p class="ratings-event-reason">${esc(context.summary || 'This event contributed to the driver’s rating history.')}</p><div class="ratings-event-facts"><p><strong>Field</strong><span>${event.fieldSize || '—'} starters · average ${fieldStrength}</span></p><p><strong>Matchups won</strong><span>${context.opponentsBeaten ?? '—'} of ${Math.max(0, Number(event.fieldSize || 1) - 1)} · ${context.higherRatedBeaten ?? '—'} higher-rated</span></p><p><strong>Recent evidence</strong><span>${evidence} weighted events</span></p>${rival}${reduced}</div></div></details>`;
  }).join('') || '<p class="ratings-profile-no-events">No events match these filters.</p>';
  renderPagination('ratings-events-list', filtered.length, paged.page, ratingState.profilePageSize, nextPage => {
    ratingState.profilePage = nextPage;
    renderProfileEvents(history);
    document.getElementById('profile').scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestAnimationFrame(() => document.querySelector('#ratings-events-list-pagination [aria-current="page"]')?.focus({ preventScroll: true }));
  });
  const count = document.querySelector('#ratings-events-list-pagination .pagination-count');
  if (count) count.textContent = `${paged.start + 1}–${Math.min(paged.start + paged.items.length, filtered.length)} of ${filtered.length} events`;
}

function renderActiveHistory(histories) {
  const item = histories[0];
  if (!item) return;
  ratingState.active = item.id;
  ratingState.profileHistory = item.history;
  const history = item.history;
  const timeline = history.timeline;
  if (!timeline.length) {
    ratingElements.profileIdentity.innerHTML = `<div><span>DRIVER PROFILE</span><h2 id="ratings-profile-name">${esc(history.driver.name)}</h2><p>No rated events are available for this driver.</p></div>`;
    ratingElements.profileSummary.innerHTML = '';
    ratingElements.profileHighlights.innerHTML = '';
    ratingElements.events.innerHTML = '<p class="ratings-profile-no-events">No rating history is available yet.</p>';
    return;
  }
  const first = timeline[0], latest = timeline.at(-1);
  const peak = timeline.reduce((best, event) => event.rating > best.rating ? event : best, first);
  const currentOrder = currentRatingOrder();
  const rank = currentOrder.findIndex(driver => driver.driverId === item.id) + 1;
  const recentChange = timeline.slice(-5).reduce((sum, event) => sum + event.change, 0);
  const biggestGain = timeline.reduce((best, event) => event.change > best.change ? event : best, first);
  const biggestLoss = timeline.reduce((worst, event) => event.change < worst.change ? event : worst, first);
  const strongestField = timeline.reduce((best, event) => (event.explanation?.fieldStrength || 0) > (best.explanation?.fieldStrength || 0) ? event : best, first);
  const seasonChanges = new Map();
  timeline.forEach(event => seasonChanges.set(event.year, (seasonChanges.get(event.year) || 0) + event.change));
  const bestSeason = [...seasonChanges].sort((a, b) => b[1] - a[1])[0];
  const years = first.year === latest.year ? String(first.year) : `${first.year}–${latest.year}`;
  const seriesBase = ratingState.series === 'f1' ? '' : `/${ratingState.series}`;
  const driverProfileUrl = `${seriesBase}/drivers/${encodeURIComponent(item.id)}`;
  const compareUrl = `/ratings/compare?series=${encodeURIComponent(ratingState.series)}&drivers=${encodeURIComponent(item.id)}`;

  ratingElements.profileIdentity.innerHTML = `<div><span>DRIVER PROFILE</span><h2 id="ratings-profile-name">${esc(history.driver.name)}</h2><p>${esc(latest.constructorName || 'Team unavailable')} · ${years} · ${history.summary.events} rated events</p></div><nav><a href="${driverProfileUrl}">Database profile</a><a class="primary" href="${compareUrl}">Compare this driver</a></nav>`;
  ratingElements.profileSummary.innerHTML = `<div><span>Current rating</span><strong>${Math.round(history.summary.currentRating)}</strong></div><div><span>Current rank</span><strong>${rank > 0 ? `#${rank}` : '—'}</strong></div><div><span>Peak rating</span><strong>${Math.round(history.summary.peakRating)}</strong><small>${ratingDate(peak.date)} · ${esc(peak.eventName)}</small></div><div><span>Rating range</span><strong>${Math.round(history.summary.ratingRange.low)}–${Math.round(history.summary.ratingRange.high)}</strong></div><div><span>Uncertainty</span><strong>±${Math.round(history.summary.uncertainty)}</strong><small>${esc(history.summary.uncertaintyLabel)}</small></div><div><span>Rated events</span><strong>${history.summary.events}</strong></div><div><span>Last change</span><strong class="ratings-change ${latest.change > 0 ? 'positive' : latest.change < 0 ? 'negative' : ''}">${ratingChange(latest.change)}</strong></div><div><span>Last five</span><strong class="ratings-change ${recentChange > 0 ? 'positive' : recentChange < 0 ? 'negative' : ''}">${ratingChange(recentChange)}</strong></div>`;
  const highlights = [
    ['Biggest gain', ratingChange(biggestGain.change), `${biggestGain.eventName} · ${ratingDate(biggestGain.date)}`],
    ['Biggest loss', ratingChange(biggestLoss.change), `${biggestLoss.eventName} · ${ratingDate(biggestLoss.date)}`],
    ['Strongest field', Number.isFinite(strongestField.explanation?.fieldStrength) ? String(Math.round(strongestField.explanation.fieldStrength)) : '—', `${strongestField.eventName} · ${ratingDate(strongestField.date)}`],
    ['Longest positive run', `${longestPositiveRun(timeline)} events`, 'Consecutive rating gains'],
    ['Best season', String(bestSeason[0]), `${ratingChange(bestSeason[1])} total rating change`]
  ];
  ratingElements.profileHighlights.innerHTML = highlights.map(([label, value, detail]) => `<article><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`).join('');
  ratingElements.summary.innerHTML = '';
  document.getElementById('ratings-events-title').textContent = `${history.driver.name} · every rated event`;
  document.getElementById('ratings-chart-title').textContent = `${history.driver.name} · career rating`;
  renderProfileEvents(history);
}

async function renderRatingDetails() {
  if (!ratingState.selected.length) {
    ratingElements.legend.innerHTML = '';
    ratingElements.compareSummary.innerHTML = '';
    ratingElements.chart.innerHTML = '<p>Choose drivers above to plot their rating history.</p>';
    ratingElements.summary.innerHTML = '';
    ratingElements.events.innerHTML = '';
    ratingElements.profileIdentity.innerHTML = '';
    ratingElements.profileSummary.innerHTML = '';
    ratingElements.profileHighlights.innerHTML = '';
    return;
  }
  ratingElements.chart.innerHTML = '<p>Loading driver histories…</p>';
  try {
    const histories = await Promise.all(ratingState.selected.map(async id => ({ id, history: await ratingHistory(id) })));
    ratingElements.legend.innerHTML = histories.map((item, index) => `<button type="button" data-driver-id="${esc(item.id)}" style="--driver-color:${ratingColours[index]}" title="Remove from comparison"><i></i>${esc(item.history.driver.name)} ×</button>`).join('');
    ratingElements.legend.querySelectorAll('button').forEach(button => button.addEventListener('click', () => toggleRatingDriver(button.dataset.driverId)));
    ratingElements.chart.dataset.showUncertainty = String(ratingState.showUncertainty);
    ratingElements.chart.innerHTML = chartSvg(histories);
    ratingElements.chart.querySelector('svg')?.setAttribute('aria-label', ratingView === 'driver' ? `Career rating history for ${histories[0].history.driver.name}` : 'Rating history for selected drivers');
    wireRatingChart(histories);
    if (ratingView === 'compare') {
      renderComparePicker();
      renderCompareSummary(histories);
      document.getElementById('ratings-chart-title').textContent = ratingState.chartScale === 'career' ? 'Career progression' : 'Rating trajectories';
      return;
    }
    renderActiveHistory(histories);
  } catch {
    ratingElements.chart.innerHTML = '<p>We could not load the selected rating histories.</p>';
  }
}

function populateRatingYears(years) {
  const current = ratingState.year;
  ratingElements.year.innerHTML = '<option value="">Latest available</option>' + years.map(year => `<option value="${year}">${year} season</option>`).join('');
  ratingElements.year.value = years.includes(Number(current)) ? current : '';
  ratingState.year = ratingElements.year.value;
}

function timelineEvents() {
  return ratingState.ratingEvents.filter(event => String(event.year) === String(ratingState.year));
}

function timelineYears() {
  return [...new Set(ratingState.ratingEvents.map(event => Number(event.year)))].sort((a, b) => a - b);
}

function currentRatingEvent() {
  return ratingState.ratingEvents.find(event => event.id === ratingState.eventId) || null;
}

function isLatestRatingEvent() {
  return Boolean(ratingState.ratingEvents.length && ratingState.eventId === ratingState.ratingEvents.at(-1).id);
}

function ratingSessionLabel(type) {
  return ({ sprint: 'Sprint', feature: 'Feature race', race: 'Race', reverse: 'Reverse-grid race' })[type] || type || 'Race';
}

function renderRatingTimeline() {
  const eventLevel = ratingState.timelineLevel === 'event';
  const items = eventLevel ? timelineEvents() : timelineYears();
  if (!items.length) return;
  let index = eventLevel
    ? items.findIndex(event => event.id === ratingState.eventId)
    : items.findIndex(year => String(year) === String(ratingState.year));
  if (index < 0) index = items.length - 1;

  ratingElements.timeline.dataset.level = ratingState.timelineLevel;
  ratingElements.timelineRange.max = String(items.length - 1);
  ratingElements.timelineRange.value = String(index);
  ratingElements.timelineRange.style.setProperty('--timeline-progress', `${items.length === 1 ? 100 : index / (items.length - 1) * 100}%`);
  ratingElements.timelineRange.style.setProperty('--timeline-steps', String(Math.max(1, Math.min(items.length - 1, 12))));
  ratingElements.timelinePrevious.disabled = index === 0;
  ratingElements.timelineNext.disabled = index === items.length - 1;
  ratingElements.timelineBack.hidden = !eventLevel;
  ratingElements.timelineZoom.hidden = eventLevel;
  ratingElements.timelineLatest.disabled = !eventLevel && isLatestRatingEvent();

  if (!eventLevel) {
    const year = items[index];
    const events = ratingState.ratingEvents.filter(event => Number(event.year) === year);
    ratingElements.timelineStart.textContent = String(items[0]);
    ratingElements.timelineSpan.textContent = `${items.length} seasons`;
    ratingElements.timelineEnd.textContent = String(items.at(-1));
    ratingState.year = String(year);
    if (!events.some(event => event.id === ratingState.eventId)) ratingState.eventId = events.at(-1)?.id || '';
    ratingElements.timelineLabel.textContent = 'AS OF SEASON';
    ratingElements.timelineEvent.textContent = `${year} season`;
    ratingElements.timelineMeta.textContent = `${events.length} rated event${events.length === 1 ? '' : 's'} · hold the timeline or choose Explore races`;
    ratingElements.timelineZoom.textContent = `Explore ${year} races`;
    ratingElements.timelineRange.setAttribute('aria-label', 'Season timeline');
    ratingElements.timelineRange.setAttribute('aria-valuetext', `${year} season`);
    ratingElements.timelinePrevious.setAttribute('aria-label', 'Previous season');
    ratingElements.timelineNext.setAttribute('aria-label', 'Next season');
    return;
  }

  const event = items[index];
  ratingState.eventId = event.id;
  ratingElements.timelineStart.textContent = 'Round 1';
  ratingElements.timelineSpan.textContent = `${items.length} rated events`;
  ratingElements.timelineEnd.textContent = `Round ${items.length}`;
  ratingElements.timelineLabel.textContent = `${ratingState.year} SEASON`;
  ratingElements.timelineEvent.textContent = `${event.name} · ${ratingSessionLabel(event.sessionType)}`;
  ratingElements.timelineMeta.textContent = `${ratingDate(event.date)} · event ${index + 1} of ${items.length}`;
  ratingElements.timelineRange.setAttribute('aria-label', `${ratingState.year} rated event timeline`);
  ratingElements.timelineRange.setAttribute('aria-valuetext', `${event.name}, ${ratingSessionLabel(event.sessionType)}, ${ratingDate(event.date)}`);
  ratingElements.timelinePrevious.setAttribute('aria-label', 'Previous rated event');
  ratingElements.timelineNext.setAttribute('aria-label', 'Next rated event');
}

async function loadRatingTimeline() {
  const query = new URLSearchParams({ series: ratingState.series });
  if (ratingState.model === 'team-adjusted') query.set('model', ratingState.model);
  const response = await fetch(`/api/ratings/events?${query}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Rating timeline unavailable');
  const data = await response.json();
  ratingState.ratingEvents = data.events || [];
  if (!ratingState.ratingEvents.length) throw new Error('Rating timeline is empty');
  const requested = currentRatingEvent();
  if (requested) ratingState.year = String(requested.year);
  else {
    const years = timelineYears();
    const selectedYear = years.includes(Number(ratingState.year)) ? Number(ratingState.year) : years.at(-1);
    ratingState.year = String(selectedYear);
    ratingState.eventId = ratingState.ratingEvents.filter(event => Number(event.year) === selectedYear).at(-1).id;
  }
  const years = [...timelineYears()].reverse();
  ratingElements.year.innerHTML = years.map(year => `<option value="${year}">${year} season</option>`).join('');
  ratingElements.year.value = ratingState.year;
  renderRatingTimeline();
}

function selectTimelinePoint(index) {
  const eventLevel = ratingState.timelineLevel === 'event';
  const items = eventLevel ? timelineEvents() : timelineYears();
  const bounded = Math.max(0, Math.min(items.length - 1, index));
  if (items[bounded] === undefined) return false;
  const previousEventId = ratingState.eventId;
  if (eventLevel) {
    ratingState.eventId = items[bounded].id;
  } else {
    ratingState.year = String(items[bounded]);
    ratingState.eventId = timelineEvents().at(-1)?.id || '';
    ratingElements.year.value = ratingState.year;
  }
  renderRatingTimeline();
  return previousEventId !== ratingState.eventId;
}

function zoomIntoRatingSeason() {
  if (ratingState.timelineLevel === 'event' || !timelineEvents().length) return;
  ratingState.timelineLevel = 'event';
  renderRatingTimeline();
  ratingUrl();
}

function zoomOutOfRatingSeason() {
  if (ratingState.timelineLevel !== 'event') return;
  const seasonEnd = timelineEvents().at(-1);
  const changed = Boolean(seasonEnd && ratingState.eventId !== seasonEnd.id);
  if (seasonEnd) ratingState.eventId = seasonEnd.id;
  ratingState.timelineLevel = 'season';
  renderRatingTimeline();
  if (changed) loadRatings();
  else ratingUrl();
}

async function loadRatings() {
  const request = ++ratingState.request;
  const progressiveCompare = ratingView === 'compare';
  ratingElements.status.hidden = progressiveCompare;
  ratingElements.status.textContent = 'Calculating the order…';
  ratingElements.content.hidden = !progressiveCompare;
  const query = new URLSearchParams({ series: ratingState.series, minEvents: ratingState.minEvents, limit: 1000 });
  if (ratingState.model === 'team-adjusted') query.set('model', ratingState.model);
  if (ratingView === 'leaderboard') query.set('order', ratingState.order);
  if (ratingView === 'compare' || ratingView === 'driver') query.set('order', 'peak');
  if (ratingView === 'leaderboard' && ratingState.eventId) query.set('event', ratingState.eventId);
  else if (ratingState.year) query.set('year', ratingState.year);
  try {
    const response = await fetch(`/api/ratings?${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Ratings unavailable');
    const data = await response.json();
    if (request !== ratingState.request) return;
    ratingState.leaderboard = data.leaderboard;
    const latestAvailableYear = Number(data.years?.[0]);
    const latestDriverYear = Math.max(...data.leaderboard.map(driver => Number(driver.lastEvent?.year)).filter(Number.isFinite));
    ratingState.latestYear = Number.isFinite(latestAvailableYear) && latestAvailableYear > 0 ? latestAvailableYear : latestDriverYear;
    if (ratingView === 'leaderboard') ratingState.order = data.order === 'peak' ? 'peak' : 'current';
    ratingElements.order.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ratingsOrder === ratingState.order)));
    document.getElementById('ratings-board-title').textContent = ratingBoardTitle(data);
    const boardHint = document.querySelector('.ratings-board-hint');
    if (boardHint && ratingView === 'leaderboard') boardHint.textContent = `Minimum events counts rated career events accumulated by this point. Evidence reflects recency and experience.`;
    ratingState.selected = ratingState.selected.filter(id => data.leaderboard.some(driver => driver.driverId === id)).slice(0, 4);
    if (ratingView === 'compare' && !ratingState.selected.length) {
      const byRating = [...data.leaderboard].sort((a, b) => b.rating - a.rating || a.driverName.localeCompare(b.driverName));
      const preferred = defaultComparisonDrivers
        .map(id => byRating.find(driver => driver.driverId === id))
        .filter(Boolean);
      ratingState.selected = [...preferred, ...byRating.filter(driver => !preferred.includes(driver))]
        .slice(0, 4)
        .map(driver => driver.driverId);
    }
    if (!ratingState.selected.length && data.leaderboard.length && ratingView === 'driver') {
      const highestRated = currentRatingOrder()[0] || [...data.leaderboard].sort((a, b) => b.rating - a.rating || a.driverName.localeCompare(b.driverName))[0];
      ratingState.selected = [highestRated.driverId];
    }
    ratingState.active = ratingState.selected.includes(ratingState.active) ? ratingState.active : ratingState.selected[0] || '';
    if (!data.leaderboard.length) {
      ratingElements.status.textContent = ratingView === 'compare'
        ? 'No rated drivers are available at this historical cutoff.'
        : ratingView === 'driver'
          ? 'No driver rating profiles are available for this championship yet.'
          : 'No drivers meet these filters yet. Try another season.';
      return;
    }
    const freshnessPending = (ratingView !== 'leaderboard' ? !ratingState.year : isLatestRatingEvent())
      && data.freshness?.isCurrent === false;
    const freshnessMessage = freshnessPending
      ? `Update pending · ratings through ${ratingDate(data.freshness.latestRatedEvent)} · source results through ${ratingDate(data.freshness.latestSourceEvent)}`
      : data.generatedAt ? `${data.modelLabel || `Model ${data.modelVersion}`} · ${data.beta ? 'beta · ' : ''}recalculated ${ratingDate(data.generatedAt)}` : `${data.modelLabel || `Model ${data.modelVersion}`}`;
    ratingElements.updated.dataset.state = freshnessPending ? 'pending' : 'current';
    ratingElements.updated.textContent = freshnessMessage;
    const viewUpdated = document.getElementById('ratings-view-updated');
    if (viewUpdated) { viewUpdated.dataset.state = ratingElements.updated.dataset.state; viewUpdated.textContent = freshnessMessage; }
    ratingElements.status.hidden = true;
    ratingElements.content.hidden = false;
    renderRatingTable();
    renderComparePicker();
    ratingUrl();
    await renderRatingDetails();
  } catch {
    if (request !== ratingState.request) return;
    ratingElements.status.textContent = 'Ratings could not be loaded. The calculation may need to be rebuilt after a data update.';
  }
}

ratingElements.year.addEventListener('change', () => {
  ratingState.year = ratingElements.year.value;
  if (ratingView === 'leaderboard') {
    ratingState.eventId = timelineEvents().at(-1)?.id || '';
    renderRatingTimeline();
  }
  if (ratingView !== 'compare') { ratingState.selected = []; ratingState.active = ''; }
  loadRatings();
});
ratingElements.minEvents.addEventListener('change', () => { ratingState.minEvents = Number(ratingElements.minEvents.value); ratingState.leaderboardPage = 1; loadRatings(); });
ratingElements.model?.addEventListener('change', async () => {
  ratingState.model = ratingState.series === 'f1' && ratingElements.model.value === 'team-adjusted' ? 'team-adjusted' : 'competitive';
  const help = document.getElementById('ratings-model-help');
  if (help) help.textContent = ratingState.model === 'team-adjusted'
    ? 'Beta model combining persistent driver and constructor estimates; it is not a pure talent score.'
    : 'Competitive measures recorded results against the field, including car, strategy and reliability.';
  ratingState.eventId = '';
  ratingState.selected = [];
  ratingState.active = '';
  ratingState.histories.clear();
  ratingUrl();
  try {
    if (ratingView === 'leaderboard') await loadRatingTimeline();
    await loadRatings();
  } catch {
    ratingElements.status.hidden = false;
    ratingElements.status.textContent = 'This rating model is not available yet. Rebuild the rating data and try again.';
  }
});
ratingElements.order.forEach(button => button.addEventListener('click', () => {
  const order = button.dataset.ratingsOrder;
  if (order === ratingState.order) return;
  ratingState.order = order;
  ratingState.leaderboardPage = 1;
  loadRatings();
}));
document.getElementById('ratings-clear').addEventListener('click', () => { ratingState.selected = []; ratingState.active = ''; renderRatingTable(); renderComparePicker(); ratingUrl(); renderRatingDetails(); });

ratingElements.driverSearch.addEventListener('input', renderDriverResults);
ratingElements.driverSearch.addEventListener('focus', renderDriverResults);
ratingElements.driverSearch.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeDriverResults(); }
  if (event.key === 'ArrowDown') {
    const first = ratingElements.driverResults.querySelector('button');
    if (first) { event.preventDefault(); first.focus(); }
  }
});
ratingElements.driverSearch.addEventListener('blur', () => setTimeout(() => {
  if (document.activeElement !== ratingElements.driverSearch && !ratingElements.driverResults.contains(document.activeElement)) closeDriverResults();
}, 100));
ratingElements.profileSearch.addEventListener('input', renderProfileResults);
ratingElements.profileSearch.addEventListener('focus', renderProfileResults);
ratingElements.profileSearch.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeProfileResults(); }
  if (event.key === 'ArrowDown') {
    const first = ratingElements.profileResults.querySelector('button');
    if (first) { event.preventDefault(); first.focus(); }
  }
});
ratingElements.profileSearch.addEventListener('blur', () => setTimeout(() => {
  if (document.activeElement !== ratingElements.profileSearch && !ratingElements.profileResults.contains(document.activeElement)) closeProfileResults();
}, 100));
ratingElements.profileSeason.addEventListener('change', () => {
  ratingState.profileSeason = ratingElements.profileSeason.value;
  ratingState.profilePage = 1;
  if (ratingState.profileHistory) renderProfileEvents(ratingState.profileHistory);
});
ratingElements.profileTeam.addEventListener('change', () => {
  ratingState.profileTeam = ratingElements.profileTeam.value;
  ratingState.profilePage = 1;
  if (ratingState.profileHistory) renderProfileEvents(ratingState.profileHistory);
});
ratingElements.profileImpact.addEventListener('change', () => {
  ratingState.profileImpact = ratingElements.profileImpact.value;
  ratingState.profilePage = 1;
  if (ratingState.profileHistory) renderProfileEvents(ratingState.profileHistory);
});
ratingElements.chartScale.forEach(button => button.addEventListener('click', () => {
  const scale = button.dataset.ratingsChartScale;
  if (scale === ratingState.chartScale) return;
  ratingState.chartScale = scale;
  ratingElements.chartScale.forEach(candidate => candidate.setAttribute('aria-pressed', String(candidate.dataset.ratingsChartScale === scale)));
  renderRatingDetails();
}));
ratingElements.uncertaintyToggle.addEventListener('click', () => {
  ratingState.showUncertainty = !ratingState.showUncertainty;
  ratingElements.uncertaintyToggle.setAttribute('aria-pressed', String(ratingState.showUncertainty));
  ratingElements.uncertaintyToggle.textContent = `Uncertainty ${ratingState.showUncertainty ? 'on' : 'off'}`;
  ratingElements.chart.dataset.showUncertainty = String(ratingState.showUncertainty);
});

ratingElements.timelineRange.addEventListener('input', () => selectTimelinePoint(Number(ratingElements.timelineRange.value)));
ratingElements.timelineRange.addEventListener('change', () => loadRatings());
ratingElements.timelinePrevious.addEventListener('click', () => {
  if (selectTimelinePoint(Number(ratingElements.timelineRange.value) - 1)) loadRatings();
});
ratingElements.timelineNext.addEventListener('click', () => {
  if (selectTimelinePoint(Number(ratingElements.timelineRange.value) + 1)) loadRatings();
});
ratingElements.timelineZoom.addEventListener('click', zoomIntoRatingSeason);
ratingElements.timelineBack.addEventListener('click', zoomOutOfRatingSeason);
ratingElements.timelineLatest.addEventListener('click', () => {
  const latest = ratingState.ratingEvents.at(-1);
  if (!latest) return;
  ratingState.year = String(latest.year);
  ratingState.eventId = latest.id;
  ratingState.timelineLevel = 'season';
  ratingElements.year.value = ratingState.year;
  renderRatingTimeline();
  loadRatings();
});

let ratingTimelineHoldTimer = null;
let ratingTimelinePointer = null;
function cancelRatingTimelineHold() {
  if (ratingTimelineHoldTimer) clearTimeout(ratingTimelineHoldTimer);
  ratingTimelineHoldTimer = null;
  ratingTimelinePointer = null;
}
ratingElements.timelineRange.addEventListener('pointerdown', event => {
  if (ratingState.timelineLevel !== 'season') return;
  ratingTimelinePointer = { x: event.clientX, y: event.clientY, value: ratingElements.timelineRange.value };
  ratingTimelineHoldTimer = setTimeout(() => {
    if (ratingTimelinePointer && ratingTimelinePointer.value === ratingElements.timelineRange.value) zoomIntoRatingSeason();
    cancelRatingTimelineHold();
  }, 650);
});
ratingElements.timelineRange.addEventListener('pointermove', event => {
  if (!ratingTimelinePointer) return;
  if (Math.hypot(event.clientX - ratingTimelinePointer.x, event.clientY - ratingTimelinePointer.y) > 8) cancelRatingTimelineHold();
});
ratingElements.timelineRange.addEventListener('pointerup', cancelRatingTimelineHold);
ratingElements.timelineRange.addEventListener('pointercancel', cancelRatingTimelineHold);
ratingElements.timelineRange.addEventListener('dblclick', zoomIntoRatingSeason);
ratingElements.timelineRange.addEventListener('keydown', event => {
  if (ratingState.timelineLevel === 'season' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    zoomIntoRatingSeason();
  }
});

readRatingUrl();
applyRatingSeriesTheme();
configureRatingView();
(async () => {
  try {
    if (ratingView === 'compare') {
      ratingElements.status.hidden = true;
      ratingElements.content.hidden = false;
      renderComparePicker();
      ratingElements.driverSearch.disabled = true;
      ratingElements.driverSearch.placeholder = 'Loading driver directory…';
      if (ratingState.selected.length) renderRatingDetails();
    }
    if (ratingView === 'leaderboard') await loadRatingTimeline();
    await loadRatings();
  } catch {
    ratingElements.status.textContent = 'Ratings could not be loaded. The calculation may need to be rebuilt after a data update.';
  }
})();
