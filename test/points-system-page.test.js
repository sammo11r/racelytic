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

test('points systems starts with a compact useful preset library', () => {
  assert.doesNotMatch(html, /points-library-hero/);
  assert.match(html, /class="points-page-heading"/);
  assert.match(html, /id="official-systems"/);
  assert.match(html, /Available without an account/);
  assert.match(html, /\/css\/points-systems\.css/);
  assert.match(script, /const F1_PRESETS = \[/);
  assert.match(script, /const JUNIOR_PRESETS =/);
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
