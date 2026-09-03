const { chromium } = require('playwright-core');
const fs = require('node:fs');
const base = process.env.ANALYSIS_AUDIT_URL || 'http://localhost:3002';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ANALYSIS_AUDIT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const results = [];
  try {
    for (const prefix of ['', '/f2', '/f3', '/academy']) {
      const page = await browser.newPage();
      await page.goto(`${base}${prefix}/race-analysis`); await page.waitForLoadState('networkidle');
      await page.route('**/api/races/*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Audit: simulated data outage' }) }));
      const values = await page.locator('#race-analysis-year option').evaluateAll(options => options.map(option => option.value));
      await page.locator('#race-analysis-year').selectOption(values[1]);
      await page.waitForFunction(() => document.querySelector('#race-analysis-status').textContent.includes('Audit: simulated data outage'), null, { timeout: 10000 });
      const result = await page.evaluate(() => ({ status: document.querySelector('#race-analysis-status').textContent, statusHidden: document.querySelector('#race-analysis-status').hidden, workspaceHidden: document.querySelector('#race-analysis-workspace').hidden }));
      result.route = `${prefix}/race-analysis`; result.passed = result.status.includes('Audit: simulated data outage') && !result.statusHidden && result.workspaceHidden;
      await page.unroute('**/api/races/*');
      await page.locator('#race-analysis-year').selectOption(values[0]);
      await page.waitForFunction(() => !document.querySelector('#race-analysis-workspace').hidden && document.querySelector('#race-analysis-status').hidden, null, { timeout: 15000 });
      result.recovered = true;
      results.push(result); console.log(JSON.stringify(result)); await page.close();
    }
    fs.writeFileSync('tmp/analysis-audit/resilience.json', JSON.stringify(results, null, 2));
    if (results.some(result => !result.passed)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
