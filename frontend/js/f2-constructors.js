let allF2Constructors = [];
let f2ConstructorPage = 1;
const F2_CONSTRUCTOR_PAGE_SIZE = 24;

function f2ConstructorFlag(constructor) {
  const code = String(constructor.countryCode || '').toLowerCase();
  return code ? `<img class="driver-card-flag" src="/assets/flags/${encodeURIComponent(code)}.svg" alt="${esc(code.toUpperCase())} flag" loading="lazy">` : '';
}

function renderF2Constructors() {
  const search = document.getElementById('f2-constructor-search').value.toLowerCase().trim();
  const sort = document.getElementById('f2-constructor-sort').value;
  const constructors = allF2Constructors
    .filter(constructor => `${constructor.name} ${constructor.abbreviation || ''}`.toLowerCase().includes(search))
    .sort((first, second) => {
      if (sort === 'name') return first.name.localeCompare(second.name);
      if (sort === 'wins') return Number(second.totalRaceWins || 0) - Number(first.totalRaceWins || 0) || first.name.localeCompare(second.name);
      if (sort === 'titles') return Number(second.totalChampionshipWins || 0) - Number(first.totalChampionshipWins || 0) || first.name.localeCompare(second.name);
      return Number(second.lastYear || 0) - Number(first.lastYear || 0) || Number(first.latestPosition || 999) - Number(second.latestPosition || 999);
    });
  const paged = pageItems(constructors, f2ConstructorPage, F2_CONSTRUCTOR_PAGE_SIZE);
  f2ConstructorPage = paged.page;
  document.getElementById('f2-constructor-count').textContent = `${fmtNumber(constructors.length)} constructor${constructors.length === 1 ? '' : 's'}`;
  document.getElementById('f2-constructors').innerHTML = paged.items.map(constructor => `
    <a class="entity-card f2-driver-card" href="/f2/constructor?id=${encodeURIComponent(constructor.id)}">
      <div class="driver-card-name"><h3>${esc(constructor.name)}</h3>${f2ConstructorFlag(constructor)}</div>
      <p>${esc(constructor.abbreviation || 'F2 team')} · ${constructor.firstYear ? `${esc(constructor.firstYear)}${constructor.lastYear !== constructor.firstYear ? `–${esc(constructor.lastYear)}` : ''}` : 'Seasons unavailable'}</p>
      <div class="f2-driver-card-record"><span><strong>${fmtNumber(constructor.totalRaceWins)}</strong> wins</span><span><strong>${fmtNumber(constructor.totalPodiums)}</strong> podiums</span><span><strong>${fmtNumber(constructor.totalChampionshipWins)}</strong> titles</span></div>
      ${Number(constructor.totalChampionshipWins || 0) > 0 ? '<em class="f2-driver-title">F2 champion</em>' : ''}
    </a>`).join('');
  renderPagination('f2-constructors', constructors.length, f2ConstructorPage, F2_CONSTRUCTOR_PAGE_SIZE, page => {
    f2ConstructorPage = page;
    renderF2Constructors();
    document.getElementById('f2-constructors').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadF2Constructors() {
  try {
    allF2Constructors = await getJSON('/api/constructors?series=f2');
    renderF2Constructors();
  } catch (error) {
    setError('f2-constructors', error.message);
  }
}

['f2-constructor-search', 'f2-constructor-sort'].forEach(id => document.getElementById(id).addEventListener(id.endsWith('search') ? 'input' : 'change', () => {
  f2ConstructorPage = 1;
  renderF2Constructors();
}));

loadF2Constructors();
