let wecDrivers = [];
let wecDriverState = { q: '', era: 'all', classCode: 'all', country: 'all', achievement: 'all', sort: 'recent', letter: '', page: 1 };
const WEC_DRIVER_PAGE_SIZE = 24;
const WEC_ERAS = Object.freeze({ hypercar: [2021, Infinity], superseason: [2018, 2020], lmp1: [2012, 2017] });

function wecDriverSurnameInitial(driver) {
  return String(driver.name || '').trim().split(/\s+/).at(-1)?.charAt(0).toUpperCase() || '';
}

function wecDriverCareer(driver) {
  if (!driver.firstYear) return 'Championship record only';
  return driver.firstYear === driver.lastYear ? `${driver.firstYear} season` : `${driver.firstYear}–${driver.lastYear}`;
}

function wecClassLabel(code) {
  return String(code || '').replace(/^LMGTE$/i, 'LMGTE').replace(/-/g, ' ');
}

function wecDriverSearchText(driver) {
  return [driver.name, driver.abbreviation, driver.countryName, driver.nationalityCountryId,
    driver.firstYear, driver.lastYear, ...(driver.classCodes || [])].filter(Boolean).join(' ').toLowerCase();
}

function readWecDriverState() {
  const query = params();
  wecDriverState.q = String(query.get('q') || '').trim().toLowerCase();
  wecDriverState.era = Object.hasOwn(WEC_ERAS, query.get('era')) ? query.get('era') : 'all';
  wecDriverState.classCode = query.get('class') || 'all';
  wecDriverState.country = query.get('country') || 'all';
  wecDriverState.achievement = ['champions', 'overall-winners', 'class-winners', 'podiums'].includes(query.get('achievement')) ? query.get('achievement') : 'all';
  wecDriverState.sort = ['name', 'starts', 'wins', 'podiums', 'titles'].includes(query.get('sort')) ? query.get('sort') : 'recent';
  wecDriverState.letter = /^[A-Z]$/.test(query.get('letter') || '') ? query.get('letter') : '';
  wecDriverState.page = Math.max(1, Number(query.get('page')) || 1);
}

function syncWecDriverState() {
  const query = new URLSearchParams();
  if (wecDriverState.q) query.set('q', wecDriverState.q);
  if (wecDriverState.era !== 'all') query.set('era', wecDriverState.era);
  if (wecDriverState.classCode !== 'all') query.set('class', wecDriverState.classCode);
  if (wecDriverState.country !== 'all') query.set('country', wecDriverState.country);
  if (wecDriverState.achievement !== 'all') query.set('achievement', wecDriverState.achievement);
  if (wecDriverState.sort !== 'recent') query.set('sort', wecDriverState.sort);
  if (wecDriverState.letter) query.set('letter', wecDriverState.letter);
  if (wecDriverState.page > 1) query.set('page', wecDriverState.page);
  history.replaceState(null, '', `/wec/drivers${query.size ? `?${query}` : ''}`);
}

function populateWecDriverFilters() {
  const classCodes = [...new Set(wecDrivers.flatMap(driver => driver.classCodes))]
    .sort((left, right) => wecClassLabel(left).localeCompare(wecClassLabel(right)));
  document.getElementById('wec-driver-class').innerHTML = '<option value="all">All classes</option>'
    + classCodes.map(code => `<option value="${esc(code)}">${esc(wecClassLabel(code))}</option>`).join('');
  const countries = [...new Map(wecDrivers.filter(driver => driver.nationalityCountryId)
    .map(driver => [driver.nationalityCountryId, driver.countryName || displayCountryName(driver.countryCode || driver.nationalityCountryId)])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1]));
  document.getElementById('wec-driver-country').innerHTML = '<option value="all">All nationalities</option>'
    + countries.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
}

