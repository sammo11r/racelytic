const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderAcademyHtml } = require('../backend/academy-renderer');

const frontend = path.join(__dirname, '../frontend');
const f1 = fs.readFileSync(path.join(frontend, 'about.html'), 'utf8');
const f2 = fs.readFileSync(path.join(frontend, 'f2-about.html'), 'utf8');
const f3 = fs.readFileSync(path.join(frontend, 'f3-about.html'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/polish.css'), 'utf8');
const navigation = fs.readFileSync(path.join(frontend, 'js/navigation.js'), 'utf8');
const { metadataFor } = require('../backend/seo');

for (const [series, html] of [['F1', f1], ['F2', f2], ['F3', f3]]) {
  test(`${series} About route explains the wider Racelytic project`, () => {
    assert.match(html, /Motorsport history/);
    assert.match(html, /Why it exists/);
    assert.match(html, /From records to an archive/);
    assert.match(html, /Project principles/);
    assert.match(html, /A growing historical record/);
    assert.doesNotMatch(html, /about-feature-grid|What you can do|Explore the archive/);
  });
}

test('About is a series-neutral navigation destination', () => {
  assert.match(navigation, /seriesNeutralPages = \['\/account', '\/privacy', '\/terms', '\/about'\]/);
  assert.match(navigation, /aboutLink\.href = `\/about\?series=\$\{activeSeries\}`/);
  assert.match(navigation, /aboutLink\.href = '\/about\?series=f2'/);
});

test('About metadata is project-level and canonical across legacy routes', () => {
  const rootAbout = metadataFor('/about');
  const legacyAbout = metadataFor('/f2/about');
  assert.equal(rootAbout.title, 'About Racelytic · Racelytic');
  assert.equal(legacyAbout.title, rootAbout.title);
  assert.equal(legacyAbout.canonical, rootAbout.canonical);
  assert.doesNotMatch(rootAbout.description, /Formula 1 archive/);
});

test('Academy receives the shared project story', () => {
  const academy = renderAcademyHtml('f3-about.html', f3);
  assert.match(academy, /Motorsport history/);
  assert.match(academy, /Independent project notice/);
  assert.doesNotMatch(academy, /Formula 3 history/);
});

test('About layout remains compact and responsive', () => {
  assert.match(css, /\.about-method-steps/);
  assert.match(css, /\.about-principles-grid/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /\.about-principles-grid \{ grid-template-columns: 1fr; \}/);
});
