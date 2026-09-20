(function initialiseWecRacePage() {
  const match = window.location.pathname.match(/\/wec\/races\/([^/]+)/);
  const eventId = match ? decodeURIComponent(match[1]) : '';
  let raceData = null;
  let currentData = null;
  let activeClass = new URLSearchParams(window.location.search).get('class') || 'overall';
  const entityPath = (type, id) => `/wec/${type}/${encodeURIComponent(id)}`;

  function eventStatus(event) {
    if (String(event.status || '').toLowerCase() === 'completed') return 'completed';
    const end = new Date(`${String(event.endDate || event.date || '').slice(0, 10)}T23:59:59`);
    return !Number.isNaN(end.getTime()) && end >= new Date() ? 'upcoming' : 'no-result';
  }
  const statusLabel = status => status === 'completed' ? 'Completed' : status === 'upcoming' ? 'Upcoming' : 'No result';
  function formatLabel(event) {
    if (event.formatType === 'distance' || Number(event.scheduledDistanceKm) > 0) return `${fmtNumber(Number(event.scheduledDistanceKm))} km`;
    const minutes = Number(event.scheduledMinutes || 0), hours = minutes / 60;
    return !minutes ? '' : Number.isInteger(hours) ? `${fmtNumber(hours)} hours` : `${Math.floor(hours)}h ${minutes % 60}m`;
  }
  function dateLabel(event) {
    const start = fmtDate(event.date), end = event.endDate ? fmtDate(event.endDate) : '';
    return end && end !== start ? `${start} – ${end}` : start;
  }
  const directionLabel = value => String(value || '').replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const crewNames = entry => (entry?.crew || []).map(driver => driver.name).join(' · ');
  const gapLabel = value => {
    const text = String(value || '');
    if (/^\d+(?:\.\d+)?$/.test(text)) return `+${text} s`;
    const laps = text.match(/^(\d+)\s+laps?$/i);
    return laps ? `${laps[1]} ${Number(laps[1]) === 1 ? 'lap' : 'laps'}` : text;
  };

  function renderHeader(event) {
    const status = eventStatus(event);
    const location = [event.placeName, event.countryName].filter(Boolean).join(' · ');
    const facts = [`Date · ${dateLabel(event)}`, formatLabel(event) ? `Format · ${formatLabel(event)}` : null,
      event.length ? `Circuit · ${fmtNumber(event.length)} km` : null, event.turns ? `${fmtNumber(event.turns)} turns` : null,
      event.direction ? directionLabel(event.direction) : null].filter(Boolean);
    document.title = `${event.name} · WEC · Racelytic`;
    const target = document.getElementById('wec-race-head');
    target.innerHTML = `<div class="detail-hero race-detail-hero wec-race-hero" data-status="${status}">
      <div class="race-detail-hero-copy"><div class="race-detail-kicker"><span class="race-status-badge ${status}">${statusLabel(status)}</span><a href="/wec/seasons/${encodeURIComponent(event.year)}">Round ${esc(event.round)} · ${esc(event.year)}</a></div>
        <h1>${esc(event.name)}</h1><div class="detail-sub">${esc(location || 'Location not recorded')}</div>
        <div class="race-hero-facts">${facts.map(fact => `<span>${esc(fact)}</span>`).join('')}</div></div>
      <aside class="race-hero-highlight"><span>Circuit</span><strong>${esc(event.circuitName || 'Circuit not recorded')}</strong><small>${esc(location)}</small></aside>
    </div>`;
    target.setAttribute('aria-busy', 'false');
  }

  function renderRaceSummary(data) {
    const target = document.getElementById('wec-race-summary'), entries = data.classification || [];
    const winner = entries.find(entry => entry.overallPosition === 1);
    const heading = '<div class="section-heading"><div><h2 id="wec-race-summary-title">Race summary</h2></div></div>';
    if (!winner) {
      target.innerHTML = `${heading}<div class="empty-state">The race classification is not available.</div>`;
      target.setAttribute('aria-busy', 'false'); return;
    }
    const podium = entries.filter(entry => entry.overallPosition && entry.overallPosition <= 3).sort((a, b) => a.overallPosition - b.overallPosition);
    const classWinners = entries.filter(entry => entry.classPosition === 1);
    const runnerUp = entries.find(entry => entry.overallPosition === 2);
    const fastest = entries.filter(entry => entry.bestLapMillis).sort((a, b) => a.bestLapMillis - b.bestLapMillis)[0];
    const winners = [['Overall', winner], ...classWinners.filter(entry => entry.entryId !== winner.entryId).map(entry => [entry.class.code, entry])];
    target.innerHTML = `${heading}<div class="wec-winner-cards" aria-label="Race winners">${winners.map(([label, entry]) => `<article class="wec-winner-card" data-class-code="${esc(entry.class.code.toLowerCase())}"><span>${esc(label)} winner</span><div><b>#${esc(entry.carNumber)}</b><h3>${esc(entry.team.name)}</h3></div><p>${esc(crewNames(entry))}</p><small>${esc(entry.manufacturer.name)} · ${esc(entry.carModel.name)}</small></article>`).join('')}</div>
      <div class="wec-race-summary-grid">
      <div class="wec-race-podium"><span>Overall podium</span><ol>${podium.map(entry => `<li><b>${entry.overallPosition}</b><div><strong>#${esc(entry.carNumber)} ${esc(entry.team.name)}</strong><small>${esc(crewNames(entry))}</small></div></li>`).join('')}</ol></div>
      <dl class="wec-race-key-stats"><div><dt>Winning time</dt><dd>${esc(winner.time || '—')}</dd><small>${fmtNumber(winner.laps)} laps</small></div><div><dt>Margin</dt><dd>${esc(gapLabel(runnerUp?.gap) || '—')}</dd><small>To second overall</small></div><div><dt>Fastest lap</dt><dd>${esc(fastest?.bestLap || '—')}</dd><small>${fastest ? `#${esc(fastest.carNumber)} ${esc(fastest.team.name)}` : 'Not recorded'}</small></div></dl>
    </div>`;
    target.setAttribute('aria-busy', 'false');
  }

  const sessionGroup = type => type === 'race' ? 'race' : ['qualifying', 'hyperpole'].includes(type) ? 'qualifying' : 'practice';
  const sessionGroupLabel = group => group === 'race' ? 'Race' : group === 'qualifying' ? 'Qualifying' : 'Practice';
  function sessionTime(value) {
    const date = new Date(value);
    return !value || Number.isNaN(date.getTime()) ? '' : `${date.toLocaleDateString(undefined, { weekday: 'short' })} · ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`;
  }
  const sessionTabId = sessionId => `wec-session-${String(sessionId).replace(/[^a-z0-9_-]/gi, '-')}`;
  function renderSessionTabs(data) {
    const groups = new Map();
    data.sessions.forEach(session => {
      const group = sessionGroup(String(session.type).toLowerCase());
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(session);
    });
    document.getElementById('wec-session-tabs').innerHTML = ['practice', 'qualifying', 'race'].filter(group => groups.has(group)).map(group => `<div class="wec-session-group"><span>${sessionGroupLabel(group)}</span><div>${groups.get(group).map(session => {
      const selected = String(session.id) === String(currentData.selectedSessionId);
      return `<button id="${sessionTabId(session.id)}" type="button" role="tab" data-session-id="${esc(session.id)}" aria-controls="wec-race-classification" aria-selected="${selected}" tabindex="${selected ? '0' : '-1'}"><strong>${esc(session.name)}</strong><small>${esc(sessionTime(session.startTimeUtc))}</small></button>`;
    }).join('')}</div></div>`).join('');
    document.querySelectorAll('[data-session-id]').forEach(button => button.addEventListener('click', () => selectSession(button.dataset.sessionId)));
  }

  const positionLabel = entry => activeClass === 'overall' ? entry.overallPosition ?? '—' : entry.classPosition ?? '—';
  function renderClassification(data) {
    currentData = data;
    const selected = data.sessions.find(session => String(session.id) === String(data.selectedSessionId));
    const classCodes = [...new Set(data.classification.map(entry => entry.class.code))];
    const allowOverall = String(selected?.type).toLowerCase() === 'race' || classCodes.length > 1;
    if (!classCodes.includes(activeClass) && activeClass !== 'overall') activeClass = allowOverall ? 'overall' : classCodes[0];
    if (activeClass === 'overall' && !allowOverall && classCodes.length === 1) activeClass = classCodes[0];
    const options = [...(allowOverall ? [['overall', 'Overall']] : []), ...classCodes.map(code => [code, code])];
    document.getElementById('wec-class-filters').innerHTML = options.map(([value, label]) => `<button type="button" data-class="${esc(value)}" aria-pressed="${value === activeClass}">${esc(label)}</button>`).join('');
    document.querySelectorAll('[data-class]').forEach(button => button.addEventListener('click', () => { activeClass = button.dataset.class; renderClassification(data); syncUrl(); }));
    document.getElementById('wec-session-note').textContent = selected ? `${selected.name} · ${fmtNumber(data.classification.length)} classified entries` : '';
    const rows = (activeClass === 'overall' ? data.classification : data.classification.filter(entry => entry.class.code === activeClass))
      .sort((a, b) => Number(positionLabel(a) || 9999) - Number(positionLabel(b) || 9999));
    const target = document.getElementById('wec-race-classification');
    target.setAttribute('role', 'tabpanel');
    if (selected) target.setAttribute('aria-labelledby', sessionTabId(selected.id));
    if (!rows.length) {
      target.innerHTML = '<div class="empty-state">No classification is available for this session and class.</div>';
      target.setAttribute('aria-busy', 'false'); renderSessionTabs(data); return;
    }
    const raceSession = String(selected?.type).toLowerCase() === 'race';
    target.innerHTML = `<div class="wec-race-results-scroll" tabindex="0" role="region" aria-label="${esc(selected?.name || 'Session')} classification"><table class="wec-race-results-table"><thead><tr><th>Pos.</th><th>Entry</th><th>Drivers</th><th>Class</th><th>Laps</th><th>Time / gap</th><th>Best lap</th><th>Status</th><th>Points</th></tr></thead><tbody>${rows.map(entry => `<tr data-class-code="${esc(entry.class.code.toLowerCase())}">
      <td data-label="Position"><strong>${esc(positionLabel(entry))}</strong>${activeClass !== 'overall' && entry.overallPosition ? `<small>Overall ${esc(entry.overallPosition)}</small>` : ''}</td>
      <td data-label="Entry"><div class="wec-table-entry"><b>#${esc(entry.carNumber)}</b><span><strong>${esc(entry.team.name)}</strong><small>${esc(entry.manufacturer.name)} · ${esc(entry.carModel.name)}</small></span></div></td>
      <td data-label="Drivers"><div class="wec-table-crew">${entry.crew.map(driver => `<a href="${entityPath('drivers', driver.id)}">${esc(driver.name)}</a>`).join('')}</div></td>
      <td data-label="Class"><span class="wec-class-pill">${esc(entry.class.code)}</span></td><td data-label="Laps">${entry.laps === null ? '—' : esc(entry.laps)}</td>
      <td data-label="Time / gap">${esc(gapLabel(entry.gap) || entry.time || (!raceSession ? entry.bestLap : '') || '—')}</td><td data-label="Best lap">${esc(entry.bestLap || '—')}</td><td data-label="Status">${esc(entry.status || '—')}</td><td data-label="Points">${!raceSession || entry.points === null ? '—' : esc(entry.points)}</td>
    </tr>`).join('')}</tbody></table></div>`;
    target.setAttribute('aria-busy', 'false'); renderSessionTabs(data);
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    if (currentData?.selectedSessionId && String(currentData.selectedSessionId) !== String(raceData?.selectedSessionId)) url.searchParams.set('session', currentData.selectedSessionId); else url.searchParams.delete('session');
    if (activeClass !== 'overall') url.searchParams.set('class', activeClass); else url.searchParams.delete('class');
    history.replaceState(null, '', url);
  }
  async function selectSession(sessionId) {
    if (String(sessionId) === String(currentData?.selectedSessionId)) return;
    const target = document.getElementById('wec-race-classification');
    target.setAttribute('aria-busy', 'true'); target.innerHTML = '<div class="loading-state">Loading classification…</div>';
    try {
      const data = await getJSON(`/api/wec/events/${encodeURIComponent(eventId)}?session=${encodeURIComponent(sessionId)}`);
      const codes = [...new Set(data.classification.map(entry => entry.class.code))];
      const selected = data.sessions.find(session => String(session.id) === String(sessionId));
      if (String(selected?.type).toLowerCase() !== 'race' && codes.length === 1) activeClass = codes[0]; else if (!codes.includes(activeClass)) activeClass = 'overall';
      renderClassification(data); syncUrl();
    } catch { target.innerHTML = '<div class="error-state">This session classification could not be loaded.</div>'; target.setAttribute('aria-busy', 'false'); }
  }

  function renderEntries(entries) {
    document.getElementById('wec-entry-count').textContent = `${fmtNumber(entries.length)} entries`;
    const groups = new Map();
    entries.forEach(entry => { if (!groups.has(entry.class.code)) groups.set(entry.class.code, []); groups.get(entry.class.code).push(entry); });
    document.getElementById('wec-entry-list').innerHTML = [...groups.entries()].map(([code, classEntries]) => `<section><header><h3>${esc(code)}</h3><span>${fmtNumber(classEntries.length)} entries</span></header><div>${classEntries.map(entry => `<article data-class-code="${esc(code.toLowerCase())}"><b>#${esc(entry.carNumber)}</b><div><strong>${esc(entry.team.name)}</strong><span>${esc(entry.manufacturer.name)} · ${esc(entry.carModel.name)}</span><small>${esc(crewNames(entry))}</small></div>${entry.championshipEligible ? '' : '<em>Guest entry</em>'}</article>`).join('')}</div></section>`).join('');
  }
  function renderNavigation(navigation) {
    const slug = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    document.getElementById('wec-race-navigation').innerHTML = `${navigation?.previous ? `<a href="/wec/races/${encodeURIComponent(navigation.previous.id)}/${slug(navigation.previous.name)}">← <span>Previous · Round ${esc(navigation.previous.round)}</span><strong>${esc(navigation.previous.name)}</strong></a>` : '<span></span>'}${navigation?.next ? `<a class="next" href="/wec/races/${encodeURIComponent(navigation.next.id)}/${slug(navigation.next.name)}"><span>Next · Round ${esc(navigation.next.round)}</span><strong>${esc(navigation.next.name)}</strong> →</a>` : ''}`;
  }

  async function loadPage() {
    if (!eventId) return setError('wec-race-head', 'Choose a race from the WEC archive.');
    const requestedSession = new URLSearchParams(window.location.search).get('session');
    const headerPromise = getJSON(`/api/wec/events/${encodeURIComponent(eventId)}/header`).then(data => renderHeader(data.event)).catch(error => {
      document.getElementById('wec-race-head').setAttribute('aria-busy', 'false'); setError('wec-race-head', error.status === 404 ? 'This WEC race is not available.' : 'The race header could not be loaded.');
    });
    const entriesPromise = getJSON(`/api/wec/events/${encodeURIComponent(eventId)}/entries`).then(data => renderEntries(data.entries)).catch(() => { document.getElementById('wec-entry-count').textContent = 'Entries unavailable'; });
    try {
      raceData = await getJSON(`/api/wec/events/${encodeURIComponent(eventId)}`);
      renderRaceSummary(raceData); renderNavigation(raceData.navigation);
      const selectedData = requestedSession && String(requestedSession) !== String(raceData.selectedSessionId)
        ? await getJSON(`/api/wec/events/${encodeURIComponent(eventId)}?session=${encodeURIComponent(requestedSession)}`) : raceData;
      renderClassification(selectedData); syncUrl();
    } catch {
      document.getElementById('wec-race-summary').setAttribute('aria-busy', 'false'); document.getElementById('wec-race-summary').innerHTML = '<div class="error-state">The race summary could not be loaded.</div>';
      document.getElementById('wec-race-classification').setAttribute('aria-busy', 'false'); document.getElementById('wec-race-classification').innerHTML = '<div class="error-state">The session data could not be loaded.</div>';
    }
    await Promise.allSettled([headerPromise, entriesPromise]);
  }
  loadPage();
})();
