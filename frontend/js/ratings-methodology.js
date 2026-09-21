(function initialiseRatingsValidation() {
  const target = document.getElementById('ratings-validation-live');
  const query = new URLSearchParams(location.search);
  const series = ['f1', 'f2', 'f3', 'academy', 'fe', 'wec'].includes(query.get('series')) ? query.get('series') : 'f1';
  document.body.classList.toggle('wec-mode', series === 'wec');
  const model = series === 'f1' && query.get('model') === 'team-adjusted' ? 'team-adjusted' : 'competitive';
  if (series === 'wec') {
    const hero = document.querySelector('.ratings-hero-copy');
    hero.querySelector('h1').innerHTML = 'How WEC crew<br>ratings work.';
    hero.querySelector('p').textContent = 'A transparent guide to class specific entry comparisons, crew strength and the evidence behind each driver rating.';
    const note = document.querySelector('.ratings-hero-note p');
    note.textContent = 'WEC crew 1.1 uses independent class pools. Historical class names are grouped into top prototype, LMP2, GTE Pro, and GT categories.';
    document.querySelector('#model-history p').innerHTML = '<strong>WEC crew 1.1</strong> is the current WEC model. Its event updates remain zero-sum across drivers, including races with different crew sizes. Saved validation reports remain tied to the model version and championship that produced them.';
    const cards = document.querySelectorAll('.ratings-method-grid article');
    if (cards[0]) cards[0].innerHTML = '<span>01</span><h3>Every entry is a matchup</h3><p>Cars are compared only with other starters in the same class. Finishing ahead of a stronger crew creates a larger gain, while ties split the matchup.</p>';
    if (cards[1]) cards[1].innerHTML = '<span>02</span><h3>Crew strength uses the mean</h3><p>An entry’s pre-race strength is the mean rating of its listed drivers. The entry result then gives the same rating signal to every crew member, without multiplying strength for larger crews.</p>';
    if (cards[2]) cards[2].innerHTML = '<span>03</span><h3>Distance softens retirements</h3><p>Classified finishes and exclusions carry full weight. Retirement matchups are softened by the distance completed, while each driver’s experience controls how quickly the rating moves.</p>';
    if (cards[3]) cards[3].innerHTML = '<span>04</span><h3>Class pools stay separate</h3><p>Top prototypes, LMP2, GTE Pro, and GT each begin from an independent 1500 point pool. A driver changing category starts a separate class rating.</p>';
    const uncertainty = document.querySelector('#uncertainty p');
    uncertainty.textContent = 'Everyone begins at 1500 with uncertainty of ±260. Weighted evidence narrows that range towards a ±45 floor, while inactivity widens the displayed range. In WEC, Measured begins at 6 weighted class starts and Stable at 20.';
  }
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
