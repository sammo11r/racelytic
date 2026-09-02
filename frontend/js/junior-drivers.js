const juniorDriverArchive = window.JUNIOR_DRIVER_ARCHIVE;
let allJuniorDrivers = [];
let juniorDriverView = 'current';
let juniorDriverSearch = '';
let juniorDriverSeason = '';
let juniorDriverCountry = '';
let juniorDriverAchievement = 'all';
let juniorDriverSort = 'recent';
let juniorDriverLetter = '';
let juniorDriverPage = 1;
let latestJuniorDriverSeason = null;
const JUNIOR_DRIVER_PAGE_SIZE = 24;

function juniorCountryCode(driver) {
  const code = String(driver.countryCode || '').toLowerCase();
  return code === 'ra' ? 'ar' : code;
}

function juniorCountryName(code) {
  if (!code) return '';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || String(code).toUpperCase(); }
  catch { return String(code).toUpperCase(); }
}

function compareJuniorDriverNames(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
}

function juniorDriverSurnameInitial(driver) {
  const surname = driver.lastName || String(driver.name || '').trim().split(/\s+/).at(-1) || '';
  return surname.charAt(0).toUpperCase();
}

function juniorDriverCareer(driver) {
  const first = Number(driver.firstSeason || 0), last = Number(driver.lastSeason || 0);
  if (!first) return 'Championship record unavailable';
  return first === last ? `${first} season` : `${first}–${last}`;
}

function juniorDriverSearchText(driver) {
  return [driver.name, driver.abbreviation, juniorCountryName(juniorCountryCode(driver)), driver.latestConstructorName,
    driver.firstSeason, driver.lastSeason].filter(Boolean).join(' ').toLowerCase();
}

function juniorDriverMemorial(driver) {
  const years = juniorDriverArchive.memorials[String(driver.id)];
  return years ? `<div class="f2-driver-memorial"><span class="memorial-ribbon" aria-hidden="true"></span><span>In memoriam</span><small>${esc(years)}</small></div>` : '';
}

function juniorDriverTitle(driver) {
  const titles = Number(driver.totalChampionshipWins || 0);
  return titles ? `<em class="f2-driver-title">${titles > 1 ? `${fmtNumber(titles)}× ` : ''}${esc(juniorDriverArchive.shortName)} champion</em>` : '';
}

function juniorDriverAchievements(driver) {
  const facts = [];
  if (Number(driver.totalChampionshipWins)) facts.push(`<span><strong>${fmtNumber(driver.totalChampionshipWins)}</strong> title${Number(driver.totalChampionshipWins) === 1 ? '' : 's'}</span>`);
  if (Number(driver.totalRaceWins)) facts.push(`<span><strong>${fmtNumber(driver.totalRaceWins)}</strong> win${Number(driver.totalRaceWins) === 1 ? '' : 's'}</span>`);
  if (Number(driver.totalPodiums)) facts.push(`<span><strong>${fmtNumber(driver.totalPodiums)}</strong> podium${Number(driver.totalPodiums) === 1 ? '' : 's'}</span>`);
  if (!facts.length && Number(driver.totalStarts)) facts.push(`<span><strong>${fmtNumber(driver.totalStarts)}</strong> starts</span>`);
  if (Number(driver.bestChampionshipPosition) > 0) facts.push(`<span><strong>P${fmtNumber(driver.bestChampionshipPosition)}</strong> best</span>`);
  return facts.slice(0, 3).join('');
}

function renderJuniorDriverCard(driver) {
  const code = juniorCountryCode(driver), memorial = Boolean(juniorDriverArchive.memorials[String(driver.id)]);
  const query = new URLSearchParams({ id: driver.id, return: `${location.pathname}${location.search}` });
  return `<a class="entity-card driver-browser-card f1-driver-archive-card junior-driver-archive-card f2-driver-card${memorial ? ' f2-driver-card-memorial' : ''}" href="${juniorDriverArchive.root}/driver?${query}">
    ${juniorDriverMemorial(driver)}${juniorDriverTitle(driver)}
    <div class="driver-card-name"><h3>${esc(driver.name)}</h3>${code ? `<img class="driver-card-flag" src="/assets/flags/${encodeURIComponent(code)}.svg" alt="${esc(juniorCountryName(code))} flag" loading="lazy">` : ''}</div>
    <p>${esc(driver.abbreviation || juniorDriverArchive.shortName + ' driver')}${code ? ` · ${esc(juniorCountryName(code))}` : ''}</p>
    <div class="driver-card-context"><span>${esc(juniorDriverCareer(driver))}</span><strong>${esc(driver.latestConstructorName || 'Team not recorded')}</strong></div>
    <div class="f2-driver-card-record">${juniorDriverAchievements(driver) || '<span>No recorded starts</span>'}</div>
  </a>`;
}

