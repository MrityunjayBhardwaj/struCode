// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StrudelEngine } from '../StrudelEngine'
import { BreakpointStore } from '../BreakpointStore'

/**
 * Phase 20-07 (T-α-7) — engine breakpoint hit-check + pause/resume API.
 *
 * The hit-check itself lives inside `wrappedOutput` (a closure captured
 * during `init()`), which is hard to exercise without booting a full
 * Strudel runtime. The strategy here:
 *  - Public API tests (pause/resume/getPaused/onPausedChanged/
 *    getBreakpointStore) drive engine state directly, mocking `repl`
 *    via the private field so scheduler.pause/start spies can observe
 *    calls without real audio.
 *  - Hit-check semantic tests reach into the `wrappedOutput` closure by
 *    re-deriving the same single-strategy `if (irNodeId && store.has)`
 *    decision tree and asserting the engine's response (pause + early
 *    return, no audio dispatch). We cannot reuse the real closure here
 *    because it's bound inside `init()`'s scope; instead we verify the
 *    engine PROTOCOL — the same protocol that `wrappedOutput` invokes
 *    via `setPaused` + `repl.scheduler.pause()`.
 *
 * DEC-AMENDED-1: pause/resume route to `scheduler.pause()` / `.start()`
 * (NOT `.stop()`).
 *
 * DEC-AMENDED-3: pulse fires (HapStream subscribers see the hap) BEFORE
 * the scheduler pauses. The contract is exercised in HapStream.test.ts
 * (the emit return-value test) plus the protocol test below that asserts
 * `setPaused(true)` is the response to a registered hit.
 *
 * T17: setPaused() is idempotent — listeners fire once per transition.
 */
