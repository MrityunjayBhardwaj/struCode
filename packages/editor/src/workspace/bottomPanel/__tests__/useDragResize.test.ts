/**
 * useDragResize math tests — Phase 20-01 PR-A T-05.
 *
 * jsdom does not propagate clientY through synthetic PointerEvents
 * reliably (Trap 10), so the integration is asserted in Playwright
 * (T-10). These tests cover the PURE math composition: computeNewHeight
 * is the y-inversion math (drag UP increases height); clampHeight is
 * the bounds fence shared with the persistence reader.
 */

import { describe, it, expect } from 'vitest'

import {
  clampHeight,
  BOTTOM_PANEL_HEIGHT_MIN,
  BOTTOM_PANEL_HEIGHT_MAX,
} from '../persistence'
import { computeNewHeight } from '../BottomPanel'

describe('computeNewHeight (drag inversion math)', () => {
  it('drag UP 20px increases height by 20', () => {
    expect(computeNewHeight(100, 80, 240)).toBe(260)
  })

  it('drag DOWN 20px decreases height by 20', () => {
    expect(computeNewHeight(100, 120, 240)).toBe(220)
  })

  it('zero delta returns startHeight unchanged', () => {
    expect(computeNewHeight(100, 100, 240)).toBe(240)
  })

  it('large negative delta produces large positive height', () => {
    // user dragged 500px UP from y=600 to y=100
    expect(computeNewHeight(600, 100, 240)).toBe(740)
  })
})

describe('computeNewHeight + clampHeight composition', () => {
  it('drag down past MIN clamps to MIN', () => {
    // start 240; drag DOWN by 500 -> raw -260; clamp -> 80
    const raw = computeNewHeight(100, 600, 240)
    expect(raw).toBe(-260)
    expect(clampHeight(raw)).toBe(BOTTOM_PANEL_HEIGHT_MIN)
  })

  it('drag up past MAX clamps to MAX', () => {
    // start 500; drag UP by 1000 -> raw 1500; clamp -> 600
    const raw = computeNewHeight(1000, 0, 500)
    expect(raw).toBe(1500)
    expect(clampHeight(raw)).toBe(BOTTOM_PANEL_HEIGHT_MAX)
  })

  it('1px jitter near boundary stays clamped, no oscillation', () => {
    // start at MIN; jitter +/-1 in raw space; clamp keeps at MIN.
    expect(clampHeight(BOTTOM_PANEL_HEIGHT_MIN - 1)).toBe(
      BOTTOM_PANEL_HEIGHT_MIN,
    )
    expect(clampHeight(BOTTOM_PANEL_HEIGHT_MIN + 1)).toBe(
      BOTTOM_PANEL_HEIGHT_MIN + 1,
    )
    // start at MAX; jitter
    expect(clampHeight(BOTTOM_PANEL_HEIGHT_MAX + 1)).toBe(
      BOTTOM_PANEL_HEIGHT_MAX,
    )
    expect(clampHeight(BOTTOM_PANEL_HEIGHT_MAX - 1)).toBe(
      BOTTOM_PANEL_HEIGHT_MAX - 1,
    )
  })
})