function readJuniorDriverState() {
  const query = params();
  juniorDriverView = query.get('view') === 'all' ? 'all' : 'current';
  juniorDriverSearch = String(query.get('q') || '').toLowerCase().trim();
  juniorDriverSeason = query.get('season') || '';
  juniorDriverCountry = query.get('country') || '';
  juniorDriverAchievement = ['champions', 'winners', 'podiums'].includes(query.get('achievement')) ? query.get('achievement') : 'all';
  juniorDriverSort = ['name-asc', 'name-desc', 'recent', 'best-finish', 'wins-desc', 'starts-desc'].includes(query.get('sort')) ? query.get('sort') : 'recent';
  juniorDriverLetter = /^[A-Z]$/.test(query.get('letter') || '') ? query.get('letter') : '';
  juniorDriverPage = Math.max(1, Number(query.get('page')) || 1);
}

function syncJuniorDriverState() {
  const query = new URLSearchParams();
  if (juniorDriverView !== 'current') query.set('view', juniorDriverView);
  if (juniorDriverSearch) query.set('q', juniorDriverSearch);
  if (juniorDriverSeason) query.set('season', juniorDriverSeason);
  if (juniorDriverCountry) query.set('country', juniorDriverCountry);
  if (juniorDriverAchievement !== 'all') query.set('achievement', juniorDriverAchievement);
  if (juniorDriverSort !== 'recent') query.set('sort', juniorDriverSort);
  if (juniorDriverLetter) query.set('letter', juniorDriverLetter);
  if (juniorDriverPage > 1) query.set('page', juniorDriverPage);
  history.replaceState(null, '', `${juniorDriverArchive.root}/drivers${query.size ? `?${query}` : ''}`);
}

function populateJuniorDriverFilters() {
  const years = [...new Set(allJuniorDrivers.flatMap(driver => [Number(driver.firstSeason), Number(driver.lastSeason)]).filter(Boolean))];
  const minimum = Math.min(...years), maximum = Math.max(...years);
  document.getElementById('driver-season').innerHTML = '<option value="">All seasons</option>'
    + Array.from({ length: maximum - minimum + 1 }, (_, index) => maximum - index).map(year => `<option value="${year}">${year}</option>`).join('');
  const countries = [...new Set(allJuniorDrivers.map(juniorCountryCode).filter(Boolean))].sort((a, b) => juniorCountryName(a).localeCompare(juniorCountryName(b)));
  document.getElementById('driver-country').innerHTML = '<option value="">All nationalities</option>'
    + countries.map(country => `<option value="${esc(country)}">${esc(juniorCountryName(country))}</option>`).join('');
}

function filteredJuniorDrivers() {
  return allJuniorDrivers.filter(driver => {
    if (juniorDriverView === 'current' && Number(driver.lastSeason) !== latestJuniorDriverSeason) return false;
    if (juniorDriverSearch && !juniorDriverSearchText(driver).includes(juniorDriverSearch)) return false;
    if (juniorDriverSeason && !(Number(driver.firstSeason) <= Number(juniorDriverSeason) && Number(driver.lastSeason) >= Number(juniorDriverSeason))) return false;
    if (juniorDriverCountry && juniorCountryCode(driver) !== juniorDriverCountry) return false;
    if (juniorDriverAchievement === 'champions' && !Number(driver.totalChampionshipWins)) return false;
    if (juniorDriverAchievement === 'winners' && !Number(driver.totalRaceWins)) return false;
    if (juniorDriverAchievement === 'podiums' && !Number(driver.totalPodiums)) return false;
    if (juniorDriverLetter && juniorDriverSurnameInitial(driver) !== juniorDriverLetter) return false;
    return true;
  }).sort((a, b) => {
    if (juniorDriverSort === 'name-desc') return compareJuniorDriverNames(b, a);
    if (juniorDriverSort === 'name-asc') return compareJuniorDriverNames(a, b);
    if (juniorDriverSort === 'best-finish') return Number(a.bestChampionshipPosition || 999) - Number(b.bestChampionshipPosition || 999) || compareJuniorDriverNames(a, b);
    if (juniorDriverSort === 'wins-desc') return Number(b.totalRaceWins || 0) - Number(a.totalRaceWins || 0) || Number(b.totalPodiums || 0) - Number(a.totalPodiums || 0) || compareJuniorDriverNames(a, b);
    if (juniorDriverSort === 'starts-desc') return Number(b.totalStarts || 0) - Number(a.totalStarts || 0) || compareJuniorDriverNames(a, b);
    return Number(b.lastSeason || 0) - Number(a.lastSeason || 0) || compareJuniorDriverNames(a, b);
  });
}

