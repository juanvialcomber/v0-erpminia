import { expect, test } from "@playwright/test"

// Production: login and read-only menu checks; never store authenticated artifacts.
test.use({ screenshot: "off", trace: "off", video: "off" })

test("Ariel module visibility matches authorized maintenance role", async ({ page }) => {
  test.skip(process.env.MOTIL_QA_EMAIL !== "ariellopez@lapatagua.cl" || !process.env.MOTIL_QA_PASSWORD,
    "Only runs for Ariel with manually supplied secret")
  await page.goto("/auth/login", { waitUntil: "domcontentloaded" })
  await page.locator("#email").fill(process.env.MOTIL_QA_EMAIL!)
  await page.locator("#password").fill(process.env.MOTIL_QA_PASSWORD!)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/, { timeout: 30000 })

  const response = await page.request.get("/api/me/access")
  expect(response.status()).toBe(200)
  const data = await response.json()
  expect(data.isAdmin).toBe(false)
  expect(data.hasCargo).toBe(true)
  expect(["ED", "LEC"]).toContain(data.access?.mant_operaciones)
  const sidebar = page.locator('nav[aria-label]').first()
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByRole("button", { name: /mantenimiento|maintenance/i })).toBeVisible()
  for (const name of [/finanzas|finance/i, /rrhh|recursos humanos|human resources/i]) {
    await expect(sidebar.getByRole("button", { name })).toHaveCount(0)
  }
})
