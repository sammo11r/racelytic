(() => {
  'use strict';
  const scoring = window.WecSeasonSimulatorModel, model = window.WecScenarioModel;
  const $ = id => document.getElementById(id);
  const initial = new URLSearchParams(location.search);
  const collections = { driver: 'drivers', team: 'teams', competitor: 'entries', manufacturer: 'manufacturers' };
  const fmt = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  let data = null, championship = null, predictions = null, requestId = 0, savedSystems = [];
  function selectedRules() {
    const key = $('wec-scenario-preset').value;
    const saved = savedSystems.find(system => `saved:${system.id}` === key);
    return saved ? scoring.settings({ points: saved.racePoints, extended: saved.extendedMultiplier, leMans: saved.leMansMultiplier })
      : scoring.settings({ preset: key });
  }

  function status(message) { $('wec-scenario-status').textContent = message; $('wec-scenario-status').hidden = !message; }
  function key() { return `racelytic:wec-scenario:${$('wec-scenario-season').value}:${championship?.id}:${$('wec-scenario-cutoff').value}`; }
  function save() { try { sessionStorage.setItem(key(), JSON.stringify(predictions)); } catch {} }
  function restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key()) || 'null');
      if (!saved || typeof saved !== 'object') return;
      for (const [eventId, race] of Object.entries(predictions)) {
        const groups = model.crewGroups(data, championship, eventId);
        for (const entityId of Object.keys(race)) {
          const value = saved[eventId]?.[entityId];
          if (value === null || value === 0 || (Number.isInteger(value) && value > 0 && value <= 100)) {
            model.setPrediction(predictions, eventId, entityId, value, championship.entityType, groups);
          }
        }
      }
    } catch {}
  }
  function syncUrl() {
    const url = new URL(location.href);
    const fields = { year: 'wec-scenario-season', championship: 'wec-scenario-championship', cutoff: 'wec-scenario-cutoff', preset: 'wec-scenario-preset', race: 'wec-scenario-race' };
    Object.entries(fields).forEach(([keyName, id]) => {
      const value = $(id).value;
      if (value) url.searchParams.set(keyName, value); else url.searchParams.delete(keyName);
    });
    history.replaceState(null, '', url);
  }
  function futureEvents() { return (data?.events || []).filter(event => Number(event.round) > Number($('wec-scenario-cutoff').value)); }
  function positionOptions(value, recordedLimit) {
    const limit = Math.min(100, Math.max(recordedLimit, Number(value) || 0));
    return `<option value=""${value === null ? ' selected' : ''}>Unassigned</option><option value="0"${value === 0 ? ' selected' : ''}>No classified finish</option>${Array.from({ length: limit }, (_, i) => i + 1).map(place => `<option value="${place}"${value === place ? ' selected' : ''}>P${place}</option>`).join('')}`;
  }
  function renderGrid() {
    const event = futureEvents().find(item => item.id === $('wec-scenario-race').value);
    const container = $('wec-scenario-grid');
    $('wec-scenario-official').disabled = !event || !championship.entities.some(entity => entity.results?.[event.id]);
    $('wec-scenario-clear').disabled = !event;
    if (!event) { container.innerHTML = '<div class="empty-state">The selected cutoff leaves no races to predict. Choose an earlier round.</div>'; return; }
    const race = predictions[event.id];
    const recorded = championship.entities.flatMap(entity => Object.values(entity.results || {}).map(result => Number(result.position) || 0));
    const positionLimit = Math.min(60, Math.max(20, ...recorded));
    const query = $('wec-scenario-filter').value.trim().toLowerCase();
    const entities = championship.entities.filter(entity => entity.name.toLowerCase().includes(query))
      .sort((a, b) => (Number(race[a.id]) || 999) - (Number(race[b.id]) || 999)
        || (Number(model.officialAt(a, Number($('wec-scenario-cutoff').value))?.position) || 999)
          - (Number(model.officialAt(b, Number($('wec-scenario-cutoff').value))?.position) || 999)
        || a.name.localeCompare(b.name));
    const assigned = Object.values(race).filter(value => value !== null).length;
    container.innerHTML = `<div class="scenario-race-meta"><div class="scenario-race-identity"><span>Round ${esc(event.round)} · ${esc(event.pointsScale || 'standard')} points scale</span><strong>${esc(event.name)}</strong></div><div class="scenario-race-progress"><strong>${assigned} of ${championship.entities.length} assigned</strong><small>Unassigned entries score zero</small></div></div>
      <div class="scenario-position-heading"><span>${championship.entityType === 'driver' ? 'Driver' : championship.entityType === 'manufacturer' ? 'Manufacturer' : 'Team / entry'}</span><span>Class finish</span></div>
      <div class="scenario-driver-grid">${entities.map(entity => {
        const value = race[entity.id], current = model.officialAt(entity, Number($('wec-scenario-cutoff').value));
        return `<label class="${value === null ? 'is-unassigned' : value === 0 ? 'is-dnf' : ''}"><span><strong>${esc(entity.name)}</strong><small>${current ? `Official P${esc(current.position)} · ${fmt(current.points)} pts` : 'No points at cutoff'}</small></span><select data-entity="${esc(entity.id)}" aria-label="${esc(entity.name)} class finish">${positionOptions(value, positionLimit)}</select></label>`;
      }).join('')}</div>${!entities.length ? '<p class="empty-state">No matching competitors.</p>' : ''}`;
    container.querySelectorAll('[data-entity]').forEach(select => select.addEventListener('change', () => {
      model.setPrediction(predictions, event.id, select.dataset.entity, select.value === '' ? null : Number(select.value),
        championship.entityType, model.crewGroups(data, championship, event.id));
      save(); renderGrid(); renderOutlook();
    }));
  }
  function renderOutlook() {
    if (!data || !championship || !predictions) return;
    const result = model.project(data, championship.id, Number($('wec-scenario-cutoff').value), predictions, selectedRules());
    if (!result) return;
    const leader = result.leaders.map(row => row.name).join(' · ');
    const official = result.officialLeaders.map(entity => entity.name).join(' · ') || 'No official leader yet';
    $('wec-scenario-summary').innerHTML = `<div class="scenario-summary-primary"><span>Projected leader</span><strong>${esc(leader)}</strong><small>${fmt(result.rows[0]?.points)} pts after all remaining races</small></div>
      <div><span>Official leader at cutoff</span><strong>${esc(official)}</strong><small>Official standings are unchanged</small></div>
      <div><span>Remaining</span><strong>${result.future.length} race${result.future.length === 1 ? '' : 's'}</strong><small>Maximum future score: ${fmt(result.maximum)} pts</small></div>
      <div><span>Scenario status</span><strong>${result.unassignedEntries ? `${result.unassignedEntries} unassigned result${result.unassignedEntries === 1 ? '' : 's'}` : 'Every competitor assigned'}</strong><small>${result.unassignedEvents ? `${result.unassignedEvents} race${result.unassignedEvents === 1 ? '' : 's'} entirely unassigned` : 'Unassigned competitors score zero'}</small></div>`;
    const collection = collections[championship.entityType];
    $('wec-scenario-standings').innerHTML = `<div class="scenario-standing-list">${result.rows.map(row => `<a href="/wec/${collection}/${encodeURIComponent(row.id)}"><b>${row.position}</b><span><strong>${esc(row.name)}</strong><small>${row.officialPosition == null ? 'Unranked' : `Official P${row.officialPosition}`} at cutoff · ${fmt(row.officialPoints)} + ${fmt(row.predictedPoints)} predicted · max ${fmt(row.maximum)}</small></span><em>${fmt(row.points)}</em></a>`).join('')}</div>`;
    status(''); syncUrl();
  }
  function populateRaces(requested = null) {
    const select = $('wec-scenario-race'), previous = select.value;
    select.innerHTML = futureEvents().map(event => `<option value="${esc(event.id)}">R${esc(event.round)} · ${esc(event.name)}</option>`).join('');
    select.disabled = !select.options.length;
    if ([...select.options].some(option => option.value === requested)) select.value = requested;
    else if ([...select.options].some(option => option.value === previous)) select.value = previous;
    renderGrid(); renderOutlook();
  }
  function setCutoff(requestedRace = null) {
    predictions = model.initialPredictions(data, championship, Number($('wec-scenario-cutoff').value));
    restore(); $('wec-scenario-reset').disabled = false;
    populateRaces(requestedRace);
  }
  function setChampionship(requestedCutoff = null, requestedRace = null) {
    championship = scoring.eligibleChampionships(data).find(item => item.id === $('wec-scenario-championship').value) || null;
    if (!championship) return status('This season has no single-class championship to project.');
    const rounds = model.cutoffRounds(data, championship);
    const lastEventRound = Number(data.events.at(-1)?.round || 0);
    const suggested = rounds.filter(round => round < lastEventRound).at(-1) ?? rounds.at(-1) ?? 0;
    const select = $('wec-scenario-cutoff');
    select.innerHTML = '<option value="0">Before round 1</option>' + data.events.filter(event => rounds.includes(Number(event.round)))
      .map(event => `<option value="${event.round}">After R${event.round} · ${esc(event.name)}</option>`).join('');
    select.disabled = false;
    select.value = [...select.options].some(option => option.value === String(requestedCutoff)) ? String(requestedCutoff) : String(suggested);
    setCutoff(requestedRace);
  }
  async function loadYear(year, requestedChampionship = null, requestedCutoff = null, requestedRace = null) {
    const current = ++requestId;
    data = null; championship = null; predictions = null;
    status(`Loading ${year} WEC standings…`);
    ['wec-scenario-championship', 'wec-scenario-cutoff', 'wec-scenario-race', 'wec-scenario-reset', 'wec-scenario-official', 'wec-scenario-clear'].forEach(id => $(id).disabled = true);
    $('wec-scenario-summary').innerHTML = ''; $('wec-scenario-standings').innerHTML = '';
    $('wec-scenario-grid').innerHTML = '<div class="loading-state">Loading championship…</div>';
    try {
      const response = await getJSON(`/api/wec/analysis/seasons/${encodeURIComponent(year)}`);
      if (current !== requestId) return;
      data = response;
      const choices = scoring.eligibleChampionships(data);
      const select = $('wec-scenario-championship');
      select.innerHTML = choices.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
      select.disabled = !choices.length;
      if (!choices.length) return status('No single-class championship standings are available for this season.');
      const preferred = choices.find(item => item.id === requestedChampionship)
        || choices.find(item => item.entityType === 'manufacturer' && /hypercar|lmp1/i.test(item.name)) || choices[0];
      select.value = preferred.id;
      setChampionship(requestedCutoff, requestedRace);
    } catch (error) { if (current === requestId) status(`Unable to load ${year}: ${error.message}`); }
  }

  $('wec-scenario-season').addEventListener('change', event => loadYear(event.target.value));
  $('wec-scenario-championship').addEventListener('change', () => setChampionship());
  $('wec-scenario-cutoff').addEventListener('change', () => setCutoff());
  $('wec-scenario-race').addEventListener('change', () => { renderGrid(); syncUrl(); });
  $('wec-scenario-preset').addEventListener('change', () => { renderOutlook(); renderGrid(); });
  $('wec-scenario-filter').addEventListener('input', renderGrid);
  $('wec-scenario-official').addEventListener('click', () => {
    const event = $('wec-scenario-race').value;
    predictions[event] = model.initialPredictions(data, championship, Number($('wec-scenario-cutoff').value))[event];
    save(); renderGrid(); renderOutlook();
  });
  $('wec-scenario-clear').addEventListener('click', () => {
    Object.keys(predictions[$('wec-scenario-race').value]).forEach(id => { predictions[$('wec-scenario-race').value][id] = null; });
    save(); renderGrid(); renderOutlook();
  });
  $('wec-scenario-reset').addEventListener('click', () => {
    try { sessionStorage.removeItem(key()); } catch {}
    predictions = model.initialPredictions(data, championship, Number($('wec-scenario-cutoff').value));
    renderGrid(); renderOutlook();
  });
  Promise.all([getJSON('/api/wec/seasons'), getJSON('/api/points-systems').catch(() => [])]).then(([seasons, systems]) => {
    savedSystems = systems.filter(system => system.series === 'wec');
    $('wec-scenario-preset').insertAdjacentHTML('beforeend', savedSystems.map(system => `<option value="saved:${esc(system.id)}">${esc(system.name)} · ${system.owned ? 'yours' : 'community'}</option>`).join(''));
    if ([...$('wec-scenario-preset').options].some(option => option.value === initial.get('preset'))) $('wec-scenario-preset').value = initial.get('preset');
    const available = seasons.filter(season => Number(season.eventCount) > 0);
    const select = $('wec-scenario-season');
    select.innerHTML = available.map(season => `<option value="${season.year}">${season.year}</option>`).join('');
    select.disabled = !available.length;
    if (!available.length) return status('No WEC seasons are available.');
    select.value = available.find(season => String(season.year) === initial.get('year'))?.year || available[0].year;
    loadYear(select.value, initial.get('championship'), initial.get('cutoff'), initial.get('race'));
  }).catch(error => status(`Unable to load WEC seasons: ${error.message}`));
})();
