const { all: SERIES } = require('../frontend/js/series-config');

const SERIES_HOME_CONFIG = Object.freeze({
    f1: {
        ...SERIES.f1,
        favicon: '/assets/favicon.svg', description: 'Explore, analyse, simulate and play with more than seventy years of Formula 1 history.',
        headline: 'More than results.', subheadline: 'A different way to experience F1.',
        introduction: 'Welcome to Racelytic. Discover the statistics and stories behind your favourite Formula 1 drivers, teams and countries. Recalculate championships with historical or custom points systems to compare eras using the same scoring rules. Explore distinctive visualisations, rewrite history in the F1 simulator and put your knowledge and instincts to the test with our games.',
        entityLabel: 'Constructors',
        archiveTitle: 'Decades of Formula 1,|ready for your next question.',
        archiveCopy: 'The database powers every part of Racelytic, from all-time comparisons and race replays to championship simulations and games.'
    },
    f2: {
        ...SERIES.f2,
        description: 'Explore, analyse, simulate and play with the complete Formula 2 archive in Racelytic.',
        headline: 'The proving ground.', subheadline: 'Every story behind the step up.',
        introduction: 'Discover the stories behind Formula 2’s rising stars. Explore drivers, teams and circuits, follow title fights race by race and compare the careers that led to the next step. Recalculate seasons, build your own championship and put your knowledge and reactions to the test with our games.',
        entityLabel: 'Teams',
        archiveTitle: 'A feeder series.|A history of its own.',
        archiveCopy: 'Every season, driver, team, circuit and session result connects to the tools built on top of the Formula 2 archive.'
    },
    f3: {
        ...SERIES.f3,
        description: 'Explore, analyse, simulate and play with FIA Formula 3 history in Racelytic.',
        headline: 'The first global stage.', subheadline: 'Where the next generation breaks through.',
        introduction: 'Explore the drivers, teams and breakthrough performances that have shaped FIA Formula 3 since 2019. Trace championship battles, compare careers and uncover the details behind the results. Recalculate seasons, create your own championship or take a break with our racing games.',
        entityLabel: 'Teams',
        archiveTitle: 'Every campaign.|Full race-by-race detail.',
        archiveCopy: 'The championship calendar, entrants, classifications and standings come together in one connected Formula 3 archive.'
    },
    academy: {
        ...SERIES.academy,
        description: 'Explore, analyse, simulate and play with the complete F1 Academy archive in Racelytic.',
        headline: 'A new generation.', subheadline: 'Every race, career and title story.',
        introduction: 'Get to know the drivers, teams and title stories shaping F1 Academy. Explore every season, compare careers and follow how each race changes the championship. Take the results further with season simulations and custom championships, then test your reactions or build a racing team of your own.',
        entityLabel: 'Teams',
        archiveTitle: 'A young championship.|A complete record.',
        archiveCopy: 'Seasons, entrants, sessions and standings connect across a dedicated archive built for the championship’s own race formats.'
    }
});

