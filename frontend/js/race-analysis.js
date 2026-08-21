let analysisRaces = [];
let activeRaceData = null;
let focusedDriver = null;
let raceTooltip = null;
const juniorRaceAnalysis = window.location.pathname.startsWith('/f2/') || window.location.pathname.startsWith('/f3/');
const raceAnalysisDetails = new Map();
let racePopulationToken = 0;

function normalizeF2RaceAnalysis(data, selectedSessionId) {
  if (!Array.isArray(data?.sessions)) return data;
  const raceSessions=data.sessions.filter(session=>session.isRace&&!session.cancelled&&session.results?.length);
  const selected=raceSessions.find(session=>String(session.id)===String(selectedSessionId))||raceSessions[raceSessions.length-1];
  const gridSessions=data.sessions.filter(session=>/grid/i.test(session.name)&&session.results?.length);
  const selectedGrid=[...gridSessions].reverse().find(session=>Number(session.sessionNumber)<Number(selected?.sessionNumber));
  const featureGrid=gridSessions[gridSessions.length-1];
  const qualifyingSessions=data.sessions.filter(session=>/qualif/i.test(session.name));
  const qualifyingByDriver=new Map();
  if(qualifyingSessions.length===1){
    (qualifyingSessions[0].results||[]).forEach(result=>{const position=Number(result.positionNumber);if(position>0&&position<100)qualifyingByDriver.set(String(result.driverId),position);});
  }else{
    const classifiedDrivers=new Set(qualifyingSessions.flatMap(session=>session.results||[]).filter(result=>Number(result.positionNumber)>0&&Number(result.positionNumber)<100).map(result=>String(result.driverId)));
    (featureGrid?.results||[]).forEach(result=>{if(classifiedDrivers.has(String(result.driverId)))qualifyingByDriver.set(String(result.driverId),Number(result.positionNumber));});
  }
  const gridByDriver=new Map((selectedGrid?.results||[]).map(result=>[String(result.driverId),Number(result.positionNumber)]));
  const results=(selected?.results||[]).map(result=>({...result,
    positionText:result.positionNumber||result.status,
    qualificationPositionNumber:qualifyingByDriver.get(String(result.driverId))||null,
    gridPositionNumber:gridByDriver.get(String(result.driverId))||null,
    reasonRetired:/ret|dnf|dns/i.test(String(result.status||''))?result.status:null,
    gap:result.gapMillis?`${(Number(result.gapMillis)/1000).toFixed(3)}`:null
  }));
  return {race:{...data.race,officialName:`${data.race.name} · ${selected?.displayName||selected?.name||'Race'}`,laps:Math.max(0,...results.map(result=>Number(result.laps||0)))},sessions:{race:results}};
}

