let allCircuits = [];
let circuitPage = 1;
let circuitSearch = '';
let circuitSort = 'name';
const CIRCUIT_PAGE_SIZE = 24;
async function loadCircuits() {
  try {
    allCircuits = await getJSON('/api/circuits');
    updateCircuits();
  } catch (error) { setError('circuits', error.message); }
}
function renderCircuits(list) {
  const paged = pageItems(list, circuitPage, CIRCUIT_PAGE_SIZE);
  circuitPage = paged.page;
  document.getElementById('circuits').innerHTML = paged.items.map(c => `
    <a class="entity-card" href="/circuit?id=${encodeURIComponent(c.id)}">
      ${c.layoutId ? `<img class="circuit-card-map" src="/assets/circuits/${encodeURIComponent(c.layoutId)}.svg" alt="" loading="lazy">` : ''}
      <div class="circuit-card-copy">
        <h3>${esc(c.name)}</h3>
        <p>${esc(c.countryName || c.countryId || '')} · ${esc(c.placeName || '')}</p>
        <span class="number">${fmtNumber(c.totalRacesHeld)} races held</span>
      </div>
    </a>`).join('');
  renderPagination('circuits', list.length, circuitPage, CIRCUIT_PAGE_SIZE, page => { circuitPage = page; renderCircuits(list); document.getElementById('circuits').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
function updateCircuits() {
  const visible = allCircuits
    .filter(circuit => `${circuit.name} ${circuit.fullName || ''} ${circuit.placeName || ''} ${circuit.countryName || ''}`.toLowerCase().includes(circuitSearch))
    .sort((first, second) => {
      if (circuitSort === 'recent') return Number(second.lastYear || 0) - Number(first.lastYear || 0) || first.name.localeCompare(second.name);
      if (circuitSort === 'races') return Number(second.totalRacesHeld || 0) - Number(first.totalRacesHeld || 0) || first.name.localeCompare(second.name);
      return first.name.localeCompare(second.name);
    });
  document.getElementById('circuit-count').textContent = `${fmtNumber(visible.length)} circuit${visible.length === 1 ? '' : 's'}`;
  renderCircuits(visible);
}
document.getElementById('search').addEventListener('input', e => {
  circuitPage = 1;
  circuitSearch = e.target.value.toLowerCase().trim();
  updateCircuits();
});
document.getElementById('circuit-sort').addEventListener('change', event => {
  circuitPage = 1;
  circuitSort = event.target.value;
  updateCircuits();
});
loadCircuits();
