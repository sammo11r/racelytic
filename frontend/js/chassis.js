let allChassis = [];
let chassisPage = 1;
const CHASSIS_PAGE_SIZE = 24;

function renderChassis() {
  const query = document.getElementById('chassis-search').value.toLowerCase().trim();
  const manufacturer = document.getElementById('chassis-engine').value;
  const visible = allChassis.filter(chassis => (!manufacturer || chassis.engineManufacturerIds.includes(manufacturer))
    && (!query || `${chassis.name} ${chassis.fullName} ${chassis.constructorName} ${chassis.engineManufacturers.join(' ')} ${chassis.engines.join(' ')}`.toLowerCase().includes(query)));
  const paged = pageItems(visible, chassisPage, CHASSIS_PAGE_SIZE);
  chassisPage = paged.page;
  document.getElementById('chassis-count').textContent = `${fmtNumber(visible.length)} chassis`;
  document.getElementById('chassis').innerHTML = paged.items.length ? paged.items.map(chassis => `
    <article class="constructor-chassis-card chassis-browser-card">
      <div class="chassis-card-heading"><div><span>${chassis.firstYear ? (chassis.firstYear === chassis.lastYear ? esc(chassis.firstYear) : `${esc(chassis.firstYear)}–${esc(chassis.lastYear)}`) : 'YEAR UNKNOWN'}</span><h3>${esc(chassis.fullName || chassis.name)}</h3></div></div>
      <div class="chassis-constructor">${chassis.constructorId ? `<a href="/constructor.html?id=${encodeURIComponent(chassis.constructorId)}">${esc(chassis.constructorName)}</a>` : 'Unknown constructor'}</div>
      <div class="chassis-engine-block"><span>ENGINE MANUFACTURER${chassis.engineManufacturers.length === 1 ? '' : 'S'}</span><p class="engine-manufacturer-list">${esc(chassis.engineManufacturers.join(', ') || 'Unknown')}</p><span>ENGINE${chassis.engines.length === 1 ? '' : 'S'}</span>${chassis.engines.length ? `<ul>${chassis.engines.map(engine => `<li>${esc(engine)}</li>`).join('')}</ul>` : '<p>Exact engine information unavailable</p>'}</div>
    </article>`).join('') : '<div class="empty-state">No chassis match these filters.</div>';
  renderPagination('chassis', visible.length, chassisPage, CHASSIS_PAGE_SIZE, page => { chassisPage = page; renderChassis(); document.getElementById('chassis').scrollIntoView({ behavior:'smooth', block:'start' }); });
}

getJSON('/api/chassis').then(chassis => {
  allChassis = chassis;
  document.getElementById('chassis-search').value = params().get('search') || '';
  const manufacturers = new Map();
  chassis.forEach(item => item.engineManufacturerIds.forEach((id,index) => manufacturers.set(id,item.engineManufacturers[index] || id)));
  document.getElementById('chassis-engine').insertAdjacentHTML('beforeend',[...manufacturers].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join(''));
  renderChassis();
}).catch(error => setError('chassis',error.message));
document.getElementById('chassis-search').addEventListener('input',()=>{chassisPage=1;renderChassis();});
document.getElementById('chassis-engine').addEventListener('change',()=>{chassisPage=1;renderChassis();});
