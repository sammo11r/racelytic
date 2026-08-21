let quizSeasons = [];
const revealedSeasons = new Map();
const guessedDriverNames = new Set();
let renderedColumnCount = 0;
let measuredTableWidth = 0;

function responsiveColumnCount(board, itemCount) {
  if (!measuredTableWidth) return 1;
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
  widths.forEach((width, index) => board.style.setProperty(`--quiz-col-${index + 1}`, `${width / totalWidth * 100}%`));
}

function renderQuizTable() {
  const board = document.getElementById('champions-quiz-board');
  const chronological = [...quizSeasons].sort((first, second) => first.year - second.year);
  const columnCount = responsiveColumnCount(board, chronological.length);
  renderedColumnCount = columnCount;
  const columnSize = Math.ceil(chronological.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, index) =>
    chronological.slice(index * columnSize, (index + 1) * columnSize)
  ).filter(column => column.length);
  board.classList.add('is-measuring');
  board.innerHTML = columns.map(column => `<div class="quiz-column-table table-wrap"><table class="champions-quiz-table"><thead><tr><th>Season</th><th>Driver</th><th>Team</th></tr></thead><tbody>${column.map(season => {
    const driver = revealedSeasons.get(season.year);
    return `<tr class="${driver ? 'is-revealed' : ''}"><td><strong>${esc(season.year)}</strong></td><td class="quiz-driver-cell">${driverCellContent(driver, season.driverNameLength)}</td><td>${season.teams.length ? season.teams.map(esc).join(' / ') : '—'}</td></tr>`;
  }).join('')}</tbody></table></div>`).join('');
  measuredTableWidth = Math.max(
    measuredTableWidth,
    ...[...board.querySelectorAll('.quiz-column-table')].map(table => table.getBoundingClientRect().width)
  );
  const fittedColumnCount = responsiveColumnCount(board, chronological.length);
  if (fittedColumnCount !== columnCount) return renderQuizTable();
  preserveMeasuredColumnProportions(board, 3);
  board.classList.remove('is-measuring');
  const found = revealedSeasons.size;
  document.getElementById('quiz-score').textContent = `${found} / ${quizSeasons.length}`;
  document.getElementById('quiz-progress-label').textContent = found === quizSeasons.length ? 'Perfect score. Every champion found!' : `${quizSeasons.length - found} seasons remaining`;
  document.getElementById('guessed-drivers').innerHTML = [...guessedDriverNames].map(name => `<span>${esc(name)}</span>`).join('');
}

async function initialiseChampionsQuiz() {
  try {
    quizSeasons = await getJSON('/api/games/world-champions?series=f2');
    renderQuizTable();
    const form = document.getElementById('champion-guess-form');
    form.elements.guess.disabled = false;
    form.querySelector('button').disabled = false;
    document.getElementById('quiz-feedback').textContent = 'You can enter a full name or surname.';
    form.elements.guess.focus();
  } catch (error) {
    setError('champions-quiz-board', error.message);
    document.getElementById('quiz-feedback').textContent = 'The quiz could not be loaded.';
  }
}

document.getElementById('champion-guess-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = event.currentTarget.elements.guess;
  const button = event.currentTarget.querySelector('button');
  const feedback = document.getElementById('quiz-feedback');
  const guess = input.value.trim();
  if (!guess) return;
  input.disabled = true;
  button.disabled = true;
  try {
    const response = await fetch('/api/games/world-champions/guess?series=f2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guess }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to check that guess.');
    const newYears = result.correct ? result.years.filter(year => !revealedSeasons.has(year)) : [];
    result.years?.forEach(year => revealedSeasons.set(year, result.driverName));
    if (result.correct) guessedDriverNames.add(result.driverName);
    renderQuizTable();
    feedback.textContent = !result.correct ? `${guess} is not an FIA Formula 2 champion.` : newYears.length ? `Correct: ${result.driverName}.` : `${result.driverName} was already found.`;
    feedback.className = result.correct && newYears.length ? 'is-correct' : result.correct ? '' : 'is-incorrect';
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

initialiseChampionsQuiz();

new ResizeObserver(entries => {
  if (!quizSeasons.length) return;
  const nextColumnCount = responsiveColumnCount(entries[0].target, quizSeasons.length);
  if (nextColumnCount !== renderedColumnCount) renderQuizTable();
}).observe(document.getElementById('champions-quiz-board'));
