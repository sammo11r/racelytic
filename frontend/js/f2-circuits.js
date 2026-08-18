let allF2Circuits = [];
let f2CircuitPage = 1;
const F2_CIRCUIT_PAGE_SIZE = 24;

function renderF2Circuits() {
  const search = document.getElementById('f2-circuit-search').value.toLowerCase().trim();
  const sort = document.getElementById('f2-circuit-sort').value;
  const circuits = allF2Circuits
    .filter(circuit => `${circuit.name} ${circuit.placeName || ''} ${circuit.type || ''}`.toLowerCase().includes(search))
    .sort((first, second) => {
      if (sort === 'recent') return Number(second.lastYear || 0) - Number(first.lastYear || 0) || first.name.localeCompare(second.name);
      if (sort === 'weekends') return Number(second.totalRacesHeld || 0) - Number(first.totalRacesHeld || 0) || first.name.localeCompare(second.name);
      return first.name.localeCompare(second.name);
    });
  const paged = pageItems(circuits, f2CircuitPage, F2_CIRCUIT_PAGE_SIZE);
  f2CircuitPage = paged.page;
  document.getElementById('f2-circuit-count').textContent = `${fmtNumber(circuits.length)} circuit${circuits.length === 1 ? '' : 's'}`;
  document.getElementById('f2-circuits').innerHTML = paged.items.map(circuit => {
    const imageId = f2CircuitImageId(circuit.id);
    return `<a class="entity-card" href="/f2/circuit?id=${encodeURIComponent(circuit.id)}">
      ${imageId ? `<img class="circuit-card-map" src="/assets/circuits/${encodeURIComponent(imageId)}.svg" alt="" loading="lazy">` : ''}
      <div class="circuit-card-copy">
        <h3>${esc(circuit.name)}</h3>
        <p>${esc(circuit.placeName || 'Location not recorded')}</p>
        <span class="number">${fmtNumber(circuit.totalRacesHeld)} weekends · ${esc(circuit.firstYear || '—')}${circuit.lastYear && circuit.lastYear !== circuit.firstYear ? `–${esc(circuit.lastYear)}` : ''}</span>
      </div>
    </a>`;
  }).join('');
  renderPagination('f2-circuits', circuits.length, f2CircuitPage, F2_CIRCUIT_PAGE_SIZE, page => {
    f2CircuitPage = page;
    renderF2Circuits();
    document.getElementById('f2-circuits').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadF2Circuits() {
  try {
    allF2Circuits = await getJSON('/api/circuits?series=f2');
    renderF2Circuits();
  } catch (error) {
    setError('f2-circuits', error.message);
  }
}

['f2-circuit-search', 'f2-circuit-sort'].forEach(id => document.getElementById(id).addEventListener(id.endsWith('search') ? 'input' : 'change', () => {
  f2CircuitPage = 1;
  renderF2Circuits();
}));

loadF2Circuits();
