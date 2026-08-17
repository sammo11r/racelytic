let battleData = null;
let battleDrivers = [];

function validPosition(value) { const number=Number(value);return Number.isFinite(number)&&number>0; }
function battleScore(races,firstKey,secondKey) { return races.reduce((score,race)=>{if(!validPosition(race[firstKey])||!validPosition(race[secondKey]))return score;if(Number(race[firstKey])<Number(race[secondKey]))score.first++;else if(Number(race[secondKey])<Number(race[firstKey]))score.second++;return score;},{first:0,second:0}); }
function battleAverage(races,key) { const values=races.map(race=>Number(race[key])).filter(validPosition);return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null; }
function pointsTotal(races,key) { return races.reduce((sum,race)=>sum+Number(race[key]||0),0); }
function positionLabel(text,number) { return text||number||'—'; }

function scoreBar(label,score,firstName,secondName) {
  const total=score.first+score.second||1,firstWidth=score.first/total*100;
  return `<div class="battle-score"><div class="battle-score-heading"><span>${esc(label)}</span><small>Only sessions with a result for both drivers</small></div><div class="battle-score-numbers"><strong>${score.first}</strong><div class="battle-score-track"><i style="width:${firstWidth}%"></i></div><strong>${score.second}</strong></div><div class="battle-score-names"><span>${esc(firstName)}</span><span>${esc(secondName)}</span></div></div>`;
}

function renderBattleOverview() {
  const races=battleData.sharedRaces,[first,second]=battleData.drivers;
  const race=battleScore(races,'firstPosition','secondPosition'),qualifying=battleScore(races,'firstQualifying','secondQualifying');
  const firstAverage=battleAverage(races,'firstPosition'),secondAverage=battleAverage(races,'secondPosition');
  const firstClassified=races.filter(item=>validPosition(item.firstPosition)).length,secondClassified=races.filter(item=>validPosition(item.secondPosition)).length;
  return `<div class="battle-score-grid">${scoreBar('Race head-to-head',race,first.name,second.name)}${scoreBar('Qualifying head-to-head',qualifying,first.name,second.name)}</div><div class="comparison-scorecard battle-metrics"><div class="comparison-metric"><strong class="${pointsTotal(races,'firstPoints')>pointsTotal(races,'secondPoints')?'leader':''}">${fmtNumber(pointsTotal(races,'firstPoints'))}</strong><span>Points together</span><strong class="${pointsTotal(races,'secondPoints')>pointsTotal(races,'firstPoints')?'leader':''}">${fmtNumber(pointsTotal(races,'secondPoints'))}</strong></div><div class="comparison-metric"><strong class="${firstAverage<secondAverage?'leader':''}">${firstAverage?.toFixed(2)||'—'}</strong><span>Average finish</span><strong class="${secondAverage<firstAverage?'leader':''}">${secondAverage?.toFixed(2)||'—'}</strong></div><div class="comparison-metric"><strong class="${firstClassified>secondClassified?'leader':''}">${firstClassified}</strong><span>Classified finishes</span><strong class="${secondClassified>firstClassified?'leader':''}">${secondClassified}</strong></div></div>`;
}

function renderBattleSeasons() {
  const races=battleData.sharedRaces,seasons=[...new Set(races.map(race=>race.year))].sort((a,b)=>b-a);
  return `<div class="battle-season-list">${seasons.map(year=>{const season=races.filter(race=>race.year===year),race=battleScore(season,'firstPosition','secondPosition'),qualifying=battleScore(season,'firstQualifying','secondQualifying'),firstPoints=pointsTotal(season,'firstPoints'),secondPoints=pointsTotal(season,'secondPoints'),teams=[...new Set(season.map(item=>item.constructorName).filter(Boolean))].join(', ');return `<article class="battle-season-card"><div><span>${year}</span><h3>${esc(teams)}</h3><small>${season.length} shared race${season.length===1?'':'s'}</small></div><dl><div><dt>Race H2H</dt><dd>${race.first}–${race.second}</dd></div><div><dt>Qualifying H2H</dt><dd>${qualifying.first}–${qualifying.second}</dd></div><div><dt>Points</dt><dd>${fmtNumber(firstPoints)}–${fmtNumber(secondPoints)}</dd></div></dl><a href="/season.html?year=${year}">View season →</a></article>`;}).join('')}</div>`;
}

