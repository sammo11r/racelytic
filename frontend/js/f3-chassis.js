let allF3Chassis = [];
const technicalSeries = activeSeriesKey();
const technicalSeriesName = activeSeriesName();
const formulaETechnical = technicalSeries === 'fe';

function yearLabel(chassis) {
  if (!chassis.firstYear) return 'YEARS UNKNOWN';
  return chassis.firstYear === chassis.lastYear ? String(chassis.firstYear) : `${chassis.firstYear}–${chassis.lastYear}`;
}

function specification(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value || '—')}</dd></div>`;
}

function optionalSpecification(label, value) {
  return value ? specification(label, value) : '';
}

function relatedChassisName(id) {
  return allF3Chassis.find(chassis => chassis.id === id)?.name || id;
}

function enginePackageSummary(engines = []) {
  const visible = engines.slice(0, 5);
  const remaining = engines.length - visible.length;
  return `${visible.join(', ')}${remaining > 0 ? ` + ${remaining} more` : ''}`;
}

function quickSpecifications(item) {
  if (formulaETechnical) return `
    <div><span>POWER</span><strong>${fmtNumber(item.powerKw)} kW</strong><small>${fmtNumber(item.powerHp)} hp</small></div>
    <div><span>WEIGHT</span><strong>${item.weightKg ? `${fmtNumber(item.weightKg)} kg` : '—'}</strong><small>${item.weightIncludesDriver ? 'including driver' : 'minimum weight'}</small></div>
    <div><span>POWERTRAIN</span><strong>${esc(item.engines?.length ? `${item.engines.length} packages` : 'Electric')}</strong><small>season-specific</small></div>
    <div><span>TYRES</span><strong>${esc(item.tyres || '—')}</strong><small>${esc(item.wheelRimLabel || '')}</small></div>`;
  return `<div><span>POWER</span><strong>${fmtNumber(item.powerHp)} hp</strong><small>${fmtNumber(item.powerKw)} kW</small></div><div><span>WEIGHT</span><strong>${fmtNumber(item.weightKg)} kg</strong><small>including driver</small></div><div><span>ENGINE</span><strong>${esc(item.engineName)}</strong><small>${esc(item.engineConfiguration)}</small></div><div><span>WHEELS</span><strong>${fmtNumber(item.wheelRimInches)} inch</strong><small>Pirelli</small></div>`;
}

function renderF3Chassis() {
  const chassis = [...allF3Chassis].sort((first, second) => Number(first.generation) - Number(second.generation));
  document.getElementById('f3-chassis').innerHTML = chassis.length ? chassis.map(item => `
    <article class="junior-technical-chassis-card">
      <header><div><span>GENERATION ${esc(item.generation)} · ${esc(yearLabel(item))}</span><h2>${esc(item.name)}</h2><p>${esc([item.manufacturer, item.designer].filter(Boolean).join(' · '))}</p></div><strong>${item.retiredYear ? 'RETIRED' : 'CURRENT'}</strong></header>
      <div class="junior-chassis-quick-specs">${quickSpecifications(item)}</div>
      <div class="junior-chassis-specification-groups">
        <section><h3>Chassis</h3><dl>${optionalSpecification('Construction', item.chassisConstruction)}${item.lengthMm && item.widthMm && item.heightMm ? specification('Dimensions', `${fmtNumber(item.lengthMm)} × ${fmtNumber(item.widthMm)} × ${fmtNumber(item.heightMm)} mm`) : ''}${item.wheelbaseMm ? specification('Wheelbase', `${fmtNumber(item.wheelbaseMm)} mm`) : ''}${optionalSpecification('Front suspension', item.frontSuspension)}${optionalSpecification('Rear suspension', item.rearSuspension)}${optionalSpecification('Aerodynamics', item.aero)}</dl></section>
        <section><h3>Powertrain</h3><dl>${optionalSpecification(formulaETechnical ? 'Powertrain' : 'Engine', [item.engineConfiguration, item.engineLayout].filter(Boolean).join('; ') || item.engineName)}${item.powerHp || item.powerKw ? specification('Output', formulaETechnical ? `${fmtNumber(item.powerKw)} kW (${fmtNumber(item.powerHp)} hp)` : `${fmtNumber(item.powerHp)} hp (${fmtNumber(item.powerKw)} kW)${item.powerRpm ? ` at ${fmtNumber(item.powerRpm)} rpm` : ''}`) : ''}${item.torqueNm ? specification('Torque', `${fmtNumber(item.torqueNm)} Nm`) : ''}${optionalSpecification('Transmission', item.transmission)}${formulaETechnical && item.engines?.length ? specification('Recorded packages', enginePackageSummary(item.engines)) : ''}</dl></section>
        <section><h3>${formulaETechnical ? 'Brakes &amp; tyres' : 'Consumables'}</h3><dl>${optionalSpecification('Fuel', item.fuel)}${optionalSpecification('Lubricants', item.lubricants)}${optionalSpecification('Brakes', item.brakes)}${optionalSpecification('Tyres', [item.tyres, item.wheelRimLabel || (item.wheelRimInches ? `${item.wheelRimInches}-inch rims` : '')].filter(Boolean).join('; '))}</dl></section>
        ${item.topSpeedKph ? `<section><h3>Performance &amp; electronics</h3><dl>${specification('Top speed', `${fmtNumber(item.topSpeedKph)} km/h`)}${specification('Acceleration', `0–100 km/h in ${item.zeroTo100Seconds}s; 0–200 km/h in ${item.zeroTo200Seconds}s`)}${specification('Cornering', `Up to ±${item.lateralAccelerationG} G lateral acceleration`)}${specification('Braking', `Up to −${item.brakingDecelerationG} G deceleration`)}${specification('Electronics', item.electronics)}</dl></section>` : ''}
        <section><h3>Competition history</h3><dl>${specification('Predecessor', relatedChassisName(item.predecessor))}${specification('Successor', relatedChassisName(item.successor) || 'Current chassis')}${optionalSpecification('Debut', item.debut)}${optionalSpecification('Last event', item.lastEvent || (item.retiredYear ? '' : 'In active service'))}</dl></section>
      </div>
      <footer><div class="constructor-driver-record"><small>${fmtNumber(item.totalWeekends)} weekends</small><small>${fmtNumber(item.totalTeams)} teams</small><small>${fmtNumber(item.totalDrivers)} drivers</small><small>${fmtNumber(item.totalEntries)} entries</small></div><span>${item.sourceUrl ? `<a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Technical source ↗</a>` : ''}${item.manufacturerSourceUrl ? ` · <a href="${esc(item.manufacturerSourceUrl)}" target="_blank" rel="noopener noreferrer">Manufacturer ↗</a>` : ''}</span></footer>
    </article>`).join('') : `<div class="empty-state">No ${esc(technicalSeriesName)} chassis data is available.</div>`;
}

async function loadF3Chassis() {
  try {
    allF3Chassis = await getJSON(`/api/chassis?series=${encodeURIComponent(technicalSeries)}`);
    renderF3Chassis();
  } catch (error) {
    setError('f3-chassis', error.message);
  }
}

loadF3Chassis();
