let allChassis = [], chassisPage = 1, chassisSearch = '', chassisSeason = '', chassisEngine = '', chassisSort = 'name';
let chassisView = 'current', latestChassisSeason = null, chassisLoaded = false;
const CHASSIS_PAGE_SIZE = 24;
const CHASSIS_CACHE_KEY = 'racelytic:f1:chassis:v1';

function chassisSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function chassisName(chassis) { return chassis.fullName || chassis.name; }
function readChassisState() {
  const query = params();
  chassisView = query.get('view') === 'all' ? 'all' : 'current';
  chassisSearch = query.get('q') || '';
  chassisSeason = /^\d{4}$/.test(query.get('season') || '') ? query.get('season') : '';
  if (chassisSeason) chassisView = 'all';
  chassisEngine = query.get('engine') || '';
  chassisSort = ['name', 'recent', 'starts', 'wins'].includes(query.get('sort')) ? query.get('sort') : 'name';
  const page = Number(query.get('page'));
  chassisPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
}
function chassisArchivePath() {
  const query = new URLSearchParams();
  if (chassisView === 'all') query.set('view', 'all');
  if (chassisSearch.trim()) query.set('q', chassisSearch.trim());
  if (chassisSeason) query.set('season', chassisSeason);
  if (chassisEngine) query.set('engine', chassisEngine);
  if (chassisSort !== 'name') query.set('sort', chassisSort);
  if (chassisPage > 1) query.set('page', chassisPage);
  return `/chassis${query.size ? `?${query}` : ''}`;
}
function updateChassisControls() {
  document.getElementById('chassis-search').value = chassisSearch;
  document.getElementById('chassis-season').value = chassisView === 'current' ? String(latestChassisSeason || '') : chassisSeason;
  document.getElementById('chassis-engine').value = chassisEngine;
  document.getElementById('chassis-sort').value = chassisSort;
  document.querySelectorAll('[data-chassis-view]').forEach(button => {
    const active = button.dataset.chassisView === chassisView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function populateChassisFilters() {
  const years = [...new Set(allChassis.flatMap(chassis => chassis.seasons))].sort((a, b) => b - a);
  const manufacturers = new Map();
  allChassis.forEach(chassis => chassis.engineManufacturerIds.forEach((id, index) => manufacturers.set(id, chassis.engineManufacturers[index] || id)));
  const engines = [...manufacturers].sort((a, b) => a[1].localeCompare(b[1]));
  document.getElementById('chassis-season').innerHTML = '<option value="">All seasons</option>' + years.map(year => `<option value="${year}">${year}${year === latestChassisSeason ? ' · Current grid' : ''}</option>`).join('');
  document.getElementById('chassis-engine').innerHTML = '<option value="">All manufacturers</option>' + engines.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  if (chassisSeason && !years.includes(Number(chassisSeason))) chassisSeason = '';
  if (chassisEngine && !manufacturers.has(chassisEngine)) chassisEngine = '';
}
function filteredChassis() {
  const search = chassisSearchText(chassisSearch.trim());
  const season = chassisView === 'current' ? latestChassisSeason : Number(chassisSeason) || null;
  const compareNames = (a, b) => chassisName(a).localeCompare(chassisName(b), undefined, { sensitivity: 'base' });
  return allChassis.filter(chassis => {
    if (season && !chassis.seasons.includes(season)) return false;
    if (chassisEngine && !chassis.engineManufacturerIds.includes(chassisEngine)) return false;
    if (!search) return true;
    return chassisSearchText([chassis.id, chassis.name, chassis.fullName, chassis.constructorName, ...chassis.engineManufacturers, ...chassis.engines].filter(Boolean).join(' ')).includes(search);
  }).sort((a, b) => {
    if (chassisSort === 'recent') return Number(b.lastYear || 0) - Number(a.lastYear || 0) || compareNames(a, b);
    if (chassisSort === 'starts') return Number(b.totalRaceStarts || 0) - Number(a.totalRaceStarts || 0) || compareNames(a, b);
    if (chassisSort === 'wins') return Number(b.totalRaceWins || 0) - Number(a.totalRaceWins || 0) || compareNames(a, b);
    return compareNames(a, b);
  });
}
function chassisEngineSummary(chassis) {
  const names = chassis.engineManufacturers.length ? chassis.engineManufacturers : chassis.engines;
  if (!names.length) return 'Power unit not recorded';
  return `${names.slice(0, 2).join(' · ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
}
function renderChassisCard(chassis) {
  const years = chassis.firstYear ? (Number(chassis.firstYear) === Number(chassis.lastYear) ? String(chassis.firstYear) : `${chassis.firstYear}–${chassis.lastYear}`) : '';
  const performance = Number(chassis.performanceSeasons || 0);
  const stats = performance ? [
    `<span><strong>${fmtNumber(chassis.totalRaceStarts)}</strong> starts</span>`,
    Number(chassis.totalRaceWins) > 0 ? `<span><strong>${fmtNumber(chassis.totalRaceWins)}</strong> wins</span>` : '',
    Number(chassis.totalPodiums) > 0 ? `<span><strong>${fmtNumber(chassis.totalPodiums)}</strong> podiums</span>` : ''
  ].filter(Boolean).join('') : '<span>Performance not uniquely attributable</span>';
  const coverage = performance && performance < chassis.seasons.length ? `<small>${performance} of ${chassis.seasons.length} seasons attributable</small>` : '';
  return `<article class="entity-card chassis-archive-card">
    <div class="chassis-card-heading"><span>${esc(years || 'Participation not recorded')}${years ? ` · ${chassis.seasons.length} season${chassis.seasons.length === 1 ? '' : 's'}` : ''}</span><h3>${esc(chassisName(chassis))}</h3></div>
    <div class="chassis-archive-constructor">${chassis.constructorId ? `<a href="/constructor?id=${encodeURIComponent(chassis.constructorId)}">${esc(chassis.constructorName)}</a>` : 'Constructor not recorded'}</div>
    <div class="chassis-archive-engine"><span class="constructor-card-label">Power unit</span><p>${esc(chassisEngineSummary(chassis))}</p></div>
    <div class="chassis-archive-performance" title="Performance totals include only seasons in which this was the constructor’s sole recorded chassis."><span class="constructor-card-label">Recorded performance</span><div class="constructor-card-record">${stats}</div>${coverage}</div>
  </article>`;
}
function renderChassis(list) {
  const paged = pageItems(list, chassisPage, CHASSIS_PAGE_SIZE);
  chassisPage = paged.page;
  history.replaceState(null, '', chassisArchivePath());
  const grid = document.getElementById('chassis');
  grid.setAttribute('aria-busy', 'false');
  grid.innerHTML = list.length ? paged.items.map(renderChassisCard).join('') : '<div class="driver-empty-state chassis-empty-state"><h2>No chassis found</h2><p>Try another chassis, season, constructor or engine.</p><button type="button" class="button secondary" id="chassis-empty-clear">Clear filters</button></div>';
  if (!list.length) document.getElementById('chassis-empty-clear').addEventListener('click', clearChassisFilters);
  renderPagination('chassis', list.length, chassisPage, CHASSIS_PAGE_SIZE, page => { chassisPage = page; updateChassis(); grid.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
function updateChassis() {
  updateChassisControls();
  if (!chassisLoaded) return;
  const visible = filteredChassis();
  renderChassis(visible);
  const scope = chassisView === 'current' ? `on the ${latestChassisSeason} grid` : chassisSeason ? `used in ${chassisSeason}` : 'in the archive';
  document.getElementById('chassis-count').textContent = `${fmtNumber(visible.length)} chassis ${scope}`;
}
function clearChassisFilters() {
  chassisSearch = ''; chassisSeason = ''; chassisEngine = ''; chassisSort = 'name'; chassisPage = 1;
  updateChassis();
}
function bindChassisControls() {
  const changes = {
    'chassis-search': value => { chassisSearch = value; },
    'chassis-season': value => { chassisSeason = value; chassisView = 'all'; },
    'chassis-engine': value => { chassisEngine = value; },
    'chassis-sort': value => { chassisSort = value; }
  };
  Object.entries(changes).forEach(([id, change]) => document.getElementById(id).addEventListener(id.endsWith('search') ? 'input' : 'change', event => { change(event.target.value); chassisPage = 1; updateChassis(); }));
  document.getElementById('chassis-clear').addEventListener('click', clearChassisFilters);
  document.querySelectorAll('[data-chassis-view]').forEach(button => button.addEventListener('click', () => { chassisView = button.dataset.chassisView; chassisSeason = ''; chassisPage = 1; updateChassis(); }));
  window.addEventListener('popstate', () => { readChassisState(); updateChassis(); });
}
function applyChassisData(rows) {
  allChassis = rows.map(row => ({ ...row, seasons: (row.seasons || []).map(Number) }));
  latestChassisSeason = Math.max(0, ...allChassis.map(row => Number(row.currentSeason) || 0)) || null;
  chassisLoaded = true;
  populateChassisFilters(); updateChassis();
}
function cachedChassis() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CHASSIS_CACHE_KEY));
    if (cached && Date.now() - cached.savedAt < 300000 && Array.isArray(cached.rows)
        && cached.rows.every(row => row.id && Array.isArray(row.seasons))) return cached.rows;
  } catch { /* Loading continues when storage is unavailable. */ }
  return null;
}
async function loadChassis() {
  const status = document.getElementById('chassis-load-status');
  if (!chassisLoaded) { const cached = cachedChassis(); if (cached) applyChassisData(cached); }
  status.textContent = chassisLoaded ? 'Refreshing chassis…' : '';
  try {
    const rows = await getJSON('/api/chassis');
    applyChassisData(rows); status.textContent = '';
    try { sessionStorage.setItem(CHASSIS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows })); } catch { /* Optional cache. */ }
  } catch (error) {
    const retry = '<button type="button" class="button secondary" id="chassis-retry">Retry</button>';
    if (chassisLoaded) status.innerHTML = `Showing saved chassis. ${retry}`;
    else {
      document.getElementById('chassis').setAttribute('aria-busy', 'false');
      document.getElementById('chassis').innerHTML = `<div class="chassis-empty-state"><h2>Chassis unavailable</h2><p>${esc(error.message)}</p>${retry}</div>`;
      document.getElementById('chassis-count').textContent = 'Unable to load chassis';
    }
    document.getElementById('chassis-retry').addEventListener('click', loadChassis);
  }
}
readChassisState();
bindChassisControls();
loadChassis();
