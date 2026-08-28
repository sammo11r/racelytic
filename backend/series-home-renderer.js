const SERIES_HOME_CONFIG = Object.freeze({
    f1: {
        key: 'f1', name: 'Formula 1', shortName: 'F1', path: '', modeClass: '',
        favicon: '/assets/favicon.svg', description: 'Explore, analyse, simulate and play with more than seventy years of Formula 1 history.',
        eyebrow: 'FORMULA 1 · EXPLORED', headline: 'More than results.', subheadline: 'A different way to experience F1.',
        introduction: 'Explore the history, uncover patterns, rewrite championships and test what you know in one connected Formula 1 platform.',
        platformEyebrow: 'ONE PLATFORM · FOUR WAYS IN', platformTitle: 'Choose how you want to explore.',
        platformCopy: 'Start with a fact, a question, an alternative rulebook or a challenge.',
        entityLabel: 'Constructors', accountHref: '/account',
        archiveTitle: 'Decades of Formula 1,|ready for your next question.',
        archiveCopy: 'The database powers every part of Racelytic, from all-time comparisons and race replays to championship simulations and games.',
        features: [
            ['database', 'DATABASE', 'Explore the history', 'Move through every season, race, driver, constructor, circuit and chassis in one connected archive.', '/database', 'Open the database'],
            ['analysis', 'ANALYSIS', 'Find the story in the data', 'Compare eras, follow championship progress, measure driver form and discover the records behind the headlines.', '/analysis', 'Start analysing'],
            ['simulator', 'SIMULATOR', 'Reimagine the championship', 'Apply different points systems, calculate title scenarios and build a championship with your own calendar and field.', '/simulator-overview', 'Enter the simulator'],
            ['games', 'GAMES', 'Put your knowledge on the line', 'Test your recall, manage a racing team and take on a growing collection of history-driven games.', '/games', 'Play now']
        ],
        tools: [
            ['RACE REPLAY', 'Watch a race unfold', 'Follow the field around the circuit with timing, position changes and driver controls.', '/simulate-race', 'Open race replay'],
            ['COMPARE ERAS', 'Season comparison', 'Place championships side by side and see how their stories differ.', '/season-comparison', 'Compare seasons'],
            ['BUILD YOUR OWN', 'Championship builder', 'Choose the calendar, field and scoring rules for a championship of your own.', '/championship-builder', 'Start building']
        ]
    },
    f2: {
        key: 'f2', name: 'Formula 2', shortName: 'F2', path: '/f2', modeClass: 'f2-mode',
        favicon: '/assets/favicon-f2.svg', description: 'Explore, analyse, simulate and play with the complete Formula 2 archive in Racelytic.',
        eyebrow: 'FORMULA 2 · EXPLORED', headline: 'The proving ground.', subheadline: 'Every story behind the step up.',
        introduction: 'Follow the drivers, teams and race weekends that shape the next generation—then analyse, simulate and play with their history.',
        platformEyebrow: 'ONE CHAMPIONSHIP · EVERY ANGLE', platformTitle: 'Go beyond the finishing order.',
        platformCopy: 'Move naturally from the archive into analysis, alternative championships and games.',
        entityLabel: 'Teams', accountHref: '/account?series=f2',
        archiveTitle: 'A feeder series.|A history of its own.',
        archiveCopy: 'Every season, driver, team, circuit and session result connects to the tools built on top of the Formula 2 archive.',
        features: [
            ['database', 'DATABASE', 'Explore the archive', 'Follow every season, race weekend, driver, team, circuit and chassis in the modern Formula 2 era.', '/f2/database', 'Open the database'],
            ['analysis', 'ANALYSIS', 'See how campaigns unfolded', 'Track points progression, compare drivers, measure form and uncover the records behind each season.', '/f2/analysis', 'Start analysing'],
            ['simulator', 'SIMULATOR', 'Rewrite the title fight', 'Change scoring rules, calculate championship scenarios and create a custom Formula 2 calendar.', '/f2/simulator', 'Enter the simulator'],
            ['games', 'GAMES', 'Test what you remember', 'Name champions and winners, run a racing team or sharpen your reactions with quick challenges.', '/f2/games', 'Play now']
        ],
        tools: [
            ['FOLLOW THE TITLE', 'Season analysis', 'Watch the standings change through every sprint and feature race.', '/f2/season-analysis', 'Analyse a season'],
            ['HEAD TO HEAD', 'Driver comparison', 'Compare careers, results and performance across the Formula 2 archive.', '/f2/driver-comparison', 'Compare drivers'],
            ['TEST YOUR RECALL', 'Champions quiz', 'See how many Formula 2 champions you can name from the complete archive.', '/f2/champions-quiz', 'Take the quiz']
        ]
    },
    f3: {
        key: 'f3', name: 'Formula 3', shortName: 'F3', path: '/f3', modeClass: 'f3-mode',
        favicon: '/assets/favicon-f3.svg', description: 'Explore, analyse, simulate and play with FIA Formula 3 history in Racelytic.',
        eyebrow: 'FORMULA 3 · EXPLORED', headline: 'The first global stage.', subheadline: 'Where the next generation breaks through.',
        introduction: 'Explore the drivers, teams and race weekends that have shaped the championship since 2019—then take the data further.',
        platformEyebrow: 'THE FULL RACELYTIC TOOLKIT', platformTitle: 'A short history, explored deeply.',
        platformCopy: 'Browse the record, interrogate the data, rewrite a championship or simply play.',
        entityLabel: 'Teams', accountHref: '/account?series=f3',
        archiveTitle: 'Every campaign.|Full race-by-race detail.',
        archiveCopy: 'The championship calendar, entrants, classifications and standings come together in one connected Formula 3 archive.',
        features: [
            ['database', 'DATABASE', 'Explore every campaign', 'Browse seasons, race weekends, drivers, teams, circuits and machinery from 2019 onward.', '/f3/database', 'Open the database'],
            ['analysis', 'ANALYSIS', 'Find the breakthrough moments', 'Follow title progress, compare drivers, examine teammate battles and discover all-time records.', '/f3/analysis', 'Start analysing'],
            ['simulator', 'SIMULATOR', 'Change the championship', 'Recalculate seasons, explore title scenarios and assemble a custom calendar and field.', '/f3/simulator', 'Enter the simulator'],
            ['games', 'GAMES', 'Play beyond the archive', 'Build a racing operation over time or test your reactions in a quick lights-out challenge.', '/f3/games', 'Play now']
        ],
        tools: [
            ['FOLLOW THE TITLE', 'Season analysis', 'See how every sprint and feature race reshaped the championship.', '/f3/season-analysis', 'Analyse a season'],
            ['INSIDE THE TEAM', 'Teammate battles', 'Measure head-to-head performance between drivers sharing the same machinery.', '/f3/teammate-battles', 'Compare teammates'],
            ['BUILD YOUR OWN', 'Championship builder', 'Combine races, drivers and teams into a new championship.', '/f3/championship-builder', 'Start building']
        ]
    },
    academy: {
        key: 'academy', name: 'F1 Academy', shortName: 'F1 Academy', path: '/academy', modeClass: 'academy-mode',
        favicon: '/assets/favicon-academy.svg', description: 'Explore, analyse, simulate and play with the complete F1 Academy archive in Racelytic.',
        eyebrow: 'F1 ACADEMY · EXPLORED', headline: 'A new generation.', subheadline: 'Every race, career and title story.',
        introduction: 'Follow the drivers, teams and race weekends shaping the championship, with a complete toolkit built around its own format.',
        platformEyebrow: 'ONE SERIES · EVERY ANGLE', platformTitle: 'The complete championship experience.',
        platformCopy: 'Move from a season or driver into deeper analysis, simulation and games.',
        entityLabel: 'Teams', accountHref: '/account?series=academy',
        archiveTitle: 'A young championship.|A complete record.',
        archiveCopy: 'Seasons, entrants, sessions and standings connect across a dedicated archive built for the championship’s own race formats.',
        features: [
            ['database', 'DATABASE', 'Explore the championship', 'Browse every season, race weekend, driver, team, circuit and chassis in the archive.', '/academy/database', 'Open the database'],
            ['analysis', 'ANALYSIS', 'Follow every turning point', 'Track championship progress, compare drivers and teams, and explore performance by circuit.', '/academy/analysis', 'Start analysing'],
            ['simulator', 'SIMULATOR', 'Rewrite the title fight', 'Change scoring rules, test championship scenarios and build your own calendar and field.', '/academy/simulator', 'Enter the simulator'],
            ['games', 'GAMES', 'Play beyond the results', 'Manage a racing team over time or test your reactions in a quick lights-out challenge.', '/academy/games', 'Play now']
        ],
        tools: [
            ['FOLLOW THE TITLE', 'Season analysis', 'Watch the standings change through every race in the championship.', '/academy/season-analysis', 'Analyse a season'],
            ['RECENT FORM', 'Driver form', 'Follow finishing and qualifying trends across recent weekends.', '/academy/driver-form', 'Explore driver form'],
            ['BUILD YOUR OWN', 'Championship builder', 'Choose races, drivers, teams and scoring rules for a custom season.', '/academy/championship-builder', 'Start building']
        ]
    }
});

