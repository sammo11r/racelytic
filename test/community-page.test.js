const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { filterItems } = require('../backend/community');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/community.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'frontend/js/community.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/css/community.css'), 'utf8');

const items = [
  { type: 'points', id: 'p1', name: 'Classic scoring', ownerName: 'Ada', series: 'all', createdAt: '2025-01-01', updatedAt: '2025-01-02' },
  { type: 'records', id: 'r1', name: 'F2 winners', ownerName: 'Ben', series: 'f2', configuration: { category: 'wins' }, createdAt: '2025-02-01', updatedAt: '2025-02-03' },
  { type: 'championships', id: 'c1', name: 'Academy remix', ownerName: 'Cara', series: 'academy', description: 'A short calendar', configuration: {}, createdAt: '2025-03-01', updatedAt: '2025-03-04' }
];

test('community page is a public discovery experience with useful controls', () => {
  assert.match(html, /See what others have changed/);
  assert.match(html, /id="community-query"/);
  assert.match(html, /id="community-series"/);
  assert.match(html, /data-community-type="championships"/);
  assert.match(html, /id="community-more"/);
  assert.match(html, /Create a championship/);
});

test('community cards link public work back into its native tool', () => {
  assert.match(script, /points-systems.*copy=/s);
  assert.match(script, /championship-builder.*id=/s);
  assert.match(script, /function recordUrl/);
  assert.match(script, /Open & remix/);
});

test('community collection filtering includes universal points systems for every series', () => {
  assert.deepEqual(filterItems(items, { series: 'f2' }).map(item => item.id), ['r1', 'p1']);
  assert.deepEqual(filterItems(items, { type: 'championships', series: 'academy' }).map(item => item.id), ['c1']);
  assert.deepEqual(filterItems(items, { query: 'ada' }).map(item => item.id), ['p1']);
  assert.deepEqual(filterItems(items, { sort: 'name' }).map(item => item.id), ['c1', 'p1', 'r1']);
});

test('community layout adapts from three columns to a single mobile column', () => {
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /\.community-controls, \.community-grid \{ grid-template-columns: 1fr; \}/);
});
