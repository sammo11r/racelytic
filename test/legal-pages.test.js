const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname, '../frontend');
const terms = fs.readFileSync(path.join(frontend, 'terms.html'), 'utf8');
const privacy = fs.readFileSync(path.join(frontend, 'privacy.html'), 'utf8');

test('terms cover public creations, moderation, reports and all championships', () => {
  assert.match(terms, /id="moderation"/);
  assert.match(terms, /Report%20content%20on%20Racelytic/);
  assert.match(terms, /make it private/);
  assert.match(terms, /Formula 3, F3, F1 Academy/);
  assert.match(terms, /Data Sources &amp; Licences/);
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
