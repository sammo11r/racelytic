const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const polish = fs.readFileSync(path.join(root, 'frontend/css/polish.css'), 'utf8');
const seasonOverview = fs.readFileSync(path.join(root, 'frontend/css/season-detail-overview.css'), 'utf8');
const simulateRace = fs.readFileSync(path.join(root, 'frontend/css/simulate-race.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const accessibilityAudit = fs.readFileSync(path.join(root, 'scripts/audit-accessibility.js'), 'utf8');

test('desktop navigation collapses before laptop-width links can overflow', () => {
    assert.match(polish, /@media \(max-width: 1120px\) \{\s*\.site-header \.nav \{ position: relative; \}/);
    assert.match(polish, /@media \(max-width: 1120px\)[\s\S]*?\.mobile-nav-toggle \{ display: block;/);
});

test('compact interactive controls provide practical touch targets', () => {
    assert.match(polish, /\.driver-letters button \{[\s\S]*?min-width: 44px;[\s\S]*?height: 44px;/);
    assert.match(polish, /\.pagination button \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
    assert.match(seasonOverview, /\.season-detail-page \.season-map-controls button \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
    assert.match(simulateRace, /\.replay-transport button \{[\s\S]*?width: 44px;[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
});

test('production static assets use compression and short-lived browser caching', () => {
    assert.match(server, /const compression = require\('compression'\);/);
    assert.match(server, /app\.use\(compression\(\{ threshold: 1024 \}\)\);/);
    assert.match(server, /maxAge: process\.env\.NODE_ENV === 'production' \? '5m' : 0/);
});

test('accessibility audit covers representative pages at desktop and mobile widths', () => {
    assert.equal(packageJson.scripts['audit:accessibility'], 'node scripts/audit-accessibility.js');
    assert.ok(packageJson.devDependencies['axe-core']);
    for (const route of ['/', '/constructors', '/drivers', '/ask', '/community', '/games', '/analysis', '/simulator-overview']) {
        assert.match(accessibilityAudit, new RegExp(`['\"]${route.replace('/', '\\/')}['\"]`));
    }
    assert.match(accessibilityAudit, /width: 1280, height: 900/);
    assert.match(accessibilityAudit, /width: 390, height: 844/);
    assert.match(accessibilityAudit, /\['critical', 'serious'\]\.includes/);
});