function esc(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Completed historical examples; verified against the archive in landing-preview.test.js.
const F1_HOME_PREVIEW = {
    year: 2008,
    alternateSystem: '1991-2002',
    official: [{ name: 'Lewis Hamilton', id: 'lewis-hamilton', points: 98 }, { name: 'Felipe Massa', id: 'felipe-massa', points: 97 }],
    alternate: [{ name: 'Felipe Massa', id: 'felipe-massa', points: 83 }, { name: 'Lewis Hamilton', id: 'lewis-hamilton', points: 80 }],
    drivers: [{ id: 'ayrton-senna', name: 'Senna', wins: 41, poles: 65 }, { id: 'alain-prost', name: 'Prost', wins: 51, poles: 33 }],
    champions: [{ year: 1950, name: 'Giuseppe Farina', id: 'nino-farina' }, { year: 1951, name: null }, { year: 1952, name: 'Alberto Ascari', id: 'alberto-ascari' }]
};

const SERIES_HOME_PREVIEWS = {
    f1: {
        ...F1_HOME_PREVIEW,
        question: 'Would different points crown a different champion?',
        copy: 'Keep the races. Change the rules. The 2008 title fight tells a different story.',
        note: 'Same results, all 18 races. Only the points system changes.',
        href: '/simulator?year=2008&points=1991-2002', action: 'Recalculate 2008',
        quizHref: '/world-champions-quiz'
    },
    f2: {
        year: 2020,
        question: 'Can consistency beat more wins?',
        copy: 'Schumacher won fewer races than Ilott. Over the full 2020 season, the title told a different story.',
        contenders: [{ name: 'Mick Schumacher', id: 'mick-schumacher', points: 215, wins: 2 }, { name: 'Callum Ilott', id: 'callum-ilott', points: 201, wins: 3 }],
        note: '2020 title contenders · Sprint and feature race wins combined.',
        href: '/f2/season-analysis?year=2020', action: 'Explore the 2020 title fight',
        drivers: [{ id: 'charles-leclerc', name: 'Leclerc', wins: 7, poles: 8 }, { id: 'george-russell', name: 'Russell', wins: 7, poles: 5 }],
        champions: [{ year: 2017, name: 'Charles Leclerc', id: 'charles-leclerc' }, { year: 2018, name: null }, { year: 2019, name: 'Nyck de Vries', id: 'nyck-de-vries' }],
        quizHref: '/f2/champions-quiz'
    },
    f3: {
        year: 2024,
        question: 'Can you take the title without a race win?',
        copy: 'Fornaroli did just that in 2024. Follow the championship where every finish mattered.',
        contenders: [{ name: 'Leonardo Fornaroli', id: 'leonardo-fornaroli', points: 153, wins: 0 }, { name: 'Gabriele Minì', id: 'gabriele-mini', points: 130, wins: 1 }],
        note: '2024 title contenders · Final standings, including post-race penalties.',
        href: '/f3/season-analysis?year=2024', action: 'Follow Fornaroli’s title season',
        drivers: [{ id: 'oscar-piastri', name: 'Piastri', wins: 2, podiums: 6 }, { id: 'theo-pourchaire', name: 'Pourchaire', wins: 2, podiums: 8 }],
        comparisonMetrics: [['wins', 'Race wins'], ['podiums', 'Podiums']]
    },
    academy: {
        year: 2024,
        question: 'What does a dominant season look like?',
        copy: 'Nine victories. A commanding points lead. Discover how Pulling built her 2024 championship.',
        contenders: [{ name: 'Abbi Pulling', id: 'abbi-pulling', points: 338, wins: 9 }, { name: 'Doriane Pin', id: 'doriane-pin', points: 217, wins: 4 }],
        note: '2024 title contenders · Points and wins across the full season.',
        href: '/academy/season-analysis?year=2024', action: 'Explore Pulling’s championship',
        drivers: [{ id: 'marta-garcia', name: 'García', wins: 7, poles: 4 }, { id: 'abbi-pulling', name: 'Pulling', wins: 9, poles: 12 }]
    }
};

function standingsPreview(rows, label, scoring, { alternate = false, metric = 'points', ranked = true } = {}) {
    const list = ranked ? 'ol' : 'ul';
    const maximum = Math.max(1, ...rows.map(driver => driver[metric]));
    return `<div class="home-scoring-board${alternate ? ' home-scoring-alternate' : ''}">
        <div class="home-scoring-heading"><strong>${esc(label)}</strong><span>${esc(scoring)}</span></div>
        <${list}>${rows.map((driver, index) => `<li>
            ${ranked ? `<span class="home-preview-rank">${index + 1}</span>` : ''}
            <div><span>${esc(driver.name)}</span><i class="home-preview-bar" aria-hidden="true" style="--preview-fill:${driver[metric] / maximum * 100}%"></i></div>
            <strong>${driver[metric]}<small>${metric === 'points' ? 'pts' : 'wins'}</small></strong>
        </li>`).join('')}</${list}>
    </div>`;
}

function renderQuestions(config) {
    const preview = SERIES_HOME_PREVIEWS[config.key];
    const [first, second] = preview.drivers;
    const metrics = preview.comparisonMetrics || [['wins', 'Race wins'], ['poles', 'Pole positions']];
    const careerLabel = config.key === 'f1' ? 'CAREER TOTALS' : `${config.shortName.toUpperCase()} CAREERS`;
    const missingChampion = preview.champions?.find(champion => !champion.name);
    return `<section class="container home-questions" id="series-explore" aria-labelledby="home-questions-title">
      <div class="home-section-head">
        <div><div class="eyebrow">TAKE THE WHEEL</div><h2 id="home-questions-title">Start with a question.</h2></div>
        <p>Real history. Different perspectives.<br>See where your curiosity takes you.</p>
      </div>
      <div class="home-question-grid">
        <article class="home-question-card home-question-scoring">
          <h3>${esc(preview.question)}</h3>
          <p>${esc(preview.copy)}</p>
          <div class="home-scoring-preview" aria-label="${preview.year} championship top two ${preview.alternate ? 'under two scoring systems' : 'compared by points and race wins'}">
            ${preview.alternate ? standingsPreview(preview.official, 'As it happened', '2003–2009 rules · 10–8–6–5–4–3–2–1') + standingsPreview(preview.alternate, 'Recalculated', '1991–2002 rules · 10–6–4–3–2–1', { alternate: true }) : standingsPreview(preview.contenders, 'Final championship', `${preview.year} · Official points`, { alternate: true }) + standingsPreview(preview.contenders, 'Race wins', 'The same two title contenders', { metric: 'wins', ranked: false })}
          </div>
          <p class="home-question-note">${esc(preview.note)}</p>
          <a class="home-question-link" href="${esc(preview.href)}">${esc(preview.action)}</a>
        </article>
        <article class="home-question-card home-question-comparison">
          <h3>How do your favourites compare?</h3>
          <div class="home-duel-preview" aria-label="${esc(first.name)} and ${esc(second.name)} ${esc(config.shortName)} career comparison">
            <div class="home-duel-names"><strong>${esc(first.name)}</strong><span>${esc(careerLabel)}</span><strong>${esc(second.name)}</strong></div>
            ${metrics.map(([key, label]) => `<div class="home-duel-row"><strong${first[key] > second[key] ? ' class="home-duel-leading"' : ''}>${first[key]}</strong><span>${esc(label)}</span><strong${second[key] > first[key] ? ' class="home-duel-leading"' : ''}>${second[key]}</strong></div>`).join('')}
          </div>
          <a class="home-question-link" href="${esc(config.path)}/driver-comparison?first=${esc(first.id)}&amp;second=${esc(second.id)}">Compare ${esc(first.name)} &amp; ${esc(second.name)}</a>
        </article>
        <article class="home-question-card home-question-quiz">
          ${preview.champions ? `<h3>How much ${esc(config.shortName)} history can you remember?</h3>
          <div class="home-quiz-preview" aria-label="Champions quiz preview: can you name the ${missingChampion.year} champion?">
            ${preview.champions.map(champion => `<div${champion.name ? '' : ' class="home-quiz-missing"'}><span>${champion.year}</span><strong>${champion.name ? esc(champion.name) : 'Who took the title?'}</strong><span aria-hidden="true">${champion.name ? '✓' : '?'}</span></div>`).join('')}
          </div>
          <a class="home-question-link" href="${esc(preview.quizHref)}">Name the champions</a>` : `<h3>How quick are your reactions?</h3>
          <div class="home-lights-preview">
            <div class="home-start-lights" role="img" aria-label="Lights Out preview: five red starting lights"><i></i><i></i><i></i><i></i><i></i></div>
            <p>Wait for the lights. Then react.<br>Find out how fast you are off the line.</p>
          </div>
          <a class="home-question-link" href="${esc(config.path)}/lights-out">Try Lights Out</a>`}
        </article>
      </div>
    </section>`;
}

function renderSeriesHome(seriesKey) {
    const config = SERIES_HOME_CONFIG[seriesKey] || SERIES_HOME_CONFIG.f1;
    const title = config.key === 'f1' ? 'Racelytic' : `${config.name} · Racelytic`;
    const archiveLines = config.archiveTitle.split('|');
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(config.description)}">
  <link rel="icon" href="${esc(config.favicon)}" type="image/svg+xml">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/polish.css">
  <link rel="stylesheet" href="/css/home-questions.css">
</head>
<body${config.modeClass ? ` class="${esc(config.modeClass)}"` : ''} data-series-home="${esc(config.key)}">
  <div id="header"></div>
  <main>
    <section class="hero home-hero series-home-hero container">
      <div class="series-home-hero-copy">
        <h1>${esc(config.headline)}<br><span>${esc(config.subheadline)}</span></h1>
        <p class="hero-copy">${esc(config.introduction)}</p>
      </div>
    </section>

    <section class="container series-snapshot" aria-labelledby="season-snapshot-title">
      <div class="series-snapshot-intro">
        <h2 class="eyebrow" id="season-snapshot-title">CURRENT SEASON</h2>
      </div>
      <div class="series-snapshot-grid" aria-live="polite">
        <a class="series-snapshot-item" id="snapshot-season-link" href="${esc(config.path)}/seasons"><span>Season</span><strong id="snapshot-season">—</strong><small>Open championship</small></a>
        <div class="series-snapshot-item"><span>Calendar</span><strong id="snapshot-rounds">—</strong><small>Rounds</small></div>
        <div class="series-snapshot-item"><span id="snapshot-leader-label">Championship leader</span><strong id="snapshot-leader">—</strong><small id="snapshot-leader-points">Standings</small></div>
        <a class="series-snapshot-item" id="snapshot-event-link" href="${esc(config.path)}/races"><span id="snapshot-event-label">Latest event</span><strong id="snapshot-event">—</strong><small id="snapshot-event-meta">Race calendar</small></a>
      </div>
    </section>

    ${renderQuestions(config)}

    <section class="container home-archive" id="series-archive">
      <div class="home-archive-copy">
        <div class="eyebrow">THE ARCHIVE BENEATH IT ALL</div>
        <h2>${esc(archiveLines[0])}<br>${esc(archiveLines[1])}</h2>
        <p>${esc(config.archiveCopy)}</p>
        <a class="series-text-link" href="${esc(config.path)}/database">Browse the full archive <span aria-hidden="true">→</span></a>
      </div>
      <div class="stats-grid" id="series-stats">
        <div class="metric"><span>Seasons</span><strong>—</strong></div>
        <div class="metric"><span>Drivers</span><strong>—</strong></div>
        <div class="metric"><span>${esc(config.entityLabel)}</span><strong>—</strong></div>
        <div class="metric"><span>Circuits</span><strong>—</strong></div>
      </div>
    </section>

    <section class="container home-community home-community-compact">
      <div><h2>Keep what you create.</h2><p>Save your custom points systems and championships. Keep them private or share them with the community.</p></div>
      <div class="home-account-actions"><a class="button primary" href="/account?series=${esc(config.key)}&amp;tab=register">Create an account</a><a class="home-account-signin" href="/account?series=${esc(config.key)}">Sign in</a></div>
    </section>
  </main>
  <footer class="footer"><div class="container">Racelytic</div></footer>
  <script src="/js/utils.js"></script>
  <script src="/js/header.js"></script>
  <script src="/js/series-home.js"></script>
</body>
</html>`;
}

module.exports = { SERIES_HOME_CONFIG, F1_HOME_PREVIEW, SERIES_HOME_PREVIEWS, renderSeriesHome };
