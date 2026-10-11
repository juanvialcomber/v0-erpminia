import { expect, test } from "@playwright/test"

// Safe against production: only login (existing approved flow), navigation and DOM assertions.
// Never persist screenshots, traces, videos or authenticated session state.
test.use({ screenshot: "off", trace: "off", video: "off" })

test("role dashboard is accessible and navigation is readable", async ({ page }) => {
  test.skip(!process.env.MOTIL_QA_EMAIL || !process.env.MOTIL_QA_PASSWORD,
    "Requires manually triggered QA credentials")

  const email = process.env.MOTIL_QA_EMAIL!
  const password = process.env.MOTIL_QA_PASSWORD!

  await page.goto("/auth/login", { waitUntil: "domcontentloaded" })
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/, { timeout: 30000 })

  await expect(page.locator("body")).toBeVisible()
  await expect(page.locator("main").first()).toBeVisible()

  const links = page.locator('a[href^="/"]:visible')
  const visibleLinks = await links.count()
  expect(visibleLinks, "Expected visible internal navigation links").toBeGreaterThan(0)

  // Assert no horizontal page overflow on mobile or desktop.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow, "The dashboard should not overflow horizontally").toBeLessThanOrEqual(2)

  // Do not click action buttons, navigate to write endpoints or create real OTs.
})
