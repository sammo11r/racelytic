const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/templates/ratings-explorer.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'frontend/js/ratings.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/css/ratings.css'), 'utf8');
const header = fs.readFileSync(path.join(root, 'frontend/components/header.html'), 'utf8');
const methodology = fs.readFileSync(path.join(root, 'frontend/ratings-methodology.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');

test('ratings explorer uses series navigation and exposes date, experience and comparison controls', () => {
  assert.doesNotMatch(html, /id="ratings-series"/);
  assert.match(html, /id="ratings-year"/);
  assert.match(html, /id="ratings-min-events"/);
  assert.match(html, /id="ratings-chart"/);
  assert.match(script, /selected\.length < \(ratingView === 'driver' \? 1 : 4\)/);
  assert.match(script, /\/api\/ratings/);
  assert.match(html, /Uncertainty/);
  assert.match(script, /ratings-event-explanation/);
  assert.match(script, /rating-band/);
  assert.match(script, /data\.freshness\?\.isCurrent === false/);
  assert.match(script, /fetch\(`\/api\/ratings\?\$\{query\}`, \{ cache: 'no-store' \}\)/);
  assert.match(script, /Update pending/);
});

test('leaderboard is compact and switches between current ratings and all-time peaks', () => {
  assert.match(html, /data-ratings-order="current"/);
  assert.match(html, /data-ratings-order="peak"/);
  assert.match(html, /<th>Rank<\/th><th>Driver<\/th><th>Rating<\/th>[\s\S]*?<th>Peak<\/th><th>Events<\/th><th>Last change<\/th>/);
  assert.match(script, /query\.set\('order', ratingState\.order\)/);
  assert.match(css, /body\[data-ratings-view="leaderboard"\] \.ratings-hero \{ display: block; min-height: 0;/);
  assert.match(css, /body\[data-ratings-view="leaderboard"\] \.ratings-uncertainty-column \{ display: table-cell; \}/);
  assert.match(html, /<th class="ratings-uncertainty-column">Evidence<\/th>/);
  assert.match(script, /ratings-row-actions/);
  assert.match(script, /ratingDestination\('\/ratings\/driver'/);
  assert.match(script, /\[1, 3, 10, 25\]\.includes\(requestedMinEvents\)/);
  assert.match(script, /query\.set\('minEvents', String\(ratingState\.minEvents\)\)/);
  assert.match(css, /body\[data-ratings-view="leaderboard"\] \.ratings-year-control \{ display: none; \}/);
  assert.match(css, /body\[data-ratings-view="leaderboard"\] \.ratings-heading > div:first-child \{ display: none; \}/);
  assert.match(html, /id="ratings-board"/);
  assert.match(html, /class="ratings-command-bar"/);
  assert.match(css, /\.ratings-command-bar \{/);
  assert.match(css, /body\[data-ratings-view="leaderboard"\] \.ratings-heading,\s*body\[data-ratings-view="leaderboard"\] \.ratings-controls \{ display: none; \}/);
  assert.match(css, /body\[data-ratings-view="leaderboard"\] \.ratings-command-bar \{[^}]*width: 100%;/);
  assert.match(css, /body\[data-ratings-view="leaderboard"\] \.ratings-content \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /body\[data-ratings-view="leaderboard"\] \{ background: linear-gradient\(180deg, #fafafa 0, var\(--background\) 27rem\); \}/);
  assert.match(css, /\.ratings-explorer \{ padding-top: 22px; border-top: 0; \}/);
  assert.match(script, /leaderboardPageSize: 50/);
  assert.match(script, /ratingState\.leaderboardPageSize = 10/);
  assert.match(script, /profilePageSize: 10/);
  assert.match(script, /renderPagination\('ratings-board'/);
});

test('leaderboard rows are informational and emphasize the active order metric', () => {
  assert.match(script, /const selectable = ratingView !== 'leaderboard'/);
  assert.match(script, /if \(ratingView === 'leaderboard'\) \{[\s\S]*?renderPagination\('ratings-board'/);
  assert.match(script, /ratingState\.order === 'current' \? ' class="ratings-value"'/);
  assert.match(script, /ratingState\.order === 'peak' \? ' class="ratings-value"'/);
  assert.match(css, /body\[data-ratings-view="leaderboard"\] \.ratings-table tr \{ cursor: default; \}/);
});

test('driver comparison uses a dedicated searchable workspace', () => {
  assert.match(html, /id="ratings-compare-setup"/);
  assert.match(html, /id="ratings-compare-slots"/);
  assert.match(html, /id="ratings-driver-search"[^>]*role="combobox"/);
  assert.match(html, /id="ratings-driver-results"[^>]*role="listbox"/);
  assert.match(html, /data-ratings-chart-scale="calendar"/);
  assert.match(html, /data-ratings-chart-scale="career"/);
  assert.match(html, /id="ratings-uncertainty-toggle"/);
  assert.match(html, /id="ratings-compare-summary"/);
  assert.match(script, /function renderComparePicker/);
  assert.match(script, /function renderCompareSummary/);
  assert.match(script, /if \(ratingView === 'compare' \|\| ratingView === 'driver'\) \{[\s\S]*?ratingElements\.table\.replaceChildren\(\)/);
  assert.match(script, /function wireRatingChart/);
  assert.match(script, /if \(ratingView === 'compare' \|\| ratingView === 'driver'\) query\.set\('order', 'peak'\)/);
  assert.match(script, /ratingView === 'compare' \|\| ratingView === 'driver'[\s\S]*?\? 1[\s\S]*?: \[1, 3, 10, 25\]\.includes/);
  assert.match(script, /defaultComparisonDrivers = \['max-verstappen', 'charles-leclerc', 'lando-norris', 'george-russell'\]/);
  assert.match(script, /ratingState\.selected = \[\.\.\.defaultComparisonDrivers\]/);
  assert.match(script, /function cachedRatingDriver\(driverId\)/);
  assert.match(script, /const progressiveCompare = ratingView === 'compare';/);
  assert.match(script, /placeholder = 'Loading driver directory…'/);
  assert.match(script, /\.sort\(\(a, b\) => b\.rating - a\.rating \|\| a\.driverName\.localeCompare\(b\.driverName\)\)/);
  assert.match(script, /ratingView === 'compare' && !ratingState\.selected\.length/);
  assert.match(css, /body\[data-ratings-view="compare"\] \.ratings-board \{ display: none; \}/);
  assert.match(script, /ratingState\.year = ratingView === 'leaderboard'/);
  assert.match(script, /if \(ratingView === 'compare'\) document\.getElementById\('ratings-controls'\)\.hidden = true/);
  assert.match(css, /body\[data-ratings-view="compare"\] \.ratings-heading,[\s\S]*?body\[data-ratings-view="compare"\] \.ratings-controls \{ display: none; \}/);
  assert.match(css, /body\[data-ratings-view="compare"\] \.ratings-hero \{ display: block; min-height: 0;/);
  assert.match(css, /body\[data-ratings-view="compare"\] \{ background: linear-gradient\(180deg, #fafafa 0, var\(--background\) 25rem\); \}/);
  assert.match(css, /body\[data-ratings-view="compare"\] \.ratings-explorer \{ padding-top: 14px; border-top: 0; \}/);
});

test('comparison chart supports event inspection, career alignment and uncertainty', () => {
  assert.match(script, /chartScale: 'calendar'/);
  assert.match(script, /ratingElements\.chart\.clientWidth/);
  assert.match(script, /svg\.viewBox\.baseVal\.width/);
  assert.match(script, /careerScale \? index : new Date\(event\.date\)\.getTime\(\)/);
  assert.match(script, /ratings-chart-overlay/);
  assert.match(script, /Math\.ceil\(item\.points\.length \/ 48\)/);
  assert.match(script, /class="rating-event-point" aria-hidden="true" focusable="false"/);
  assert.match(script, /addEventListener\('pointermove'/);
  assert.match(script, /addEventListener\('keydown'/);
  assert.match(script, /inspectionPoints/);
  assert.match(script, /data-series-index/);
  assert.match(script, /Use left and right arrow keys/);
  assert.match(script, /Not active at this point/);
  assert.match(css, /\.ratings-chart\[data-show-uncertainty="false"\] \.rating-band \{ opacity: 0; \}/);
  assert.match(css, /\.ratings-chart-tooltip/);
  assert.match(css, /\.ratings-line-label/);
});

test('rating profile presents a searchable full-career driver dossier', () => {
  assert.match(html, /id="ratings-profile-selector"/);
  assert.match(html, /id="ratings-profile-search"[^>]*role="combobox"/);
  assert.match(html, /id="ratings-profile-summary"/);
  assert.match(html, /id="ratings-profile-highlights"/);
  assert.match(html, /id="ratings-profile-season"/);
  assert.match(html, /id="ratings-profile-team"/);
  assert.match(html, /id="ratings-profile-impact"/);
  assert.match(html, /id="ratings-events-list-pagination"[^>]*aria-label="Rating history pages"/);
  assert.match(html, /<span>Event<\/span><span>Result<\/span><span>Expected<\/span><span>Change<\/span><span>Rating<\/span><span>Weight<\/span>/);
  assert.match(script, /function renderProfileResults/);
  assert.match(script, /function renderProfileEvents/);
  assert.match(script, /profilePageSize: 10/);
  assert.match(script, /pageItems\(ordered, ratingState\.profilePage, ratingState\.profilePageSize\)/);
  assert.match(script, /renderPagination\('ratings-events-list'/);
  assert.match(script, /ratingState\.profilePage = 1/);
  assert.match(script, /function longestPositiveRun/);
  assert.match(script, /function currentRatingOrder/);
  assert.match(script, /Number\(driver\.lastEvent\?\.year\) === latestYear/);
  assert.match(script, /const highestRated = currentRatingOrder\(\)\[0\]/);
  assert.match(script, /ratings-peak-point/);
  assert.match(script, /ratings-team-change/);
  assert.match(script, /ratingState\.year = ratingView === 'leaderboard'/);
  assert.match(css, /body\[data-ratings-view="driver"\] \.ratings-board \{ display: none; \}/);
  assert.match(css, /body\[data-ratings-view="driver"\] \{ background: linear-gradient\(180deg, #fafafa 0, var\(--background\) 25rem\); \}/);
  assert.match(css, /body\[data-ratings-view="driver"\] \.ratings-explorer \{ padding-top: 14px; border-top: 0; \}/);
  assert.match(css, /\.ratings-profile-summary \{ display: grid;/);
  assert.match(css, /\.ratings-profile-events-columns, \.ratings-profile-event summary \{ display: grid;/);
});

test('leaderboard timeline selects seasons and drills into exact rated events', () => {
  assert.match(html, /id="ratings-timeline-range"[^>]*type="range"/);
  assert.match(html, /id="ratings-timeline-previous"/);
  assert.match(html, /id="ratings-timeline-next"/);
  assert.match(html, /id="ratings-timeline-back"/);
  assert.match(html, /id="ratings-timeline-zoom"/);
  assert.match(html, /id="ratings-timeline-latest"/);
  assert.match(script, /new URLSearchParams\(\{ series: ratingState\.series \}\)[\s\S]*?\/api\/ratings\/events\?\$\{query\}/);
  assert.match(script, /query\.set\('event', ratingState\.eventId\)/);
  assert.match(script, /timelineLevel: 'season'/);
  assert.match(script, /function zoomIntoRatingSeason/);
  assert.match(script, /function zoomOutOfRatingSeason/);
  assert.match(script, /query\.set\('timeline', 'events'\)/);
  assert.match(script, /addEventListener\('pointerdown'/);
  assert.match(script, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(script, /addEventListener\('input'/);
  assert.match(script, /addEventListener\('change', \(\) => loadRatings\(\)\)/);
  assert.match(html, /id="ratings-timeline-range" class="ratings-timeline-range"/);
  assert.match(html, /class="ratings-timeline-scale"/);
  assert.match(script, /timelineSpan\.textContent = `\$\{items\.length\} seasons`/);
  assert.match(script, /function applyRatingSeriesTheme/);
  assert.match(script, /--timeline-progress/);
  assert.match(css, /background: var\(--accent\)/);
  assert.match(css, /\.ratings-timeline-track \{ display: block; width: 100%; \}/);
  assert.match(html, /class="ratings-timeline-stepper"[^>]*><button id="ratings-timeline-previous"[\s\S]*?id="ratings-timeline-next"/);
});

test('ratings methodology explains weights and avoids claiming pure talent', () => {
  assert.match(methodology, /Elo 1\.4/);
  assert.match(methodology, /equal-event/);
  assert.match(methodology, /resample complete race weekends/);
  assert.match(methodology, /displayed uncertainty is recalculated for the selected date/);
  assert.match(html, /Sprints and reverse-grid races carry half weight/);
  assert.match(html, /Non-starters are excluded/);
  assert.match(html, /first 10 events/);
  assert.match(html, /Expected is the model-implied finishing position/);
  assert.match(html, /not a pure measure of driver talent/i);
  assert.match(html, /Each championship has an independent 1500-point pool/);
  assert.doesNotMatch(html, /three-quarter weight/);
});

test('ratings layout collapses cleanly for tablets and phones', () => {
  assert.match(css, /@media \(max-width: 1000px\)/);
  assert.match(css, /\.ratings-content \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /\.ratings-table tbody \{ display: grid;/);
  assert.match(css, /\.ratings-profile-events-columns \{ display: none; \}/);
});

test('ratings explains model context and exposes trustworthy freshness messaging', () => {
  assert.match(html, /id="ratings-model-help"/);
  assert.match(html, /id="ratings-view-updated"[^>]*aria-live="polite"/);
  assert.match(script, /ratings through/);
  assert.match(script, /source results through/);
  assert.match(script, /dataset\.state = freshnessPending \? 'pending' : 'current'/);
  assert.match(script, /Order after the/);
  assert.match(script, /Minimum events counts rated career events/);
});

test('ratings is a top-level section while games remains available', () => {
  assert.doesNotMatch(header.match(/data-nav-section="analysis"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '', /href="\/ratings"/);
  assert.match(header, /data-nav-section="ratings"[\s\S]*?Ratings[\s\S]*?\/ratings\/leaderboard[\s\S]*?\/ratings\/compare[\s\S]*?\/ratings\/driver[\s\S]*?\/ratings\/methodology/);
  assert.match(header, /data-nav-section="games"[\s\S]*?Games[\s\S]*?href="\/games"/);
});

test('ratings page exposes matching internal destinations', () => {
  assert.doesNotMatch(html, /ratings-subnav/);
  assert.match(fs.readFileSync(path.join(root, 'frontend/ratings.html'), 'utf8'), /href="\/ratings\/leaderboard"/);
  assert.match(fs.readFileSync(path.join(root, 'frontend/ratings.html'), 'utf8'), /href="\/ratings\/compare"/);
  assert.match(fs.readFileSync(path.join(root, 'frontend/ratings.html'), 'utf8'), /href="\/ratings\/driver"/);
  assert.match(fs.readFileSync(path.join(root, 'frontend/ratings.html'), 'utf8'), /href="\/ratings\/methodology"/);
  assert.match(script, /const ratingViews/);
  assert.match(server, /'\/ratings\/methodology': \['ratings-methodology\.html'/);
});

test('methodology is a dedicated transparent model page', () => {
  assert.match(methodology, /RATINGS METHODOLOGY/);
  assert.match(methodology, /Evidence, not an error bar/);
  assert.match(methodology, /140 for the first 10 rated events, 98 through event 50 and 70 thereafter/);
  assert.match(methodology, /uncertainty of ±260/);
  assert.match(methodology, /towards a ±45 floor/);
  assert.match(methodology, /Stable begins at 50 weighted events in F1, 30 in F2, 24 in F3 and 16 in Academy/);
  assert.match(methodology, /READING A PROFILE/);
  assert.match(methodology, /Disqualifications retain full effect/);
  assert.match(methodology, /zero-sum within its pool/);
  assert.match(methodology, /tested chronologically/i);
  assert.match(methodology, /not a pure measure of driver talent/i);
  assert.doesNotMatch(methodology, /ratings-subnav/);
});
