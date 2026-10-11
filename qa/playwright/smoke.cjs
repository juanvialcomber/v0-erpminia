const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { URL } = require('node:url');

(async () => {
  const target = process.env.MOTIL_QA_URL || 'https://motil.app';
  const origin = new URL(target);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') throw new Error('Only HTTPS or localhost allowed');
  await fs.mkdir('qa/playwright/artifacts', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'mobile' }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const response = await page.goto(new URL('/login', origin).toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      assert(response, 'Login request did not return HTTP response');
      assert(response.status() < 500, 'Login page returned server error: ' + response.status());
      await page.screenshot({ path: 'qa/playwright/artifacts/login-' + viewport.name + '.png', fullPage: true });
      assert((await page.locator('body').innerText()).trim().length > 0, 'Login screen rendered an empty body');
      console.log('PASS login ' + viewport.name + ': HTTP ' + response.status());
      await context.close();
    }
    if (process.env.MOTIL_QA_HSE_OT === '1') {
    const context = await browser.newContext();
    const response = await context.request.get(new URL('/api/sostenibilidad/corrective-actions/work-orders?correctiveActionId=00000000-0000-4000-8000-000000000001', origin).toString(), { maxRedirects: 0 });
    assert([401, 403, 302, 307, 308].includes(response.status()), 'Unauthenticated HSE OT endpoint unexpectedly returned ' + response.status());
    console.log('PASS unauthenticated HSE OT access: HTTP ' + response.status());
    await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