function updateJuniorDriverControls() {
  document.getElementById('search').value = juniorDriverSearch;
  document.getElementById('driver-season').value = juniorDriverSeason;
  document.getElementById('driver-country').value = juniorDriverCountry;
  document.getElementById('driver-achievement').value = juniorDriverAchievement;
  document.getElementById('driver-sort').value = juniorDriverSort;
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === juniorDriverView;
    button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
  });
}

function renderJuniorDriverLetters(baseList) {
  const available = new Set(baseList.map(juniorDriverSurnameInitial));
  document.getElementById('driver-letters').innerHTML = `<button type="button" data-letter="" class="${!juniorDriverLetter ? 'active' : ''}" aria-pressed="${!juniorDriverLetter}">All</button>`
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => `<button type="button" data-letter="${letter}" class="${juniorDriverLetter === letter ? 'active' : ''}" aria-pressed="${juniorDriverLetter === letter}" ${available.has(letter) ? '' : 'disabled'}>${letter}</button>`).join('');
  document.querySelectorAll('[data-letter]').forEach(button => button.addEventListener('click', () => { juniorDriverLetter = button.dataset.letter; juniorDriverPage = 1; updateJuniorDrivers(); }));
}

function renderJuniorDrivers(list) {
  const grid = document.getElementById('drivers'), paged = pageItems(list, juniorDriverPage, JUNIOR_DRIVER_PAGE_SIZE);
  juniorDriverPage = paged.page; grid.setAttribute('aria-busy', 'false'); grid.removeAttribute('aria-label');
  if (!list.length) {
    grid.innerHTML = `<div class="driver-empty-state"><div class="eyebrow">NO MATCHES</div><h2>No drivers found</h2><p>Try a different name, season, nationality or achievement.</p><button type="button" class="button primary" id="driver-empty-clear">Clear filters</button></div>`;
    document.getElementById('driver-empty-clear').addEventListener('click', clearJuniorDriverFilters);
  } else grid.innerHTML = paged.items.map(renderJuniorDriverCard).join('');
  renderPagination('drivers', list.length, juniorDriverPage, JUNIOR_DRIVER_PAGE_SIZE, page => { juniorDriverPage = page; updateJuniorDrivers(); grid.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

function updateJuniorDrivers() {
  const base = allJuniorDrivers.filter(driver => juniorDriverView !== 'current' || Number(driver.lastSeason) === latestJuniorDriverSeason);
  const visible = filteredJuniorDrivers();
  renderJuniorDriverLetters(base); renderJuniorDrivers(visible);
  document.getElementById('driver-count').textContent = `${fmtNumber(visible.length)} driver${visible.length === 1 ? '' : 's'}${juniorDriverView === 'current' ? ` on the ${latestJuniorDriverSeason} grid` : ' in the archive'}`;
  updateJuniorDriverControls(); syncJuniorDriverState();
}

function clearJuniorDriverFilters() {
  juniorDriverSearch = ''; juniorDriverSeason = ''; juniorDriverCountry = ''; juniorDriverAchievement = 'all'; juniorDriverLetter = ''; juniorDriverPage = 1; updateJuniorDrivers();
}

function bindJuniorDriverControls() {
  document.getElementById('search').addEventListener('input', e => { juniorDriverSearch = e.target.value.toLowerCase().trim(); juniorDriverPage = 1; updateJuniorDrivers(); });
  document.getElementById('driver-season').addEventListener('change', e => { juniorDriverSeason = e.target.value; juniorDriverPage = 1; updateJuniorDrivers(); });
  document.getElementById('driver-country').addEventListener('change', e => { juniorDriverCountry = e.target.value; juniorDriverPage = 1; updateJuniorDrivers(); });
  document.getElementById('driver-achievement').addEventListener('change', e => { juniorDriverAchievement = e.target.value; juniorDriverPage = 1; updateJuniorDrivers(); });
  document.getElementById('driver-sort').addEventListener('change', e => { juniorDriverSort = e.target.value; juniorDriverPage = 1; updateJuniorDrivers(); });
  document.getElementById('driver-clear').addEventListener('click', clearJuniorDriverFilters);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { juniorDriverView = button.dataset.view; juniorDriverSeason = ''; juniorDriverLetter = ''; juniorDriverPage = 1; updateJuniorDrivers(); }));
}

async function loadJuniorDrivers() {
  readJuniorDriverState(); bindJuniorDriverControls();
  try {
    allJuniorDrivers = await getJSON(`/api/drivers?series=${encodeURIComponent(juniorDriverArchive.series)}&limit=1000`);
    latestJuniorDriverSeason = Math.max(...allJuniorDrivers.map(driver => Number(driver.lastSeason || 0)));
    populateJuniorDriverFilters(); updateJuniorDrivers();
  } catch (error) {
    document.getElementById('drivers').setAttribute('aria-busy', 'false'); document.getElementById('driver-count').textContent = 'Driver archive unavailable'; setError('drivers', error.message);
  }
}

loadJuniorDrivers();
