const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname, '../frontend');
const footer = fs.readFileSync(path.join(frontend, 'components/footer.html'), 'utf8');
const privacy = fs.readFileSync(path.join(frontend, 'js/privacy.js'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/polish.css'), 'utf8');

test('footer adds useful explore and project navigation above unchanged legal content', () => {
  assert.match(footer, /class="footer-main"/);
  assert.match(footer, /id="footer-explore-title">Explore/);
  assert.match(footer, /data-footer-page="database"/);
  assert.match(footer, /data-footer-page="analysis"/);
  assert.match(footer, /data-footer-page="simulator"/);
  assert.match(footer, /data-footer-page="games"/);
  assert.match(footer, /id="footer-project-title">Project/);
  assert.match(footer, /data-footer-page="method"/);
  assert.match(footer, /data-footer-trademark/);
  assert.match(footer, /data-footer-source/);
  assert.match(footer, /href="\/data-sources">Data sources &amp; licences/);
  assert.match(footer, />Contact<\/a>/);
  assert.match(footer, />Report content<\/a>/);
});

test('footer avoids unsupported F2 and F3 trade mark ownership claims', () => {
  assert.doesNotMatch(privacy, /trade marks of the Fédération Internationale de l’Automobile/);
  assert.match(privacy, /Formula 2, F2 and related marks belong to their respective owners/);
  assert.match(privacy, /Formula 3, F3 and related marks belong to their respective owners/);
  assert.match(privacy, /F1 ACADEMY, F1, FORMULA 1 and related marks are trade marks of Formula One Licensing B\.V\./);
});

test('footer navigation follows the active championship on regular and neutral routes', () => {
  assert.match(privacy, /document\.body\.classList\.contains\('academy-mode'\)/);
  assert.match(privacy, /\['f1', 'f2', 'f3', 'academy'\]\.includes\(requestedSeries\)/);
  assert.match(privacy, /simulator: activeSeries === 'f1' \? '\/simulator-overview' : `\$\{seriesBase\}\/simulator`/);
  assert.match(privacy, /about: `\/about\?series=\$\{activeSeries\}`/);
  assert.match(privacy, /account: `\/account\?series=\$\{activeSeries\}`/);
});

test('footer navigation has responsive and keyboard-visible styling', () => {
  assert.match(css, /\.footer-navigation \{ display: grid/);
  assert.match(css, /\.footer-link-group a:focus-visible/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /\.footer-navigation \{ grid-template-columns: 1fr;/);
});
