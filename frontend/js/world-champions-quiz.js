let quizSeasons = [];
const revealedSeasons = new Map();
const guessedDriverNames = new Set();
let activeDecade = 'all';
let quizGaveUp = false;
let renderedColumnCount = 0;
let measuredTableWidth = 0;
let newlyRevealedYears = new Set();
const QUIZ_PROGRESS_KEY = 'racelytic-quiz-world-champions';

function saveQuizProgress() {
  try {
    localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify({
      version: 2, answers: [...revealedSeasons.entries()], guessedDriverNames: [...guessedDriverNames], gaveUp: quizGaveUp
    }));
    document.getElementById('quiz-save-status').textContent = 'Progress saved';
  } catch (_) {
    document.getElementById('quiz-save-status').textContent = 'Progress kept for this visit';
  }
}

function restoreQuizProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUIZ_PROGRESS_KEY) || 'null');
    if (saved && saved.version !== 2) {
      localStorage.removeItem(QUIZ_PROGRESS_KEY);
      return;
    }
    const validYears = new Set(quizSeasons.map(season => String(season.year)));
    saved?.answers?.forEach(([year, driver]) => {
      if (validYears.has(String(year)) && typeof driver === 'string') revealedSeasons.set(Number(year), driver);
    });
    saved?.guessedDriverNames?.forEach(name => {
      if (typeof name === 'string') guessedDriverNames.add(name);
    });
    quizGaveUp = Boolean(saved?.gaveUp);
  } catch (_) {}
}

function responsiveColumnCount(board, itemCount) {
  if (!measuredTableWidth || activeDecade !== 'all') return 1;
  const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
  return Math.max(1, Math.min(itemCount, Math.floor((board.clientWidth + gap) / (measuredTableWidth + gap))));
}

function driverCellContent(driver, nameLength) {
  return `<span class="quiz-column-sizer" aria-hidden="true">${'M'.repeat(nameLength)}</span>${driver
    ? `<span class="quiz-answer-overlay">${esc(driver)}</span>`
    : '<span class="quiz-empty-answer quiz-answer-overlay" aria-label="Not yet answered"></span>'}`;
}

function preserveMeasuredColumnProportions(board, columnCount) {
  const widths = Array(columnCount).fill(0);
  board.querySelectorAll('table').forEach(table => {
    [...table.rows[0].cells].forEach((cell, index) => {
      widths[index] = Math.max(widths[index], cell.getBoundingClientRect().width);
    });
  });
  const totalWidth = widths.reduce((total, width) => total + width, 0);
  if (!totalWidth) return;
  widths.forEach((width, index) => board.style.setProperty(`--quiz-col-${index + 1}`, `${width / totalWidth * 100}%`));
}

function visibleQuizSeasons() {
  const chronological = [...quizSeasons].sort((a, b) => a.year - b.year);
  if (activeDecade === 'all') return chronological;
  return chronological.filter(season => Math.floor(season.year / 10) * 10 === Number(activeDecade));
}

function updateQuizStatus() {
  const found = revealedSeasons.size;
  const total = quizSeasons.length;
  document.getElementById('quiz-score').textContent = `${found} / ${total}`;
  document.getElementById('quiz-progress-fill').style.width = `${total ? found / total * 100 : 0}%`;
  document.getElementById('guessed-driver-count').textContent = guessedDriverNames.size;
  document.getElementById('guessed-drivers').innerHTML = [...guessedDriverNames].map(name => `<span>${esc(name)}</span>`).join('');

  const completion = document.getElementById('quiz-completion');
  completion.hidden = found !== total;
  if (!completion.hidden) {
    document.getElementById('quiz-completion-label').textContent = quizGaveUp ? 'Answers revealed' : 'Quiz complete';
    document.getElementById('quiz-completion-title').textContent = quizGaveUp ? 'History completed' : 'Perfect score';
    document.getElementById('quiz-completion-copy').textContent = quizGaveUp
      ? `You found ${guessedDriverNames.size} champions before revealing the remaining seasons.`
      : `You completed all ${total} seasons with ${guessedDriverNames.size} champion ${guessedDriverNames.size === 1 ? 'name' : 'names'}.`;
  }
}

