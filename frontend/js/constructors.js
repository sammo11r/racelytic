let allConstructors = [];
let constructorPage = 1;
let constructorSearch = '';
let constructorSort = 'name';
const CONSTRUCTOR_PAGE_SIZE = 24;
async function loadConstructors() {
  try {
    allConstructors = await getJSON('/api/constructors');
    updateConstructors();
  } catch (error) { setError('constructors', error.message); }
}
function renderConstructors(list) {
  const paged = pageItems(list, constructorPage, CONSTRUCTOR_PAGE_SIZE);
  constructorPage = paged.page;
  document.getElementById('constructors').innerHTML = paged.items.map(t => `
    <a class="entity-card f2-driver-card f1-achievement-card" href="/constructor?id=${encodeURIComponent(t.id)}">
      <h3>${esc(t.name)}</h3>
      <p>${esc(t.fullName || '')}${t.countryName ? ` · ${esc(t.countryName)}` : ''}</p>
      <div class="f2-driver-card-record"><span><strong>${fmtNumber(t.totalRaceWins)}</strong> wins</span><span><strong>${fmtNumber(t.totalPodiums)}</strong> podiums</span><span><strong>${fmtNumber(t.totalChampionshipWins)}</strong> titles</span></div>
      ${Number(t.totalChampionshipWins || 0) > 0 ? `<em class="f2-driver-title">${Number(t.totalChampionshipWins) > 1 ? `${fmtNumber(t.totalChampionshipWins)}× ` : ''}Constructors’ champion</em>` : ''}
    </a>`).join('');
  renderPagination('constructors', list.length, constructorPage, CONSTRUCTOR_PAGE_SIZE, page => { constructorPage = page; renderConstructors(list); document.getElementById('constructors').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
function updateConstructors() {
  const visible = allConstructors
    .filter(constructor => `${constructor.name} ${constructor.fullName || ''} ${constructor.countryName || ''}`.toLowerCase().includes(constructorSearch))
    .sort((first, second) => {
      if (constructorSort === 'wins') return Number(second.totalRaceWins || 0) - Number(first.totalRaceWins || 0) || first.name.localeCompare(second.name);
      if (constructorSort === 'titles') return Number(second.totalChampionshipWins || 0) - Number(first.totalChampionshipWins || 0) || first.name.localeCompare(second.name);
      return first.name.localeCompare(second.name);
    });
  document.getElementById('constructor-count').textContent = `${fmtNumber(visible.length)} constructor${visible.length === 1 ? '' : 's'}`;
  renderConstructors(visible);
}
document.getElementById('search').addEventListener('input', e => {
  constructorPage = 1;
  constructorSearch = e.target.value.toLowerCase().trim();
  updateConstructors();
});
document.getElementById('constructor-sort').addEventListener('change', event => {
  constructorPage = 1;
  constructorSort = event.target.value;
  updateConstructors();
});
loadConstructors();