function filteredWecDrivers({ ignoreLetter = false } = {}) {
  const era = WEC_ERAS[wecDriverState.era];
  return wecDrivers.filter(driver => {
    if (wecDriverState.q && !wecDriverSearchText(driver).includes(wecDriverState.q)) return false;
    if (!WecArchiveScopeModel.matches(driver, { from: era?.[0], to: era?.[1], classCode: wecDriverState.classCode, achievement: wecDriverState.achievement })) return false;
    if (wecDriverState.country !== 'all' && driver.nationalityCountryId !== wecDriverState.country) return false;
    if (!ignoreLetter && wecDriverState.letter && wecDriverSurnameInitial(driver) !== wecDriverState.letter) return false;
    return true;
  }).sort((left, right) => {
    const name = () => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    if (wecDriverState.sort === 'name') return name();
    if (wecDriverState.sort === 'starts') return right.starts - left.starts || right.classWins - left.classWins || name();
    if (wecDriverState.sort === 'wins') return right.classWins - left.classWins || right.overallWins - left.overallWins || name();
    if (wecDriverState.sort === 'podiums') return right.podiums - left.podiums || right.classWins - left.classWins || name();
    if (wecDriverState.sort === 'titles') return right.championships - left.championships || Number(left.bestChampionshipPosition || 999) - Number(right.bestChampionshipPosition || 999) || name();
    return Number(right.lastYear || 0) - Number(left.lastYear || 0) || Number(right.starts || 0) - Number(left.starts || 0) || name();
  });
}

function wecDriverCard(driver) {
  const classSummary = driver.classCodes.length
    ? `${driver.classCodes.slice(0, 2).map(wecClassLabel).join(' · ')}${driver.classCodes.length > 2 ? ` · +${driver.classCodes.length - 2}` : ''}`
    : 'No race class';
  const achievements = [];
  if (driver.championships) achievements.push(`<span><strong>${fmtNumber(driver.championships)}</strong> title${driver.championships === 1 ? '' : 's'}</span>`);
  if (driver.overallWins) achievements.push(`<span><strong>${fmtNumber(driver.overallWins)}</strong> overall win${driver.overallWins === 1 ? '' : 's'}</span>`);
  if (driver.classWins) achievements.push(`<span><strong>${fmtNumber(driver.classWins)}</strong> class win${driver.classWins === 1 ? '' : 's'}</span>`);
  if (driver.podiums) achievements.push(`<span><strong>${fmtNumber(driver.podiums)}</strong> podium${driver.podiums === 1 ? '' : 's'}</span>`);
  if (driver.starts) achievements.push(`<span><strong>${fmtNumber(driver.starts)}</strong> starts</span>`);
  const title = driver.championships ? `<em class="wec-driver-title">${driver.championships > 1 ? `${fmtNumber(driver.championships)}× ` : ''}title winner</em>` : '';
  const flag = driver.countryCode ? `<img class="wec-driver-flag" src="/assets/flags/${esc(driver.countryCode)}.svg" alt="${esc(driver.countryName || '')} flag" loading="lazy">` : '';
  const query = new URLSearchParams({ return: `${location.pathname}${location.search}` });
  return `<a class="wec-driver-card${driver.championships ? ' is-champion' : ''}" href="${resourceUrl('driver', driver.id, { base: '/wec', query })}">
    ${title}
    <div class="wec-driver-name"><h3>${esc(driver.name)}</h3>${flag}</div>
    <p>${esc(driver.abbreviation || '')}${driver.countryName ? `${driver.abbreviation ? ' · ' : ''}${esc(driver.countryName)}` : ''}</p>
    <div class="wec-driver-context"><span>${esc(wecDriverCareer(driver))}</span><strong>${esc(classSummary)}</strong></div>
    <div class="wec-driver-record">${achievements.slice(0, 3).join('') || '<span>No recorded starts</span>'}</div>
  </a>`;
}