function esc(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function featureCard(feature, index) {
    const [kind, label, title, copy, href, action] = feature;
    return `<a class="home-path-card home-path-${esc(kind)}" href="${esc(href)}">
          <span>${String(index + 1).padStart(2, '0')} · ${esc(label)}</span>
          <div><h3>${esc(title)}</h3><p>${esc(copy)}</p></div>
          <strong>${esc(action)} <span aria-hidden="true">→</span></strong>
        </a>`;
}

function toolCard(tool, index) {
    const [label, title, copy, href, action] = tool;
    return `<a class="series-tool-card${index === 0 ? ' series-tool-featured' : ''}" href="${esc(href)}">
          <span>${esc(label)}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p><strong>${esc(action)} <span aria-hidden="true">→</span></strong>
        </a>`;
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
</head>
<body${config.modeClass ? ` class="${esc(config.modeClass)}"` : ''} data-series-home="${esc(config.key)}">
  <div id="header"></div>
  <main>
    <section class="hero home-hero series-home-hero container">
      <div class="series-home-hero-copy">
        <div class="eyebrow">${esc(config.eyebrow)}</div>
        <h1>${esc(config.headline)}<br><span>${esc(config.subheadline)}</span></h1>
        <p class="hero-copy">${esc(config.introduction)}</p>
        <div class="hero-actions">
          <a class="button primary" href="#series-explore">Explore ${esc(config.shortName)}</a>
          <a class="button secondary" id="latest-season-link" href="${esc(config.path)}/seasons">Latest season</a>
        </div>
      </div>
    </section>

    <section class="container series-snapshot" aria-labelledby="season-snapshot-title">
      <div class="series-snapshot-intro">
        <div class="eyebrow">CURRENT SEASON</div>
        <h2 id="season-snapshot-title">The championship at a glance.</h2>
      </div>
      <div class="series-snapshot-grid" aria-live="polite">
        <a class="series-snapshot-item" id="snapshot-season-link" href="${esc(config.path)}/seasons"><span>Season</span><strong id="snapshot-season">—</strong><small>Open championship</small></a>
        <div class="series-snapshot-item"><span>Calendar</span><strong id="snapshot-rounds">—</strong><small>Rounds</small></div>
        <div class="series-snapshot-item"><span id="snapshot-leader-label">Championship leader</span><strong id="snapshot-leader">—</strong><small id="snapshot-leader-points">Standings</small></div>
        <a class="series-snapshot-item" id="snapshot-event-link" href="${esc(config.path)}/races"><span id="snapshot-event-label">Latest event</span><strong id="snapshot-event">—</strong><small id="snapshot-event-meta">Race calendar</small></a>
      </div>
    </section>

    <section class="container home-platform" id="series-explore">
      <div class="home-section-head">
        <div><div class="eyebrow">${esc(config.platformEyebrow)}</div><h2>${esc(config.platformTitle)}</h2></div>
        <p>${esc(config.platformCopy)}</p>
      </div>
      <div class="home-path-grid">${config.features.map(featureCard).join('')}</div>
    </section>

    <section class="container series-tools" aria-labelledby="series-tools-title">
      <div class="home-section-head">
        <div><div class="eyebrow">FEATURED TOOLS</div><h2 id="series-tools-title">Start somewhere interesting.</h2></div>
        <p>A few of the best ways to turn the ${esc(config.name)} archive into something you can explore.</p>
      </div>
      <div class="series-tools-grid">${config.tools.map(toolCard).join('')}</div>
    </section>

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

    <section class="container home-community">
      <div><div class="eyebrow">YOUR RACELYTIC</div><h2>One account. Every series.</h2><p>Save custom points systems and championships, keep your creations private or share them with the community.</p></div>
      <a class="button primary" href="${esc(config.accountHref)}">Open your account</a>
    </section>
  </main>
  <footer class="footer"><div class="container">Racelytic</div></footer>
  <script src="/js/utils.js"></script>
  <script src="/js/header.js"></script>
  <script src="/js/series-home.js"></script>
</body>
</html>`;
}

module.exports = { SERIES_HOME_CONFIG, renderSeriesHome };
