const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    ACADEMY_PAGES,
    ACADEMY_SERIES,
    renderAcademyHtml,
    renderAcademyScript
} = require('../backend/academy-renderer');

const frontend = path.join(__dirname, '..', 'frontend');

test('Academy pages use one explicit series configuration', () => {
    assert.deepEqual(ACADEMY_SERIES, {
        key: 'academy',
        name: 'F1 Academy',
        path: '/academy',
        modeClass: 'academy-mode',
        favicon: '/assets/favicon-academy.svg',
        firstSeason: 2023
    });
    assert.equal(ACADEMY_PAGES[''], 'f3.html');
    assert.equal(ACADEMY_PAGES['championship-builder'], 'f3-championship-builder.html');
});

test('Academy home has Academy anchors, account context and current copy', () => {
    const source = fs.readFileSync(path.join(frontend, ACADEMY_PAGES['']), 'utf8');
    const rendered = renderAcademyHtml(ACADEMY_PAGES[''], source);
    const main = rendered.match(/<main>[\s\S]*?<\/main>/)?.[0] || '';

    assert.match(main, /href="#academy-archive"/);
    assert.match(main, /id="academy-archive"/);
    assert.match(main, /href="\/account\?series=academy"/);
    assert.match(main, /Explore dedicated season, race, driver, team and circuit pages/);
    assert.doesNotMatch(main, /#f3-archive|series=f3|the next step/i);
    assert.doesNotMatch(main, /sprint and feature/i);
});

test('every Academy page removes stale F3 format copy', () => {
    const forbidden = /sprint and feature|feature and sprint|sprint races and feature races|two Dallara generations|the next step|tools planned|preview the simulation/i;

    for (const file of new Set(Object.values(ACADEMY_PAGES))) {
        const source = fs.readFileSync(path.join(frontend, file), 'utf8');
        const rendered = renderAcademyHtml(file, source);
        if (/rel="icon"/.test(source)) assert.match(rendered, /\/assets\/favicon-academy\.svg/, file);
        assert.doesNotMatch(rendered, /series=f3|#f3-archive/, file);
        assert.doesNotMatch(rendered, forbidden, file);
    }
});

test('Academy scripts request Academy data and generate Academy links', () => {
    for (const file of fs.readdirSync(path.join(frontend, 'js')).filter(name => /^f3(?:-|\.)/.test(name))) {
        const source = fs.readFileSync(path.join(frontend, 'js', file), 'utf8');
        const rendered = renderAcademyScript(source);
        assert.doesNotMatch(rendered, /series=f3|href="\/f3|`\/f3|['"]\/f3\//, file);
        if (/series=f3|\/f3\//.test(source)) assert.match(rendered, /series=academy|\/academy\//, file);
    }
});
