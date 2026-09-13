const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderAcademyHtml } = require('../backend/academy-renderer');

const frontend = path.join(__dirname, '../frontend');
const html = fs.readFileSync(path.join(frontend, 'points-systems.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/points-systems.js'), 'utf8');
const builder = fs.readFileSync(path.join(frontend, 'js/championship-builder.js'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/points-systems.css'), 'utf8');

test('points systems starts with a historical archive and keeps the custom library', () => {
  assert.doesNotMatch(html, /points-library-hero/);
  assert.match(html, /class="points-page-heading"/);
  assert.match(html, /id="historical-systems"/);
  assert.match(html, /id="points-history-search"/);
  assert.match(html, /id="points-history-season"/);
  assert.match(html, /id="official-systems"/);
  assert.match(html, /id="your-systems"/);
  assert.match(html, /\/css\/points-systems\.css/);
  assert.match(html, /\/js\/f1-points-systems\.js/);
  assert.match(script, /const F1_PRESETS = \[/);
  assert.match(script, /const JUNIOR_PRESETS =/);
  assert.match(script, /function historicalSystems/);
  assert.match(script, /function historyChange/);
});

test('official scoring eras can be compared and applied to simulations', () => {
  assert.match(html, /id="compare-systems"/);
  assert.match(html, /id="points-compare-first"/);
  assert.match(html, /id="points-compare-second"/);
  assert.match(html, /id="points-compare-copy"/);
  assert.match(script, /function renderHistoricalComparison/);
  assert.match(script, /Apply \$\{esc\(first\.label\)\}/);
  assert.match(script, /window\.history\.replaceState/);
  assert.match(css, /\.points-compare-result table/);
});

test('rule editor uses direct position inputs and explicit counting modes', () => {
  assert.match(html, /data-points-editor="racePoints"/);
  assert.match(html, /data-points-editor="sprintPoints"/);
  assert.match(html, /data-points-editor="qualifyingPoints"/);
  assert.match(html, /data-add-points-position="racePoints"/);
  assert.match(html, /name="countingMode"/);
  assert.match(html, /value="all"/);
  assert.match(html, /value="best"/);
  assert.match(html, /value="segmented"/);
  assert.match(script, /function renderPositionEditor/);
  assert.match(script, /function syncCountingFields/);
});

test('live preview validates and describes every important rule', () => {
  assert.match(html, /class="points-live-preview"/);
  assert.match(html, /id="points-preview-status"/);
  assert.match(script, /Award points to at least one race position/);
  assert.match(script, /Complete both fields for the first-season segment/);
  assert.match(script, /system\.sprintPoints\.join/);
  assert.match(script, /system\.fastestLapMaxPosition/);
  assert.match(script, /countingDescription\(system\)/);
});

test('saved and public rules can be reused while unfinished edits survive', () => {
  assert.match(script, /Season simulator/);
  assert.match(script, /Scenario calculator/);
  assert.match(script, /Championship builder/);
  assert.match(script, /data-copy-system/);
  assert.match(script, /points-community-search/);
  assert.match(script, /sessionStorage\.setItem\(pointsDraftKey/);
  assert.match(script, /sessionStorage\.getItem\(pointsDraftKey/);
  assert.match(script, /RECOVERED DRAFT/);
});

test('builder accepts linked official and custom points systems', () => {
  assert.match(builder, /BUILDER_SYSTEMS\['2003'\]/);
  assert.match(builder, /BUILDER_SYSTEMS\['1991'\]/);
  assert.match(builder, /BUILDER_SYSTEMS\.classic/);
  assert.match(builder, /const requestedPoints=params\(\)\.get\('points'\)/);
  assert.match(builder, /option\.value===requestedPoints/);
});

test('Academy retains reverse-grid language in the shared editor', () => {
  const academy = renderAcademyHtml('points-systems.html', html);
  assert.match(academy, /favicon-academy\.svg/);
  assert.match(script, /F1 Academy/);
  assert.match(script, /Reverse-grid race/);
  assert.match(script, /reverse-grid race points/);
});

test('points editor and preset cards stack cleanly on smaller screens', () => {
  assert.match(css, /\.points-editor-workspace \{ display: grid/);
  assert.match(css, /@media \(max-width: 1050px\)/);
  assert.match(css, /\.points-editor-workspace \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.points-preset-grid, \.points-library-page \.saved-systems \{ grid-template-columns: 1fr; \}/);
});

test('points-system cards use the compact library layout', () => {
  assert.match(css, /\.points-history-grid \{ display: grid; grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.points-history-card \{[^}]*padding: 13px/);
  assert.match(css, /\.points-system-card \{[^}]*min-height: 125px/);
  assert.match(css, /@media \(max-width: 1050px\)[\s\S]*\.points-history-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\); \}/);
  assert.match(script, /points-history-card-heading"><h3>\$\{esc\(system\.label\)\}<\/h3>/);
  assert.doesNotMatch(script, />Apply to a season<\/a>/);
});

test('points-system section navigation remains fixed below the main header', () => {
  assert.match(css, /#header \{ position: sticky; z-index: 1000; top: 0; \}/);
  assert.match(css, /\.points-local-nav \{ position: fixed;[^}]*top: var\(--header-height\);[^}]*right: 0; left: 0;/);
  assert.match(css, /\.points-library-page\.page \{ padding-top: 75px; \}/);
});
