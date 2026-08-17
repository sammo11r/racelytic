const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sourceRoots = ['backend', 'frontend/js', 'scripts', 'test'];
const files = sourceRoots.flatMap(directory => {
    const full = path.join(root, directory);
    return fs.readdirSync(full, { recursive: true })
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(full, file));
});

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}

const legacyLinks = [];
for (const file of files.filter(file => file.includes(`${path.sep}frontend${path.sep}js${path.sep}`))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?<![a-z0-9/-])\/[a-z-]+\.html/gi)) {
        legacyLinks.push(`${path.relative(root, file)} -> ${match[0]}`);
    }
}

if (legacyLinks.length) {
    console.error(`Public links must not include .html:\n${legacyLinks.join('\n')}`);
    process.exit(1);
}

console.log(`Checked ${files.length} JavaScript files and local page links.`);
