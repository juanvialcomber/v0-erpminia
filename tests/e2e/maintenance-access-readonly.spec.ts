import { expect, test } from "@playwright/test"

// Production-safe: only GET requests, login, and page navigation.
// No storageState, screenshots, traces, or video of authenticated pages.
test.use({ screenshot: "off", trace: "off", video: "off" })

test("authenticated module matrix and maintenance read-only", async ({ page }) => {
  test.skip(!process.env.MOTIL_QA_EMAIL || !process.env.MOTIL_QA_PASSWORD, "Manual secrets required")

  await page.goto("/auth/login", { waitUntil: "domcontentloaded" })
  await page.locator("#email").fill(process.env.MOTIL_QA_EMAIL!)
  await page.locator("#password").fill(process.env.MOTIL_QA_PASSWORD!)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/, { timeout: 30000 })

  const access = await page.request.get("/api/me/access", { failOnStatusCode: false })
  expect(access.status(), "Authenticated access matrix must respond").toBe(200)
  const data = await access.json()
  expect(typeof data.isAdmin).toBe("boolean")
  expect(typeof data.hasCargo).toBe("boolean")
  expect(typeof data.access).toBe("object")
  expect(data.access).not.toBeNull()
  for (const value of Object.values(data.access as Record<string, unknown>)) {
    expect(["ED", "LEC", "SR"]).toContain(value)
  }

  const maintenance = await page.goto("/dashboard/mantenimiento", { waitUntil: "domcontentloaded" })
  expect(maintenance?.status(), "Maintenance route must not fail on server").toBeLessThan(500)
  await expect(page.locator("main").first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(2)
})