function renderWecDriverLetters() {
  const available = new Set(filteredWecDrivers({ ignoreLetter: true }).map(wecDriverSurnameInitial));
  const target = document.getElementById('wec-driver-letters');
  target.innerHTML = `<button type="button" data-letter="" class="${wecDriverState.letter ? '' : 'active'}" aria-pressed="${!wecDriverState.letter}">All</button>`
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => `<button type="button" data-letter="${letter}" class="${wecDriverState.letter === letter ? 'active' : ''}" aria-pressed="${wecDriverState.letter === letter}" ${available.has(letter) ? '' : 'disabled'}>${letter}</button>`).join('');
  target.querySelectorAll('[data-letter]').forEach(button => button.addEventListener('click', () => {
    wecDriverState.letter = button.dataset.letter;
    wecDriverState.page = 1;
    updateWecDrivers();
  }));
}

function renderWecDrivers(drivers) {
  const target = document.getElementById('wec-drivers');
  const paged = pageItems(drivers, wecDriverState.page, WEC_DRIVER_PAGE_SIZE);
  wecDriverState.page = paged.page;
  target.setAttribute('aria-busy', 'false');
  target.innerHTML = paged.items.length ? paged.items.map(wecDriverCard).join('')
    : `<div class="wec-driver-empty"><p class="eyebrow">NO MATCHES</p><h2>No drivers found</h2><p>Try another search, era, class or achievement.</p><button type="button" class="button primary" id="wec-driver-empty-clear">Clear filters</button></div>`;
  document.getElementById('wec-driver-empty-clear')?.addEventListener('click', clearWecDriverFilters);
  renderPagination('wec-drivers', drivers.length, wecDriverState.page, WEC_DRIVER_PAGE_SIZE, page => {
    wecDriverState.page = page;
    updateWecDrivers();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function updateWecDriverControls() {
  document.getElementById('wec-driver-search').value = wecDriverState.q;
  document.getElementById('wec-driver-era').value = wecDriverState.era;
  document.getElementById('wec-driver-class').value = wecDriverState.classCode;
  document.getElementById('wec-driver-country').value = wecDriverState.country;
  document.getElementById('wec-driver-achievement').value = wecDriverState.achievement;
  document.getElementById('wec-driver-sort').value = wecDriverState.sort;
}

function updateWecDrivers() {
  const drivers = filteredWecDrivers();
  renderWecDriverLetters();
  renderWecDrivers(drivers);
  document.getElementById('wec-driver-count').textContent = `${fmtNumber(drivers.length)} driver${drivers.length === 1 ? '' : 's'}`;
  updateWecDriverControls();
  syncWecDriverState();
}

function clearWecDriverFilters() {
  wecDriverState = { q: '', era: 'all', classCode: 'all', country: 'all', achievement: 'all', sort: 'recent', letter: '', page: 1 };
  updateWecDrivers();
}

function bindWecDriverControls() {
  const bindings = [
    ['wec-driver-search', 'input', event => event.target.value.trim().toLowerCase(), 'q'],
    ['wec-driver-era', 'change', event => event.target.value, 'era'],
    ['wec-driver-class', 'change', event => event.target.value, 'classCode'],
    ['wec-driver-country', 'change', event => event.target.value, 'country'],
    ['wec-driver-achievement', 'change', event => event.target.value, 'achievement'],
    ['wec-driver-sort', 'change', event => event.target.value, 'sort']
  ];
  bindings.forEach(([id, eventName, value, key]) => document.getElementById(id).addEventListener(eventName, event => {
    wecDriverState[key] = value(event);
    wecDriverState.page = 1;
    updateWecDrivers();
  }));
  document.getElementById('wec-driver-clear').addEventListener('click', clearWecDriverFilters);
}

async function loadWecDrivers() {
  readWecDriverState();
  bindWecDriverControls();
  try {
    wecDrivers = await getJSON('/api/wec/drivers');
    populateWecDriverFilters();
    updateWecDrivers();
  } catch (error) {
    document.getElementById('wec-drivers').setAttribute('aria-busy', 'false');
    document.getElementById('wec-driver-count').textContent = 'Driver archive unavailable';
    setError('wec-drivers', error.message);
  }
}

loadWecDrivers();
