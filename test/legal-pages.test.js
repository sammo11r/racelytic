const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PRIVACY_VERSION, TERMS_VERSION } = require('../backend/legal');

const frontend = path.join(__dirname, '../frontend');
const terms = fs.readFileSync(path.join(frontend, 'terms.html'), 'utf8');
const privacy = fs.readFileSync(path.join(frontend, 'privacy.html'), 'utf8');
const dataSources = fs.readFileSync(path.join(frontend, 'data-sources.html'), 'utf8');
const aboutPages = ['about.html', 'f2-about.html', 'f3-about.html']
  .map(file => fs.readFileSync(path.join(frontend, file), 'utf8'));
const navigation = fs.readFileSync(path.join(frontend, 'js/navigation.js'), 'utf8');

test('terms cover public creations, moderation, reports and all championships', () => {
  assert.match(terms, /id="moderation"/);
  assert.match(terms, /Report%20content%20on%20Racelytic/);
  assert.match(terms, /make it private/);
  assert.match(terms, /Formula 3, F3, F1 Academy, Formula E, FIA WEC, World Endurance Championship/);
  assert.match(terms, /the FIA World Endurance Championship, the FIA, the ACO/);
  assert.match(terms, /Version 2026-09-21/);
  assert.match(terms, /Data Sources &amp; Licences/);
});

test('WEC provenance and project notices cover the complete current archive', () => {
  assert.match(dataSources, /official FIA WEC website’s results archive/);
  assert.match(dataSources, /historic season index/);
  assert.match(dataSources, /every championship season from 2012 through the ongoing 2026 season/);
  assert.doesNotMatch(dataSources, /2022–2025|220 race-weekend sessions|season\/2025/);
  for (const about of aboutPages) {
    assert.match(about, /Formula E, the FIA World Endurance Championship, the FIA, the ACO/);
  }
  assert.match(navigation, /seriesNeutralPages = \[[^\]]*'\/data-sources'/);
});

test('privacy notice matches account, analytics and browser storage behaviour', () => {
  assert.match(privacy, /does not require your email address/);
  assert.match(privacy, /random visitor identifier/);
  assert.match(privacy, /page path without query parameters/);
  assert.match(privacy, /up to 13 months/);
  assert.match(privacy, /unfinished points-system, scenario or championship drafts/);
  assert.match(privacy, /Changing your password ends other active sessions/);
  assert.match(privacy, /does not sell personal data/);
});

test('account consent versions match the published legal documents', () => {
  assert.match(terms, new RegExp(`Version ${TERMS_VERSION}`));
  assert.match(privacy, new RegExp(`Version ${PRIVACY_VERSION}`));
});
