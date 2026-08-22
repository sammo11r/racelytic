let allF3Chassis = [];

function yearLabel(chassis) {
  if (!chassis.firstYear) return 'YEARS UNKNOWN';
  return chassis.firstYear === chassis.lastYear ? String(chassis.firstYear) : `${chassis.firstYear}–${chassis.lastYear}`;
}

function specification(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value || '—')}</dd></div>`;
}

function renderF3Chassis() {
  const chassis = [...allF3Chassis].sort((first, second) => Number(first.generation) - Number(second.generation));
  document.getElementById('f3-chassis').innerHTML = chassis.length ? chassis.map(item => `
    <article class="junior-technical-chassis-card">
      <header><div><span>GENERATION ${esc(item.generation)} · ${esc(yearLabel(item))}</span><h2>${esc(item.name)}</h2><p>${esc(item.manufacturer)} · ${esc(item.designer)}</p></div><strong>${item.retiredYear ? 'RETIRED' : 'CURRENT'}</strong></header>
      <div class="junior-chassis-quick-specs"><div><span>POWER</span><strong>${fmtNumber(item.powerHp)} hp</strong><small>${fmtNumber(item.powerKw)} kW</small></div><div><span>WEIGHT</span><strong>${fmtNumber(item.weightKg)} kg</strong><small>including driver</small></div><div><span>ENGINE</span><strong>${esc(item.engineName)}</strong><small>${esc(item.engineConfiguration)}</small></div><div><span>WHEELS</span><strong>${fmtNumber(item.wheelRimInches)} inch</strong><small>Pirelli</small></div></div>
      <div class="junior-chassis-specification-groups">
        <section><h3>Chassis</h3><dl>${specification('Construction', item.chassisConstruction)}${specification('Dimensions', `${fmtNumber(item.lengthMm)} × ${fmtNumber(item.widthMm)} × ${fmtNumber(item.heightMm)} mm`)}${item.wheelbaseMm ? specification('Wheelbase', `${fmtNumber(item.wheelbaseMm)} mm`) : ''}${specification('Front suspension', item.frontSuspension)}${specification('Rear suspension', item.rearSuspension)}${item.aero ? specification('Aerodynamics', item.aero) : ''}</dl></section>
        <section><h3>Powertrain</h3><dl>${specification('Engine', `${item.engineConfiguration}; ${item.engineLayout}`)}${specification('Output', `${fmtNumber(item.powerHp)} hp (${fmtNumber(item.powerKw)} kW) at ${fmtNumber(item.powerRpm)} rpm`)}${specification('Torque', `${fmtNumber(item.torqueNm)} Nm`)}${specification('Transmission', item.transmission)}</dl></section>
        <section><h3>Consumables</h3><dl>${specification('Fuel', item.fuel)}${specification('Lubricants', item.lubricants)}${specification('Tyres', `${item.tyres}; ${item.wheelRimInches}-inch rims`)}</dl></section>
        ${item.topSpeedKph ? `<section><h3>Performance &amp; electronics</h3><dl>${specification('Top speed', `${fmtNumber(item.topSpeedKph)} km/h`)}${specification('Acceleration', `0–100 km/h in ${item.zeroTo100Seconds}s; 0–200 km/h in ${item.zeroTo200Seconds}s`)}${specification('Cornering', `Up to ±${item.lateralAccelerationG} G lateral acceleration`)}${specification('Braking', `Up to −${item.brakingDecelerationG} G deceleration`)}${specification('Electronics', item.electronics)}</dl></section>` : ''}
        <section><h3>Competition history</h3><dl>${specification('Predecessor', item.predecessor)}${specification('Successor', item.successor || 'Current chassis')}${specification('Debut', item.debut)}${specification('Last event', item.lastEvent || 'In active service')}</dl></section>
      </div>
      <footer><div class="constructor-driver-record"><small>${fmtNumber(item.totalWeekends)} weekends</small><small>${fmtNumber(item.totalTeams)} teams</small><small>${fmtNumber(item.totalDrivers)} drivers</small><small>${fmtNumber(item.totalEntries)} entries</small></div><span><a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Technical source ↗</a>${item.manufacturerSourceUrl ? ` · <a href="${esc(item.manufacturerSourceUrl)}" target="_blank" rel="noopener noreferrer">Manufacturer ↗</a>` : ''}</span></footer>
    </article>`).join('') : '<div class="empty-state">No Formula 3 chassis data is available.</div>';
}

async function loadF3Chassis() {
  try {
    allF3Chassis = await getJSON('/api/chassis?series=f3');
    renderF3Chassis();
  } catch (error) {
    setError('f3-chassis', error.message);
  }
}

loadF3Chassis();
