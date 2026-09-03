(() => {
  const card = document.querySelector('.analysis-example-card');
  if (!card) return;
  const directory = document.querySelector('[data-analysis-series]');
  const seriesName = directory?.dataset.analysisSeries || 'Formula 1';
  const basePath = directory?.dataset.analysisBase || '';

  const examples = [
    ['Which championship had the most dramatic points swing?', 'Season analysis', `${basePath}/season-analysis`],
    ['Which seasons produced the closest title fights?', 'Season comparison', `${basePath}/season-comparison`],
    ['How much did the starting grid shape the final result?', 'Race analysis', `${basePath}/race-analysis`],
    [`How do two ${seriesName} careers compare side by side?`, 'Driver comparison', `${basePath}/driver-comparison`],
    ['Which drivers are carrying the strongest recent momentum?', 'Driver form', `${basePath}/driver-form`],
    ['Which drivers consistently outperform their teammates?', 'Teammate battles', `${basePath}/teammate-battles`],
    [`Who performs best at ${seriesName}’s toughest circuits?`, 'Circuit analysis', `${basePath}/circuit-analysis`],
    [`Who leads ${seriesName}’s major historical statistics?`, 'Records', `${basePath}/records`]
  ];
  const link = card.matches('[data-analysis-example-link]') ? card : card.querySelector('[data-analysis-example-link]');
  const content = card.querySelector('[data-analysis-example-content]');
  const question = card.querySelector('[data-analysis-example-question]');
  const tool = card.querySelector('[data-analysis-example-tool]');
  const count = card.querySelector('[data-analysis-example-count]');
  const markers = [...card.querySelectorAll('.analysis-example-progress i')];
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let index = 0;
  let timer;

  const render = nextIndex => {
    index = nextIndex;
    question.textContent = examples[index][0];
    tool.firstChild.textContent = `${examples[index][1]} `;
    link.href = examples[index][2];
    link.setAttribute('aria-label', `Explore ${examples[index][1].toLowerCase()}: ${examples[index][0]}`);
    count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(examples.length).padStart(2, '0')}`;
    markers.forEach((marker, markerIndex) => marker.classList.toggle('is-active', markerIndex === index));
  };

  const advance = () => {
    content.classList.add('is-changing');
    window.setTimeout(() => {
      render((index + 1) % examples.length);
      content.classList.remove('is-changing');
    }, 180);
  };

  const start = () => {
    if (reducedMotion || timer) return;
    timer = window.setInterval(advance, 4600);
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = undefined;
  };

  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  card.addEventListener('mouseenter', stop);
  card.addEventListener('mouseleave', start);
  card.addEventListener('focusin', stop);
  card.addEventListener('focusout', start);
  start();
})();