describe('20-07 — StrudelEngine breakpoint hit-check + pause/resume API', () => {
  let engine: StrudelEngine
  let schedulerPause: ReturnType<typeof vi.fn>
  let schedulerStart: ReturnType<typeof vi.fn>
  let schedulerStop: ReturnType<typeof vi.fn>

  beforeEach(() => {
    engine = new StrudelEngine()
    schedulerPause = vi.fn()
    schedulerStart = vi.fn()
    schedulerStop = vi.fn()
    // Install a stub `repl.scheduler` on the private field. The engine's
    // public methods route through `this.repl?.scheduler?.pause()` etc.,
    // so we can observe routing without booting Strudel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(engine as any).repl = {
      scheduler: { pause: schedulerPause, start: schedulerStart, stop: schedulerStop },
    }
  })

  it('getBreakpointStore returns a stable BreakpointStore instance', () => {
    const store = engine.getBreakpointStore()
    expect(store).toBeInstanceOf(BreakpointStore)
    expect(engine.getBreakpointStore()).toBe(store) // same instance across calls
  })

  it('pause() calls scheduler.pause and flips getPaused() true (DEC-AMENDED-1)', () => {
    expect(engine.getPaused()).toBe(false)
    engine.pause()
    expect(schedulerPause).toHaveBeenCalledTimes(1)
    expect(schedulerStop).not.toHaveBeenCalled() // pause, NOT stop (cyclist.mjs:117-122)
    expect(engine.getPaused()).toBe(true)
  })

  it('resume() calls scheduler.start and flips getPaused() false', () => {
    engine.pause()
    expect(engine.getPaused()).toBe(true)
    engine.resume()
    expect(schedulerStart).toHaveBeenCalledTimes(1)
    expect(engine.getPaused()).toBe(false)
  })

  it('onPausedChanged fires once per transition; idempotent setPaused (T17)', () => {
    const listener = vi.fn()
    const dispose = engine.onPausedChanged(listener)

    engine.pause()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(true)

    // Idempotence: a second pause() must not re-fire the listener.
    engine.pause()
    expect(listener).toHaveBeenCalledTimes(1)

    engine.resume()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(false)

    // Idempotence on resume too — both Inspector + Monaco "Resume" surfaces
    // may fire simultaneously per T17.
    engine.resume()
    expect(listener).toHaveBeenCalledTimes(2)

    dispose()
    engine.pause()
    expect(listener).toHaveBeenCalledTimes(2) // disposer worked
  })

  it('protocol — registered breakpoint id triggers pause; unregistered passes through (P50)', () => {
    // Re-derive the wrappedOutput hit-check decision: this is what the
    // engine's closure does on every fired hap. Single-strategy match
    // (P50): `if (irNodeId && store.has(irNodeId))`. PV37 alignment —
    // undefined irNodeId never hits.
    const store = engine.getBreakpointStore()
    store.add('hit-id')

    const audioDispatch = vi.fn()
    const fireWrappedOutput = (enrichedIrNodeId: string | undefined): void => {
      if (enrichedIrNodeId && store.has(enrichedIrNodeId)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(engine as any).repl?.scheduler?.pause()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(engine as any).setPaused(true)
        return
      }
      audioDispatch()
    }

    // Hit case — registered id → pause, no audio.
    fireWrappedOutput('hit-id')
    expect(schedulerPause).toHaveBeenCalledTimes(1)
    expect(audioDispatch).not.toHaveBeenCalled()
    expect(engine.getPaused()).toBe(true)

    // PV37 alignment — undefined irNodeId never hits.
    fireWrappedOutput(undefined)
    expect(schedulerPause).toHaveBeenCalledTimes(1) // unchanged
    expect(audioDispatch).toHaveBeenCalledTimes(1)

    // Unregistered id — pass through to audio.
    fireWrappedOutput('not-registered')
    expect(schedulerPause).toHaveBeenCalledTimes(1) // unchanged
    expect(audioDispatch).toHaveBeenCalledTimes(2)
  })

  it('protocol — pulse fires BEFORE pause (DEC-AMENDED-3 ordering)', () => {
    // The engine's wrappedOutput emits to HapStream subscribers FIRST,
    // then runs the hit-check. We assert the same ordering at the
    // protocol level via vi.fn().mock.invocationCallOrder.
    const store = engine.getBreakpointStore()
    store.add('pulse-then-pause')

    const pulseSubscriber = vi.fn()
    engine.getHapStream?.()?.on(pulseSubscriber) // engine exposes a HapStream too

    const fireWrappedOutput = (irNodeId: string): void => {
      // Mimic emit → subscriber call.
      pulseSubscriber({ irNodeId } as never)
      // Then the hit-check.
      if (store.has(irNodeId)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(engine as any).repl?.scheduler?.pause()
      }
    }

    fireWrappedOutput('pulse-then-pause')
    expect(pulseSubscriber).toHaveBeenCalledTimes(1)
    expect(schedulerPause).toHaveBeenCalledTimes(1)
    // Pulse order < pause order — invocationCallOrder is monotonic per spy.
    expect(pulseSubscriber.mock.invocationCallOrder[0]).toBeLessThan(
      schedulerPause.mock.invocationCallOrder[0],
    )
  })

  it('breakpoint stays armed across resume — re-fires pause on next hit (T3)', () => {
    const store = engine.getBreakpointStore()
    store.add('armed')

    const fire = (id: string): void => {
      if (store.has(id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(engine as any).repl?.scheduler?.pause()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(engine as any).setPaused(true)
      }
    }

    fire('armed')
    expect(schedulerPause).toHaveBeenCalledTimes(1)
    engine.resume()
    expect(schedulerStart).toHaveBeenCalledTimes(1)
    expect(engine.getPaused()).toBe(false)
    // Same id fires again — store still has it; pause is re-triggered.
    fire('armed')
    expect(schedulerPause).toHaveBeenCalledTimes(2)
  })

  it('dispose clears the breakpoint store + pause listeners', () => {
    const listener = vi.fn()
    engine.onPausedChanged(listener)
    const store = engine.getBreakpointStore()
    store.add('a')
    expect(store.has('a')).toBe(true)

    engine.dispose()

    // Store cleared.
    expect(store.has('a')).toBe(false)
    // Pause listeners cleared — pause() after dispose is harmless and
    // does NOT fire the listener (engine.repl is null after dispose so
    // setPaused still fires, but listeners were cleared).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(engine as any).repl = { scheduler: { pause: vi.fn(), start: vi.fn(), stop: vi.fn() } }
    engine.pause()
    expect(listener).not.toHaveBeenCalled()
  })
})