function renderDecadeFilters() {
  const decades = [...new Set(quizSeasons.map(season => Math.floor(season.year / 10) * 10))].sort((a, b) => a - b);
  document.getElementById('quiz-decade-filters').innerHTML = ['all', ...decades].map(decade => {
    const selected = String(decade) === String(activeDecade);
    return `<button type="button" data-decade="${decade}" aria-pressed="${selected}">${decade === 'all' ? 'All seasons' : `${decade}s`}</button>`;
  }).join('');
}

function renderQuizTable() {
  const board = document.getElementById('champions-quiz-board');
  const chronological = visibleQuizSeasons();
  const columnCount = responsiveColumnCount(board, chronological.length);
  renderedColumnCount = columnCount;
  const columnSize = Math.ceil(chronological.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, index) => chronological.slice(index * columnSize, (index + 1) * columnSize)).filter(column => column.length);

  board.classList.add('is-measuring');
  board.innerHTML = columns.map(column => `<div class="quiz-column-table table-wrap">
    <table class="champions-quiz-table">
      <thead><tr><th>Season</th><th>Driver</th><th>Team</th></tr></thead>
      <tbody>${column.map(season => {
        const driver = revealedSeasons.get(season.year);
        return `<tr data-year="${season.year}" class="${driver ? 'is-revealed' : ''}${newlyRevealedYears.has(season.year) ? ' is-new-answer' : ''}">
          <td><strong>${esc(season.year)}</strong></td>
          <td class="quiz-driver-cell">${driverCellContent(driver, season.driverNameLength)}</td>
          <td>${season.teams.length ? season.teams.map(esc).join(' / ') : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`).join('');

  measuredTableWidth = Math.max(measuredTableWidth, ...[...board.querySelectorAll('.quiz-column-table')].map(table => table.getBoundingClientRect().width));
  const fittedColumnCount = responsiveColumnCount(board, chronological.length);
  if (fittedColumnCount !== columnCount) return renderQuizTable();
  preserveMeasuredColumnProportions(board, 3);
  board.classList.remove('is-measuring');
  updateQuizStatus();
}

function chooseDecade(decade) {
  activeDecade = String(decade);
  renderDecadeFilters();
  renderQuizTable();
}

function scrollToYear(year) {
  requestAnimationFrame(() => document.querySelector(`[data-year="${year}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}

function resetQuiz() {
  revealedSeasons.clear();
  guessedDriverNames.clear();
  newlyRevealedYears.clear();
  quizGaveUp = false;
  try { localStorage.removeItem(QUIZ_PROGRESS_KEY); } catch (_) {}
  const latestDecade = Math.max(...quizSeasons.map(season => Math.floor(season.year / 10) * 10));
  chooseDecade(window.matchMedia('(max-width: 800px)').matches ? latestDecade : 'all');
  document.getElementById('quiz-feedback').textContent = 'Progress reset.';
  document.getElementById('champion-guess').focus();
}

async function revealQuiz() {
  const button = document.getElementById('quiz-reveal');
  const feedback = document.getElementById('quiz-feedback');
  button.disabled = true;
  try {
    const response = await fetch('/api/games/world-champions/reveal', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to reveal the answers.');
    result.answers.forEach(answer => {
      revealedSeasons.set(answer.year, answer.driverName);
      guessedDriverNames.add(answer.driverName);
    });
    quizGaveUp = true;
    newlyRevealedYears.clear();
    saveQuizProgress();
    chooseDecade('all');
    feedback.textContent = 'Every remaining champion has been revealed.';
    feedback.className = '';
    document.getElementById('quiz-completion').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    feedback.textContent = error.message;
    feedback.className = 'is-incorrect';
  } finally {
    button.disabled = false;
  }
}

let pendingConfirmation = null;

function openQuizConfirmation({ title, copy, confirmLabel, action }) {
  const dialog = document.getElementById('quiz-confirm-dialog');
  document.getElementById('quiz-confirm-title').textContent = title;
  document.getElementById('quiz-confirm-copy').textContent = copy;
  document.getElementById('quiz-confirm-submit').textContent = confirmLabel;
  pendingConfirmation = action;
  dialog.returnValue = '';
  dialog.showModal();
}

async function initialiseChampionsQuiz() {
  try {
    quizSeasons = await getJSON('/api/games/world-champions');
    restoreQuizProgress();
    if (window.matchMedia('(max-width: 800px)').matches) activeDecade = String(Math.max(...quizSeasons.map(season => Math.floor(season.year / 10) * 10)));
    renderDecadeFilters();
    renderQuizTable();
    const form = document.getElementById('champion-guess-form');
    form.elements.guess.disabled = false;
    form.querySelector('button[type="submit"]').disabled = false;
    document.getElementById('quiz-feedback').textContent = '';
    form.elements.guess.focus();
  } catch (error) {
    setError('champions-quiz-board', error.message);
    document.getElementById('quiz-feedback').textContent = 'The quiz could not be loaded.';
  }
}

document.getElementById('champion-guess-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.elements.guess;
  const button = form.querySelector('button[type="submit"]');
  const feedback = document.getElementById('quiz-feedback');
  const guess = input.value.trim();
  if (!guess) return;

  input.disabled = true;
  button.disabled = true;
  try {
    const response = await fetch('/api/games/world-champions/guess', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guess })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to check that guess.');
    if (!result.correct) {
      feedback.textContent = `${guess} is not a World Drivers’ Champion.`;
      feedback.className = 'is-incorrect';
    } else {
      const matches = result.matches?.length ? result.matches : result.years.map(year => ({ year, driverName: result.driverName }));
      const newYears = matches.filter(match => !revealedSeasons.has(match.year)).map(match => match.year);
      matches.forEach(match => {
        revealedSeasons.set(match.year, match.driverName);
        guessedDriverNames.add(match.driverName);
      });
      const matchedNames = [...new Set(matches.map(match => match.driverName))];
      const matchedNameLabel = matchedNames.join(' and ');
      newlyRevealedYears = new Set(newYears);
      saveQuizProgress();
      if (newYears.length && activeDecade !== 'all' && !newYears.some(year => Math.floor(year / 10) * 10 === Number(activeDecade))) {
        activeDecade = String(Math.floor(newYears[0] / 10) * 10);
        renderDecadeFilters();
      }
      renderQuizTable();
      feedback.textContent = newYears.length
        ? `Correct: ${matchedNameLabel} revealed ${newYears.length} ${newYears.length === 1 ? 'season' : 'seasons'}.`
        : `${matchedNameLabel} ${matchedNames.length === 1 ? 'was' : 'were'} already found.`;
      feedback.className = newYears.length ? 'is-correct' : '';
      if (newYears.length) {
        scrollToYear(newYears[0]);
        window.setTimeout(() => document.querySelectorAll('.is-new-answer').forEach(row => row.classList.remove('is-new-answer')), 1800);
      }
    }
    input.value = '';
  } catch (error) {
    feedback.textContent = error.message;
    feedback.className = 'is-incorrect';
  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
  }
});

document.getElementById('quiz-decade-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-decade]');
  if (button) chooseDecade(button.dataset.decade);
});

document.getElementById('quiz-reset').addEventListener('click', () => openQuizConfirmation({
  title: 'Reset this quiz?',
  copy: 'Every answer you have found will be removed and your saved progress will be cleared.',
  confirmLabel: 'Reset quiz',
  action: resetQuiz
}));
document.getElementById('quiz-play-again').addEventListener('click', resetQuiz);
document.getElementById('quiz-reveal').addEventListener('click', () => openQuizConfirmation({
  title: 'Reveal every champion?',
  copy: 'All remaining answers will be shown and this attempt will be marked as revealed.',
  confirmLabel: 'Reveal answers',
  action: revealQuiz
}));

document.getElementById('quiz-confirm-dialog').addEventListener('close', event => {
  const action = pendingConfirmation;
  pendingConfirmation = null;
  if (event.currentTarget.returnValue === 'confirm') action?.();
});

document.getElementById('quiz-confirm-dialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close('cancel');
});
initialiseChampionsQuiz();

new ResizeObserver(entries => {
  if (!quizSeasons.length) return;
  const nextColumnCount = responsiveColumnCount(entries[0].target, visibleQuizSeasons().length);
  if (nextColumnCount !== renderedColumnCount) renderQuizTable();
}).observe(document.getElementById('champions-quiz-board'));
