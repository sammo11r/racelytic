(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const colors = ['#087f5b', '#d9485f', '#2463a7', '#9a6700', '#6f42c1', '#00838f', '#b44600', '#5f6b73', '#c2255c', '#2b8a3e'];
  const allowedViews = new Set(['progression', 'margin', 'distribution', 'heatmap', 'averages']);
  const initialQuery = new URLSearchParams(location.search);
  let seasons = [], data, championship, selected = new Set();
  let view = allowedViews.has(initialQuery.get('view')) ? initialQuery.get('view') : 'progression';
  let sortKey = 'averageFinish', sortDirection = 1, requestId = 0, previousWidth = 0;

  const number = value => value === null || value === undefined ? '—' : fmtNumber(value);
  const empty = message => `<div class="empty-state">${esc(message)}</div>`;
  const entityTypeLabel = (type, singular = false) => ({ driver: singular ? 'Driver' : 'Drivers', manufacturer: singular ? 'Manufacturer' : 'Manufacturers', competitor: singular ? 'Team' : 'Teams', team: singular ? 'Team' : 'Teams' })[type] || (singular ? 'Entry' : 'Entries');
  const entityLink = entity => {
    const collection = { driver: 'drivers', manufacturer: 'manufacturers', competitor: 'entries', team: 'teams' }[championship.entityType];
    return collection ? `/wec/${collection}/${encodeURIComponent(entity.id)}` : '';
  };
  const eventLabel = event => `R${event.round}`;
  const styleFor = (entity, index) => ({ color: colors[index % colors.length], dash: index >= colors.length ? `${4 + index % 3} 3` : '' });

  function saveState() {
    if (!data || !championship) return;
    const url = new URL(location.href);
    url.searchParams.set('year', data.season.year);
    url.searchParams.set('championship', championship.id);
    url.searchParams.set('view', view);
    url.searchParams.set('entities', [...selected].join(','));
    history.replaceState(null, '', url);
  }

  function seriesRows() {
    if (!championship) return [];
    return championship.entities.map((entity, index) => {
      const rounds = new Map(entity.rounds.map(round => [round.round, round]));
      return {
        ...entity,
        ...styleFor(entity, index),
        values: data.events.map(event => {
          const round = rounds.get(event.round);
          return { race: event, points: Number(round?.points || 0), position: round?.position || null, available: Boolean(round) };
        })
      };
    });
  }

  function leaders() {
    return data.events.map((event, index) => {
      const rows = seriesRows().filter(row => row.values[index].available)
        .sort((left, right) => left.values[index].position - right.values[index].position || right.values[index].points - left.values[index].points);
      const leader = rows[0], runnerUp = rows[1];
      const tied = leader ? rows.filter(row => row.values[index].points === leader.values[index].points) : [];
      return { race: event, available: Boolean(leader), leader, runnerUp, tied, leaderKey: tied.map(row => row.id).sort().join('|'), gap: leader && runnerUp ? leader.values[index].points - runnerUp.values[index].points : 0 };
    });
  }

  function leadDescription(entry) {
    if (!entry?.leader) return 'No standings recorded.';
    if (entry.tied.length > 1) return `Tied on points: ${entry.tied.map(row => row.name).join(', ')}.`;
    return `${entry.leader.name} leads${entry.runnerUp ? ` ${entry.runnerUp.name} by ${number(entry.gap)} pts.` : '.'}`;
  }

  function renderSummary() {
    const winner = championship.entities.find(row => row.championshipWon) || championship.entities[0];
    const runner = championship.entities.find(row => row.id !== winner?.id);
    const item = (label, value, note, highlight = false) => `<div${highlight ? ' class="highlight"' : ''}><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
    $('wec-analysis-summary').innerHTML =
      item(winner?.championshipWon ? 'Champion' : 'Championship leader', winner?.name || '—', winner ? `${number(winner.finalPoints)} championship points` : 'No standing recorded', true) +
      item(winner?.championshipWon ? 'Final margin' : 'Current lead', winner && runner ? `${number(winner.finalPoints - runner.finalPoints)} pts` : '—', runner ? `over ${runner.name}` : 'No runner-up recorded') +
      item(entityTypeLabel(championship.entityType), number(championship.entities.length), `classified in ${championship.name}`) +
      item('Rounds recorded', `${new Set(championship.entities.flatMap(entity => entity.rounds.map(round => Number(round.round)))).size} / ${data.events.length}`, data.season.status === 'completed' ? 'Season complete' : 'Official standings available');
    $('analysis-status').textContent = '';
    $('analysis-status').hidden = true;
  }

  function updateSelection() {
    const label = entityTypeLabel(championship.entityType).toLowerCase();
    $('selection-count').textContent = `${selected.size} ${label} selected`;
    $('entity-picker-count').textContent = `(${selected.size})`;
  }

  function filterEntities() {
    const query = $('entity-search').value.trim().toLowerCase();
    document.querySelectorAll('[data-analysis-entity]').forEach(button => { button.hidden = !button.dataset.search.includes(query); });
  }

  function renderPicker() {
    $('entity-picker').querySelector('summary').firstChild.textContent = `Choose ${entityTypeLabel(championship.entityType).toLowerCase()} `;
    $('progression-legend').innerHTML = seriesRows().map(row => `<button type="button" class="progression-driver${selected.has(String(row.id)) ? ' active' : ''}" data-analysis-entity="${esc(row.id)}" aria-pressed="${selected.has(String(row.id))}" data-search="${esc(row.name.toLowerCase())}"><i style="--driver-color:${row.color}"></i>${esc(row.name)}</button>`).join('');
    filterEntities();
    updateSelection();
  }

  function preset(value) {
    const rows = championship.entities;
    let chosen;
    if (value === 'clear') chosen = [];
    else if (value === 'all') chosen = rows;
    else if (value === 'five') chosen = rows.slice(0, 5);
    else chosen = rows.filter((row, index) => index < 2 || (Number(rows[0]?.finalPoints) > 0 && Number(row.finalPoints) >= Number(rows[0].finalPoints) * .8));
    selected = new Set(chosen.map(row => String(row.id)));
    $('entity-picker').setAttribute('data-preset-note', value === 'contenders' ? `Top two plus ${entityTypeLabel(championship.entityType).toLowerCase()} within 20% of the leader’s points.` : '');
    renderPicker();
    renderCharts();
    saveState();
  }

  function drawChart(container, rows, marginChart = false) {
    const rounds = rows[0]?.values || [];
    const readout = $(marginChart ? 'lead-readout' : 'round-readout');
    if (!rounds.length) { container.innerHTML = empty('No recorded rounds to plot.'); readout.innerHTML = ''; return; }
    const width = Math.max(300, Math.round(container.clientWidth || $('season-analysis-workspace').clientWidth));
    const small = width < 600, left = 42, right = small ? 88 : 180;
    const height = Math.max(small ? 300 : 320, rows.length * 18 + 70), top = 20, bottom = 38;
    const plotRight = width - right, plotBottom = height - bottom;
    const max = Math.max(1, ...rows.flatMap(row => row.values.filter(value => value.available).map(value => value.points)));
    const x = index => left + index / Math.max(1, rounds.length - 1) * (plotRight - left);
    const y = points => top + (1 - points / max) * (plotBottom - top);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${marginChart ? 'Championship lead' : 'Official points'} by round"><g class="chart-grid">`;
    svg += Array.from({ length: 5 }, (_, index) => {
      const value = max * index / 4;
      return `<line x1="${left}" x2="${plotRight}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 7}" y="${y(value) + 4}" text-anchor="end">${number(Math.round(value * 10) / 10)}</text>`;
    }).join('') + '</g>';
    const endpoints = rows.map(row => ({ row, value: row.values.at(-1), labelY: y(row.values.at(-1).points) })).sort((a, b) => a.labelY - b.labelY);
    endpoints.forEach((point, index) => { point.labelY = Math.max(point.labelY, index ? endpoints[index - 1].labelY + 17 : top + 4); });
    if (endpoints.at(-1)?.labelY > plotBottom) {
      const shift = endpoints.at(-1).labelY - plotBottom;
      endpoints.forEach(point => { point.labelY -= shift; });
    }
    rows.forEach(row => {
      let previous = false;
      const path = row.values.map((value, index) => {
        if (!value.available) { previous = false; return ''; }
        const command = previous ? 'L' : 'M'; previous = true;
        return `${command}${x(index)},${y(value.points)}`;
      }).join(' ');
      svg += `<g class="chart-series" style="--series-color:${row.color}"><path d="${path}" stroke-dasharray="${row.dash}"/>${row.values.map((value, index) => value.available ? `<circle cx="${x(index)}" cy="${y(value.points)}" r="3"/>` : '').join('')}</g>`;
    });
    endpoints.forEach(({ row, value, labelY }) => {
      const name = marginChart ? 'Lead' : small ? row.name.slice(0, 7) : row.name;
      svg += `<g class="chart-endpoint"><path d="M${plotRight},${y(value.points)} L${plotRight + 8},${labelY}" stroke="${row.color}"/><text x="${plotRight + 12}" y="${labelY + 4}">${esc(name)} ${number(value.points)}</text></g>`;
    });
    rounds.forEach((round, index) => {
      svg += `<text class="chart-round-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${eventLabel(round.race)}</text>`;
      if (!round.available) return;
      const before = index ? (x(index - 1) + x(index)) / 2 : left;
      const after = index < rounds.length - 1 ? (x(index) + x(index + 1)) / 2 : plotRight;
      svg += `<rect class="analysis-round-hit" data-round-index="${index}" x="${rounds.length === 1 ? left : before}" y="${top}" width="${Math.max(1, rounds.length === 1 ? plotRight - left : after - before)}" height="${plotBottom - top}" tabindex="0" role="button" aria-label="${esc(eventLabel(round.race))}: ${esc(round.race.name)}"><title>${esc(round.race.name)}</title></rect>`;
    });
    container.innerHTML = svg + '</svg>';
    const showRound = index => {
      const round = rounds[index];
      let content = `<strong>${esc(eventLabel(round.race))} · ${esc(round.race.name)}</strong><span>${esc(fmtDate(round.race.date))}</span>`;
      if (marginChart) content += `<p>${esc(leadDescription(leaders()[index]))}</p>`;
      else content += `<ul>${[...rows].sort((a, b) => b.values[index].points - a.values[index].points).map(row => `<li><i style="background:${row.color}"></i><span>${esc(row.name)}</span><b>${number(row.values[index].points)} pts</b></li>`).join('')}</ul>`;
      readout.innerHTML = content;
      container.querySelectorAll('[data-round-index]').forEach(hit => hit.classList.toggle('is-current', Number(hit.dataset.roundIndex) === index));
    };
    container.querySelectorAll('[data-round-index]').forEach(hit => {
      const show = () => showRound(Number(hit.dataset.roundIndex));
      hit.addEventListener('pointerenter', show); hit.addEventListener('focus', show); hit.addEventListener('click', show);
      hit.addEventListener('keydown', event => {
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); show(); }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const hits = [...container.querySelectorAll('[data-round-index]')], index = hits.indexOf(hit);
        hits[event.key === 'Home' ? 0 : event.key === 'End' ? hits.length - 1 : Math.max(0, Math.min(hits.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))].focus();
      });
    });
    showRound(rounds.length - 1);
  }

  function renderCharts() {
    if (!championship) return;
    if (view === 'progression') {
      const rows = seriesRows().filter(row => selected.has(String(row.id)));
      if (rows.length) drawChart($('season-progression-chart'), rows);
      else { $('season-progression-chart').innerHTML = empty(`Select ${entityTypeLabel(championship.entityType).toLowerCase()} or choose a preset to begin.`); $('round-readout').innerHTML = ''; }
    }
    if (view === 'margin') {
      const entries = leaders();
      drawChart($('winning-margin-chart'), entries.length ? [{ name: 'Lead', color: '#087f5b', dash: '', values: entries.map(entry => ({ race: entry.race, available: entry.available, points: entry.gap })) }] : [], true);
      let lastKey;
      $('lead-changes').innerHTML = entries.filter(entry => {
        if (!entry.available || entry.leaderKey === lastKey) return false;
        lastKey = entry.leaderKey; return true;
      }).map(entry => `<li><strong>${esc(eventLabel(entry.race))} · ${esc(entry.race.name)}</strong><span>${esc(leadDescription(entry))}</span></li>`).join('') || '<li>No recorded lead changes.</li>';
    }
  }

  function renderDistribution() {
    const rows = seriesRows().filter(row => row.finalPoints > 0).sort((left, right) => right.finalPoints - left.finalPoints);
    const total = rows.reduce((sum, row) => sum + row.finalPoints, 0);
    $('points-distribution-chart').innerHTML = rows.length ? `<ol class="analysis-share-bars">${rows.map(row => `<li><span>${esc(row.name)}</span><div class="analysis-share-track" aria-hidden="true"><i style="width:${row.finalPoints / total * 100}%;background:${row.color}"></i></div><strong>${number(row.finalPoints)} pts <small>${(row.finalPoints / total * 100).toFixed(1)}%</small></strong></li>`).join('')}</ol>` : empty('No championship points recorded.');
  }

  function heatClass(result) {
    if (!result) return 'missing';
    if (['disqualified', 'excluded'].includes(result.status)) return 'disqualified';
    if (result.status !== 'classified' || !result.position) return 'retired';
    if (result.position === 1) return 'winner';
    if (result.position <= 3) return 'podium';
    return 'finish';
  }

  function renderHeatmap() {
    $('heatmap-scope').textContent = `${championship.entities.length} ${entityTypeLabel(championship.entityType).toLowerCase()} · class positions`;
    $('heatmap-readout').textContent = 'Select a result for details.';
    $('results-heatmap').innerHTML = `<table class="analysis-results-table"><caption>${championship.entities.length} ${entityTypeLabel(championship.entityType).toLowerCase()} · ${data.season.year}</caption><thead><tr><th scope="col">${entityTypeLabel(championship.entityType, true)}</th>${data.events.map(event => `<th scope="col"><span>${eventLabel(event)}</span><small>${esc(event.name)}</small></th>`).join('')}</tr></thead><tbody>${championship.entities.map(entity => `<tr><th scope="row"><a href="${entityLink(entity)}">${esc(entity.name)}</a></th>${data.events.map(event => {
      const result = entity.results?.[event.id];
      const classifiedResult = result?.status === 'classified' && Number(result.position) > 0;
      const label = classifiedResult ? result.position : result ? String(result.status || '—').replace(/-/g, ' ') : '—';
      const detail = `${entity.name} · ${eventLabel(event)} · ${event.name} · ${fmtDate(event.date)}: ${classifiedResult ? `P${result.position} in class` : result ? String(result.status).replace(/-/g, ' ') : 'Did not participate'}`;
      return `<td><button type="button" class="heatmap-cell ${heatClass(result)}" data-result-detail="${esc(detail)}" aria-label="${esc(detail)}">${esc(label)}</button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table><div class="heatmap-key"><span class="winner">Win</span><span class="podium">Podium</span><span class="finish">Classified</span><span class="retired">Unclassified / did not start</span><span class="disqualified">Disqualified / excluded</span><span>— Did not participate</span></div>`;
    $('results-heatmap').querySelectorAll('[data-result-detail]').forEach(button => {
      const show = () => { $('heatmap-readout').textContent = button.dataset.resultDetail; };
      button.addEventListener('focus', show); button.addEventListener('click', show); button.addEventListener('pointerenter', show);
    });
  }

  function averageRow(entity) {
    const results = Object.values(entity.results || {});
    const starts = results.filter(result => result.status !== 'not-started');
    const positions = starts.filter(result => result.status === 'classified').map(result => Number(result.position)).filter(position => position > 0);
    const averageFinish = positions.length ? positions.reduce((sum, value) => sum + value, 0) / positions.length : null;
    const spread = positions.length ? Math.sqrt(positions.reduce((sum, value) => sum + (value - averageFinish) ** 2, 0) / positions.length) : null;
    const unclassified = starts.length - positions.length;
    return { ...entity, averageFinish, spread, finishes: positions.length, starts: starts.length, unclassified, unclassifiedRate: starts.length ? unclassified / starts.length * 100 : null };
  }

  function renderAverages() {
    const columns = [['name', entityTypeLabel(championship.entityType, true)], ['averageFinish', 'Avg. class finish'], ['spread', 'Finish spread'], ['finishes', 'Classified sample'], ['unclassifiedRate', 'Unclassified rate'], ['finalPosition', 'Final standing'], ['finalPoints', 'Points']];
    const rows = championship.entities.map(averageRow).sort((left, right) => {
      if (left[sortKey] == null) return right[sortKey] == null ? 0 : 1;
      if (right[sortKey] == null) return -1;
      return sortDirection * (typeof left[sortKey] === 'string' ? left[sortKey].localeCompare(right[sortKey]) : left[sortKey] - right[sortKey]);
    });
    $('average-position-table').innerHTML = `<table class="average-position-table"><thead><tr>${columns.map(([key, label]) => `<th scope="col" aria-sort="${sortKey === key ? sortDirection === 1 ? 'ascending' : 'descending' : 'none'}"><button type="button" data-sort="${key}">${esc(label)}${sortKey === key ? sortDirection === 1 ? ' ↑' : ' ↓' : ' ↕'}</button></th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(([key]) => `<td>${key === 'name' ? `<a href="${entityLink(row)}">${esc(row.name)}</a>` : key === 'finalPosition' ? (row.finalPosition ? `P${row.finalPosition}` : '—') : key === 'unclassifiedRate' ? (row.unclassifiedRate == null ? '—' : `${row.unclassifiedRate.toFixed(1)}% <small>(${row.unclassified}/${row.starts} starts)</small>`) : key === 'finishes' ? row.finishes : row[key] == null ? '—' : key === 'finalPoints' ? number(row[key]) : row[key].toFixed(2)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function selectView(next) {
    view = allowedViews.has(next) ? next : 'progression';
    document.querySelectorAll('[data-wec-visual]').forEach(panel => { panel.hidden = panel.dataset.wecVisual !== view; });
    document.querySelectorAll('[data-wec-visual-button]').forEach(button => {
      const active = button.dataset.wecVisualButton === view;
      button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    $('analysis-view').value = view;
    renderCharts();
    saveState();
  }

  function renderChampionship(next, requestedEntities = null) {
    championship = next;
    if (!championship) return;
    $('analysis-championship').value = championship.id;
    const valid = new Set(championship.entities.map(entity => String(entity.id)));
    selected = new Set(requestedEntities?.filter(id => valid.has(id)) || championship.entities.slice(0, 5).map(entity => String(entity.id)));
    $('entity-search').value = '';
    $('entity-picker').removeAttribute('data-preset-note');
    renderSummary(); renderPicker(); renderDistribution(); renderHeatmap(); renderAverages();
    $('season-analysis-workspace').hidden = false;
    selectView(view);
  }

  function defaultChampionship() {
    return data.championships.find(item => item.entityType === 'manufacturer' && /hypercar|lmp1/i.test(`${item.name} ${item.classCode || ''}`)) || data.championships[0];
  }

  async function loadSeason(year, requestedChampionship = null, requestedEntities = null) {
    const current = ++requestId;
    $('analysis-status').hidden = false;
    $('analysis-status').textContent = `Loading ${year} WEC season…`;
    $('season-analysis-workspace').hidden = true;
    $('wec-analysis-summary').innerHTML = '';
    $('analysis-championship').disabled = true;
    try {
      const response = await getJSON(`/api/wec/analysis/seasons/${encodeURIComponent(year)}`);
      if (current !== requestId) return;
      data = response;
      const select = $('analysis-championship');
      select.innerHTML = data.championships.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
      select.disabled = !data.championships.length;
      const next = data.championships.find(item => item.id === requestedChampionship) || defaultChampionship();
      renderChampionship(next, requestedEntities);
    } catch (error) {
      if (current !== requestId) return;
      data = null;
      $('analysis-status').textContent = `Unable to load ${year}: ${error.message}`;
    }
  }

  $('analysis-season').addEventListener('change', event => loadSeason(event.target.value));
  $('analysis-championship').addEventListener('change', event => renderChampionship(data.championships.find(item => item.id === event.target.value)));
  $('analysis-view').addEventListener('change', event => selectView(event.target.value));
  $('entity-search').addEventListener('input', filterEntities);
  $('progression-legend').addEventListener('click', event => {
    const button = event.target.closest('[data-analysis-entity]'); if (!button) return;
    const id = button.dataset.analysisEntity;
    $('entity-picker').removeAttribute('data-preset-note');
    selected.has(id) ? selected.delete(id) : selected.add(id);
    button.classList.toggle('active', selected.has(id)); button.setAttribute('aria-pressed', String(selected.has(id)));
    updateSelection(); renderCharts(); saveState();
  });
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => preset(button.dataset.preset)));
  const tabs = [...document.querySelectorAll('[data-wec-visual-button]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => selectView(button.dataset.wecVisualButton));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectView(tabs[target].dataset.wecVisualButton); tabs[target].focus();
    });
  });
  $('average-position-table').addEventListener('click', event => {
    const button = event.target.closest('[data-sort]'); if (!button) return;
    sortDirection = sortKey === button.dataset.sort ? -sortDirection : 1; sortKey = button.dataset.sort;
    renderAverages(); $('average-position-table').querySelector(`[data-sort="${sortKey}"]`)?.focus();
  });
  window.addEventListener('popstate', () => {
    const query = new URLSearchParams(location.search);
    view = allowedViews.has(query.get('view')) ? query.get('view') : 'progression';
    const year = query.get('year');
    if ([...$('analysis-season').options].some(option => option.value === year)) $('analysis-season').value = year;
    loadSeason($('analysis-season').value, query.get('championship'), String(query.get('entities') || '').split(',').filter(Boolean));
  });
  new ResizeObserver(entries => {
    const width = Math.round(entries[0].contentRect.width);
    if (width && width !== previousWidth) { previousWidth = width; renderCharts(); }
  }).observe($('season-analysis-workspace'));

  getJSON('/api/wec/seasons').then(response => {
    seasons = response;
    const select = $('analysis-season');
    select.innerHTML = seasons.map(season => `<option value="${season.year}">${season.year}</option>`).join('');
    select.disabled = false;
    const requestedYear = initialQuery.get('year');
    if (seasons.some(season => String(season.year) === requestedYear)) select.value = requestedYear;
    const requestedEntities = String(initialQuery.get('entities') || '').split(',').filter(Boolean);
    if (select.value) loadSeason(select.value, initialQuery.get('championship'), requestedEntities.length ? requestedEntities : null);
    else $('analysis-status').textContent = 'No WEC seasons available.';
  }).catch(error => { $('analysis-status').textContent = `Unable to load seasons: ${error.message}`; });
})();
