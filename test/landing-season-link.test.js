const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../frontend/js/season-analysis.js'), 'utf8');
const model = require('../frontend/js/season-analysis-model');

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
                SeasonAnalysisModel: model,
                location: { search },
                window: { addEventListener() {} },
                ResizeObserver: class { observe() {} },
                URLSearchParams,
                document: { getElementById: id => id === 'analysis-season' ? select : { addEventListener() {} }, querySelector: () => null, querySelectorAll: () => [] },
                getJSON: async url => {
                    assert.equal(url, `/api/seasons?series=${series}`);
                    return [{ year: 2026 }, { year: 2024 }, { year: 2020 }];
                },
                esc: String,
                setError: (...args) => errors.push(args),
                recordRender: year => { renderedYear = year; }
            };
            // Isolate initialization from chart rendering and network requests.
            const initialization = source.replace(/  async function loadSeason[\s\S]+?(?=  \$\('analysis-season'\)\.addEventListener)/,
                '  async function loadSeason(year) { recordRender(year); }\n');
            vm.runInNewContext(initialization, context);
            await new Promise(resolve => setImmediate(resolve));
            assert.deepEqual(errors, []);
            assert.equal(renderedYear, expected);
        }
    });
}