function renderBattleRaces() {
  const races=battleData.sharedRaces,[first,second]=battleData.drivers;
  return `<div class="table-wrap"><table><thead><tr><th>Race</th><th>Team</th><th>${esc(first.name)}</th><th>${esc(second.name)}</th><th>Qualifying</th><th>Points</th></tr></thead><tbody>${races.map(race=>`<tr><td><a href="/race.html?id=${encodeURIComponent(race.raceId)}">${esc(race.year)} ${esc(race.officialName)}</a><small>Round ${esc(race.round)}</small></td><td>${esc(race.constructorName||'—')}</td><td>${esc(positionLabel(race.firstPositionText,race.firstPosition))}</td><td>${esc(positionLabel(race.secondPositionText,race.secondPosition))}</td><td>${race.firstQualifying||'—'}–${race.secondQualifying||'—'}</td><td>${fmtNumber(race.firstPoints)}–${fmtNumber(race.secondPoints)}</td></tr>`).join('')}</tbody></table></div>`;
}

function selectBattleView(value) { document.querySelectorAll('[data-battle-panel]').forEach(panel=>{panel.hidden=panel.dataset.battlePanel!==value;});document.querySelectorAll('[data-battle-view]').forEach(button=>{const active=button.dataset.battleView===value;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));}); }
function renderBattle() {
  const [first,second]=battleData.drivers,races=battleData.sharedRaces,years=races.map(race=>Number(race.year));
  document.getElementById('battle-content').innerHTML=`<section class="comparison-driver-heads"><a href="/driver.html?id=${encodeURIComponent(first.id)}"><span>${esc(first.nationalityCountryId||'')}</span><h2>${esc(first.name)}</h2></a><div>${races.length} SHARED RACES<br>${Math.min(...years)}–${Math.max(...years)}</div><a href="/driver.html?id=${encodeURIComponent(second.id)}"><span>${esc(second.nationalityCountryId||'')}</span><h2>${esc(second.name)}</h2></a></section><section class="analysis-visualization-menu"><div class="analysis-visualization-heading"><div class="eyebrow">BATTLE VIEW</div><strong>Compare the pairing</strong></div><div class="analysis-visualization-tabs comparison-tabs" role="tablist"><button type="button" class="active" role="tab" aria-selected="true" data-battle-view="overview"><span>Overview</span><small>Head-to-head</small></button><button type="button" role="tab" aria-selected="false" data-battle-view="seasons"><span>Shared seasons</span><small>Year by year</small></button><button type="button" role="tab" aria-selected="false" data-battle-view="races"><span>Shared races</span><small>Full results</small></button></div></section><div class="comparison-workspace"><section data-battle-panel="overview">${renderBattleOverview()}</section><section data-battle-panel="seasons" hidden>${renderBattleSeasons()}</section><section data-battle-panel="races" hidden>${renderBattleRaces()}</section></div>`;
  document.querySelectorAll('[data-battle-view]').forEach(button=>button.addEventListener('click',()=>selectBattleView(button.dataset.battleView)));
}

async function loadBattle() { const first=document.getElementById('battle-driver').value,second=document.getElementById('battle-teammate').value;if(!first||!second)return;document.getElementById('battle-content').innerHTML='<div class="loading-state">Building teammate battle…</div>';try{battleData=await getJSON(`/api/drivers/compare?ids=${encodeURIComponent(first)},${encodeURIComponent(second)}`);renderBattle();}catch(error){setError('battle-content',error.message);} }
async function loadTeammates(autoLoad=true) { const id=document.getElementById('battle-driver').value,select=document.getElementById('battle-teammate');select.innerHTML='<option>Loading…</option>';select.disabled=true;try{const teammates=await getJSON(`/api/drivers/${encodeURIComponent(id)}/teammates`);select.innerHTML=teammates.length?teammates.map(teammate=>`<option value="${esc(teammate.id)}">${esc(teammate.name)} · ${teammate.sharedRaces} races</option>`).join(''):'<option value="">No teammates found</option>';select.disabled=!teammates.length;if(teammates.length&&autoLoad)loadBattle();}catch(error){setError('battle-content',error.message);} }

getJSON('/api/drivers?limit=1000').then(drivers=>{battleDrivers=[...drivers].sort((a,b)=>Number(b.totalRaceWins)-Number(a.totalRaceWins)||a.name.localeCompare(b.name));document.getElementById('battle-driver').innerHTML=battleDrivers.map(driver=>`<option value="${esc(driver.id)}">${esc(driver.name)}</option>`).join('');loadTeammates();}).catch(error=>setError('battle-content',error.message));
document.getElementById('battle-driver').addEventListener('change',()=>loadTeammates());document.getElementById('load-battle').addEventListener('click',loadBattle);
