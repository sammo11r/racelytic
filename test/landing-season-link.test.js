const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../frontend/js/f2-season-analysis.js'), 'utf8');

for (const series of ['f2', 'f3', 'academy']) {
    test(`${series} season preview links select valid years and ignore unsupported years`, async () => {
        for (const [search, expected] of [['?year=2020', '2020'], ['?year=2024', '2024'], ['?year=1900', '2026'], ['?year=<script>', '2026'], ['', '2026']]) {
            const select = { value: '2026', addEventListener() {} };
            const errors = [];
            let renderedYear;
            const context = {
                activeSeriesKey: () => series,
                activeSeriesName: () => series,
                activeSeriesAccent: () => '#123456',
                window: { location: { search } },
                URLSearchParams,
                document: { getElementById: () => select, querySelector: () => null, querySelectorAll: () => [] },
                getJSON: async url => {
                    assert.equal(url, `/api/seasons?series=${series}`);
                    return [{ year: 2026 }, { year: 2024 }, { year: 2020 }];
                },
                esc: String,
                setError: (...args) => errors.push(args),
                recordRender: () => { renderedYear = select.value; }
            };
            // Isolate initialization from chart rendering and network requests.
            vm.runInNewContext(`${source}\nfunction renderF2SeasonAnalysis() { recordRender(); }`, context);
            await new Promise(resolve => setImmediate(resolve));
            assert.deepEqual(errors, []);
            assert.equal(renderedYear, expected);
        }
    });
}
