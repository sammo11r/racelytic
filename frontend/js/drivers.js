let allDrivers = [];
let driverSearch = '';
let driverSort = 'name-asc';
let driverPage = 1;
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

async function loadDrivers() {
  try {
    allDrivers = await getJSON('/api/drivers?limit=1000');
    updateDrivers();
  } catch (error) { setError('drivers', error.message); }
}

function compareNames(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
}

function f1DriverMemorial(driver) {
  const years = F1_DRIVER_MEMORIALS.get(String(driver.id));
  return years
    ? `<div class="f2-driver-memorial"><span class="memorial-ribbon" aria-hidden="true"></span><span>In memoriam</span><small>${years}</small></div>`
    : '';
}

function f1DriverTitle(driver) {
  const titles = Number(driver.totalChampionshipWins || 0);
  if (!titles) return '';
  return `<em class="f2-driver-title">${titles > 1 ? `${fmtNumber(titles)}× ` : ''}World champion</em>`;
}

function updateDrivers() {
  const visible = allDrivers
    .filter(d => `${d.name} ${d.abbreviation || ''}`.toLowerCase().includes(driverSearch))
    .sort((a, b) => {
      if (driverSort === 'name-desc') return compareNames(b, a);
      if (driverSort === 'recent') {
        return Number(b.lastYear || 0) - Number(a.lastYear || 0) || compareNames(a, b);
      }
      if (driverSort === 'best-finish') {
        return Number(a.bestChampionshipPosition || 999) - Number(b.bestChampionshipPosition || 999)
          || compareNames(a, b);
      }
      if (driverSort === 'wins-desc') {
        return Number(b.totalRaceWins || 0) - Number(a.totalRaceWins || 0)
          || Number(b.totalPodiums || 0) - Number(a.totalPodiums || 0)
          || compareNames(a, b);
      }
      return compareNames(a, b);
    });

  renderDrivers(visible);
  document.getElementById('driver-count').textContent = `${visible.length} driver${visible.length === 1 ? '' : 's'}`;
}
function renderDrivers(list) {
  const paged = pageItems(list, driverPage, DRIVER_PAGE_SIZE);
  driverPage = paged.page;
  document.getElementById('drivers').innerHTML = paged.items.map(d => `
    <a class="entity-card driver-browser-card f2-driver-card f1-achievement-card${F1_DRIVER_MEMORIALS.has(String(d.id)) ? ' f2-driver-card-memorial' : ''}" href="/driver?id=${encodeURIComponent(d.id)}">
      ${f1DriverMemorial(d)}
      <div class="driver-card-name"><h3>${esc(d.name)}</h3>${COUNTRY_CODES[d.nationalityCountryId] ? `<img class="driver-card-flag" src="/assets/flags/${COUNTRY_CODES[d.nationalityCountryId].toLowerCase()}.svg" alt="${esc(countryName(d.nationalityCountryId))} flag" loading="lazy">` : ''}</div>
      <p>${esc(d.abbreviation || '')}${d.nationalityCountryId ? ` · ${esc(countryName(d.nationalityCountryId))}` : ''}</p>
      <div class="f2-driver-card-record"><span><strong>${fmtNumber(d.totalRaceWins)}</strong> wins</span><span><strong>${fmtNumber(d.totalPodiums)}</strong> podiums</span><span><strong>${fmtNumber(d.totalChampionshipWins)}</strong> titles</span></div>
      ${f1DriverTitle(d)}
    </a>`).join('');
  renderPagination('drivers', list.length, driverPage, DRIVER_PAGE_SIZE, page => { driverPage = page; updateDrivers(); document.getElementById('drivers').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
document.getElementById('search').addEventListener('input', e => {
  driverPage = 1;
  driverSearch = e.target.value.toLowerCase().trim();
  updateDrivers();
});
document.getElementById('driver-sort').addEventListener('change', e => {
  driverPage = 1;
  driverSort = e.target.value;
  updateDrivers();
});
loadDrivers();
