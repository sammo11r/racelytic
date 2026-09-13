const QUIZ_PROGRESS_KEYS = {
  'world-champions': 'racelytic-quiz-world-champions',
  'race-winners': 'racelytic-quiz-race-winners',
  'constructor-champions': 'racelytic-quiz-constructor-champions'
};

function storedQuizProgress(quiz, overrideKey) {
  try {
    const value = JSON.parse(localStorage.getItem(overrideKey || QUIZ_PROGRESS_KEYS[quiz]) || 'null');
    if ((quiz === 'world-champions' || quiz === 'race-winners') && value?.version !== 2) return null;
    return value && Array.isArray(value.answers) ? value : null;
  } catch (_) {
    return null;
  }
}

function updateQuizCard(quiz, total, validAnswerIds, progressKey) {
  const card = document.querySelector(`[data-quiz-card="${quiz}"]`);
  if (!card) return;
  const progress = storedQuizProgress(quiz, progressKey);
  const found = progress?.answers.filter(answer => Array.isArray(answer) && validAnswerIds.has(String(answer[0]))).length || 0;
  const gaveUp = Boolean(progress?.gaveUp);
  const status = card.querySelector('[data-quiz-status]');
  const action = card.querySelector('[data-quiz-action]');

  status.classList.toggle('is-progress', found > 0 && found < total);
  status.classList.toggle('is-complete', total > 0 && found === total && !gaveUp);
  status.textContent = gaveUp ? 'Answers revealed' : !found ? 'Not started' : found === total ? 'Completed' : `${found} / ${total} found`;
  action.innerHTML = `${found && found < total ? 'Continue quiz' : found === total ? 'Review quiz' : 'Start quiz'} <span aria-hidden="true">→</span>`;
}

async function loadQuizDetails() {
  const results = await Promise.allSettled([
    getJSON('/api/games/world-champions'),
    getJSON('/api/games/race-winners'),
    getJSON('/api/games/constructor-champions'),
    getJSON('/api/games/season-race-winners')
  ]);

  if (results[0].status === 'fulfilled') {
    const seasons = results[0].value;
    const years = seasons.map(item => Number(item.year)).filter(Number.isFinite);
    const card = document.querySelector('[data-quiz-card="world-champions"]');
    card.querySelector('[data-quiz-coverage]').textContent = `${Math.min(...years)}–${Math.max(...years)}`;
    card.querySelector('[data-quiz-count]').textContent = `${seasons.length} seasons`;
    updateQuizCard('world-champions', seasons.length, new Set(years.map(String)));
  }

  if (results[1].status === 'fulfilled') {
    const winners = results[1].value;
    const firstYears = winners.map(item => Number(item.firstWinYear)).filter(Number.isFinite);
    const card = document.querySelector('[data-quiz-card="race-winners"]');
    card.querySelector('[data-quiz-coverage]').textContent = `Since ${Math.min(...firstYears)}`;
    card.querySelector('[data-quiz-count]').textContent = `${winners.length} winners`;
    updateQuizCard('race-winners', winners.length, new Set(winners.map(item => String(item.slot))));
  }

  if (results[2].status === 'fulfilled') {
    const seasons = results[2].value;
    const years = seasons.map(item => Number(item.year)).filter(Number.isFinite);
    const card = document.querySelector('[data-quiz-card="constructor-champions"]');
    card.querySelector('[data-quiz-coverage]').textContent = `${Math.min(...years)}–${Math.max(...years)}`;
    card.querySelector('[data-quiz-count]').textContent = `${seasons.length} seasons`;
    updateQuizCard('constructor-champions', seasons.length, new Set(years.map(String)));
  }

  if (results[3].status === 'fulfilled') {
    const { year, races } = results[3].value;
    const card = document.querySelector('[data-quiz-card="season-race-winners"]');
    card.querySelector('[data-quiz-coverage]').textContent = `${year} season`;
    card.querySelector('[data-quiz-count]').textContent = `${races.length} races`;
    updateQuizCard('season-race-winners', races.length, new Set(races.map(item => String(item.raceId))), `racelytic-quiz-season-race-winners-${year}`);
  }
}

loadQuizDetails();
