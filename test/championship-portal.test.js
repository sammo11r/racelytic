const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const header = read('frontend/components/header.html');
const navigation = read('frontend/js/navigation.js');
const css = read('frontend/css/polish.css');

test('header uses one expanding championship pill', () => {
    assert.match(header, /class="header-identity">\s*<div class="championship-selector">[\s\S]*?<a class="brand"/);
    assert.match(header, /class="championship-selector"/);
    assert.match(header, /id="championship-select"[^>]+aria-haspopup="listbox"[^>]+aria-expanded="false"/);
    assert.match(header, /data-active-series-short>F1</);
    assert.equal((header.match(/role="option" data-series="(?:f1|f2|f3|academy|fe)"/g) || []).length, 5);
    assert.match(header, /data-series="academy" aria-label="F1 Academy"><span>F1A<\/span>/);
    assert.doesNotMatch(header, /championship-portal|role="dialog"/);
});

test('championship dropdown preserves active state and route translation', () => {
    assert.match(navigation, /option\.setAttribute\('aria-selected', String\(active\)\)/);
    assert.match(navigation, /championshipSelect\.addEventListener\('click'/);
    assert.match(navigation, /resolveSeriesTarget\(targetSeries\)/);
    assert.match(navigation, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/);
    assert.match(navigation, /event\.key === 'Escape'/);
});

test('championship pill remains compact and accessible across breakpoints', () => {
    assert.match(css, /\.header-identity \{[\s\S]*?gap: 14px;/);
    assert.match(css, /\.championship-selector-trigger \{[\s\S]*?width: 38px;[\s\S]*?height: 30px;/);
    assert.match(css, /\.championship-selector-trigger \{[\s\S]*?background: var\(--accent\);/);
    assert.match(css, /\.championship-options \{[\s\S]*?position: absolute;[\s\S]*?display: flex;/);
    assert.match(css, /\.championship-options \[role="option"\] \{[\s\S]*?font: 850 11px\//);
    assert.match(css, /@keyframes championship-pill-open/);
    assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*?\.site-header \.championship-selector-trigger \{ width: 38px; min-width: 38px; \}/);
    assert.doesNotMatch(css, /championship-portal-open|championship-portal-layer/);
});
