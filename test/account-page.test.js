const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname, '../frontend');
const html = fs.readFileSync(path.join(frontend, 'account.html'), 'utf8');
const script = fs.readFileSync(path.join(frontend, 'js/account.js'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/account.css'), 'utf8');
const accountRoute = fs.readFileSync(path.join(__dirname, '../backend/routes/account.js'), 'utf8');

test('signed-out account page leads with concrete saved-work benefits', () => {
  assert.match(html, /Keep your racing ideas together/);
  assert.match(html, /class="account-benefits"/);
  assert.match(html, /Points systems/);
  assert.match(html, /Record book/);
  assert.match(html, /Championships/);
  assert.match(html, /forgotten passwords cannot currently be recovered/);
});

test('authentication forms provide confirmation, password visibility and inline errors', () => {
  assert.match(html, /name="confirmPassword"/);
  assert.match(html, /data-toggle-password/);
  assert.match(html, /data-error-for="username"/);
  assert.match(script, /Passwords do not match/);
  assert.match(script, /input\.type = showing \? 'password' : 'text'/);
});

test('returning users see a loading state before either account view', () => {
  assert.match(html, /id="account-loading"/);
  assert.match(html, /id="account-auth-layout"[^>]*hidden/);
  assert.match(html, /id="account-dashboard"[^>]*hidden/);
  assert.match(script, /getJSON\('\/api\/account'\)/);
});

test('account dashboard is an index rather than a duplicate points editor', () => {
  assert.match(html, /Everything you have saved/);
  assert.match(html, /id="points-system-count"/);
  assert.match(html, /id="saved-record-count"/);
  assert.match(html, /id="championship-count"/);
  assert.doesNotMatch(html, /id="points-system-form"|Race points by position/);
  assert.match(script, /slice\(0, 6\)/);
});

test('saved collections expose independent error and retry states', () => {
  assert.match(script, /function errorState/);
  assert.match(script, /We could not load this part of your library/);
  assert.match(script, /errorState\(container, loadPoints\)/);
  assert.match(script, /errorState\(container, loadRecords\)/);
  assert.match(script, /errorState\(container, loadChampionships\)/);
});

test('account holders can securely change their password', () => {
  assert.match(html, /id="password-form"/);
  assert.match(script, /\/api\/account\/password/);
  assert.match(accountRoute, /router\.post\('\/api\/account\/password', requireUser/);
  assert.match(accountRoute, /verifyPassword\(currentPassword/);
  assert.match(accountRoute, /id <> \?/);
});

test('account layout has dedicated tablet and mobile compositions', () => {
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.account-library-summary/);
  assert.match(css, /\.account-card-grid/);
});
