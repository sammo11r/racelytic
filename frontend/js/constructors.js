let allConstructors = [];
let constructorPage = 1;
const CONSTRUCTOR_PAGE_SIZE = 24;
async function loadConstructors() {
  try {
    allConstructors = await getJSON('/api/constructors');
    renderConstructors(allConstructors);
  } catch (error) { setError('constructors', error.message); }
}
function renderConstructors(list) {
  const paged = pageItems(list, constructorPage, CONSTRUCTOR_PAGE_SIZE);
  constructorPage = paged.page;
  document.getElementById('constructors').innerHTML = paged.items.map(t => `
    <a class="entity-card" href="/constructor.html?id=${encodeURIComponent(t.id)}">
      <h3>${esc(t.name)}</h3>
      <p>${esc(t.fullName || '')}${t.countryName ? ` · ${esc(t.countryName)}` : ''}</p>
      <span class="number">${fmtNumber(t.totalRaceWins)} wins · ${fmtNumber(t.totalChampionshipWins)} titles</span>
    </a>`).join('');
  renderPagination('constructors', list.length, constructorPage, CONSTRUCTOR_PAGE_SIZE, page => { constructorPage = page; renderConstructors(list); document.getElementById('constructors').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
document.getElementById('search').addEventListener('input', e => {
  constructorPage = 1;
  const q = e.target.value.toLowerCase().trim();
  renderConstructors(allConstructors.filter(t => `${t.name} ${t.fullName || ''} ${t.countryName || ''}`.toLowerCase().includes(q)));
});
loadConstructors();
