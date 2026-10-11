import { test, expect } from "@playwright/test"

// Manual, read-only authenticated smoke against the deployed application.
// Never persist storage state, screenshots, traces or video containing sessions.
test.use({ screenshot: "off", trace: "off", video: "off" })

test("QA role signs in and sees dashboard", async ({ page }) => {
  test.skip(!process.env.MOTIL_QA_EMAIL || !process.env.MOTIL_QA_PASSWORD, "Manual QA only: credentials are not supplied to standard CI")
  const email = process.env.MOTIL_QA_EMAIL
  const password = process.env.MOTIL_QA_PASSWORD
  if (!email || !password) throw new Error("Missing MOTIL QA credentials in Actions secrets")
  await page.goto("/auth/login", { waitUntil: "domcontentloaded" })
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/, { timeout: 30000 })
  await expect(page.locator("body")).toBeVisible()
})
