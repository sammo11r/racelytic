const constructorId = params().get('id');
const CONSTRUCTOR_SERIES = ['f2', 'f3', 'academy'].find(series => String(window.location?.pathname || '').startsWith(`/${series}/`)) || 'f1';
const CONSTRUCTOR_BASE = CONSTRUCTOR_SERIES === 'f1' ? '' : `/${CONSTRUCTOR_SERIES}`;
const CONSTRUCTOR_ENTITY = ['f3', 'academy'].includes(CONSTRUCTOR_SERIES) ? 'team' : 'constructor';
const CONSTRUCTOR_ARCHIVE = `${CONSTRUCTOR_BASE}/${CONSTRUCTOR_ENTITY}s`;
const CONSTRUCTOR_SERIES_NAME = { f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy' }[CONSTRUCTOR_SERIES];
const CONSTRUCTOR_HAS_CHASSIS = CONSTRUCTOR_SERIES === 'f1';
const CONSTRUCTOR_DETAIL_CACHE = `racelytic:${CONSTRUCTOR_SERIES}:constructor:${constructorId}:v2`;
let constructorData = null, constructorResults = null, constructorState = {};
const constructorNode = id => document.getElementById(id);
const constructorText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const constructorTrue = value => value === true || /^(1|true)$/i.test(String(value));
const constructorYears = (first, last) => first ? (Number(first) === Number(last) ? String(first) : `${first}–${last}`) : 'Years not recorded';

function constructorReturnPath() {
  const returnPath = params().get('return');
  return returnPath === CONSTRUCTOR_ARCHIVE || returnPath?.startsWith(`${CONSTRUCTOR_ARCHIVE}?`) ? returnPath : CONSTRUCTOR_ARCHIVE;
}
function readConstructorDetailState() {
  const query = params();
  constructorState = { q: query.get('q') || '', season: query.get('season') || '', driver: query.get('driver') || '',
    driverSearch: query.get('driverSearch') || '', driverSeason: query.get('driverSeason') || '',
    driverSort: ['name', 'starts', 'wins'].includes(query.get('driverSort')) ? query.get('driverSort') : 'recent',
    chassisSeason: query.get('chassisSeason') || '', timeline: query.get('timeline') || '' };
  for (const key of ['page', 'driverPage', 'chassisPage']) {
    const value = Number(query.get(key));
    constructorState[key] = Number.isSafeInteger(value) && value > 0 ? value : 1;
  }
  for (const key of ['season', 'driverSeason', 'chassisSeason', 'timeline']) {
    if (!/^\d{4}$/.test(constructorState[key])) constructorState[key] = '';
  }
}
function saveConstructorDetailState() {
  const query = new URLSearchParams({ id: constructorId });
  if (constructorReturnPath() !== CONSTRUCTOR_ARCHIVE) query.set('return', constructorReturnPath());
  Object.entries(constructorState).forEach(([key, value]) => {
    if (!value || (['page', 'driverPage', 'chassisPage'].includes(key) && value === 1) || (key === 'driverSort' && value === 'recent')) return;
    query.set(key, value);
  });
  history.replaceState(null, '', `${CONSTRUCTOR_BASE}/${CONSTRUCTOR_ENTITY}?${query}${window.location.hash || ''}`);
}
function constructorOptions(id, years, label = 'All seasons') {
  constructorNode(id).innerHTML = `<option value="">${label}</option>` + [...new Set(years)].sort((a, b) => b - a).map(year => `<option value="${esc(year)}">${esc(year)}</option>`).join('');
}
function constructorStat(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${value == null ? '—' : fmtNumber(value)}</dd></div>`;
}
function renderConstructorProfile(data) {
  constructorData = data;
  const c = data.constructor, current = data.standings.find(season => season.year === c.currentSeason);
  document.title = `${c.name} · ${CONSTRUCTOR_SERIES_NAME} · Racelytic`;
  const subtitle = [c.fullName && constructorText(c.fullName) !== constructorText(c.name) ? c.fullName : c.abbreviation, c.countryName].filter(Boolean).join(' · ');
  const titles = Number(c.totalChampionshipWins || 0);
  constructorNode('constructor-head').innerHTML = `<section class="detail-hero constructor-profile-hero"><div><h1>${esc(c.name)}</h1>
    ${subtitle ? `<p class="detail-sub">${esc(subtitle)}</p>` : ''}
    <div class="driver-profile-badges">${titles ? `<strong>${fmtNumber(titles)}× ${CONSTRUCTOR_SERIES === 'f1' ? 'Constructors’' : 'Teams’'} champion</strong>` : ''}</div>
    <div class="profile-meta"><span>${esc(constructorYears(c.firstYear, c.lastYear))}</span><span>${data.standings.length} recorded season${data.standings.length === 1 ? '' : 's'}</span></div></div>
    ${current ? `<aside class="constructor-current-season"><span class="eyebrow">${c.currentSeason} SEASON</span><strong>${current.positionNumber ? `P${current.positionNumber}` : 'Not classified'}${current.points != null ? ` · ${fmtNumber(current.points)} points` : ''}</strong><span>Season drivers</span><div>${c.currentDrivers.map(driver => `<a href="${CONSTRUCTOR_BASE}/driver?id=${encodeURIComponent(driver.id)}">${esc(driver.name)}</a>`).join(' · ') || 'Drivers not yet recorded'}</div></aside>` : ''}</section>`;
  constructorNode('constructor-stats').innerHTML = `<dl class="constructor-stat-strip">${[
    [CONSTRUCTOR_SERIES === 'f1' ? 'Constructors’ titles' : 'Teams’ titles', c.totalChampionshipWins], ['Race starts', c.totalRaceStarts], ['Race wins', c.totalRaceWins],
    ['Podiums', c.totalPodiums], ['Pole positions', c.totalPolePositions], ['Career points', c.totalPoints]
  ].map(([label, value]) => constructorStat(label, value)).join('')}</dl>`;
  constructorNode('constructor-career-span').textContent = `${constructorYears(c.firstYear, c.lastYear)} · ${data.standings.length} seasons`;
  constructorNode('constructor-seasons').innerHTML = data.standings.length ? `<div class="career-timeline constructor-career-timeline" role="list" aria-label="Constructor career by season">${[...data.standings].reverse().map(season => {
    const won = constructorTrue(season.championshipWon);
    const label = won ? `${CONSTRUCTOR_SERIES === 'f1' ? 'Constructors’' : 'Teams’'} champion` : season.positionNumber ? `Championship P${season.positionNumber}` : CONSTRUCTOR_SERIES === 'f1' && season.year < 1958 ? 'Before constructors’ championship' : 'No standings recorded';
    return `<a id="constructor-season-${season.year}" class="career-timeline-item${won ? ' champion' : ''}" role="listitem" href="${CONSTRUCTOR_BASE}/season?year=${season.year}"><div class="timeline-marker"><i></i></div><span class="timeline-year">${season.year}</span><strong>${label}</strong><small>${season.points == null ? 'Participation recorded' : `${fmtNumber(season.points)} points`}</small>${CONSTRUCTOR_HAS_CHASSIS && season.chassis.length ? `<div class="timeline-context">${esc(season.chassis.join(' · '))}</div>` : ''}${season.drivers.length ? `<div class="timeline-people">${esc(season.drivers.join(', '))}</div>` : ''}</a>`;
  }).join('')}</div>` : '<p class="empty-state">No participation history recorded.</p>';
  constructorOptions('constructor-timeline-year', data.standings.map(row => row.year), 'Latest season');
  constructorOptions('constructor-driver-season', data.drivers.flatMap(row => row.seasons));
  if (CONSTRUCTOR_HAS_CHASSIS) constructorOptions('constructor-chassis-season', data.chassis.flatMap(row => row.seasons));
  for (const id of ['constructor-head', 'constructor-stats', 'constructor-seasons']) constructorNode(id).setAttribute('aria-busy', 'false');
  renderConstructorDrivers(); if (CONSTRUCTOR_HAS_CHASSIS) renderConstructorChassis(); focusConstructorSeason(false);
}
function focusConstructorSeason(userAction = true) {
  if (!constructorData) return;
  constructorNode('constructor-timeline-year').value = constructorState.timeline;
  const year = constructorState.timeline || constructorData.standings[0]?.year;
  const item = constructorNode(`constructor-season-${year}`);
  const track = constructorNode('constructor-seasons').firstElementChild;
  if (item && track) track.scrollTo({ left: item.offsetLeft - 18, behavior: userAction && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
  if (userAction) saveConstructorDetailState();
}
function filteredConstructorDrivers() {
  const search = constructorText(constructorState.driverSearch.trim());
  return constructorData.drivers.filter(driver => (!search || constructorText(driver.driverName).includes(search)) && (!constructorState.driverSeason || driver.seasons.includes(Number(constructorState.driverSeason))))
    .sort((a, b) => {
      const metric = { starts: 'starts', wins: 'wins', recent: 'lastYear' }[constructorState.driverSort];
      return (metric ? Number(b[metric]) - Number(a[metric]) : 0) || a.driverName.localeCompare(b.driverName);
    });
}
function renderConstructorDrivers() {
  if (!constructorData) return;
  for (const [id, key] of [['search', 'driverSearch'], ['season', 'driverSeason'], ['sort', 'driverSort']]) constructorNode(`constructor-driver-${id}`).value = constructorState[key];
  const visible = filteredConstructorDrivers(), paged = pageItems(visible, constructorState.driverPage, 24);
  constructorState.driverPage = paged.page;
  constructorNode('constructor-driver-count').textContent = `${visible.length} driver${visible.length === 1 ? '' : 's'}`;
  constructorNode('constructor-drivers').setAttribute('aria-busy', 'false');
  constructorNode('constructor-drivers').innerHTML = visible.length ? paged.items.map(driver => `<a class="constructor-driver-card" href="${CONSTRUCTOR_BASE}/driver?id=${encodeURIComponent(driver.driverId)}"><div class="constructor-driver-years">${esc(constructorYears(driver.firstYear, driver.lastYear))}</div><strong>${esc(driver.driverName)}</strong><span>${fmtNumber(driver.starts)} starts · ${fmtNumber(driver.points)} points</span><div class="constructor-driver-record">${driver.wins > 0 ? `<small>${fmtNumber(driver.wins)} wins</small>` : ''}${driver.podiums > 0 ? `<small>${fmtNumber(driver.podiums)} podiums</small>` : ''}<small>${driver.seasons.length} season${driver.seasons.length === 1 ? '' : 's'}</small></div></a>`).join('') : '<p class="empty-state">No drivers match these filters.</p>';
  renderPagination('constructor-drivers', visible.length, paged.page, 24, page => { constructorState.driverPage = page; renderConstructorDrivers(); constructorNode('constructor-people').scrollIntoView({ behavior: 'smooth' }); });
  saveConstructorDetailState();
}
function renderConstructorChassis() {
  if (!constructorData || !CONSTRUCTOR_HAS_CHASSIS) return;
  constructorNode('constructor-chassis-season').value = constructorState.chassisSeason;
  const visible = constructorData.chassis.filter(chassis => !constructorState.chassisSeason || chassis.seasons.includes(Number(constructorState.chassisSeason)));
  const paged = pageItems(visible, constructorState.chassisPage, 12); constructorState.chassisPage = paged.page;
  constructorNode('constructor-chassis-count').textContent = `${visible.length} chassis`;
  constructorNode('constructor-chassis').setAttribute('aria-busy', 'false');
  constructorNode('constructor-chassis').innerHTML = visible.length ? paged.items.map(chassis => `<article class="constructor-chassis-card"><div class="chassis-card-heading"><div><span>${esc(constructorYears(chassis.firstYear, chassis.lastYear))}</span><h3><a href="/chassis?search=${encodeURIComponent(chassis.chassisFullName || chassis.chassisName)}">${esc(chassis.chassisFullName || chassis.chassisName)}</a></h3></div></div><div class="chassis-engine-block"><span>ENGINE${chassis.engines.length === 1 ? '' : 'S'}</span><p>${esc((chassis.engines.length ? chassis.engines : chassis.engineManufacturers).join(' · ') || 'Engine not recorded')}</p></div></article>`).join('') : '<p class="empty-state">No chassis recorded for this selection.</p>';
  renderPagination('constructor-chassis', visible.length, paged.page, 12, page => { constructorState.chassisPage = page; renderConstructorChassis(); constructorNode('constructor-cars').scrollIntoView({ behavior: 'smooth' }); });
  saveConstructorDetailState();
}
function constructorResultGrid(result) {
  if (result.gridPositionText === 'PL') return 'Pit lane';
  const grid = Number(result.gridPositionNumber);
  if (Number.isInteger(grid) && grid > 0 && grid < 999) return String(grid);
  if (result.gridPositionText && !(Number(result.gridPositionText) >= 999)) return result.gridPositionText;
  return /^(DNS|DNQ|DNPQ)$/.test(String(result.positionText || '')) ? result.positionText : '—';
}
function constructorResultFinish(result) {
  const text = String(result.positionText || '').toUpperCase();
  if (/^(DNF|RET|RETIRED|DNS|DNQ|DNPQ|DSQ|DQ|DISQ|EXC|NC)$/.test(text)) return text;
  if (Number(result.positionNumber) >= 999 || Number(text) >= 999) {
    const status = String(result.reasonRetired || result.status || '').toUpperCase();
    return /^(DNF|RET|RETIRED|DNS|DNQ|DNPQ|DSQ|DQ|DISQ|EXC|NC)$/.test(status) ? status : Number(result.positionNumber || text) === 999 ? 'DNF' : 'NC';
  }
  return result.positionText || result.positionNumber || (result.reasonRetired ? 'RET' : '—');
}
function groupedConstructorResults() {
  const races = new Map(), search = constructorText(constructorState.q.trim());
  for (const row of constructorResults || []) {
    if (constructorState.season && Number(row.year) !== Number(constructorState.season)) continue;
    if (constructorState.driver && row.driverId !== constructorState.driver) continue;
    if (search && !constructorText([displayRaceName(row), row.circuitName, row.year].join(' ')).includes(search)) continue;
    const key = String(row.sessionId || row.raceId);
    if (!races.has(key)) races.set(key, { ...row, entries: [] });
    races.get(key).entries.push(row);
  }
  return [...races.values()].sort((a, b) => Number(b.year) - Number(a.year) || Number(b.round) - Number(a.round));
}
function renderConstructorResults() {
  if (!constructorResults) return;
  for (const [id, key] of [['search', 'q'], ['season', 'season'], ['driver', 'driver']]) constructorNode(`constructor-result-${id}`).value = constructorState[key];
  const races = groupedConstructorResults(), paged = pageItems(races, constructorState.page, 25); constructorState.page = paged.page;
  constructorNode('constructor-result-count').textContent = `${fmtNumber(races.length)} race${races.length === 1 ? '' : 's'} · Up to 25 per page`;
  constructorNode('constructor-results').setAttribute('aria-busy', 'false');
  constructorNode('constructor-results').innerHTML = races.length ? `<div class="constructor-history-table-wrap"><table class="constructor-history-table"><caption class="sr-only">Constructor race history</caption><thead><tr><th scope="col">Season</th><th scope="col">Race</th><th scope="col">Constructor results</th><th scope="col">Points</th></tr></thead><tbody>${paged.items.map(race => {
    const totalPoints = race.entries.reduce((total, result) => total + Number(result.points || 0), 0);
    const raceQuery = new URLSearchParams({ id: race.raceId });
    if (race.sessionId) raceQuery.set('session', race.sessionId);
    const raceLabel = `${displayRaceName(race)}${race.sessionName ? ` · ${race.sessionName}` : ''}`;
    return `<tr><td><a href="${CONSTRUCTOR_BASE}/season?year=${esc(race.year)}">${esc(race.year)}</a><small>Round ${esc(race.round)}</small></td><th scope="row"><a href="${CONSTRUCTOR_BASE}/race?${esc(raceQuery.toString())}">${esc(raceLabel)}</a><small>${esc(fmtDate(race.date))}${race.circuitName ? ` · ${esc(race.circuitName)}` : ''}</small></th><td><div class="constructor-race-results">${race.entries.map(result => {
    const finish = constructorResultFinish(result), podium = Number(finish) > 0 && Number(finish) <= 3;
    return `<div class="constructor-race-result"><a href="${CONSTRUCTOR_BASE}/driver?id=${encodeURIComponent(result.driverId)}">${esc(result.driverName)}</a><span>Grid ${esc(constructorResultGrid(result))}</span><strong class="finish-position${podium ? ' podium' : ''}">${esc(finish)}</strong><b>${fmtNumber(result.points)} pts</b>${result.reasonRetired ? `<small title="${esc(result.reasonRetired)}">${esc(result.reasonRetired)}</small>` : ''}</div>`;
  }).join('')}</div></td><td class="result-points-total">${fmtNumber(totalPoints)}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="empty-state">No races match these filters.</p>';
  renderPagination('constructor-results', races.length, paged.page, 25, page => { constructorState.page = page; renderConstructorResults(); constructorNode('constructor-history').scrollIntoView({ behavior: 'smooth' }); });
  saveConstructorDetailState();
}
function applyConstructorResults(rows) {
  constructorResults = rows;
  constructorOptions('constructor-result-season', rows.map(row => row.year));
  const drivers = [...new Map(rows.map(row => [row.driverId, row.driverName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  constructorNode('constructor-result-driver').innerHTML = '<option value="">All drivers</option>' + drivers.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  renderConstructorResults();
}
function validConstructorProfile(data) {
  return data && data.constructor?.id === constructorId && Array.isArray(data.standings) && Array.isArray(data.drivers) && Array.isArray(data.chassis);
}
function constructorCached(key, validate) {
  try { const cached = JSON.parse(sessionStorage.getItem(key)); if (cached && Date.now() - cached.savedAt < 300000 && validate(cached.data)) return cached.data; } catch { /* Storage is optional. */ }
  return null;
}
function constructorStore(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* Full histories can exceed storage quotas; the page still works. */ }
}
async function loadConstructorProfile() {
  if (!constructorData) { const cached = constructorCached(CONSTRUCTOR_DETAIL_CACHE, validConstructorProfile); if (cached) renderConstructorProfile(cached); }
  constructorNode('constructor-load-status').textContent = constructorData ? 'Refreshing constructor…' : 'Loading constructor…';
  try {
    const data = await getJSON(`/api/constructors/${encodeURIComponent(constructorId)}?summary=1${CONSTRUCTOR_SERIES === 'f1' ? '' : `&series=${CONSTRUCTOR_SERIES}`}`);
    if (!validConstructorProfile(data)) throw Error('Constructor data is unavailable.');
    renderConstructorProfile(data); constructorStore(CONSTRUCTOR_DETAIL_CACHE, data);
    constructorNode('constructor-load-status').textContent = '';
  } catch (error) {
    if (!constructorData) for (const id of ['constructor-head', 'constructor-stats', 'constructor-seasons', 'constructor-drivers', ...(CONSTRUCTOR_HAS_CHASSIS ? ['constructor-chassis'] : [])]) { constructorNode(id).innerHTML = ''; constructorNode(id).setAttribute('aria-busy', 'false'); }
    constructorNode('constructor-load-status').innerHTML = `${constructorData ? 'Showing saved constructor. ' : ''}${esc(error.message)} <button type="button" class="button secondary" id="constructor-retry">Retry</button>`;
    constructorNode('constructor-retry').addEventListener('click', loadConstructorProfile);
  }
}
async function loadConstructorResults() {
  const key = `${CONSTRUCTOR_DETAIL_CACHE}:results`;
  if (!constructorResults) { const cached = constructorCached(key, Array.isArray); if (cached) applyConstructorResults(cached); }
  constructorNode('constructor-results-status').textContent = constructorResults ? 'Refreshing races…' : 'Loading race history…';
  try {
    const rows = await getJSON(`/api/constructors/${encodeURIComponent(constructorId)}?results=1${CONSTRUCTOR_SERIES === 'f1' ? '' : `&series=${CONSTRUCTOR_SERIES}`}`);
    if (!Array.isArray(rows)) throw Error('Race history is unavailable.');
    applyConstructorResults(rows); constructorStore(key, rows); constructorNode('constructor-results-status').textContent = '';
  } catch (error) {
    if (!constructorResults) { constructorNode('constructor-results').innerHTML = ''; constructorNode('constructor-results').setAttribute('aria-busy', 'false'); constructorNode('constructor-result-count').textContent = ''; }
    constructorNode('constructor-results-status').innerHTML = `${constructorResults ? 'Showing saved races. ' : ''}${esc(error.message)} <button type="button" class="button secondary" id="constructor-results-retry">Retry</button>`;
    constructorNode('constructor-results-retry').addEventListener('click', loadConstructorResults);
  }
}
function bindConstructorDetail() {
  const controls = [
    ['constructor-driver-search', 'driverSearch', 'driverPage', renderConstructorDrivers], ['constructor-driver-season', 'driverSeason', 'driverPage', renderConstructorDrivers],
    ['constructor-driver-sort', 'driverSort', 'driverPage', renderConstructorDrivers],
    ['constructor-result-search', 'q', 'page', renderConstructorResults], ['constructor-result-season', 'season', 'page', renderConstructorResults], ['constructor-result-driver', 'driver', 'page', renderConstructorResults]
  ];
  if (CONSTRUCTOR_HAS_CHASSIS) controls.push(['constructor-chassis-season', 'chassisSeason', 'chassisPage', renderConstructorChassis]);
  controls.forEach(([id, key, page, render]) => constructorNode(id).addEventListener(id.endsWith('search') ? 'input' : 'change', event => { constructorState[key] = event.target.value; constructorState[page] = 1; render(); }));
  constructorNode('constructor-driver-clear').addEventListener('click', () => { Object.assign(constructorState, { driverSearch: '', driverSeason: '', driverSort: 'recent', driverPage: 1 }); renderConstructorDrivers(); });
  constructorNode('constructor-result-clear').addEventListener('click', () => { Object.assign(constructorState, { q: '', season: '', driver: '', page: 1 }); renderConstructorResults(); });
  constructorNode('constructor-timeline-year').addEventListener('change', event => { constructorState.timeline = event.target.value; focusConstructorSeason(); });
  constructorNode('constructor-timeline-latest').addEventListener('click', () => { constructorState.timeline = ''; focusConstructorSeason(); });
  window.addEventListener('popstate', () => {
    if (params().get('id') !== constructorId) { window.location.reload(); return; }
    readConstructorDetailState(); renderConstructorDrivers(); if (CONSTRUCTOR_HAS_CHASSIS) renderConstructorChassis(); renderConstructorResults(); focusConstructorSeason(false);
  });
}
function loadConstructor() {
  constructorNode('constructor-back-link').href = constructorReturnPath();
  if (!constructorId) {
    for (const id of ['constructor-head', 'constructor-stats', 'constructor-seasons', 'constructor-drivers', ...(CONSTRUCTOR_HAS_CHASSIS ? ['constructor-chassis'] : []), 'constructor-results']) { constructorNode(id).innerHTML = ''; constructorNode(id).setAttribute('aria-busy', 'false'); }
    constructorNode('constructor-result-count').textContent = '';
    constructorNode('constructor-load-status').textContent = 'Choose a constructor from the archive.';
    return;
  }
  return Promise.all([loadConstructorProfile(), loadConstructorResults()]);
}
readConstructorDetailState();
bindConstructorDetail();
loadConstructor();
