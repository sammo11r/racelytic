let allCircuits = [];
let circuitPage = 1;
const CIRCUIT_PAGE_SIZE = 24;
async function loadCircuits() {
  try {
    allCircuits = await getJSON('/api/circuits');
    renderCircuits(allCircuits);
  } catch (error) { setError('circuits', error.message); }
}
function renderCircuits(list) {
  const paged = pageItems(list, circuitPage, CIRCUIT_PAGE_SIZE);
  circuitPage = paged.page;
  document.getElementById('circuits').innerHTML = paged.items.map(c => `
    <a class="entity-card" href="/circuit.html?id=${encodeURIComponent(c.id)}">
      ${c.layoutId ? `<img class="circuit-card-map" src="/assets/circuits/${encodeURIComponent(c.layoutId)}.svg" alt="" loading="lazy">` : ''}
      <div class="circuit-card-copy">
        <h3>${esc(c.name)}</h3>
        <p>${esc(c.countryName || c.countryId || '')} · ${esc(c.placeName || '')}</p>
        <span class="number">${fmtNumber(c.totalRacesHeld)} races held</span>
      </div>
    </a>`).join('');
  renderPagination('circuits', list.length, circuitPage, CIRCUIT_PAGE_SIZE, page => { circuitPage = page; renderCircuits(list); document.getElementById('circuits').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
document.getElementById('search').addEventListener('input', e => {
  circuitPage = 1;
  const q = e.target.value.toLowerCase().trim();
  renderCircuits(allCircuits.filter(c => `${c.name} ${c.fullName} ${c.placeName} ${c.countryName || ''}`.toLowerCase().includes(q)));
});
loadCircuits();
