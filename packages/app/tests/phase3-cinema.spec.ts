/**
 * Phase 3 E2E — code-surface backdrop (#39), backdrop quality ladder (#41).
 */

import { test, expect } from '@playwright/test'

async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({
    timeout: 15000,
  })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
}

test.describe('Code surface backdrop (#39)', () => {
  test('data-stave-backdrop attr flips on + off with backdrop state', async ({
    page,
  }) => {
    await gotoApp(page)

    const panel = page
      .locator('[data-stave-code-panel="true"]')
      .first()
    await expect(panel).toHaveAttribute('data-stave-backdrop', 'off')

    // Activate the hydra tab so its chrome button is mounted, then
    // flip the backdrop on.
    const allTabs = page.locator('[data-workspace-tab]')
    const count = await allTabs.count()
    for (let i = 0; i < count; i++) {
      const text = await allTabs.nth(i).textContent()
      if (text && /\.hydra/.test(text)) {
        await allTabs.nth(i).click()
        break
      }
    }
    const btn = page
      .locator('[data-testid="viz-chrome-bg-toggle"]')
      .first()
    await btn.click()
    await expect(panel).toHaveAttribute('data-stave-backdrop', 'on', {
      timeout: 5000,
    })

    await btn.click()
  })
})

test.describe('Backdrop quality ladder (#41)', () => {
  test('data-backdrop-quality reflects the stored setting', async ({ page }) => {
    // Seed quarter before visiting — backdrop mounts read the value
    // through onBackdropQualityChange subscription, which fires from
    // initial read at subscription time. Setting before load is the
    // most deterministic way to exercise the render path.
    await page.goto('/')
    await page.evaluate(() => {
      window.localStorage.setItem('stave:backdropQuality', 'quarter')
    })
    await page.reload()
    await page.locator('[data-workspace-shell="root"]').waitFor({
      timeout: 15000,
    })
    await page.locator('.monaco-editor').waitFor({ timeout: 15000 })

    // Pin a backdrop via the viz-chrome toggle to exercise the render.
    const allTabs = page.locator('[data-workspace-tab]')
    const count = await allTabs.count()
    for (let i = 0; i < count; i++) {
      const text = await allTabs.nth(i).textContent()
      if (text && /\.hydra/.test(text)) {
        await allTabs.nth(i).click()
        break
      }
    }
    const btn = page
      .locator('[data-testid="viz-chrome-bg-toggle"]')
      .first()
    await btn.click()

    const backdrop = page.locator('[data-workspace-background]').first()
    await expect(backdrop).toBeVisible({ timeout: 5000 })
    await expect(backdrop).toHaveAttribute(
      'data-backdrop-quality',
      'quarter',
    )

    await btn.click()
    await page.evaluate(() => {
      window.localStorage.removeItem('stave:backdropQuality')
    })
  })
})
