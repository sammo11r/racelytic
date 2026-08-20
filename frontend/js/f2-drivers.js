let allF2Drivers = [];
let f2DriverSearch = '';
let f2DriverSort = 'recent';
let f2DriverPage = 1;
const F2_DRIVER_PAGE_SIZE = 24;
const F2_DRIVER_FLAG_CODES = new Set([
  'ar', 'at', 'au', 'bb', 'be', 'bg', 'br', 'ca', 'ch', 'cl', 'cn', 'co', 'cz', 'de', 'dk', 'ee', 'es', 'fi', 'fr',
  'gb', 'gt', 'hk', 'hu', 'id', 'ie', 'il', 'in', 'it', 'jp', 'li', 'ma', 'mc', 'mx', 'my', 'nl', 'no', 'nz', 'pl',
  'pt', 'py', 'ro', 'ru', 'se', 'th', 'tr', 'us', 'uy', 've', 'za', 'zw'
]);

function f2CountryName(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || String(code).toUpperCase();
  } catch {
    return String(code).toUpperCase();
  }
}

function f2DriverFlag(driver) {
  const sourceCode = String(driver.countryCode || '').toLowerCase();
  const code = sourceCode === 'ra' ? 'ar' : sourceCode;
  return F2_DRIVER_FLAG_CODES.has(code)
    ? `<img class="driver-card-flag" src="/assets/flags/${encodeURIComponent(code)}.svg" alt="${esc(f2CountryName(code))} flag" loading="lazy">`
    : '';
}

function f2DriverCareer(driver) {
  const first = Number(driver.firstSeason || 0);
  const last = Number(driver.lastSeason || 0);
  if (!first) return 'No championship campaign recorded';
  return first === last ? `${first} season` : `${first}–${last}`;
}

function compareF2DriverNames(first, second) {
  return String(first.name || '').localeCompare(String(second.name || ''), undefined, { sensitivity: 'base' });
}

function f2DriverMemorial(driver) {
  return driver.id === 'anthoine-hubert'
    ? '<div class="f2-driver-memorial"><span class="memorial-ribbon" aria-hidden="true"></span><span>In memoriam</span><small>1996–2019</small></div>'
    : '';
}

function updateF2Drivers() {
  const visible = allF2Drivers
    .filter(driver => `${driver.name} ${driver.abbreviation || ''} ${f2CountryName(driver.countryCode)} ${driver.latestConstructorName || ''}`.toLowerCase().includes(f2DriverSearch))
    .sort((first, second) => {
      if (f2DriverSort === 'name-asc') return compareF2DriverNames(first, second);
      if (f2DriverSort === 'best-finish') {
        const firstPosition = Number(first.bestChampionshipPosition || Number.MAX_SAFE_INTEGER);
        const secondPosition = Number(second.bestChampionshipPosition || Number.MAX_SAFE_INTEGER);
        return firstPosition - secondPosition || Number(second.totalPoints || 0) - Number(first.totalPoints || 0) || compareF2DriverNames(first, second);
      }
      if (f2DriverSort === 'wins-desc') {
        return Number(second.totalRaceWins || 0) - Number(first.totalRaceWins || 0)
          || Number(second.totalPodiums || 0) - Number(first.totalPodiums || 0)
          || compareF2DriverNames(first, second);
      }
      return Number(second.lastSeason || 0) - Number(first.lastSeason || 0)
        || Number(first.bestChampionshipPosition || 999) - Number(second.bestChampionshipPosition || 999)
        || compareF2DriverNames(first, second);
    });

  const paged = pageItems(visible, f2DriverPage, F2_DRIVER_PAGE_SIZE);
  f2DriverPage = paged.page;
  document.getElementById('f2-driver-count').textContent = `${visible.length} driver${visible.length === 1 ? '' : 's'}`;
  document.getElementById('f2-drivers').innerHTML = paged.items.map(driver => `
    <a class="entity-card driver-browser-card f2-driver-card${driver.id === 'anthoine-hubert' ? ' f2-driver-card-memorial' : ''}" href="/f2/driver?id=${encodeURIComponent(driver.id)}">
      ${f2DriverMemorial(driver)}
      <div class="driver-card-name"><h3>${esc(driver.name)}</h3>${f2DriverFlag(driver)}</div>
      <p>${esc(driver.abbreviation || 'F2 driver')} · ${esc(f2CountryName(driver.countryCode))} · ${esc(f2DriverCareer(driver))}</p>
      <div class="f2-driver-team">${esc(driver.latestConstructorName || 'Team not recorded')}</div>
      <div class="f2-driver-card-record">
        <span><strong>${fmtNumber(driver.totalRaceWins)}</strong> wins</span>
        <span><strong>${fmtNumber(driver.totalPodiums)}</strong> podiums</span>
        ${Number(driver.bestChampionshipPosition || 0) ? `<span><strong>P${fmtNumber(driver.bestChampionshipPosition)}</strong> best</span>` : ''}
      </div>
      ${Number(driver.totalChampionshipWins || 0) > 0 ? '<em class="f2-driver-title">F2 champion</em>' : ''}
    </a>`).join('');
  renderPagination('f2-drivers', visible.length, f2DriverPage, F2_DRIVER_PAGE_SIZE, page => {
    f2DriverPage = page;
    updateF2Drivers();
    document.getElementById('f2-drivers').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadF2Drivers() {
  try {
    allF2Drivers = await getJSON('/api/drivers?series=f2&limit=1000');
    updateF2Drivers();
  } catch (error) {
    setError('f2-drivers', error.message);
  }
}

document.getElementById('f2-driver-search').addEventListener('input', event => {
  f2DriverPage = 1;
  f2DriverSearch = event.target.value.toLowerCase().trim();
  updateF2Drivers();
});

document.getElementById('f2-driver-sort').addEventListener('change', event => {
  f2DriverPage = 1;
  f2DriverSort = event.target.value;
  updateF2Drivers();
});

loadF2Drivers();
