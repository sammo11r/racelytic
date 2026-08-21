let winnerRows = [];
const revealedWinners = new Map();
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

function nationCellContent(countryCode) {
  if (!countryCode) return '<span class="quiz-empty-answer" aria-label="Not yet answered"></span>';
  const code = String(countryCode).toUpperCase();
  const nation = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  return `<span class="quiz-nation">${esc(nation)}</span>`;
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

function renderWinnerBoard() {
  const board = document.getElementById('race-winners-quiz-board');
  const columnCount = responsiveColumnCount(board, winnerRows.length);
  renderedColumnCount = columnCount;
  const columnSize = Math.ceil(winnerRows.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, index) =>
    winnerRows.slice(index * columnSize, (index + 1) * columnSize)
  ).filter(column => column.length);
  board.classList.add('is-measuring');
  board.innerHTML = columns.map(column => `<div class="quiz-column-table table-wrap"><table class="champions-quiz-table race-winners-table f2-race-winners-table"><thead><tr><th>Wins</th><th>Driver</th><th>Nation</th><th>F</th><th>S</th></tr></thead><tbody>${column.map(row => {
    const answer = revealedWinners.get(row.slot);
    return `<tr class="${answer ? 'is-revealed' : ''}"><td><strong>${fmtNumber(row.wins)}</strong></td><td class="quiz-driver-cell">${driverCellContent(answer?.driverName, row.driverNameLength)}</td><td>${nationCellContent(row.countryCode)}</td><td>${fmtNumber(row.featureWins)}</td><td>${fmtNumber(row.sprintWins)}</td></tr>`;
  }).join('')}</tbody></table></div>`).join('');
  measuredTableWidth = Math.max(
    measuredTableWidth,
    ...[...board.querySelectorAll('.quiz-column-table')].map(table => table.getBoundingClientRect().width)
  );
  const fittedColumnCount = responsiveColumnCount(board, winnerRows.length);
  if (fittedColumnCount !== columnCount) return renderWinnerBoard();
  preserveMeasuredColumnProportions(board, 5);
  board.classList.remove('is-measuring');
  const found = revealedWinners.size;
  document.getElementById('quiz-score').textContent = `${found} / ${winnerRows.length}`;
  document.getElementById('quiz-progress-label').textContent = found === winnerRows.length ? 'Perfect score. Every winner found!' : `${winnerRows.length - found} drivers remaining`;
  document.getElementById('guessed-drivers').innerHTML = [...new Set([...revealedWinners.values()].map(answer => answer.driverName))].map(name => `<span>${esc(name)}</span>`).join('');
}

async function initialiseRaceWinnersQuiz() {
  try {
    winnerRows = await getJSON('/api/games/race-winners?series=f2');
    renderWinnerBoard();
    const form = document.getElementById('winner-guess-form');
    form.elements.guess.disabled = false;
    form.querySelector('button').disabled = false;
    document.getElementById('quiz-feedback').textContent = 'You can enter a full name or surname.';
    form.elements.guess.focus();
  } catch (error) {
    setError('race-winners-quiz-board', error.message);
    document.getElementById('quiz-feedback').textContent = 'The quiz could not be loaded.';
  }
}

document.getElementById('winner-guess-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = event.currentTarget.elements.guess;
  const button = event.currentTarget.querySelector('button');
  const feedback = document.getElementById('quiz-feedback');
  const guess = input.value.trim();
  if (!guess) return;
  input.disabled = true;
  button.disabled = true;
  try {
    const response = await fetch('/api/games/race-winners/guess?series=f2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guess }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to check that guess.');
    const newMatches = result.correct ? result.matches.filter(match => !revealedWinners.has(match.slot)) : [];
    result.matches?.forEach(match => revealedWinners.set(match.slot, match));
    renderWinnerBoard();
    const names = result.matches?.map(match => match.driverName).join(' and ');
    feedback.textContent = !result.correct ? `${guess} is not an FIA Formula 2 race winner.` : newMatches.length ? `Correct: ${names}.` : `${names} was already found.`;
    feedback.className = result.correct && newMatches.length ? 'is-correct' : result.correct ? '' : 'is-incorrect';
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

initialiseRaceWinnersQuiz();

new ResizeObserver(entries => {
  if (!winnerRows.length) return;
  const nextColumnCount = responsiveColumnCount(entries[0].target, winnerRows.length);
  if (nextColumnCount !== renderedColumnCount) renderWinnerBoard();
}).observe(document.getElementById('race-winners-quiz-board'));
