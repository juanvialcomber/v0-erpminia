import { test, expect } from "@playwright/test"

/**
 * Optional authenticated smoke test.
 * Set MOTIL_QA_STORAGE_STATE to an isolated Playwright storage-state JSON path.
 * It is intentionally excluded from regular CI until safe QA accounts exist.
 * No create, update, approve, close, upload, or delete operations are performed.
 */
test.describe("authenticated read-only QA", () => {
  test.skip(!process.env.MOTIL_QA_STORAGE_STATE, "Isolated QA session has not been configured")

  test.use({
    storageState: process.env.MOTIL_QA_STORAGE_STATE || { cookies: [], origins: [] },
  })

  test("authenticated landing page loads without server error", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" })
    expect(response).not.toBeNull()
    expect(response!.status()).toBeLessThan(500)
    await expect(page.locator("body")).toBeVisible()
  })

  test("browser connection can be interrupted and restored without a write", async ({ page, context }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await context.setOffline(true)
    try {
      await expect(page.locator("body")).toBeVisible()
    } finally {
      await context.setOffline(false)
    }
    const response = await page.reload({ waitUntil: "domcontentloaded" })
    expect(response).not.toBeNull()
    expect(response!.status()).toBeLessThan(500)
  })
})
