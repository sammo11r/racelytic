(() => {
  'use strict';
  const $ = id => document.getElementById(id), labels = { classWins: 'Class wins', overallWins: 'Overall wins', championships: 'Championships', podiums: 'Class podiums', points: 'Race points', starts: 'Starts', laps: 'Laps completed', finishRate: 'Classified finish rate', averageFinish: 'Average class finish' };
  let currentYear = new Date().getFullYear();
  let options = null, data = null, type = 'drivers', page = 1, request = 0, controller;
  const percentage = category => category === 'finishRate', average = category => category === 'averageFinish';
  const entityCollection = () => type === 'drivers' ? 'drivers' : type;
  const entityName = () => type === 'drivers' ? 'drivers' : type;

  function applyEra() {
    const era = $('wr-era').value;
    if (era === 'custom') return;
    const values = era === 'all' ? ['', ''] : era === 'current' ? [currentYear, currentYear] : era === 'recent' ? [Math.max(2012, currentYear - 4), currentYear] : era.split('-');
    $('wr-from').value = values[0]; $('wr-to').value = values[1];
  }
  function config() {
    const category = $('wr-category').value;
    return { series: 'wec', type, category, fromYear: $('wr-from').value || null, toYear: $('wr-to').value || null,
      circuitId: category === 'championships' ? '' : $('wr-circuit').value, classCode: $('wr-class').value,
      teamId: type === 'drivers' ? $('wr-team').value : '', minStarts: ['finishRate', 'averageFinish'].includes(category) ? Number($('wr-minimum').value) : 1 };
  }
  function query(configuration, includePage = false) {
    const params = new URLSearchParams();
    Object.entries(configuration).forEach(([key, value]) => { if (value !== '' && value != null && !(key === 'minStarts' && value === 1)) params.set(key, String(value)); });
    if (includePage && page > 1) params.set('page', page);
    return params;
  }
  function writeURL(configuration) { history.replaceState(null, '', `${location.pathname}?${query(configuration, true)}`); }
  function controls() {
    const category = $('wr-category').value, titles = category === 'championships', sample = ['finishRate', 'averageFinish'].includes(category);
    $('wr-circuit').closest('label').hidden = titles; $('wr-team-label').hidden = type !== 'drivers'; $('wr-minimum-label').hidden = !sample;
    document.querySelectorAll('[data-wr-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.wrType === type)));
    $('wr-filter-note').textContent = titles ? 'Championship records follow official class championships. Circuit filters do not apply.'
      : sample ? `Only entries with at least ${$('wr-minimum').value} starts are ranked.`
        : type === 'drivers' ? 'Every driver in a race crew receives the entry’s class result.' : 'Each car contributes one result; multi-car teams and manufacturers can record multiple starts in one event.';
  }
  function chips(c) {
    const rows = [];
    if (c.fromYear || c.toYear) rows.push(`${c.fromYear || 2012}–${c.toYear || 'present'}`);
    if (c.circuitId) rows.push(options.circuits.find(row => row.id === c.circuitId)?.name || c.circuitId);
    if (c.classCode) rows.push(c.classCode);
    if (c.teamId) rows.push(options.teams.find(row => row.id === c.teamId)?.name || c.teamId);
    if (['finishRate', 'averageFinish'].includes(c.category)) rows.push(`Minimum ${c.minStarts} starts`);
    $('wr-chips').innerHTML = rows.map(label => `<span>${esc(label)}</span>`).join('');
    return rows.length ? rows.join(' · ') : 'All WEC seasons';
  }
  function value(entry, category) {
    if (percentage(category)) return `${Number(entry.value).toFixed(1)}<span class="wr-value-unit">%</span>`;
    if (average(category)) return Number(entry.value).toFixed(2);
    return fmtNumber(entry.value);
  }
  function render() {
    const c = data.configuration, rows = data.entries, pages = Math.max(1, Math.ceil(rows.length / 25));
    page = Math.min(Math.max(1, page), pages); const visible = rows.slice((page - 1) * 25, page * 25), scope = chips(c);
    $('wr-title').textContent = data.label; $('wr-count').textContent = `${fmtNumber(data.total)} eligible ${entityName()} · ${scope}`;
    const top = rows[0], holders = rows.filter(row => row.rank === 1);
    $('wr-summary').innerHTML = top ? `<div><span class="fr-kicker">Record holder${holders.length === 1 ? '' : 's'}</span><h3>${esc(holders.slice(0, 3).map(row => row.name).join(' · '))}${holders.length > 3 ? ` +${holders.length - 3}` : ''}</h3><p>${esc(scope)}</p></div><div class="fr-total">${value(top, c.category)}</div><div class="fr-gap"><span class="fr-kicker">Archive coverage</span><strong>${data.coverage.fromYear || '—'}–${data.coverage.toYear || '—'}</strong><p>${fmtNumber(data.coverage.results)} car results in scope</p></div>` : '';
    const maximum = Math.max(1, ...visible.map(row => Math.abs(Number(row.value) || 0)));
    $('wr-ranking').innerHTML = visible.length ? `<div class="fr-table-scroll" role="region" tabindex="0" aria-label="WEC record rankings"><table class="fr-table"><caption class="sr-only">${esc(data.label)} ranking · ${esc(scope)}</caption><thead><tr><th scope="col">Rank</th><th scope="col">${type === 'drivers' ? 'Driver' : type === 'teams' ? 'Team' : 'Manufacturer'}</th><th scope="col" class="fr-secondary">Period</th><th scope="col" class="fr-secondary">Starts</th><th scope="col" class="fr-secondary">Class wins</th><th scope="col" class="fr-secondary">Podiums</th><th scope="col" class="fr-metric" aria-sort="${data.lowerIsBetter ? 'ascending' : 'descending'}">${esc(data.label)}</th></tr></thead><tbody>${visible.map(row => `<tr><td class="fr-rank">${row.rank}</td><td class="fr-person"><a href="/wec/${entityCollection()}/${encodeURIComponent(row.id)}">${esc(row.name)}</a><small>${['finishRate', 'averageFinish'].includes(c.category) ? `${row.sample} measured starts` : ''}</small></td><td class="fr-secondary">${row.firstYear === row.lastYear ? row.firstYear : `${row.firstYear}–${row.lastYear}`}</td><td class="fr-secondary">${fmtNumber(row.starts)}</td><td class="fr-secondary">${fmtNumber(row.classWins)}</td><td class="fr-secondary">${fmtNumber(row.podiums)}</td><td class="fr-metric"><strong>${value(row, c.category)}</strong><span class="fr-bar" aria-hidden="true"><i style="width:${Math.abs(Number(row.value) || 0) / maximum * 100}%"></i></span></td></tr>`).join('')}</tbody></table></div>` : '<p class="fr-empty">No eligible record holders match these filters. Widen the period or lower the minimum sample.</p>';
    $('wr-pagination').innerHTML = pages > 1 ? `<button type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pages}</span><button type="button" data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Next</button>` : '';
    $('wr-method-text').innerHTML = `<p>Class wins and podiums use official class positions. Overall wins use the complete race classification. DNS and withdrawn entries are excluded from starts; classified finish rate uses official classified status.</p><p>${type === 'drivers' ? 'Every listed crew member receives the car’s race result and points.' : 'Teams and manufacturers count each car entry once, so two cars in one race create two starts.'} Points use the scoring rules of each era and are not normalised.</p><p>Championships count distinct official championship titles. Competitor championships are attributed to the team behind that entry. Equal displayed values share a rank.</p>`;
    $('wr-results').setAttribute('aria-busy', 'false'); writeURL(c);
  }
  async function load() {
    const c = config(), version = ++request; controller?.abort(); controller = new AbortController();
    $('wr-message').textContent = 'Calculating WEC records…'; $('wr-results').setAttribute('aria-busy', 'true');
    try {
      const response = await getJSON(`/api/records/explore?${query(c)}`, { signal: controller.signal });
      if (version !== request) return; data = response; render(); $('wr-message').textContent = `${fmtNumber(data.total)} record holder${data.total === 1 ? '' : 's'} ranked.`;
    } catch (error) {
      if (error.name === 'AbortError' || version !== request) return;
      $('wr-message').textContent = `${error.message || 'Records could not be loaded.'} Please retry.`; $('wr-results').setAttribute('aria-busy', 'false');
    }
  }
  function restore() {
    const params = new URLSearchParams(location.search);
    type = ['drivers', 'teams', 'manufacturers'].includes(params.get('type')) ? params.get('type') : 'drivers';
    $('wr-category').value = Object.hasOwn(labels, params.get('category')) ? params.get('category') : 'classWins';
    $('wr-from').value = /^20\d{2}$/.test(params.get('fromYear') || '') ? params.get('fromYear') : '';
    $('wr-to').value = /^20\d{2}$/.test(params.get('toYear') || '') ? params.get('toYear') : '';
    $('wr-era').value = $('wr-from').value || $('wr-to').value ? 'custom' : 'all';
    $('wr-from-label').hidden = $('wr-to-label').hidden = $('wr-era').value !== 'custom';
    $('wr-circuit').value = params.get('circuitId') || ''; $('wr-class').value = params.get('classCode') || ''; $('wr-team').value = params.get('teamId') || '';
    $('wr-minimum').value = ['1', '3', '5', '10', '25'].includes(params.get('minStarts')) ? params.get('minStarts') : '5';
    page = Math.max(1, Number(params.get('page')) || 1); controls();
  }
  async function init() {
    try {
      options = await getJSON('/api/records/options?series=wec');
      currentYear = Math.max(2012, ...options.classes.map(row => Number(row.lastYear) || 0));
      $('wr-circuit').innerHTML = '<option value="">All circuits</option>' + options.circuits.map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('');
      $('wr-class').innerHTML = '<option value="">All classes</option>' + options.classes.map(row => `<option value="${esc(row.code)}">${esc(row.code)} · ${esc(row.firstYear === row.lastYear ? row.firstYear : `${row.firstYear}–${row.lastYear}`)}</option>`).join('');
      $('wr-team').innerHTML = '<option value="">All teams</option>' + options.teams.map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('');
      ['wr-circuit', 'wr-class', 'wr-team'].forEach(id => $(id).disabled = false); restore(); await load();
    } catch (error) { $('wr-message').textContent = `${error.message || 'Record filters could not be loaded.'} Please retry.`; }
  }
  document.querySelectorAll('[data-wr-type]').forEach(button => button.addEventListener('click', () => { type = button.dataset.wrType; page = 1; controls(); load(); }));
  $('wr-category').addEventListener('change', () => { page = 1; controls(); load(); });
  $('wr-era').addEventListener('change', () => { applyEra(); $('wr-from-label').hidden = $('wr-to-label').hidden = $('wr-era').value !== 'custom'; page = 1; load(); });
  ['wr-circuit', 'wr-class', 'wr-team', 'wr-minimum'].forEach(id => $(id).addEventListener('change', () => { page = 1; controls(); load(); }));
  ['wr-from', 'wr-to'].forEach(id => $(id).addEventListener('change', () => { page = 1; load(); }));
  $('wr-reset').addEventListener('click', () => { $('wr-era').value = 'all'; applyEra(); $('wr-from-label').hidden = $('wr-to-label').hidden = true; $('wr-circuit').value = $('wr-class').value = $('wr-team').value = ''; $('wr-minimum').value = '5'; page = 1; controls(); load(); });
  $('wr-pagination').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (!button || button.disabled) return; page = Number(button.dataset.page); render(); scrollTo({ top: $('wr-results').offsetTop - 80, behavior: 'smooth' }); });
  $('wr-share').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); $('wr-message').textContent = 'Link copied.'; } catch { $('wr-message').textContent = 'Copy the current address to share this ranking.'; } });
  init();
})();