function selectRaceVisualization(value) {
  document.querySelectorAll('[data-race-visual]').forEach(panel => {
    panel.hidden = panel.dataset.raceVisual !== value;
  });
  document.querySelectorAll('[data-race-visual-button]').forEach(button => {
    const active = button.dataset.raceVisualButton === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  raceTooltip?.classList.remove('visible');
}

function bindRaceTooltips(container = document) {
  if (!raceTooltip) {
    raceTooltip = document.createElement('div');
    raceTooltip.className = 'analysis-tooltip';
    raceTooltip.setAttribute('role', 'status');
    document.body.append(raceTooltip);
  }
  const show = (element, event) => {
    raceTooltip.innerHTML = element.dataset.chartTooltip;
    raceTooltip.classList.add('visible');
    const x = event?.clientX ?? element.getBoundingClientRect().left;
    const y = event?.clientY ?? element.getBoundingClientRect().top;
    raceTooltip.style.left = `${Math.min(window.innerWidth - raceTooltip.offsetWidth - 12, x + 14)}px`;
    raceTooltip.style.top = `${Math.max(10, y - raceTooltip.offsetHeight - 12)}px`;
  };
  container.querySelectorAll('[data-chart-tooltip]').forEach(element => {
    element.addEventListener('pointerenter', event => show(element, event));
    element.addEventListener('pointermove', event => show(element, event));
    element.addEventListener('pointerleave', () => raceTooltip.classList.remove('visible'));
    element.addEventListener('focus', event => show(element, event));
    element.addEventListener('blur', () => raceTooltip.classList.remove('visible'));
  });
}

function raceStyles(results) {
  return assignDriverTeamStyles(results.map(result => ({ driverId: result.driverId, raceResults: { 1: { constructorId: result.constructorId } } })));
}

function isRetired(result, raceLaps) {
  return /ret|dns|dnq|dsq|wd|nc/i.test(result.positionText || '')
    || (result.reasonRetired && Number(result.laps) < Number(raceLaps));
}

function resultTooltip(result, gained) {
  return `<strong>${esc(result.driverName)}</strong><span>${esc(result.constructorName || '')} · Grid P${result.gridPositionNumber ?? '—'} → ${isRetired(result, activeRaceData.race.laps) ? esc(result.positionText || 'DNF') : `Finish P${result.positionNumber}`}</span><b>${gained > 0 ? '+' : ''}${gained} positions · ${fmtNumber(result.points)} pts</b>`;
}

function renderRaceFlow(results, styles) {
  const width = 1000, top = 55, row = 31;
  const starters = [...results].sort((a, b) => Number(a.gridPositionNumber || 99) - Number(b.gridPositionNumber || 99));
  const finishers = results.filter(result => !isRetired(result, activeRaceData.race.laps)).sort((a,b) => Number(a.positionNumber)-Number(b.positionNumber));
  const retirees = results.filter(result => isRetired(result, activeRaceData.race.laps)).sort((a,b) => Number(b.laps)-Number(a.laps));
  const classification = [...finishers, ...retirees];
  const height = top * 2 + Math.max(starters.length, classification.length) * row;
  const startY = new Map(starters.map((result,index) => [String(result.driverId), top + index*row]));
  const finishY = new Map(classification.map((result,index) => [String(result.driverId), top + index*row]));
  const labelsLeft = starters.map(result => `<text x="18" y="${startY.get(String(result.driverId))+4}"><tspan class="flow-position">P${result.gridPositionNumber ?? '—'}</tspan><tspan x="50">${esc(result.driverName)}</tspan></text>`).join('');
  const labelsRight = classification.map(result => `<text x="982" y="${finishY.get(String(result.driverId))+4}" text-anchor="end"><tspan>${esc(result.driverName)}</tspan><tspan class="flow-position"> · ${isRetired(result,activeRaceData.race.laps) ? esc(result.positionText || 'DNF') : `P${result.positionNumber}`}</tspan></text>`).join('');
  const paths = starters.map(result => {
    const id = String(result.driverId), style = styles.get(id), gained = Number(result.gridPositionNumber || result.positionNumber)-Number(result.positionNumber);
    const muted = focusedDriver && focusedDriver !== id;
    return `<path tabindex="0" class="race-flow-line${muted ? ' muted' : ''}" data-driver-flow="${esc(id)}" data-chart-tooltip="${esc(resultTooltip(result,gained))}" style="--flow-color:${style?.color || '#777'}"${style?.dash ? ` stroke-dasharray="${style.dash}"` : ''} d="M210 ${startY.get(id)} C400 ${startY.get(id)},600 ${finishY.get(id)},790 ${finishY.get(id)}"/>`;
  }).join('');
  const container = document.getElementById('race-flow-chart');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Flow from starting grid to finishing classification"><text class="flow-heading" x="18" y="25">STARTING GRID</text><text class="flow-heading" x="982" y="25" text-anchor="end">CLASSIFICATION</text><g class="flow-labels">${labelsLeft}${labelsRight}</g><g>${paths}</g></svg>`;
  container.querySelectorAll('[data-driver-flow]').forEach(path => path.addEventListener('click', () => { focusedDriver = focusedDriver === path.dataset.driverFlow ? null : path.dataset.driverFlow; renderRaceFlow(results, styles); }));
  bindRaceTooltips(container);
}

function renderResultMatrix(results) {
  document.getElementById('race-result-matrix').innerHTML = `<table class="race-analysis-table"><thead><tr><th>Finish</th><th>Driver</th><th>Constructor</th><th>Qual.</th><th>Grid</th><th>Change</th><th>Laps</th><th>Status</th><th>Points</th></tr></thead><tbody>${results.map(result => {
    const gained=Number(result.gridPositionNumber||result.positionNumber)-Number(result.positionNumber);
    return `<tr><td><span class="finish-position${Number(result.positionNumber)<=3?' podium':''}">${esc(result.positionText||result.positionNumber)}</span></td><td><a href="/driver?id=${encodeURIComponent(result.driverId)}">${esc(result.driverName)}</a>${result.fastestLap?'<small>Fastest lap</small>':''}</td><td>${esc(result.constructorName||'—')}</td><td>${result.qualificationPositionNumber??'—'}</td><td>${result.gridPositionNumber??'—'}${result.polePosition?'<small>Pole</small>':''}</td><td><span class="position-change ${gained>0?'up':gained<0?'down':'same'}">${gained>0?'+':''}${gained}</span></td><td>${result.laps??'—'}</td><td>${esc(result.reasonRetired||result.time||result.gap||'Finished')}</td><td class="result-points-total">${fmtNumber(result.points)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function renderConstructorContribution(results) {
  const teams = new Map();
  results.forEach(result => {
    if (!teams.has(result.constructorId)) teams.set(result.constructorId,{ id:result.constructorId,name:result.constructorName,drivers:[],points:0 });
    const team=teams.get(result.constructorId); team.drivers.push(result); team.points+=Number(result.points||0);
  });
  const ordered=[...teams.values()].sort((a,b)=>b.points-a.points), maximum=Math.max(...ordered.map(team=>team.points),1);
  const container=document.getElementById('constructor-contribution-chart');
  container.innerHTML=`<div class="contribution-chart">${ordered.map(team=>`<div class="contribution-row"><a href="/constructor?id=${encodeURIComponent(team.id)}">${esc(team.name)}</a><div class="contribution-track">${team.drivers.map(driver=>`<span data-chart-tooltip="<strong>${esc(driver.driverName)}</strong><span>${esc(team.name)}</span><b>${fmtNumber(driver.points)} points</b>" style="width:${Number(driver.points)/maximum*100}%;background:${baseConstructorColor(team.id)}"></span>`).join('')}</div><strong>${fmtNumber(team.points)}</strong></div>`).join('')}</div>`;
  bindRaceTooltips(container);
}

function renderAttrition(results) {
  const maximum=Math.max(...results.map(result=>Number(result.laps)),1);
  const ordered=[...results].sort((a,b)=>Number(b.laps)-Number(a.laps));
  const container=document.getElementById('attrition-chart');
  container.innerHTML=`<div class="attrition-chart">${ordered.map(result=>`<div class="attrition-row"><a href="/driver?id=${encodeURIComponent(result.driverId)}">${esc(result.driverName)}</a><div class="attrition-track"><span class="${isRetired(result,maximum)?'retired':''}" data-chart-tooltip="<strong>${esc(result.driverName)}</strong><span>${esc(result.reasonRetired||'Finished')}</span><b>${fmtNumber(result.laps)} of ${fmtNumber(maximum)} laps</b>" style="width:${Number(result.laps)/maximum*100}%"></span></div><strong>${result.laps}</strong></div>`).join('')}</div>`;
  bindRaceTooltips(container);
}

function renderWeekendConversion(results, styles) {
  const maximum=Math.max(results.length,20);
  const position=(value)=>Math.max(0,Math.min(100,(Number(value||maximum)-1)/Math.max(maximum-1,1)*100));
  const container=document.getElementById('weekend-conversion-chart');
  container.innerHTML=`<div class="conversion-head"><span>Driver</span><span>Qualifying</span><span>Grid</span><span>Finish</span></div>${results.map(result=>{const style=styles.get(String(result.driverId)); return `<div class="conversion-row" data-chart-tooltip="${esc(resultTooltip(result,Number(result.gridPositionNumber||result.positionNumber)-Number(result.positionNumber)))}"><a href="/driver?id=${encodeURIComponent(result.driverId)}"><i style="background:${style?.color}"></i>${esc(result.driverName)}</a><span>P${result.qualificationPositionNumber??'—'}</span><span>P${result.gridPositionNumber??'—'}</span><span>${isRetired(result,activeRaceData.race.laps)?esc(result.positionText||'DNF'):`P${result.positionNumber}`}</span><div class="conversion-line"><i style="left:${position(result.qualificationPositionNumber)}%;width:${Math.abs(position(result.positionNumber)-position(result.qualificationPositionNumber))}%;background:${style?.color}"></i></div></div>`;}).join('')}`;
  bindRaceTooltips(container);
}

async function loadRaceAnalysis() {
  const selection=document.getElementById('race-analysis-race').value; if(!selection)return;
  const [id,sessionId]=juniorRaceAnalysis?selection.split('::'):[selection,null];
  try {
    const rawData=raceAnalysisDetails.get(String(id))||await getJSON(`/api/races/${encodeURIComponent(id)}`);
    raceAnalysisDetails.set(String(id),rawData);
    activeRaceData=normalizeF2RaceAnalysis(rawData,sessionId); focusedDriver=null;
    const results=activeRaceData.sessions.race, styles=raceStyles(results), winner=results[0];
    const gains=results.map(result=>({...result,gained:Number(result.gridPositionNumber||result.positionNumber)-Number(result.positionNumber)}));
    const biggest=[...gains].sort((a,b)=>b.gained-a.gained)[0];
    const retirements=results.filter(result=>isRetired(result,activeRaceData.race.laps)).length;
    const teamTotals={}; results.forEach(result=>teamTotals[result.constructorName]=(teamTotals[result.constructorName]||0)+Number(result.points||0));
    const bestTeam=Object.entries(teamTotals).sort((a,b)=>b[1]-a[1])[0];
    document.getElementById('race-analysis-summary').innerHTML=`<div><span>Winner</span><strong>${esc(winner?.driverName)}</strong><small>${esc(winner?.constructorName)}</small></div><div><span>Biggest mover</span><strong>${esc(biggest?.driverName)}</strong><small>${biggest?.gained>0?'+':''}${biggest?.gained} positions</small></div><div><span>Retirements</span><strong>${retirements}</strong><small>of ${results.length} starters</small></div><div><span>${window.location.pathname.startsWith('/f3/')?'Top team':'Top constructor'}</span><strong>${esc(bestTeam?.[0])}</strong><small>${fmtNumber(bestTeam?.[1])} points</small></div>`;
    renderRaceFlow(results,styles); renderResultMatrix(results); renderConstructorContribution(results); renderAttrition(results); renderWeekendConversion(results,styles);
  } catch(error){setError('race-flow-chart',error.message);}
}

async function populateRaces(){const token=++racePopulationToken,year=document.getElementById('race-analysis-year').value,races=analysisRaces.filter(race=>String(race.year)===year).sort((a,b)=>a.round-b.round),selector=document.getElementById('race-analysis-race');if(!juniorRaceAnalysis){selector.innerHTML=races.map(race=>`<option value="${esc(race.id)}">R${esc(race.round)} · ${esc(race.officialName||race.name)}</option>`).join('');return loadRaceAnalysis();}selector.innerHTML='<option>Loading race sessions…</option>';try{const weekends=await Promise.all(races.map(async race=>{const data=raceAnalysisDetails.get(String(race.id))||await getJSON(`/api/races/${encodeURIComponent(race.id)}`);raceAnalysisDetails.set(String(race.id),data);return{race,data};}));if(token!==racePopulationToken)return;const options=weekends.flatMap(({race,data})=>data.sessions.filter(session=>session.isRace&&!session.cancelled&&session.results?.length).map(session=>`<option value="${esc(race.id)}::${esc(session.id)}">R${esc(race.round)} · ${esc(race.officialName||race.name)} · ${esc(session.displayName||session.name)}</option>`));selector.innerHTML=options.join('');if(options.length)loadRaceAnalysis();else setError('race-flow-chart','No completed race sessions are available for this season.');}catch(error){if(token===racePopulationToken)setError('race-flow-chart',error.message);}}
getJSON('/api/races').then(races=>{analysisRaces=races.filter(race=>race.raceSessionCount===undefined||Number(race.raceSessionCount)>0);const years=[...new Set(analysisRaces.map(race=>race.year))].sort((a,b)=>b-a);document.getElementById('race-analysis-year').innerHTML=years.map(year=>`<option value="${esc(year)}">${esc(year)}</option>`).join('');populateRaces();}).catch(error=>setError('race-flow-chart',error.message));
document.getElementById('race-analysis-year').addEventListener('change',populateRaces);document.getElementById('race-analysis-race').addEventListener('change',loadRaceAnalysis);
document.querySelectorAll('[data-race-visual-button]').forEach(button => button.addEventListener('click', () => selectRaceVisualization(button.dataset.raceVisualButton)));
