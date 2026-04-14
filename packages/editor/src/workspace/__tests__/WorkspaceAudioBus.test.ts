/**
 * WorkspaceAudioBus — unit tests (Phase 10.2 Task 02).
 *
 * Covers the full multi-publisher matrix from PLAN.md §10.2-02 acceptance
 * criteria + RESEARCH §6 test 2.
 *
 * Synchronous-fire / lifecycle (krama):
 * - subscribe fires SYNC with current state before returning the unsubscribe
 * - subscribe with no publishers fires once with `null`
 * - subscribe to a non-existent file id fires once with `null`
 * - subscribe with `'none'` fires once with `null` and never again
 *
 * Multi-publisher coexistence (D-02):
 * - publishing B then A leaves both registered (not stomped)
 * - listSources returns both with `playing: true`
 *
 * Default-tracker semantics:
 * - publishing A: default-trackers see A
 * - publishing B after A: default-trackers see B (most-recent-wins)
 * - unpublishing B: default-trackers fall through to A (NOT null)
 * - unpublishing the only publisher: default-trackers see `null`
 * - unpublishing a non-default source does NOT fire default-trackers
 *
 * Pinned (file-specific) subscriber semantics:
 * - pinned to A only fires for A's events, never B's
 * - pinned to A sees `null` when A unpublishes
 * - re-publishing the same payload (same component refs) does NOT re-fire
 *   pinned subscribers
 *
 * Identity contract (D-01):
 * - re-publish with the SAME slot refs is a no-op (no callback fire,
 *   no source list change)
 * - re-publish with DIFFERENT slot refs replaces the entry and fires
 *   pinned subscribers (and default-trackers if it was the most-recent)
 *
 * Source listing & onSourcesChanged:
 * - listSources returns `{ sourceId, label, playing }` per publisher
 * - onSourcesChanged fires once on a new publisher publish
 * - onSourcesChanged fires once on unpublish
 * - onSourcesChanged does NOT fire on payload-replacement re-publish
 *
 * Unsubscribe cleanup:
 * - after unsubscribe, the callback never fires again
 * - calling unsubscribe twice is safe (idempotent)
 * - unsubscribing one subscriber does not affect siblings
 *
 * Consume (sync read without subscribe):
 * - consume({ kind: 'default' }) tracks recency
 * - consume({ kind: 'file', fileId }) returns specific publisher
 * - consume({ kind: 'none' }) returns null
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  workspaceAudioBus,
  __resetWorkspaceAudioBusForTests,
} from '../WorkspaceAudioBus'
import type { AudioPayload } from '../types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build an `AudioPayload` whose component slots are unique sentinel objects.
 * Two payloads built from this helper with the same `tag` are NOT
 * reference-equal — every call mints fresh sentinel refs. This is what
 * lets the identity-contract tests distinguish "same publisher, new
 * payload" (different refs) from "same publisher, same payload" (same
 * refs).
 *
 * The sentinels are typed as `unknown as ...` because we don't need real
 * audio nodes for the tests — the bus only ever compares them by reference,
 * never reads any property.
 */
function makePayload(tag: string): AudioPayload {
  return {
    hapStream: { __tag: `${tag}-hap` } as unknown as AudioPayload['hapStream'],
    analyser: {
      __tag: `${tag}-analyser`,
    } as unknown as AudioPayload['analyser'],
    scheduler: {
      __tag: `${tag}-scheduler`,
    } as unknown as AudioPayload['scheduler'],
    inlineViz: {
      __tag: `${tag}-inlineViz`,
    } as unknown as AudioPayload['inlineViz'],
    audio: { __tag: `${tag}-audio` } as unknown as AudioPayload['audio'],
  }
}

