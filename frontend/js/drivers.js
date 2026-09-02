let allDrivers = [];
let driverView = 'current';
let driverSearch = '';
let driverSeason = '';
let driverCountry = '';
let driverAchievement = 'all';
let driverSort = 'recent';
let driverLetter = '';
let driverPage = 1;
let latestDriverSeason = null;
const DRIVER_PAGE_SIZE = 24;
const F1_DRIVER_MEMORIALS = new Map([
  ['luigi-musso', '1924–1958'], ['peter-collins', '1931–1958'], ['stuart-lewis-evans', '1930–1958'],
  ['chris-bristow', '1937–1960'], ['alan-stacey', '1933–1960'], ['wolfgang-von-trips', '1928–1961'],
  ['john-taylor', '1933–1966'], ['lorenzo-bandini', '1935–1967'], ['roger-williamson', '1948–1973'],
  ['helmuth-koinigg', '1948–1974'], ['tom-pryce', '1949–1977'], ['ronnie-peterson', '1944–1978'],
  ['riccardo-paletti', '1958–1982'], ['ayrton-senna', '1960–1994'], ['jules-bianchi', '1989–2015']
]);

const COUNTRY_CODES = {
  argentina:'AR', australia:'AU', austria:'AT', belgium:'BE', brazil:'BR', canada:'CA', chile:'CL', china:'CN', colombia:'CO',
  czechia:'CZ', denmark:'DK', estonia:'EE', finland:'FI', france:'FR', germany:'DE', 'hong-kong':'HK', hungary:'HU', india:'IN',
  indonesia:'ID', ireland:'IE', israel:'IL', italy:'IT', japan:'JP', liechtenstein:'LI', malaysia:'MY', mexico:'MX', monaco:'MC',
  morocco:'MA', netherlands:'NL', 'new-zealand':'NZ', poland:'PL', portugal:'PT', russia:'RU', 'south-africa':'ZA', spain:'ES',
  sweden:'SE', switzerland:'CH', thailand:'TH', 'united-kingdom':'GB', 'united-states-of-america':'US', uruguay:'UY', venezuela:'VE', zimbabwe:'ZW'
};

