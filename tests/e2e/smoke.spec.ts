import { test, expect } from "@playwright/test"

// Read-only: these checks never submit forms, create orders, or change production data.
test("application responds without server failure", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" })
  expect(response, "Expected an HTTP response").not.toBeNull()
  expect(response!.status()).toBeLessThan(500)
  await expect(page.locator("body")).toBeVisible()
})

test("login route responds without server failure", async ({ page }) => {
  const response = await page.goto("/login", { waitUntil: "domcontentloaded" })
  expect(response).not.toBeNull()
  expect(response!.status()).toBeLessThan(500)
  await expect(page.locator("body")).toBeVisible()
})
