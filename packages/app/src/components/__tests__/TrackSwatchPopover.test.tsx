/**
 * TrackSwatchPopover — Phase 20-12 β-6 unit tests.
 *
 * Coverage matches plan §4 β-6 PART C:
 *   - 32 swatches in 8×4 grid
 *   - swatch click → onPick(color) THEN onClose()
 *   - outside-click → onClose
 *   - Escape → onClose
 *   - aria-current set on the matching currentColor swatch
 *
 * The deferred-attach pattern (mirroring BackdropPopover.tsx:48-68) is
 * verified by checking the listener doesn't fire on the same tick as the
 * mount.
 */

import { describe, it, expect, vi } from 'vitest'
import { act, render, cleanup, fireEvent } from '@testing-library/react'
import { afterEach } from 'vitest'
import { TrackSwatchPopover } from '../TrackSwatchPopover'
import { TRACK_PALETTE_32 } from '../musicalTimeline/colors'

afterEach(() => {
  cleanup()
})

function fakeRect(): DOMRect {
  return {
    top: 100,
    bottom: 112,
    left: 50,
    right: 62,
    width: 12,
    height: 12,
    x: 50,
    y: 100,
    toJSON: () => ({}),
  } as DOMRect
}

describe('20-12 β-6 — TrackSwatchPopover', () => {
  it('renders 32 swatches in an 8×4 grid', () => {
    const { container } = render(
      <TrackSwatchPopover
        anchorRect={fakeRect()}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const swatches = container.querySelectorAll(
      '[data-musical-timeline="swatch-cell"]',
    )
    expect(swatches).toHaveLength(32)
    expect(TRACK_PALETTE_32).toHaveLength(32)
    // Confirm each color from the palette appears in order.
    swatches.forEach((sw, i) => {
      expect(sw.getAttribute('data-color')).toBe(TRACK_PALETTE_32[i])
    })
  })

  it('clicking a swatch calls onPick(color) then onClose() (commit-on-click, not mousemove)', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    const { container } = render(
      <TrackSwatchPopover
        anchorRect={fakeRect()}
        onPick={onPick}
        onClose={onClose}
      />,
    )
    const target = container.querySelector<HTMLButtonElement>(
      `[data-color="${TRACK_PALETTE_32[5]}"]`,
    )
    fireEvent.click(target!)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(TRACK_PALETTE_32[5])
    expect(onClose).toHaveBeenCalledTimes(1)
    // onPick fired before onClose (write storm guard — we don't fire on
    // mousemove, only on commit).
    expect(onPick.mock.invocationCallOrder[0]).toBeLessThan(
      onClose.mock.invocationCallOrder[0],
    )
  })

  it('outside-click closes (after deferred-attach tick)', async () => {
    vi.useFakeTimers()
    try {
      const onClose = vi.fn()
      render(
        <TrackSwatchPopover
          anchorRect={fakeRect()}
          onPick={vi.fn()}
          onClose={onClose}
        />,
      )
      // Same-tick mousedown should NOT close (deferred-attach pattern).
      act(() => {
        document.body.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true }),
        )
      })
      expect(onClose).not.toHaveBeenCalled()
      // Advance the setTimeout(0) — the listener attaches.
      act(() => {
        vi.advanceTimersByTime(1)
      })
      // Now an outside mousedown closes.
      act(() => {
        document.body.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true }),
        )
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Escape closes', () => {
    const onClose = vi.fn()
    render(
      <TrackSwatchPopover
        anchorRect={fakeRect()}
        onPick={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('aria-current="true" is set on the matching currentColor swatch', () => {
    const target = TRACK_PALETTE_32[10]
    const { container } = render(
      <TrackSwatchPopover
        anchorRect={fakeRect()}
        currentColor={target}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const matching = container.querySelector(
      `[data-color="${target}"][aria-current="true"]`,
    )
    expect(matching).not.toBeNull()
    // No other swatch has aria-current=true.
    const allCurrent = container.querySelectorAll('[aria-current="true"]')
    expect(allCurrent).toHaveLength(1)
  })
})
