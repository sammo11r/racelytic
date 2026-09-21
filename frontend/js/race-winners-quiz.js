let winnerRows = [];
const revealedWinners = new Map();
const guessedWinnerNames = new Set();
let activeEra = 'all';
let quizGaveUp = false;
let renderedColumnCount = 0;
let measuredTableWidth = 0;
let newlyRevealedSlots = new Set();
const QUIZ_SERIES = document.body.classList.contains('wec-mode') ? 'wec' : document.body.classList.contains('fe-mode') ? 'fe' : document.body.classList.contains('f2-mode') ? 'f2' : 'f1';
const QUIZ_PROGRESS_KEY = QUIZ_SERIES === 'f1' ? 'racelytic-quiz-race-winners' : `racelytic-quiz-${QUIZ_SERIES}-race-winners`;
const quizApi = path => `${path}${QUIZ_SERIES === 'f1' ? '' : `?series=${QUIZ_SERIES}`}`;
const CHAMPIONSHIP_NAME = { f1: 'Formula 1', f2: 'Formula 2', fe: 'Formula E', wec: 'WEC' }[QUIZ_SERIES];
const seasonLabel = year => QUIZ_SERIES === 'fe' ? `${Number(year) - 1}–${String(year).slice(-2)}` : String(year);

function saveQuizProgress() {
  try {
    localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify({
      version: 2, answers: [...revealedWinners.entries()], guessedDriverNames: [...guessedWinnerNames], gaveUp: quizGaveUp
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
    const validSlots = new Set(winnerRows.map(row => String(row.slot)));
    saved?.answers?.forEach(([slot, driver]) => {
      if (validSlots.has(String(slot)) && typeof driver === 'string') revealedWinners.set(Number(slot), driver);
    });
    saved?.guessedDriverNames?.forEach(name => {
      if (typeof name === 'string') guessedWinnerNames.add(name);
    });
    quizGaveUp = Boolean(saved?.gaveUp);
  } catch (_) {}
}

function responsiveColumnCount(board, itemCount) {
  if (!measuredTableWidth || activeEra !== 'all') return 1;
  const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
  return Math.max(1, Math.min(itemCount, Math.floor((board.clientWidth + gap) / (measuredTableWidth + gap))));
}

function driverCellContent(driver, nameLength) {
  return `<span class="quiz-column-sizer" aria-hidden="true">${'M'.repeat(nameLength)}</span>${driver
    ? `<span class="quiz-answer-overlay">${esc(driver)}</span>`
    : '<span class="quiz-empty-answer quiz-answer-overlay"><span class="visually-hidden">Not yet answered</span></span>'}`;
}

function nationCellContent(row) {
  if (QUIZ_SERIES === 'f1' || QUIZ_SERIES === 'wec') return esc(row.countryName || '—');
  if (!row.countryCode) return '—';
  const code = String(row.countryCode).toUpperCase();
  return esc(new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code);
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

function visibleWinnerRows() {
  if (activeEra === 'all') return winnerRows;
  return winnerRows.filter(row => Math.floor(row.firstWinYear / 10) * 10 === Number(activeEra));
}

function updateQuizStatus() {
  const found = revealedWinners.size;
  const total = winnerRows.length;
  const names = [...guessedWinnerNames];
  document.getElementById('quiz-score').textContent = `${found} / ${total}`;
  document.getElementById('quiz-progress-fill').style.width = `${total ? found / total * 100 : 0}%`;
  document.getElementById('guessed-driver-count').textContent = names.length;
  document.getElementById('guessed-drivers').innerHTML = names.map(name => `<span>${esc(name)}</span>`).join('');

  const completion = document.getElementById('quiz-completion');
  completion.hidden = found !== total;
  if (!completion.hidden) {
    document.getElementById('quiz-completion-label').textContent = quizGaveUp ? 'Answers revealed' : 'Quiz complete';
    document.getElementById('quiz-completion-title').textContent = quizGaveUp ? 'Winners table completed' : 'Perfect score';
    document.getElementById('quiz-completion-copy').textContent = quizGaveUp
      ? `You found ${names.length} ${CHAMPIONSHIP_NAME} race winners before revealing the remaining drivers.`
      : `You named all ${total} ${CHAMPIONSHIP_NAME} race winners.`;
  }
}

function renderEraFilters() {
  const eras = [...new Set(winnerRows.map(row => Math.floor(row.firstWinYear / 10) * 10))].sort((a, b) => a - b);
  document.getElementById('quiz-era-filters').innerHTML = ['all', ...eras].map(era => {
    const selected = String(era) === String(activeEra);
    return `<button type="button" data-era="${era}" aria-pressed="${selected}">${era === 'all' ? 'All winners' : `${era}s`}</button>`;
  }).join('');
}

function renderWinnerBoard() {
  const board = document.getElementById('race-winners-quiz-board');
  const rows = visibleWinnerRows();
  const columnCount = responsiveColumnCount(board, rows.length);
  renderedColumnCount = columnCount;
  const columnSize = Math.ceil(rows.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, index) => rows.slice(index * columnSize, (index + 1) * columnSize)).filter(column => column.length);

  board.classList.add('is-measuring');
  board.innerHTML = columns.map(column => `<div class="quiz-column-table table-wrap" tabindex="0">
    <table class="champions-quiz-table race-winners-table${QUIZ_SERIES === 'f2' ? ' f2-race-winners-table' : ''}">
      <thead><tr><th>Wins</th><th>Driver</th><th>Nation</th>${QUIZ_SERIES === 'f2' ? '<th>Feature</th><th>Sprint</th>' : QUIZ_SERIES === 'fe' || QUIZ_SERIES === 'wec' ? '<th>First season</th><th>Latest season</th>' : '<th>First win</th>'}</tr></thead>
      <tbody>${column.map(row => {
        const name = revealedWinners.get(row.slot);
        return `<tr data-slot="${row.slot}" class="${name ? 'is-revealed' : ''}${newlyRevealedSlots.has(row.slot) ? ' is-new-answer' : ''}">
          <td><strong>${fmtNumber(row.wins)}</strong></td>
          <td class="quiz-driver-cell">${driverCellContent(name, row.driverNameLength)}</td>
          <td>${nationCellContent(row)}</td>
          ${QUIZ_SERIES === 'f2' ? `<td>${fmtNumber(row.featureWins)}</td><td>${fmtNumber(row.sprintWins)}</td>` : QUIZ_SERIES === 'fe' || QUIZ_SERIES === 'wec' ? `<td>${esc(seasonLabel(row.firstWinYear))}</td><td>${esc(seasonLabel(row.lastWinYear))}</td>` : `<td>${esc(row.firstWinYear)}</td>`}
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`).join('');

  measuredTableWidth = Math.max(measuredTableWidth, ...[...board.querySelectorAll('.quiz-column-table')].map(table => table.getBoundingClientRect().width));
  const fittedColumnCount = responsiveColumnCount(board, rows.length);
  if (fittedColumnCount !== columnCount) return renderWinnerBoard();
  preserveMeasuredColumnProportions(board, QUIZ_SERIES === 'f1' ? 4 : 5);
  board.classList.remove('is-measuring');
  updateQuizStatus();
}

function chooseEra(era) {
  activeEra = String(era);
  renderEraFilters();
  renderWinnerBoard();
}

function scrollToSlot(slot) {
  requestAnimationFrame(() => document.querySelector(`[data-slot="${slot}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}

function resetQuiz() {
  revealedWinners.clear();
  guessedWinnerNames.clear();
  newlyRevealedSlots.clear();
  quizGaveUp = false;
  try { localStorage.removeItem(QUIZ_PROGRESS_KEY); } catch (_) {}
  const latestEra = Math.max(...winnerRows.map(row => Math.floor(row.firstWinYear / 10) * 10));
  chooseEra(window.matchMedia('(max-width: 800px)').matches ? latestEra : 'all');
  document.getElementById('quiz-feedback').textContent = 'Progress reset.';
  document.getElementById('winner-guess').focus();
}

async function revealQuiz() {
  const button = document.getElementById('quiz-reveal');
  const feedback = document.getElementById('quiz-feedback');
  button.disabled = true;
  try {
    const response = await fetch(quizApi('/api/games/race-winners/reveal'), { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to reveal the answers.');
    result.answers.forEach(answer => revealedWinners.set(answer.slot, answer.driverName));
    quizGaveUp = true;
    newlyRevealedSlots.clear();
    saveQuizProgress();
    chooseEra('all');
    feedback.textContent = 'Every remaining race winner has been revealed.';
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

async function initialiseRaceWinnersQuiz() {
  try {
    winnerRows = await getJSON(quizApi('/api/games/race-winners'));
    restoreQuizProgress();
    if (window.matchMedia('(max-width: 800px)').matches) activeEra = String(Math.max(...winnerRows.map(row => Math.floor(row.firstWinYear / 10) * 10)));
    renderEraFilters();
    renderWinnerBoard();
    const form = document.getElementById('winner-guess-form');
    form.elements.guess.disabled = false;
    form.querySelector('button[type="submit"]').disabled = false;
    document.getElementById('quiz-feedback').textContent = '';
    form.elements.guess.focus();
  } catch (error) {
    setError('race-winners-quiz-board', error.message);
    document.getElementById('quiz-feedback').textContent = 'The quiz could not be loaded.';
  }
}

document.getElementById('winner-guess-form').addEventListener('submit', async event => {
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
    const response = await fetch(quizApi('/api/games/race-winners/guess'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guess })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to check that guess.');
    if (!result.correct) {
      feedback.textContent = `${guess} is not a ${CHAMPIONSHIP_NAME} race winner.`;
      feedback.className = 'is-incorrect';
    } else {
      const newMatches = result.matches.filter(match => !revealedWinners.has(match.slot));
      result.matches.forEach(match => revealedWinners.set(match.slot, match.driverName));
      result.matches.forEach(match => guessedWinnerNames.add(match.driverName));
      newlyRevealedSlots = new Set(newMatches.map(match => match.slot));
      saveQuizProgress();
      const firstNewRow = winnerRows.find(row => row.slot === newMatches[0]?.slot);
      if (firstNewRow && activeEra !== 'all' && Math.floor(firstNewRow.firstWinYear / 10) * 10 !== Number(activeEra)) {
        activeEra = String(Math.floor(firstNewRow.firstWinYear / 10) * 10);
        renderEraFilters();
      }
      renderWinnerBoard();
      const names = [...new Set(result.matches.map(match => match.driverName))].join(' and ');
      feedback.textContent = newMatches.length ? `Correct: ${names}.` : `${names} ${result.matches.length > 1 ? 'were' : 'was'} already found.`;
      feedback.className = newMatches.length ? 'is-correct' : '';
      if (newMatches.length) {
        scrollToSlot(newMatches[0].slot);
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

document.getElementById('quiz-era-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-era]');
  if (button) chooseEra(button.dataset.era);
});

document.getElementById('quiz-reset').addEventListener('click', () => openQuizConfirmation({
  title: 'Reset this quiz?',
  copy: 'Every winner you have found will be removed and your saved progress will be cleared.',
  confirmLabel: 'Reset quiz',
  action: resetQuiz
}));
document.getElementById('quiz-play-again').addEventListener('click', resetQuiz);
document.getElementById('quiz-reveal').addEventListener('click', () => openQuizConfirmation({
  title: 'Reveal every race winner?',
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

initialiseRaceWinnersQuiz();

new ResizeObserver(entries => {
  if (!winnerRows.length) return;
  const nextColumnCount = responsiveColumnCount(entries[0].target, visibleWinnerRows().length);
  if (nextColumnCount !== renderedColumnCount) renderWinnerBoard();
}).observe(document.getElementById('race-winners-quiz-board'));
