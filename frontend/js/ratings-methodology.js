(function initialiseRatingsValidation() {
  const target = document.getElementById('ratings-validation-live');
  const query = new URLSearchParams(location.search);
  const series = ['f1', 'f2', 'f3', 'academy'].includes(query.get('series')) ? query.get('series') : 'f1';
  const model = series === 'f1' && query.get('model') === 'team-adjusted' ? 'team-adjusted' : 'competitive';
  const format = value => Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '—';
  fetch(`/api/ratings/validation?series=${encodeURIComponent(series)}&model=${encodeURIComponent(model)}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error('No report')))
    .then(data => {
      if (!data.available) {
        target.innerHTML = '<p>No saved validation report is available for this model yet. The methodology above describes the checks required before publication.</p>';
        return;
      }
      const values = [
        ['Pairwise accuracy', data.accuracy == null ? '—' : `${Math.round(data.accuracy * 100)}%`],
        ['Brier score', format(data.brierScore)],
        ['Position error', data.positionMeanAbsoluteError == null ? '—' : `${Number(data.positionMeanAbsoluteError).toFixed(2)} places`],
        ['Evaluated events', data.events ?? '—']
      ];
      const list = document.createElement('dl');
      values.forEach(([label, value]) => {
        const row = document.createElement('div'), term = document.createElement('dt'), description = document.createElement('dd');
        term.textContent = label;
        description.textContent = value;
        row.append(term, description);
        list.append(row);
      });
      const note = document.createElement('p');
      note.textContent = `${data.modelLabel} · ${data.evaluatedAt ? `evaluated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(data.evaluatedAt))}` : 'saved report'}.`;
      target.replaceChildren(list, note);
    })
    .catch(() => { target.innerHTML = '<p>No saved validation report is available for this model yet. The methodology above describes the checks required before publication.</p>'; });
})();
