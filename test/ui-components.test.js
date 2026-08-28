const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../frontend/js/ui-components');

test('shared UI states escape untrusted messages', () => {
    assert.match(ui.error('<script>'), /&lt;script&gt;/);
    assert.match(ui.loading('Race data'), /loading-state/);
    assert.match(ui.empty(), /No results found/);
});

test('shared table and chart primitives produce accessible wrappers', () => {
    const table = ui.table({ columns: ['Driver'], rows: [{ name: 'Max' }], row: item => [item.name] });
    assert.match(table, /class="table-wrap"/);
    assert.match(table, /<th>Driver<\/th>/);
    assert.match(ui.chart('<svg></svg>', 'Championship progression'), /aria-label="Championship progression"/);
});
