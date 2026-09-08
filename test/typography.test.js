const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const stylesheet = fs.readFileSync(path.join(root, 'frontend', 'css', 'style.css'), 'utf8');
const fontsDirectory = path.join(root, 'frontend', 'assets', 'fonts');

const fontFiles = [
    'InterVariable.woff2',
    'BarlowCondensed-Bold.woff2',
    'BarlowCondensed-ExtraBold.woff2',
    'BarlowCondensed-Black.woff2',
];

test('self-hosted Inter and Barlow Condensed font files are valid WOFF2 assets', () => {
    for (const filename of fontFiles) {
        const font = fs.readFileSync(path.join(fontsDirectory, filename));
        assert.equal(font.subarray(0, 4).toString('ascii'), 'wOF2', `${filename} is not a WOFF2 file`);
    }
});

test('global typography uses Inter for UI and Barlow Condensed for display type', () => {
    assert.match(stylesheet, /--font-body:\s*"Inter"/);
    assert.match(stylesheet, /--font-display:\s*"Barlow Condensed"/);
    assert.match(stylesheet, /body\s*\{[\s\S]*?font-family:\s*var\(--font-body\)/);
    assert.match(stylesheet, /h1,\s*h2,\s*h3,\s*\.brand\s*\{\s*font-family:\s*var\(--font-display\)/);

    for (const filename of fontFiles) {
        assert.match(stylesheet, new RegExp(`/assets/fonts/${filename.replace('.', '\\.')}`));
    }
});

test('bundled font licenses are retained alongside the font assets', () => {
    for (const filename of ['Inter-OFL.txt', 'Barlow-OFL.txt']) {
        const license = fs.readFileSync(path.join(fontsDirectory, 'licenses', filename), 'utf8');
        assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
    }
});
