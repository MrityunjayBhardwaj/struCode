import { describe, it, expect, vi } from 'vitest'
import { BreakpointStore } from '../BreakpointStore'

/**
 * Phase 20-07 (T-α-7) — BreakpointStore unit tests. Covers the engine-
 * attached registry of irNodeIds that pause the scheduler when a hap
 * with that id fires (PK13 step 9).
 *
 * Discipline:
 *  - O(1) Set ops on hot-path `has` (P50; D-03 forbids predicates here).
 *  - addSet preserves existing meta (CONTEXT T5 / R-3) so a gutter-set
 *    lineHint isn't clobbered when the Inspector later toggleSet's the
 *    same id.
 *  - toggleSet treats the input as ONE breakpoint: any-missing → add-all,
 *    all-present → remove-all.
 */
describe('20-07 — BreakpointStore', () => {
  it('add / has / remove are O(1) and consistent', () => {
    const s = new BreakpointStore()
    expect(s.has('a')).toBe(false)
    expect(s.size()).toBe(0)
    s.add('a')
    expect(s.has('a')).toBe(true)
    expect(s.size()).toBe(1)
    s.remove('a')
    expect(s.has('a')).toBe(false)
    expect(s.size()).toBe(0)
  })

  it('toggleSet flips the entire set: any-missing → add-all, all-present → remove-all', () => {
    const s = new BreakpointStore()
    s.toggleSet(['a', 'b', 'c'])
    expect([s.has('a'), s.has('b'), s.has('c')]).toEqual([true, true, true])
    // remove one via the individual remove path
    s.remove('b')
    // toggleSet now sees partial → add all
    s.toggleSet(['a', 'b', 'c'])
    expect([s.has('a'), s.has('b'), s.has('c')]).toEqual([true, true, true])
    // toggleSet again with all present → remove all (treat the set as one breakpoint)
    s.toggleSet(['a', 'b', 'c'])
    expect([s.has('a'), s.has('b'), s.has('c')]).toEqual([false, false, false])
  })

  it('addSet preserves existing meta — lineHint not clobbered by a later call (R-3)', () => {
    const s = new BreakpointStore()
    s.add('a', { lineHint: 5 })
    expect(s.getMeta('a')?.lineHint).toBe(5)
    // addSet on an existing id MUST NOT overwrite its meta — the Inspector's
    // later toggleSet (with the row's resolved lineHint, possibly different)
    // must respect the gutter-captured hint.
    s.addSet(['a', 'b'], { lineHint: 9 })
    expect(s.getMeta('a')?.lineHint).toBe(5) // preserved
    expect(s.getMeta('b')?.lineHint).toBe(9) // applied to newly-added id only
  })

  it('R-3 — getMeta returns lineHint set at registration; undefined when absent', () => {
    const s = new BreakpointStore()
    s.add('with-hint', { lineHint: 7 })
    s.add('no-hint')
    expect(s.getMeta('with-hint')?.lineHint).toBe(7)
    expect(s.getMeta('no-hint')?.lineHint).toBeUndefined()
    expect(s.getMeta('not-registered')).toBeUndefined()
  })

  it('subscribe fires on every change and returns a disposer', () => {
    const s = new BreakpointStore()
    const cb = vi.fn()
    const dispose = s.subscribe(cb)
    s.add('a')
    expect(cb).toHaveBeenCalledTimes(1)
    s.remove('a')
    expect(cb).toHaveBeenCalledTimes(2)
    s.add('b', { lineHint: 1 })
    expect(cb).toHaveBeenCalledTimes(3)
    dispose()
    s.add('c')
    expect(cb).toHaveBeenCalledTimes(3) // disposer worked
  })

  it('listener errors do not block fan-out to other subscribers', () => {
    const s = new BreakpointStore()
    const good1 = vi.fn()
    const bad = vi.fn(() => { throw new Error('boom') })
    const good2 = vi.fn()
    s.subscribe(good1)
    s.subscribe(bad)
    s.subscribe(good2)
    // Should not throw despite middle listener raising.
    expect(() => s.add('a')).not.toThrow()
    expect(good1).toHaveBeenCalledTimes(1)
    expect(bad).toHaveBeenCalledTimes(1)
    expect(good2).toHaveBeenCalledTimes(1)
  })

  it('dispose clears state and listeners', () => {
    const s = new BreakpointStore()
    const cb = vi.fn()
    s.subscribe(cb)
    s.add('a')
    expect(cb).toHaveBeenCalledTimes(1)
    s.dispose()
    expect(s.has('a')).toBe(false)
    expect(s.size()).toBe(0)
    s.add('b') // post-dispose: no listeners, but operation is safe
    expect(cb).toHaveBeenCalledTimes(1) // only the pre-dispose fire
  })
})
