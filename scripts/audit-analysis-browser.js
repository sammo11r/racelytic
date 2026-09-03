// Read-only browser regression sweep. Uses a separate headless browser profile.
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ANALYSIS_AUDIT_URL || 'http://localhost:3002';
const output = path.resolve('tmp/analysis-audit');
const pages = ['analysis', 'season-analysis', 'season-comparison', 'race-analysis', 'driver-comparison', 'driver-form', 'teammate-battles', 'circuit-analysis', 'records'];
const report = [];
const pause = page => page.waitForLoadState('networkidle', { timeout: 25000 });

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.ANALYSIS_AUDIT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    await Promise.all(['', '/f2', '/f3', '/academy'].map(async prefix => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
      for (const slug of pages) {
        const page = await context.newPage(), result = { route: `${prefix}/${slug}`, errors: [], failures: [], tabs: [], links: [], snapshots: [] };
        const series = prefix.slice(1) || 'f1';
        page.on('pageerror', error => result.errors.push(error.message));
        page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) result.failures.push(`${response.status()} ${response.url()}`); });
        try {
          const response = await page.goto(`${base}${result.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
          if (response.status() !== 200) result.errors.push(`Page HTTP ${response.status()}`);
          await pause(page);
          const decline = page.getByRole('button', { name: 'Decline', exact: true });
          if (await decline.isVisible()) await decline.click();
          result.title = await page.title();
          result.initial = await page.locator('main').innerText();
          if (!result.initial.trim()) result.errors.push('Empty main content');
          if (/\b(?:undefined|NaN)\b/.test(result.initial)) result.errors.push('Rendered undefined / NaN');
          if (/Unable to (?:load|compare)|Database request failed|could not be loaded/.test(result.initial)) result.errors.push('Visible load error');
          result.links = await page.locator('main a[href]').evaluateAll(links => links.map(link => link.getAttribute('href')).filter(href => href.startsWith('/')));
          if (prefix) {
            const cross = result.links.filter(href => /^\/(?:analysis|season|race|driver|circuit|constructor|team)(?:[/?#-]|$)/.test(href));
            if (cross.length) result.errors.push(`Links leave series: ${cross.slice(0, 5).join(', ')}`);
          }
          const tabs = page.getByRole('tab');
          for (let index = 0; index < await tabs.count(); index++) {
            const tab = tabs.nth(index);
            if (!await tab.isVisible()) continue;
            const label = await tab.innerText();
            await tab.click(); await pause(page);
            if (await tab.getAttribute('aria-selected') !== 'true') result.errors.push(`Tab did not activate: ${label}`);
            const panel = await tab.getAttribute('aria-controls');
            if (panel && !await page.locator(`[id="${panel}"]`).isVisible()) result.errors.push(`Tab panel hidden: ${label}`);
            result.tabs.push(label);
          }
          // Exercise a data-changing control after tab navigation.
          const controlIds = { 'season-analysis': 'analysis-season', 'race-analysis': 'race-analysis-year', records: 'fr-category', 'driver-form': 'form-range' };
          const id = controlIds[slug];
          if (id) {
            const control = page.locator(`#${id}`);
            const values = await control.locator('option').evaluateAll(options => options.filter(option => !option.disabled && option.value).map(option => option.value));
            if (values.length > 1) { await control.selectOption(values[1]); await pause(page); result.changedControl = id; }
          }
          result.finalUrl = page.url();
          result.statuses = await page.locator('main [role="status"], main [id$="status"]').allTextContents();
          const content = await page.locator('main').innerText();
          if (/\b(?:undefined|NaN)\b|Unable to (?:load|compare)|Database request failed|could not be loaded/.test(content)) result.errors.push('Error after interaction');
          if (series === 'f1') { const file = `${series}-${slug}-desktop.png`; await page.screenshot({ path: path.join(output, file) }); result.snapshots.push(file); }
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(200);
          result.mobileViews = [];
          const mobileSelects = page.locator('main .analysis-mobile-view select');
          for (let index = 0; index < await mobileSelects.count(); index++) {
            const select = mobileSelects.nth(index);
            if (!await select.isVisible()) continue;
            const values = await select.locator('option').evaluateAll(options => options.filter(option => !option.disabled).map(option => option.value));
            for (const value of values) {
              await select.selectOption(value); await pause(page);
              result.mobileViews.push(value);
              const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
              if (overflow) result.errors.push(`Mobile overflow in view ${value}`);
            }
          }
          result.mobile = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
          if (result.mobile.page > result.mobile.viewport + 1) result.errors.push(`Mobile overflow: ${result.mobile.page}/${result.mobile.viewport}`);
          if (slug !== 'analysis' && (series === 'academy' || result.errors.length)) { const file = `${series}-${slug}-mobile.png`; await page.screenshot({ path: path.join(output, file) }); result.snapshots.push(file); }
        } catch (error) { result.errors.push(error.message); }
        result.initial = result.initial?.slice(0, 500);
        report.push(result);
        console.log(JSON.stringify({ route: result.route, errors: result.errors, failures: result.failures, tabs: result.tabs.length, mobile: result.mobile }));
        await page.close();
      }
      await context.close();
    }));
    const links = [...new Set(report.flatMap(result => result.links))], brokenLinks = [];
    const queue = [...links];
    await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) { const href = queue.shift(); try { const response = await fetch(new URL(href, base)); if (!response.ok) brokenLinks.push({ href, status: response.status }); } catch (error) { brokenLinks.push({ href, error: error.message }); } } }));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ base, checkedAt: new Date().toISOString(), pages: report, linksChecked: links.length, brokenLinks }, null, 2));
    console.log(JSON.stringify({ routes: report.length, routesWithIssues: report.filter(result => result.errors.length || result.failures.length).length, linksChecked: links.length, brokenLinks }));
    if (report.some(result => result.errors.length || result.failures.length) || brokenLinks.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
