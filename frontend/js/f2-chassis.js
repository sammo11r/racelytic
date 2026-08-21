let allF2Chassis = [];

function f2ChassisYearLabel(chassis) {
  if (!chassis.firstYear) return 'YEARS UNKNOWN';
  return chassis.firstYear === chassis.lastYear ? String(chassis.firstYear) : `${chassis.firstYear}–${chassis.lastYear}`;
}

function f2ChassisSpecification(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value || '—')}</dd></div>`;
}

function renderF2Chassis() {
  const chassis = [...allF2Chassis].sort((first, second) => Number(first.generation) - Number(second.generation));
  document.getElementById('f2-chassis').innerHTML = chassis.length ? chassis.map(item => `
    <article class="junior-technical-chassis-card">
      <header><div><span>GENERATION ${esc(item.generation)} · ${esc(f2ChassisYearLabel(item))}</span><h2>${esc(item.name)}</h2><p>${esc(item.manufacturer)} · ${esc(item.designer)}</p></div><strong>${item.retiredYear ? 'RETIRED' : 'CURRENT'}</strong></header>
      <div class="junior-chassis-quick-specs"><div><span>POWER</span><strong>${fmtNumber(item.powerHp)} hp</strong><small>${fmtNumber(item.powerKw)} kW</small></div><div><span>WEIGHT</span><strong>${fmtNumber(item.weightKg)} kg</strong><small>including driver${item.weightIncludesFuel ? ' and fuel' : ''}</small></div><div><span>ENGINE</span><strong>${esc(item.engineName)}</strong><small>${esc(item.engineConfiguration)}</small></div><div><span>WHEELS</span><strong>${esc(item.wheelRimLabel)}</strong><small>Pirelli</small></div></div>
      <div class="junior-chassis-specification-groups">
        <section><h3>Chassis</h3><dl>${f2ChassisSpecification('Construction', item.chassisConstruction)}${f2ChassisSpecification('Dimensions', `${fmtNumber(item.lengthMm)} × ${fmtNumber(item.widthMm)} × ${fmtNumber(item.heightMm)} mm`)}${f2ChassisSpecification('Wheelbase', `${fmtNumber(item.wheelbaseMm)} mm`)}${f2ChassisSpecification('Front suspension', item.frontSuspension)}${f2ChassisSpecification('Rear suspension', item.rearSuspension)}</dl></section>
        <section><h3>Powertrain</h3><dl>${f2ChassisSpecification('Engine', `${item.engineConfiguration}; ${item.engineLayout}`)}${f2ChassisSpecification('Output', `${fmtNumber(item.powerHp)} hp (${fmtNumber(item.powerKw)} kW) at ${fmtNumber(item.powerRpm)} rpm`)}${f2ChassisSpecification('Torque', `${fmtNumber(item.torqueNm)} Nm`)}${f2ChassisSpecification('Transmission', item.transmission)}</dl></section>
        <section><h3>Consumables</h3><dl>${f2ChassisSpecification('Fuel', item.fuel)}${f2ChassisSpecification('Lubricants', item.lubricants)}${f2ChassisSpecification('Brakes', item.brakes)}${f2ChassisSpecification('Tyres', `${item.tyres}; ${item.wheelRimLabel}`)}</dl></section>
        <section><h3>Competition history</h3><dl>${f2ChassisSpecification('Predecessor', item.predecessor)}${f2ChassisSpecification('Successor', item.successor || 'Current chassis')}${f2ChassisSpecification('Debut', item.debut)}${f2ChassisSpecification('Last event', item.lastEvent || 'In active service')}</dl></section>
      </div>
      <footer><div class="constructor-driver-record"><small>${fmtNumber(item.totalWeekends)} weekends</small><small>${fmtNumber(item.totalTeams)} teams</small><small>${fmtNumber(item.totalDrivers)} drivers</small><small>${fmtNumber(item.totalEntries)} entries</small></div><a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Technical source ↗</a></footer>
    </article>`).join('') : '<div class="empty-state">No Formula 2 chassis data is available.</div>';
}

async function loadF2Chassis() {
  try {
    allF2Chassis = await getJSON('/api/chassis?series=f2');
    renderF2Chassis();
  } catch (error) {
    setError('f2-chassis', error.message);
  }
}

loadF2Chassis();
