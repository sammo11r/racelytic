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

const sharedFrontendDependencies = [
    { symbol: 'displayRaceName', provider: '/js/utils.js' },
];
const frontendRoot = path.join(root, 'frontend');
const htmlFiles = fs.readdirSync(frontendRoot, { recursive: true })
    .filter(file => file.endsWith('.html'))
    .map(file => path.join(frontendRoot, file));
const missingDependencies = [];

for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const scriptSources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)]
        .map(match => match[1]);

    for (const dependency of sharedFrontendDependencies) {
        const providerIndex = scriptSources.indexOf(dependency.provider);
        for (const [consumerIndex, source] of scriptSources.entries()) {
            if (!source.startsWith('/js/') || source === dependency.provider) continue;
            const scriptFile = path.join(frontendRoot, source.slice(1).replaceAll('/', path.sep));
            if (!fs.existsSync(scriptFile)) continue;
            const script = fs.readFileSync(scriptFile, 'utf8');
            if (!new RegExp(`\\b${dependency.symbol}\\b`).test(script)) continue;
            if (providerIndex < 0 || providerIndex > consumerIndex) {
                missingDependencies.push(
                    `${path.relative(root, htmlFile)} loads ${source} without loading ${dependency.provider} first (${dependency.symbol})`,
                );
            }
        }
    }
}

if (missingDependencies.length) {
    console.error(`Missing frontend script dependencies:\n${missingDependencies.join('\n')}`);
    process.exit(1);
}

console.log(`Checked ${files.length} JavaScript files, local page links, and shared frontend dependencies.`);
