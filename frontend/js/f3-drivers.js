let allF3Drivers = [];
let f3DriverSearch = '';
let f3DriverSort = 'recent';
let f3DriverPage = 1;
const F3_DRIVER_PAGE_SIZE = 24;

function f3CountryName(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || String(code).toUpperCase();
  } catch {
    return String(code).toUpperCase();
  }
}

function f3DriverFlag(driver) {
  const code = String(driver.countryCode || '').toLowerCase();
  return code ? `<img class="driver-card-flag" src="/assets/flags/${encodeURIComponent(code)}.svg" alt="${esc(f3CountryName(code))} flag" loading="lazy">` : '';
}

function f3DriverCareer(driver) {
  const first = Number(driver.firstSeason || 0);
  const last = Number(driver.lastSeason || 0);
  if (!first) return 'No championship campaign recorded';
  return first === last ? `${first} season` : `${first}–${last}`;
}

function compareF3DriverNames(first, second) {
  return String(first.name || '').localeCompare(String(second.name || ''), undefined, { sensitivity: 'base' });
}

function updateF3Drivers() {
  const visible = allF3Drivers
    .filter(driver => `${driver.name} ${driver.abbreviation || ''} ${f3CountryName(driver.countryCode)} ${driver.latestConstructorName || ''}`.toLowerCase().includes(f3DriverSearch))
    .sort((first, second) => {
      if (f3DriverSort === 'name-desc') return compareF3DriverNames(second, first);
      if (f3DriverSort === 'name-asc') return compareF3DriverNames(first, second);
      if (f3DriverSort === 'best-finish') return Number(first.bestChampionshipPosition || 999) - Number(second.bestChampionshipPosition || 999)
        || Number(second.totalPoints || 0) - Number(first.totalPoints || 0) || compareF3DriverNames(first, second);
      if (f3DriverSort === 'wins-desc') return Number(second.totalRaceWins || 0) - Number(first.totalRaceWins || 0)
        || Number(second.totalPodiums || 0) - Number(first.totalPodiums || 0) || compareF3DriverNames(first, second);
      return Number(second.lastSeason || 0) - Number(first.lastSeason || 0)
        || Number(first.bestChampionshipPosition || 999) - Number(second.bestChampionshipPosition || 999)
        || compareF3DriverNames(first, second);
    });

  const paged = pageItems(visible, f3DriverPage, F3_DRIVER_PAGE_SIZE);
  f3DriverPage = paged.page;
  document.getElementById('f3-driver-count').textContent = `${visible.length} driver${visible.length === 1 ? '' : 's'}`;
  document.getElementById('f3-drivers').innerHTML = paged.items.map(driver => `
    <a class="entity-card driver-browser-card f2-driver-card" href="/f3/driver?id=${encodeURIComponent(driver.id)}">
      <div class="driver-card-name"><h3>${esc(driver.name)}</h3>${f3DriverFlag(driver)}</div>
      <p>${esc(driver.abbreviation || 'F3 driver')} · ${esc(f3CountryName(driver.countryCode))} · ${esc(f3DriverCareer(driver))}</p>
      <div class="f2-driver-team">${esc(driver.latestConstructorName || 'Team not recorded')}</div>
      <div class="f2-driver-card-record"><span><strong>${fmtNumber(driver.totalRaceWins)}</strong> wins</span><span><strong>${fmtNumber(driver.totalPodiums)}</strong> podiums</span>${Number(driver.bestChampionshipPosition || 0) ? `<span><strong>P${fmtNumber(driver.bestChampionshipPosition)}</strong> best</span>` : ''}</div>
      ${Number(driver.totalChampionshipWins || 0) > 0 ? '<em class="f2-driver-title">F3 champion</em>' : ''}
    </a>`).join('');
  renderPagination('f3-drivers', visible.length, f3DriverPage, F3_DRIVER_PAGE_SIZE, page => {
    f3DriverPage = page;
    updateF3Drivers();
    document.getElementById('f3-drivers').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadF3Drivers() {
  try {
    allF3Drivers = await getJSON('/api/drivers?series=f3&limit=1000');
    updateF3Drivers();
  } catch (error) {
    setError('f3-drivers', error.message);
  }
}

document.getElementById('f3-driver-search').addEventListener('input', event => {
  f3DriverPage = 1;
  f3DriverSearch = event.target.value.toLowerCase().trim();
  updateF3Drivers();
});
document.getElementById('f3-driver-sort').addEventListener('change', event => {
  f3DriverPage = 1;
  f3DriverSort = event.target.value;
  updateF3Drivers();
});

loadF3Drivers();