describe('WorkspaceAudioBus', () => {
  beforeEach(() => {
    __resetWorkspaceAudioBusForTests()
  })

  // -------------------------------------------------------------------------
  // Synchronous-fire / lifecycle (krama)
  // -------------------------------------------------------------------------

  describe('synchronous initial fire', () => {
    it('fires the callback SYNC before subscribe returns, with current state', () => {
      const cb = vi.fn()
      // Order is load-bearing: assert that cb was called BEFORE we even
      // capture the unsubscribe handle. The mock count after subscribe
      // returns is the test.
      const unsubscribe = workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(null)
      unsubscribe()
    })

    it('fires `null` for default with no publishers', () => {
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      expect(cb).toHaveBeenCalledWith(null)
    })

    it('fires `null` for a file ref that has no publisher yet', () => {
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'ghost' }, cb)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(null)
    })

    it('fires the existing payload for default when a publisher is already on the bus', () => {
      const a = makePayload('a')
      workspaceAudioBus.publish('a', a)
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(a)
    })

    it('fires the existing payload for a pinned subscribe to an active publisher', () => {
      const a = makePayload('a')
      workspaceAudioBus.publish('a', a)
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'a' }, cb)
      expect(cb).toHaveBeenCalledWith(a)
    })

    it('fires `null` once for `{ kind: "none" }` and never again', () => {
      const a = makePayload('a')
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'none' }, cb)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(null)
      // No further events ever, regardless of bus activity.
      workspaceAudioBus.publish('a', a)
      workspaceAudioBus.unpublish('a')
      expect(cb).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // Multi-publisher coexistence (D-02)
  // -------------------------------------------------------------------------

  describe('multi-publisher coexistence', () => {
    it('keeps both publishers registered when two arrive in sequence', () => {
      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('a', a)
      workspaceAudioBus.publish('b', b)

      expect(workspaceAudioBus.consume({ kind: 'file', fileId: 'a' })).toBe(a)
      expect(workspaceAudioBus.consume({ kind: 'file', fileId: 'b' })).toBe(b)
    })

    it('publishing one source does not stomp another', () => {
      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('a', a)
      workspaceAudioBus.publish('b', b)

      // 'a' is still on the bus despite 'b' arriving.
      const sources = workspaceAudioBus.listSources()
      expect(sources.map((s) => s.sourceId).sort()).toEqual(['a', 'b'])
    })
  })

  // -------------------------------------------------------------------------
  // Default-tracker semantics
  // -------------------------------------------------------------------------

  describe('default-tracker semantics (most-recent-wins + fall-through)', () => {
    it('default-tracker snaps to a new publisher', () => {
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      cb.mockClear() // discard the synchronous-fire null

      const a = makePayload('a')
      workspaceAudioBus.publish('a', a)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(a)
    })

    it('publishing B after A makes B the new default', () => {
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      cb.mockClear()

      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('a', a)
      workspaceAudioBus.publish('b', b)

      // Two events: first A becomes default, then B replaces.
      expect(cb).toHaveBeenCalledTimes(2)
      expect(cb).toHaveBeenNthCalledWith(1, a)
      expect(cb).toHaveBeenNthCalledWith(2, b)
    })

    it('unpublishing the most-recent falls through to the next-most-recent (NOT null)', () => {
      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('a', a)
      workspaceAudioBus.publish('b', b) // B is now most-recent

      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      cb.mockClear() // discard the synchronous fire (B)

      workspaceAudioBus.unpublish('b')
      // Default-tracker must see A again, NOT null. This is the
      // pre-mortem secondary failure that breaks if recency is treated
      // as a single slot.
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(a)
    })

    it('unpublishing the only publisher fires default-trackers with `null`', () => {
      const a = makePayload('a')
      workspaceAudioBus.publish('a', a)

      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      cb.mockClear()

      workspaceAudioBus.unpublish('a')
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(null)
    })

    it('unpublishing a NON-default source does NOT fire default-trackers', () => {
      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('a', a)
      workspaceAudioBus.publish('b', b) // B most-recent

      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      cb.mockClear()

      workspaceAudioBus.unpublish('a') // A is not the default — no fire
      expect(cb).not.toHaveBeenCalled()
      // B is still the default.
      expect(workspaceAudioBus.consume({ kind: 'default' })).toBe(b)
    })

    it('default-tracker after subscribe + complex sequence ends in correct state', () => {
      // Full pre-mortem scenario: A → B → unpublish B → C → unpublish A
      // → unpublish C
      const events: Array<AudioPayload | null> = []
      workspaceAudioBus.subscribe({ kind: 'default' }, (p) => events.push(p))
      events.length = 0 // discard initial null

      const a = makePayload('a')
      const b = makePayload('b')
      const c = makePayload('c')

      workspaceAudioBus.publish('a', a) // events: [a]
      workspaceAudioBus.publish('b', b) // events: [a, b]
      workspaceAudioBus.unpublish('b') // events: [a, b, a]
      workspaceAudioBus.publish('c', c) // events: [a, b, a, c]
      workspaceAudioBus.unpublish('a') // a is not default — no fire
      workspaceAudioBus.unpublish('c') // events: [a, b, a, c, null]

      expect(events).toEqual([a, b, a, c, null])
    })
  })

  // -------------------------------------------------------------------------
  // Pinned (file-specific) subscriber semantics
  // -------------------------------------------------------------------------

  describe('pinned file subscriber semantics', () => {
    it('pinned to A fires only for A events, never for B', () => {
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'a' }, cb)
      cb.mockClear() // discard initial null

      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('b', b) // unrelated — must not fire
      expect(cb).not.toHaveBeenCalled()

      workspaceAudioBus.publish('a', a) // pinned target — must fire
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(a)
    })

    it('pinned subscriber sees `null` when its publisher unpublishes', () => {
      const a = makePayload('a')
      workspaceAudioBus.publish('a', a)

      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'a' }, cb)
      cb.mockClear()

      workspaceAudioBus.unpublish('a')
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(null)
    })

    it('pinned subscriber registered before publish receives the publish', () => {
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'late' }, cb)
      cb.mockClear()

      const late = makePayload('late')
      workspaceAudioBus.publish('late', late)
      expect(cb).toHaveBeenCalledWith(late)
    })
  })

  // -------------------------------------------------------------------------
  // Identity contract (D-01) — re-publish behaviour
  // -------------------------------------------------------------------------

  describe('identity contract (D-01)', () => {
    it('re-publishing the SAME payload object is a no-op for pinned subscribers', () => {
      const a = makePayload('a')
      workspaceAudioBus.publish('a', a)

      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'a' }, cb)
      cb.mockClear()

      workspaceAudioBus.publish('a', a) // exact same object
      expect(cb).not.toHaveBeenCalled()
    })

    it('re-publishing a NEW object with all the same component refs is a no-op', () => {
      const a = makePayload('a')
      workspaceAudioBus.publish('a', a)

      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'a' }, cb)
      cb.mockClear()

      // New wrapper object, but every internal slot is the same reference.
      // The bus must shallow-compare and treat this as no-op.
      const aShallowCopy: AudioPayload = {
        hapStream: a.hapStream,
        analyser: a.analyser,
        scheduler: a.scheduler,
        inlineViz: a.inlineViz,
        audio: a.audio,
      }
      workspaceAudioBus.publish('a', aShallowCopy)
      expect(cb).not.toHaveBeenCalled()
    })

    it('re-publishing with DIFFERENT slot refs replaces the entry and fires subscribers', () => {
      const a1 = makePayload('a-v1')
      workspaceAudioBus.publish('a', a1)

      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'a' }, cb)
      cb.mockClear()

      const a2 = makePayload('a-v2') // different sentinel refs throughout
      workspaceAudioBus.publish('a', a2)

      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(a2)
      // The replacement-not-mutation pattern: the bus now hands out a2 on
      // sync reads.
      expect(workspaceAudioBus.consume({ kind: 'file', fileId: 'a' })).toBe(a2)
    })

    it('re-publish does NOT change recency: the source stays where it was', () => {
      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('a', a)
      workspaceAudioBus.publish('b', b) // B most-recent

      // Re-publish A with new component refs — A should NOT jump to
      // most-recent. B is still the default.
      const aPrime = makePayload('a-prime')
      workspaceAudioBus.publish('a', aPrime)

      expect(workspaceAudioBus.consume({ kind: 'default' })).toBe(b)
    })

    it('re-publish on the current most-recent fires default-trackers with the new payload', () => {
      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      cb.mockClear()

      const a1 = makePayload('a-v1')
      workspaceAudioBus.publish('a', a1)
      cb.mockClear()

      const a2 = makePayload('a-v2')
      workspaceAudioBus.publish('a', a2)

      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(a2)
    })
  })

  // -------------------------------------------------------------------------
  // listSources + onSourcesChanged
  // -------------------------------------------------------------------------

  describe('listSources & onSourcesChanged', () => {
    it('listSources returns { sourceId, label, playing } per publisher', () => {
      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('pattern.strudel', a)
      workspaceAudioBus.publish('pattern.sonicpi', b)

      const sources = workspaceAudioBus.listSources()
      expect(sources).toEqual([
        { sourceId: 'pattern.strudel', label: 'pattern.strudel', playing: true },
        { sourceId: 'pattern.sonicpi', label: 'pattern.sonicpi', playing: true },
      ])
    })

    it('listSources returns a fresh array on every call (no cached reference)', () => {
      workspaceAudioBus.publish('a', makePayload('a'))
      const r1 = workspaceAudioBus.listSources()
      const r2 = workspaceAudioBus.listSources()
      expect(r1).not.toBe(r2) // different array refs
      expect(r1).toEqual(r2) // but same content
    })

    it('listSources reflects the live state immediately after publish/unpublish', () => {
      // Pre-mortem mitigation: rapid publish/unpublish sequence with
      // listSources read at every step proves the data is always fresh.
      expect(workspaceAudioBus.listSources()).toEqual([])

      workspaceAudioBus.publish('a', makePayload('a'))
      expect(workspaceAudioBus.listSources().map((s) => s.sourceId)).toEqual([
        'a',
      ])

      workspaceAudioBus.publish('b', makePayload('b'))
      expect(
        workspaceAudioBus.listSources().map((s) => s.sourceId).sort(),
      ).toEqual(['a', 'b'])

      workspaceAudioBus.unpublish('a')
      expect(workspaceAudioBus.listSources().map((s) => s.sourceId)).toEqual([
        'b',
      ])

      workspaceAudioBus.unpublish('b')
      expect(workspaceAudioBus.listSources()).toEqual([])
    })

    it('onSourcesChanged fires once when a new publisher is added', () => {
      const cb = vi.fn()
      workspaceAudioBus.onSourcesChanged(cb)

      workspaceAudioBus.publish('a', makePayload('a'))
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('onSourcesChanged fires once when a publisher is removed', () => {
      workspaceAudioBus.publish('a', makePayload('a'))

      const cb = vi.fn()
      workspaceAudioBus.onSourcesChanged(cb)

      workspaceAudioBus.unpublish('a')
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('onSourcesChanged does NOT fire on payload-replacement re-publish', () => {
      const a1 = makePayload('a-v1')
      workspaceAudioBus.publish('a', a1)

      const cb = vi.fn()
      workspaceAudioBus.onSourcesChanged(cb)

      const a2 = makePayload('a-v2')
      workspaceAudioBus.publish('a', a2) // same id, different refs
      // The SET of registered ids didn't change, even though the payload
      // did. onSourcesChanged is about set membership, not payload content.
      expect(cb).not.toHaveBeenCalled()
    })

    it('onSourcesChanged fires once per state transition across a complex sequence', () => {
      const cb = vi.fn()
      workspaceAudioBus.onSourcesChanged(cb)

      workspaceAudioBus.publish('a', makePayload('a')) // +a
      workspaceAudioBus.publish('b', makePayload('b')) // +b
      workspaceAudioBus.publish('a', makePayload('a-v2')) // payload swap (no fire)
      workspaceAudioBus.unpublish('a') // -a
      workspaceAudioBus.unpublish('b') // -b

      expect(cb).toHaveBeenCalledTimes(4)
    })
  })

  // -------------------------------------------------------------------------
  // Unsubscribe cleanup
  // -------------------------------------------------------------------------

  describe('unsubscribe cleanup', () => {
    it('after unsubscribe, the default subscriber never fires again', () => {
      const cb = vi.fn()
      const unsubscribe = workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      cb.mockClear()
      unsubscribe()

      workspaceAudioBus.publish('a', makePayload('a'))
      workspaceAudioBus.unpublish('a')
      expect(cb).not.toHaveBeenCalled()
    })

    it('after unsubscribe, the pinned subscriber never fires again', () => {
      const cb = vi.fn()
      const unsubscribe = workspaceAudioBus.subscribe(
        { kind: 'file', fileId: 'a' },
        cb,
      )
      cb.mockClear()
      unsubscribe()

      workspaceAudioBus.publish('a', makePayload('a'))
      workspaceAudioBus.unpublish('a')
      expect(cb).not.toHaveBeenCalled()
    })

    it('unsubscribe is idempotent — calling it twice is safe', () => {
      const cb = vi.fn()
      const unsubscribe = workspaceAudioBus.subscribe(
        { kind: 'file', fileId: 'a' },
        cb,
      )
      cb.mockClear()
      unsubscribe()
      expect(() => unsubscribe()).not.toThrow()

      workspaceAudioBus.publish('a', makePayload('a'))
      expect(cb).not.toHaveBeenCalled()
    })

    it('unsubscribing one default subscriber does not affect siblings', () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      const u1 = workspaceAudioBus.subscribe({ kind: 'default' }, cb1)
      workspaceAudioBus.subscribe({ kind: 'default' }, cb2)
      cb1.mockClear()
      cb2.mockClear()

      u1() // remove first
      workspaceAudioBus.publish('a', makePayload('a'))

      expect(cb1).not.toHaveBeenCalled()
      expect(cb2).toHaveBeenCalledTimes(1)
    })

    it('unsubscribing one pinned subscriber does not affect siblings on the same id', () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      const u1 = workspaceAudioBus.subscribe(
        { kind: 'file', fileId: 'a' },
        cb1,
      )
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'a' }, cb2)
      cb1.mockClear()
      cb2.mockClear()

      u1()
      workspaceAudioBus.publish('a', makePayload('a'))

      expect(cb1).not.toHaveBeenCalled()
      expect(cb2).toHaveBeenCalledTimes(1)
    })

    it('unsubscribing the last pinned subscriber on an id cleans up the inner Set', () => {
      // White-box: re-subscribe then unsubscribe a couple times to make
      // sure the bus doesn't leak the inner Set or accumulate stale state.
      // Visible to the test as: subsequent publishes still work.
      const u1 = workspaceAudioBus.subscribe(
        { kind: 'file', fileId: 'a' },
        () => {},
      )
      u1()

      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'file', fileId: 'a' }, cb)
      cb.mockClear()

      workspaceAudioBus.publish('a', makePayload('a'))
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('onSourcesChanged unsubscribe is idempotent and isolated from siblings', () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      const u1 = workspaceAudioBus.onSourcesChanged(cb1)
      workspaceAudioBus.onSourcesChanged(cb2)

      u1()
      expect(() => u1()).not.toThrow()

      workspaceAudioBus.publish('a', makePayload('a'))
      expect(cb1).not.toHaveBeenCalled()
      expect(cb2).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // consume (sync read without subscribe)
  // -------------------------------------------------------------------------

  describe('consume (sync peek)', () => {
    it('default reflects the most-recent publisher', () => {
      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('a', a)
      workspaceAudioBus.publish('b', b)
      expect(workspaceAudioBus.consume({ kind: 'default' })).toBe(b)
    })

    it('default returns null with no publishers', () => {
      expect(workspaceAudioBus.consume({ kind: 'default' })).toBe(null)
    })

    it('file ref returns the specific publisher payload', () => {
      const a = makePayload('a')
      const b = makePayload('b')
      workspaceAudioBus.publish('a', a)
      workspaceAudioBus.publish('b', b)
      expect(
        workspaceAudioBus.consume({ kind: 'file', fileId: 'a' }),
      ).toBe(a)
      expect(
        workspaceAudioBus.consume({ kind: 'file', fileId: 'b' }),
      ).toBe(b)
    })

    it('file ref returns null for an unknown id', () => {
      expect(
        workspaceAudioBus.consume({ kind: 'file', fileId: 'ghost' }),
      ).toBe(null)
    })

    it('none returns null regardless of bus state', () => {
      workspaceAudioBus.publish('a', makePayload('a'))
      expect(workspaceAudioBus.consume({ kind: 'none' })).toBe(null)
    })

    it('consume does NOT register a subscriber (no fire on later publish)', () => {
      // White-box invariant: peek must not leak a phantom subscriber.
      // Verify by checking that a later publish only fires the explicit
      // subscribers, not anything we might have left behind.
      workspaceAudioBus.consume({ kind: 'default' })
      workspaceAudioBus.consume({ kind: 'file', fileId: 'a' })
      workspaceAudioBus.consume({ kind: 'none' })

      const cb = vi.fn()
      workspaceAudioBus.subscribe({ kind: 'default' }, cb)
      cb.mockClear()

      workspaceAudioBus.publish('a', makePayload('a'))
      // If consume had registered phantom subscribers, this would fire
      // multiple callbacks. The single explicit subscriber must be the
      // only one called.
      expect(cb).toHaveBeenCalledTimes(1)
    })
  })
})
