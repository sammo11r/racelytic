// Representative WCAG regression sweep. Start Racelytic before running this script.
const { chromium } = require('playwright-core');
const axePath = require.resolve('axe-core/axe.min.js');

const base = process.env.ACCESSIBILITY_AUDIT_URL || 'http://localhost:3000';
const browserPath = process.env.ACCESSIBILITY_AUDIT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const routes = ['/', '/constructors', '/drivers', '/ask', '/community', '/games', '/analysis', '/simulator-overview'];
const viewports = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }];

function conciseViolation(violation) {
  return {
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.slice(0, 5).map(node => node.target.join(' '))
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const report = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', bypassCSP: true });
      for (const route of routes) {
        const page = await context.newPage();
        const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (!response?.ok()) throw new Error(`${route} returned HTTP ${response?.status() || 'unknown'}`);
        await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
        await page.addScriptTag({ path: axePath });
        const result = await page.evaluate(async () => globalThis.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          resultTypes: ['violations']
        }));
        const violations = result.violations.map(conciseViolation);
        report.push({ route, viewport: viewport.name, violations });
        console.log(JSON.stringify({ route, viewport: viewport.name, violations }));
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const blocking = report.flatMap(result => result.violations.map(violation => ({ ...result, violation })))
    .filter(result => ['critical', 'serious'].includes(result.violation.impact));
  console.log(JSON.stringify({ pages: report.length, blockingViolations: blocking.length }));
  if (blocking.length) process.exitCode = 1;
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
