const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const { findBrowserExecutable } = require('./import-f2-results');

async function generateSocialCard() {
    const source = path.resolve(__dirname, '../frontend/assets/social-card.svg');
    const target = path.resolve(__dirname, '../frontend/assets/social-card.png');
    const browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
        await page.goto(pathToFileURL(source).href);
        await page.screenshot({ path: target, type: 'png' });
    } finally {
        await browser.close();
    }
    console.log(`Generated ${path.relative(process.cwd(), target)} (1200x630).`);
}

if (require.main === module) {
    generateSocialCard().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { generateSocialCard };
