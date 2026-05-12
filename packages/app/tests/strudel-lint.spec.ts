/**
 * F-2 — Strudel `.p("...")` double-quote lint, Playwright integration.
 *
 * Verifies the Monaco marker actually shows up in the live editor (not
 * just in unit tests). Probes `monaco.editor.getModelMarkers({ owner:
 * 'stave-strudel-lint' })` after setting source.
 */

import { test, expect, type Page } from '@playwright/test'

async function setupShell(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (
      window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }
    ).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => {
        getLanguageId?: () => string
        setValue: (s: string) => void
      } | null
      focus: () => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ??
      editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(250)
}

async function getLintMarkers(
  page: Page,
): Promise<{ count: number; messages: string[]; codes: string[] }> {
  return await page.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: {
          editor?: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getModelMarkers?: (opts: { owner: string }) => any[]
          }
        }
      }
    ).monaco
    const ms =
      monaco?.editor?.getModelMarkers?.({ owner: 'stave-strudel-lint' }) ?? []
    return {
      count: ms.length,
      messages: ms.map((m) => String(m.message ?? '')),
      codes: ms.map((m) => String(m.code ?? '')),
    }
  })
}

test.describe('F-2 — Strudel .p("...") double-quote lint', () => {
  test('flags `.p("kick")` (double quotes) with a Warning marker', async ({
    page,
  }) => {
    await setupShell(page)
    await setStrudelCode(page, '$: s("bd*4").p("kick")')

    const before = await getLintMarkers(page)
    expect(before.count).toBe(1)
    expect(before.codes).toContain('strudel/p-double-quoted')
    expect(before.messages[0]).toMatch(/single quotes/)
  })

  test("does NOT flag `.p('kick')` (single quotes — working idiom)", async ({
    page,
  }) => {
    await setupShell(page)
    await setStrudelCode(page, "$: s(\"bd*4\").p('kick')")

    const markers = await getLintMarkers(page)
    expect(markers.count).toBe(0)
  })

  test('marker clears live when user rewrites double → single quotes', async ({
    page,
  }) => {
    await setupShell(page)
    await setStrudelCode(page, '$: s("bd*4").p("kick")')
    const bad = await getLintMarkers(page)
    expect(bad.count).toBe(1)

    await setStrudelCode(page, "$: s(\"bd*4\").p('kick')")
    const good = await getLintMarkers(page)
    expect(good.count).toBe(0)
  })
})
