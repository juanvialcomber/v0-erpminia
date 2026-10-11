import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.MOTIL_QA_URL || "https://motil.app";
const output = "test-results/browser";
await mkdir(output, { recursive: true });

const profiles = [
  { name: "desktop", options: { viewport: { width: 1440, height: 900 } } },
  { name: "mobile", options: { ...devices["iPhone 13"] } },
];

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const profile of profiles) {
    const context = await browser.newContext({ ...profile.options, serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      const response = await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.screenshot({ path: `${output}/${profile.name}.png`, fullPage: true });
      const status = response?.status() ?? 0;
      const title = await page.title();
      const ok = status >= 200 && status < 500 && title.trim().length > 0 && errors.length === 0;
      results.push({ profile: profile.name, status, title, errors, result: ok ? "PASS" : "FAIL" });
    } catch (error) {
      results.push({ profile: profile.name, result: "FAIL", error: String(error) });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
for (const result of results) console.log(JSON.stringify(result));
if (results.some(result => result.result !== "PASS")) process.exitCode = 1;
