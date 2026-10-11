const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const email = process.env.MOTIL_QA_EMAIL;
  const password = process.env.MOTIL_QA_PASSWORD;
  assert(email && password, 'Required protected QA secrets are not configured');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ baseURL: 'https://motil.app', acceptDownloads: false, serviceWorkers: 'block' });
    const page = await context.newPage();
    // Never log response bodies, cookies, storage state or credentials.
    await page.goto('https://motil.app/auth/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.origin === 'https://motil.app' && !url.pathname.startsWith('/auth/login'), { timeout: 25000 });
    const access = await page.request.get('https://motil.app/api/me/access');
    assert.equal(access.status(), 200, 'Authenticated access endpoint did not return 200');
    // The test is intentionally read-only. No screenshots, traces or session-state exports.
    console.log('PASS authorized MOTIL login and read-only session check');
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
