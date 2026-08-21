let allF3Circuits = [];
let f3CircuitPage = 1;
const F3_CIRCUIT_PAGE_SIZE = 24;

function renderF3Circuits() {
  const search = document.getElementById('f3-circuit-search').value.toLowerCase().trim();
  const sort = document.getElementById('f3-circuit-sort').value;
  const circuits = allF3Circuits
    .filter(circuit => `${circuit.name} ${circuit.placeName || ''} ${circuit.type || ''}`.toLowerCase().includes(search))
    .sort((first, second) => {
      if (sort === 'recent') return Number(second.lastYear || 0) - Number(first.lastYear || 0) || first.name.localeCompare(second.name);
      if (sort === 'weekends') return Number(second.totalRacesHeld || 0) - Number(first.totalRacesHeld || 0) || first.name.localeCompare(second.name);
      return first.name.localeCompare(second.name);
    });
  const paged = pageItems(circuits, f3CircuitPage, F3_CIRCUIT_PAGE_SIZE);
  f3CircuitPage = paged.page;
  document.getElementById('f3-circuit-count').textContent = `${fmtNumber(circuits.length)} circuit${circuits.length === 1 ? '' : 's'}`;
  document.getElementById('f3-circuits').innerHTML = paged.items.map(circuit => {
    const imageId = f2CircuitImageId(circuit.id);
    return `<a class="entity-card" href="/f3/circuit?id=${encodeURIComponent(circuit.id)}">${imageId ? `<img class="circuit-card-map" src="/assets/circuits/${encodeURIComponent(imageId)}.svg" alt="" loading="lazy">` : ''}<div class="circuit-card-copy"><h3>${esc(circuit.name)}</h3><p>${esc(circuit.placeName || 'Location not recorded')}</p><span class="number">${fmtNumber(circuit.totalRacesHeld)} weekends · ${esc(circuit.firstYear || '—')}${circuit.lastYear && circuit.lastYear !== circuit.firstYear ? `–${esc(circuit.lastYear)}` : ''}</span></div></a>`;
  }).join('');
  renderPagination('f3-circuits', circuits.length, f3CircuitPage, F3_CIRCUIT_PAGE_SIZE, page => { f3CircuitPage = page; renderF3Circuits(); document.getElementById('f3-circuits').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

async function loadF3Circuits() {
  try {
    allF3Circuits = await getJSON('/api/circuits?series=f3');
    renderF3Circuits();
  } catch (error) {
    setError('f3-circuits', error.message);
  }
}

['f3-circuit-search', 'f3-circuit-sort'].forEach(id => document.getElementById(id).addEventListener(id.endsWith('search') ? 'input' : 'change', () => { f3CircuitPage = 1; renderF3Circuits(); }));
loadF3Circuits();
