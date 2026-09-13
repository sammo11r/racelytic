const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { matchingChampionAnswers, constructorMatchesGuess } = require('../backend/quiz-name-matcher');

test('F1 quiz library is a compact, descriptive quiz workspace', () => {
  const html = read('frontend/quizzes.html');
  const css = read('frontend/css/polish.css');

  assert.match(html, /Choose your challenge/);
  assert.doesNotMatch(html, /quiz-breadcrumb/);
  assert.doesNotMatch(html, /01 · CHAMPIONSHIPS|02 · RACE WINS/);
  assert.doesNotMatch(html, /Choose a challenge, enter the drivers/);
  assert.match(html, /Surnames accepted/g);
  assert.match(html, /quiz-card-action"><span class="quiz-status"/);
  assert.match(html, /src="\/js\/quizzes\.js"/);
  assert.match(html, /href="\/constructor-champions-quiz"/);
  assert.match(html, /href="\/season-race-winners-quiz"/);
  assert.match(css, /\.quiz-library-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(css, /\.quiz-choice-card:focus-visible/);
  assert.match(css, /\.quizzes-hero \{ max-width: none;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.quiz-choice-card \{ min-height: 330px;/);
});

test('Constructors Champions quiz uses the shared template and flexible team matching', () => {
  const html = read('frontend/constructor-champions-quiz.html');
  const script = read('frontend/js/constructor-champions-quiz.js');
  const routes = read('backend/routes/games.js');

  assert.match(html, /class="quiz-guess-form quiz-play-bar"/);
  assert.match(html, /id="quiz-decade-filters"/);
  assert.match(html, /id="quiz-confirm-dialog"/);
  assert.doesNotMatch(html + script, /<th>Drivers<\/th>|driverNames|row\.drivers/);
  assert.match(script, /racelytic-quiz-constructor-champions/);
  assert.match(script, /constructor-champions\/reveal/);
  assert.match(routes, /router\.post\('\/api\/games\/constructor-champions\/guess'/);
  assert.equal(constructorMatchesGuess('Scuderia Ferrari', 'Ferrari'), true);
  assert.equal(constructorMatchesGuess('Red Bull Racing', 'Red Bull'), true);
  assert.equal(constructorMatchesGuess('McLaren', 'Williams'), false);
});

test('Winners by Season quiz persists each season independently', () => {
  const html = read('frontend/season-race-winners-quiz.html');
  const script = read('frontend/js/season-race-winners-quiz.js');
  const routes = read('backend/routes/games.js');

  assert.match(html, /id="quiz-season"/);
  assert.match(html, /class="quiz-guess-form quiz-play-bar"/);
  assert.match(html, /id="quiz-confirm-dialog"/);
  assert.match(script, /season-race-winners-\$\{selectedYear\}/);
  assert.match(script, /QUIZ_SERIES/);
  assert.match(script, /season-race-winners\/reveal/);
  assert.match(routes, /router\.post\('\/api\/games\/season-race-winners\/guess'/);
});

test('new quiz modes are available across every junior championship', () => {
  const seriesPages = read('backend/series-pages.js');
  const games = read('backend/routes/games.js');
  const navigation = read('frontend/js/navigation.js');
  const juniorLibrary = read('frontend/js/junior-quizzes.js');

  for (const series of ['f2', 'f3']) {
    const library = read(`frontend/${series}-quizzes.html`);
    const constructors = read(`frontend/${series}-constructor-champions-quiz.html`);
    const seasonWinners = read(`frontend/${series}-season-race-winners-quiz.html`);
    assert.match(library, new RegExp(`href="/${series}/constructor-champions-quiz"`));
    assert.match(library, new RegExp(`href="/${series}/season-race-winners-quiz"`));
    assert.match(constructors, /src="\/js\/constructor-champions-quiz\.js"/);
    assert.match(seasonWinners, /src="\/js\/season-race-winners-quiz\.js"/);
  }

  assert.match(seriesPages, /academy:[\s\S]*constructor-champions-quiz/);
  assert.match(seriesPages, /academy:[\s\S]*season-race-winners-quiz/);
  assert.match(games, /isJuniorSeries\(series\)[\s\S]*season_constructor_standings/);
  assert.match(games, /session_results[\s\S]*sessions\.isRace/);
  assert.match(navigation, /\/f3\/quizzes/);
  assert.match(juniorLibrary, /racelytic-quiz-\$\{QUIZ_SERIES\}-constructor-champions/);
});

test('F1 quizzes persist answers and expose resume state on the library', () => {
  const library = read('frontend/js/quizzes.js');
  const champions = read('frontend/js/world-champions-quiz.js');
  const winners = read('frontend/js/race-winners-quiz.js');

  assert.match(library, /Promise\.allSettled/);
  assert.match(library, /Continue quiz/);
  assert.match(library, /validAnswerIds\.has/);
  assert.match(champions, /restoreQuizProgress\(\);/);
  assert.match(champions, /saveQuizProgress\(\);/);
  assert.match(winners, /restoreQuizProgress\(\);/);
  assert.match(winners, /saveQuizProgress\(\);/);
});

test('World Champions quiz provides focused play controls and decade navigation', () => {
  const html = read('frontend/world-champions-quiz.html');
  const script = read('frontend/js/world-champions-quiz.js');
  const routes = read('backend/routes/games.js');

  assert.match(html, /class="quiz-guess-form quiz-play-bar"/);
  assert.match(html, /id="quiz-progress-fill"/);
  assert.doesNotMatch(html, /class="back-link"/);
  assert.doesNotMatch(html, /id="quiz-next-gap"/);
  assert.doesNotMatch(html, /id="quiz-team-toggle"/);
  assert.doesNotMatch(html, /id="quiz-progress-label"/);
  assert.doesNotMatch(html + script, /Enter a full name or surname/);
  assert.match(html, /id="quiz-reset"/);
  assert.match(html, /id="quiz-reveal"/);
  assert.match(html, /id="quiz-confirm-dialog"/);
  assert.match(html, /id="quiz-completion"/);
  assert.match(script, /renderDecadeFilters/);
  assert.match(script, /is-new-answer/);
  assert.doesNotMatch(script, /window\.confirm/);
  assert.match(script, /openQuizConfirmation/);
  assert.match(read('frontend/css/polish.css'), /\.quiz-play-actions \{[^}]*justify-content: flex-end;/);
  assert.match(script, /world-champions\/reveal/);
  assert.match(routes, /router\.post\('\/api\/games\/world-champions\/reveal'/);
});

test('champion guesses preserve the correct driver for shared surnames', () => {
  const champions = [
    { year: 1982, driverName: 'Keke Rosberg' },
    { year: 2016, driverName: 'Nico Rosberg' }
  ];

  assert.deepEqual(matchingChampionAnswers(champions, 'Nico Rosberg'), [
    { year: 2016, driverName: 'Nico Rosberg' }
  ]);
  assert.deepEqual(matchingChampionAnswers(champions, 'Rosberg'), [
    { year: 1982, driverName: 'Keke Rosberg' },
    { year: 2016, driverName: 'Nico Rosberg' }
  ]);
});

test('Race Winners quiz uses the shared play template and race-specific controls', () => {
  const html = read('frontend/race-winners-quiz.html');
  const script = read('frontend/js/race-winners-quiz.js');
  const routes = read('backend/routes/games.js');

  assert.match(html, /class="quiz-guess-form quiz-play-bar"/);
  assert.doesNotMatch(html, /class="back-link"/);
  assert.match(html, /id="quiz-progress-fill"/);
  assert.match(html, /id="quiz-era-filters"/);
  assert.match(html, /id="quiz-confirm-dialog"/);
  assert.match(html, /Try World champions/);
  assert.match(script, /renderEraFilters/);
  assert.match(script, /version: 2/);
  assert.match(script, /race-winners\/reveal/);
  assert.match(script, /openQuizConfirmation/);
  assert.match(routes, /router\.post\('\/api\/games\/race-winners\/reveal'/);
});
