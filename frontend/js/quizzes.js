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
  try {
    const { quizzes } = await getJSON('/api/games/quiz-summary');
    const champions = quizzes.champions;
    const winners = quizzes.raceWinners;
    const constructors = quizzes.constructorChampions;
    const season = quizzes.seasonRaceWinners;

    const card = document.querySelector('[data-quiz-card="world-champions"]');
    card.querySelector('[data-quiz-coverage]').textContent = `${champions.firstYear}–${champions.lastYear}`;
    card.querySelector('[data-quiz-count]').textContent = `${champions.total} seasons`;
    updateQuizCard('world-champions', champions.total, new Set(champions.answerIds));

    const winnersCard = document.querySelector('[data-quiz-card="race-winners"]');
    winnersCard.querySelector('[data-quiz-coverage]').textContent = `Since ${winners.firstYear}`;
    winnersCard.querySelector('[data-quiz-count]').textContent = `${winners.total} winners`;
    updateQuizCard('race-winners', winners.total, new Set(winners.answerIds));

    const constructorsCard = document.querySelector('[data-quiz-card="constructor-champions"]');
    constructorsCard.querySelector('[data-quiz-coverage]').textContent = `${constructors.firstYear}–${constructors.lastYear}`;
    constructorsCard.querySelector('[data-quiz-count]').textContent = `${constructors.total} seasons`;
    updateQuizCard('constructor-champions', constructors.total, new Set(constructors.answerIds));

    const seasonCard = document.querySelector('[data-quiz-card="season-race-winners"]');
    seasonCard.querySelector('[data-quiz-coverage]').textContent = `${season.year} season`;
    seasonCard.querySelector('[data-quiz-count]').textContent = `${season.total} races`;
    updateQuizCard('season-race-winners', season.total, new Set(season.answerIds), `racelytic-quiz-season-race-winners-${season.year}`);
  } catch (error) {
    console.error('Quiz summaries could not be loaded.', error);
  }
}

loadQuizDetails();