function countryName(countryId) {
  return String(countryId || '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function compareNames(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
}

function driverSurnameInitial(driver) {
  const surname = driver.lastName || String(driver.name || '').trim().split(/\s+/).at(-1) || '';
  return surname.charAt(0).toUpperCase();
}

function driverCareer(driver) {
  if (!driver.firstYear && !driver.lastYear) return 'Championship record unavailable';
  return Number(driver.firstYear) === Number(driver.lastYear)
    ? `${driver.lastYear} season`
    : `${driver.firstYear || '—'}–${driver.lastYear || '—'}`;
}

function driverSearchText(driver) {
  return [driver.name, driver.fullName, driver.abbreviation, driver.permanentNumber,
    countryName(driver.nationalityCountryId), driver.firstYear, driver.lastYear]
    .filter(Boolean).join(' ').toLowerCase();
}

function f1DriverMemorial(driver) {
  const years = F1_DRIVER_MEMORIALS.get(String(driver.id));
  return years ? `<div class="f2-driver-memorial"><span class="memorial-ribbon" aria-hidden="true"></span><span>In memoriam</span><small>${years}</small></div>` : '';
}

function f1DriverTitle(driver) {
  const titles = Number(driver.totalChampionshipWins || 0);
  if (!titles) return '';
  return `<em class="f2-driver-title">${titles > 1 ? `${fmtNumber(titles)}× ` : ''}World champion</em>`;
}

function driverAchievements(driver) {
  const facts = [];
  if (Number(driver.totalChampionshipWins)) facts.push(`<span><strong>${fmtNumber(driver.totalChampionshipWins)}</strong> title${Number(driver.totalChampionshipWins) === 1 ? '' : 's'}</span>`);
  if (Number(driver.totalRaceWins)) facts.push(`<span><strong>${fmtNumber(driver.totalRaceWins)}</strong> win${Number(driver.totalRaceWins) === 1 ? '' : 's'}</span>`);
  if (Number(driver.totalPodiums)) facts.push(`<span><strong>${fmtNumber(driver.totalPodiums)}</strong> podium${Number(driver.totalPodiums) === 1 ? '' : 's'}</span>`);
  if (!facts.length && Number(driver.totalRaceStarts)) facts.push(`<span><strong>${fmtNumber(driver.totalRaceStarts)}</strong> starts</span>`);
  if (Number(driver.bestChampionshipPosition) > 0) facts.push(`<span><strong>P${fmtNumber(driver.bestChampionshipPosition)}</strong> best</span>`);
  return facts.slice(0, 3).join('');
}

function renderDriverCard(driver) {
  const memorial = F1_DRIVER_MEMORIALS.has(String(driver.id));
  const query = new URLSearchParams({ id: driver.id, return: `${location.pathname}${location.search}` });
  const number = driver.permanentNumber ? `<span class="driver-permanent-number">#${esc(driver.permanentNumber)}</span>` : '';
  return `<a class="entity-card driver-browser-card f1-driver-archive-card f1-achievement-card${memorial ? ' f2-driver-card-memorial' : ''}" href="/driver?${query}">
    ${f1DriverMemorial(driver)}${f1DriverTitle(driver)}
    <div class="driver-card-name"><h3>${esc(driver.name)}</h3>${COUNTRY_CODES[driver.nationalityCountryId] ? `<img class="driver-card-flag" src="/assets/flags/${COUNTRY_CODES[driver.nationalityCountryId].toLowerCase()}.svg" alt="${esc(countryName(driver.nationalityCountryId))} flag" loading="lazy">` : ''}</div>
    <p>${esc(driver.abbreviation || '')}${driver.nationalityCountryId ? ` · ${esc(countryName(driver.nationalityCountryId))}` : ''}</p>
    <div class="driver-card-context"><span>${esc(driverCareer(driver))}</span>${number}</div>
    <div class="f2-driver-card-record">${driverAchievements(driver) || '<span>No recorded starts</span>'}</div>
  </a>`;
}

function readDriverState() {
  const query = params();
  driverView = query.get('view') === 'all' ? 'all' : 'current';
  driverSearch = String(query.get('q') || '').toLowerCase().trim();
  driverSeason = query.get('season') || '';
  driverCountry = query.get('country') || '';
  driverAchievement = ['champions', 'winners', 'podiums'].includes(query.get('achievement')) ? query.get('achievement') : 'all';
  driverSort = ['name-asc', 'name-desc', 'recent', 'best-finish', 'wins-desc', 'starts-desc'].includes(query.get('sort')) ? query.get('sort') : 'recent';
  driverLetter = /^[A-Z]$/.test(query.get('letter') || '') ? query.get('letter') : '';
  driverPage = Math.max(1, Number(query.get('page')) || 1);
}

function syncDriverState() {
  const query = new URLSearchParams();
  if (driverView !== 'current') query.set('view', driverView);
  if (driverSearch) query.set('q', driverSearch);
  if (driverSeason) query.set('season', driverSeason);
  if (driverCountry) query.set('country', driverCountry);
  if (driverAchievement !== 'all') query.set('achievement', driverAchievement);
  if (driverSort !== 'recent') query.set('sort', driverSort);
  if (driverLetter) query.set('letter', driverLetter);
  if (driverPage > 1) query.set('page', driverPage);
  history.replaceState(null, '', `/drivers${query.size ? `?${query}` : ''}`);
}

function updateDriverControls() {
  document.getElementById('search').value = driverSearch;
  document.getElementById('driver-season').value = driverSeason;
  document.getElementById('driver-country').value = driverCountry;
  document.getElementById('driver-achievement').value = driverAchievement;
  document.getElementById('driver-sort').value = driverSort;
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === driverView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
}

function populateDriverFilters() {
  const years = [...new Set(allDrivers.flatMap(driver => [Number(driver.firstYear), Number(driver.lastYear)]).filter(Boolean))];
  const minimum = Math.min(...years);
  const maximum = Math.max(...years);
  document.getElementById('driver-season').innerHTML = '<option value="">All seasons</option>'
    + Array.from({ length: maximum - minimum + 1 }, (_, index) => maximum - index).map(year => `<option value="${year}">${year}</option>`).join('');
  const countries = [...new Set(allDrivers.map(driver => driver.nationalityCountryId).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  document.getElementById('driver-country').innerHTML = '<option value="">All nationalities</option>'
    + countries.map(country => `<option value="${esc(country)}">${esc(countryName(country))}</option>`).join('');
}

function filteredDrivers() {
  return allDrivers.filter(driver => {
    if (driverView === 'current' && Number(driver.lastYear) !== latestDriverSeason) return false;
    if (driverSearch && !driverSearchText(driver).includes(driverSearch)) return false;
    if (driverSeason && !(Number(driver.firstYear) <= Number(driverSeason) && Number(driver.lastYear) >= Number(driverSeason))) return false;
    if (driverCountry && driver.nationalityCountryId !== driverCountry) return false;
    if (driverAchievement === 'champions' && !Number(driver.totalChampionshipWins)) return false;
    if (driverAchievement === 'winners' && !Number(driver.totalRaceWins)) return false;
    if (driverAchievement === 'podiums' && !Number(driver.totalPodiums)) return false;
    if (driverLetter && driverSurnameInitial(driver) !== driverLetter) return false;
    return true;
  }).sort((a, b) => {
    if (driverSort === 'name-desc') return compareNames(b, a);
    if (driverSort === 'recent') return Number(b.lastYear || 0) - Number(a.lastYear || 0) || compareNames(a, b);
    if (driverSort === 'best-finish') return Number(a.bestChampionshipPosition || 999) - Number(b.bestChampionshipPosition || 999) || compareNames(a, b);
    if (driverSort === 'wins-desc') return Number(b.totalRaceWins || 0) - Number(a.totalRaceWins || 0) || Number(b.totalPodiums || 0) - Number(a.totalPodiums || 0) || compareNames(a, b);
    if (driverSort === 'starts-desc') return Number(b.totalRaceStarts || 0) - Number(a.totalRaceStarts || 0) || compareNames(a, b);
    return compareNames(a, b);
  });
}

function renderDriverLetters(baseList) {
  const available = new Set(baseList.map(driverSurnameInitial));
  document.getElementById('driver-letters').innerHTML = `<button type="button" data-letter="" class="${!driverLetter ? 'active' : ''}" aria-pressed="${!driverLetter}">All</button>`
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => `<button type="button" data-letter="${letter}" class="${driverLetter === letter ? 'active' : ''}" aria-pressed="${driverLetter === letter}" ${available.has(letter) ? '' : 'disabled'}>${letter}</button>`).join('');
  document.querySelectorAll('[data-letter]').forEach(button => button.addEventListener('click', () => {
    driverLetter = button.dataset.letter;
    driverPage = 1;
    updateDrivers();
  }));
}

function renderDrivers(list) {
  const grid = document.getElementById('drivers');
  const paged = pageItems(list, driverPage, DRIVER_PAGE_SIZE);
  driverPage = paged.page;
  grid.setAttribute('aria-busy', 'false');
  if (!list.length) {
    grid.innerHTML = `<div class="driver-empty-state"><div class="eyebrow">NO MATCHES</div><h2>No drivers found</h2><p>Try a different name, season, nationality or achievement.</p><button type="button" class="button primary" id="driver-empty-clear">Clear filters</button></div>`;
    document.getElementById('driver-empty-clear').addEventListener('click', clearDriverFilters);
  } else grid.innerHTML = paged.items.map(renderDriverCard).join('');
  renderPagination('drivers', list.length, driverPage, DRIVER_PAGE_SIZE, page => {
    driverPage = page;
    updateDrivers();
    document.getElementById('drivers').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function updateDrivers() {
  const baseForLetters = allDrivers.filter(driver => driverView !== 'current' || Number(driver.lastYear) === latestDriverSeason);
  const visible = filteredDrivers();
  renderDriverLetters(baseForLetters);
  renderDrivers(visible);
  document.getElementById('driver-count').textContent = `${fmtNumber(visible.length)} driver${visible.length === 1 ? '' : 's'}${driverView === 'current' ? ` on the ${latestDriverSeason} grid` : ' in the archive'}`;
  updateDriverControls();
  syncDriverState();
}

function clearDriverFilters() {
  driverSearch = '';
  driverSeason = '';
  driverCountry = '';
  driverAchievement = 'all';
  driverLetter = '';
  driverPage = 1;
  updateDrivers();
}

function bindDriverControls() {
  document.getElementById('search').addEventListener('input', event => { driverSearch = event.target.value.toLowerCase().trim(); driverPage = 1; updateDrivers(); });
  document.getElementById('driver-season').addEventListener('change', event => { driverSeason = event.target.value; driverPage = 1; updateDrivers(); });
  document.getElementById('driver-country').addEventListener('change', event => { driverCountry = event.target.value; driverPage = 1; updateDrivers(); });
  document.getElementById('driver-achievement').addEventListener('change', event => { driverAchievement = event.target.value; driverPage = 1; updateDrivers(); });
  document.getElementById('driver-sort').addEventListener('change', event => { driverSort = event.target.value; driverPage = 1; updateDrivers(); });
  document.getElementById('driver-clear').addEventListener('click', clearDriverFilters);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    driverView = button.dataset.view;
    driverSeason = '';
    driverLetter = '';
    driverPage = 1;
    updateDrivers();
  }));
}

async function loadDrivers() {
  readDriverState();
  bindDriverControls();
  try {
    allDrivers = await getJSON('/api/drivers?limit=1000');
    latestDriverSeason = Math.max(...allDrivers.map(driver => Number(driver.lastYear || 0)));
    populateDriverFilters();
    updateDrivers();
  } catch (error) {
    document.getElementById('drivers').setAttribute('aria-busy', 'false');
    document.getElementById('driver-count').textContent = 'Driver archive unavailable';
    setError('drivers', error.message);
  }
}

loadDrivers();
