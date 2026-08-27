(() => {
  const engine = window.LightsOutEngine;
  const zone = document.getElementById('lights-reaction-zone');
  const startButton = document.getElementById('lights-start');
  const result = document.getElementById('lights-result');
  const instruction = document.getElementById('lights-instruction');
  const lightElements = [...document.querySelectorAll('.lights-rig i')];
  let stats = engine.loadStats(localStorage);
  let phase = 'ready';
  let sequenceToken = 0;
  let lightsOutAt = 0;
  let attempts = stats.results.length + stats.falseStarts;

  const path = window.location.pathname;
  if (path.startsWith('/f2/')) document.getElementById('lights-games-link').href = '/f2/games';
  else if (path.startsWith('/f3/')) document.getElementById('lights-games-link').href = '/f3/games';
  else if (path.startsWith('/academy/')) document.getElementById('lights-games-link').href = '/academy/games';

  function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  function save() {
    stats = engine.saveStats(stats, localStorage);
  }

  function renderStats() {
    const summary = engine.summarize(stats);
    document.getElementById('lights-best').textContent = summary.best === null ? '—' : `${summary.best} ms`;
    document.getElementById('lights-average').textContent = summary.average === null ? '—' : `${summary.average} ms`;
    document.getElementById('lights-valid').textContent = summary.count;
    document.getElementById('lights-false').textContent = summary.falseStarts;
    document.getElementById('lights-round').textContent = `Attempt ${attempts + 1}`;
    const history = document.getElementById('lights-history');
    if (!summary.results.length) {
      history.innerHTML = '<li class="empty">No valid attempts yet</li>';
      return;
    }
    history.innerHTML = summary.results.map((milliseconds, index) => {
      const tier = engine.reactionTier(milliseconds);
      return `<li><span>#${summary.count - index}</span><strong>${milliseconds} ms</strong><small class="${tier.id}">${tier.label}</small></li>`;
    }).join('');
  }

  function resetVisuals() {
    lightElements.forEach(light => light.classList.remove('on'));
    zone.className = 'lights-reaction-zone';
  }

  function readyForNext(message = 'Press start when you are ready') {
    phase = 'ready';
    startButton.disabled = false;
    startButton.textContent = attempts ? 'Try again' : 'Start test';
    instruction.textContent = message;
  }

  async function beginSequence() {
    if (phase !== 'ready') return;
    const token = ++sequenceToken;
    phase = 'staging';
    resetVisuals();
    result.textContent = '—';
    instruction.textContent = 'Wait for darkness…';
    startButton.disabled = true;
    for (const light of lightElements) {
      await wait(460);
      if (token !== sequenceToken) return;
      light.classList.add('on');
    }
    phase = 'holding';
    await wait(engine.randomizedHold());
    if (token !== sequenceToken) return;
    lightElements.forEach(light => light.classList.remove('on'));
    phase = 'go';
    lightsOutAt = performance.now();
    zone.classList.add('go');
    instruction.textContent = 'NOW!';
  }

  function react() {
    if (phase === 'ready') return beginSequence();
    if (phase === 'staging' || phase === 'holding') {
      sequenceToken += 1;
      attempts += 1;
      stats = engine.addFalseStart(stats);
      save();
      resetVisuals();
      zone.classList.add('false-start');
      result.textContent = 'FALSE START';
      readyForNext('You reacted before the lights went out');
      renderStats();
      return;
    }
    if (phase !== 'go') return;
    const milliseconds = Math.max(0, Math.round(performance.now() - lightsOutAt));
    attempts += 1;
    stats = engine.addResult(stats, milliseconds);
    save();
    const tier = engine.reactionTier(milliseconds);
    phase = 'result';
    zone.className = `lights-reaction-zone result ${tier.id}`;
    result.textContent = `${milliseconds} ms`;
    instruction.textContent = tier.label;
    renderStats();
    setTimeout(() => readyForNext('Go again when you are ready'), 250);
  }

  startButton.addEventListener('click', event => { event.stopPropagation(); beginSequence(); });
  zone.addEventListener('pointerdown', event => { event.preventDefault(); react(); });
  window.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || /input|select|textarea/i.test(document.activeElement?.tagName)) return;
    event.preventDefault();
    react();
  });
  document.getElementById('lights-clear').addEventListener('click', () => {
    stats = engine.normalizeStats();
    attempts = 0;
    save();
    renderStats();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || phase === 'ready' || phase === 'result') return;
    sequenceToken += 1;
    resetVisuals();
    result.textContent = '—';
    readyForNext('Attempt cancelled while the page was hidden');
  });

  renderStats();
})();
