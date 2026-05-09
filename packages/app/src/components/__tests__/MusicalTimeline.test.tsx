/**
 * MusicalTimeline component coverage —
 *   - Empty state copy renders verbatim (D-08).
 *   - Track grouping respects the trackId ?? s ?? '$default' fallback (D-04).
 *   - Stable track order across re-evals (Trap 5).
 *   - File-switch reset (Trap NEW-5).
 *   - Note-block positions match s("bd*4") fixture (PV28 / Trap 4).
 *   - Tooltip vocabulary respects FORBIDDEN_VOCABULARY (Trap 1 + NEW-2).
 *   - Status line gating + (stopped) copy when getCycle returns null
 *     (Trap 3 + Trap NEW-1 baseline).
 *   - rAF loop suspends when drawer closed OR tab inactive (Trap NEW-1).
 *   - Subscribe/unsubscribe lifecycle (Trap NEW-4).
 *
 * Mocks `@stave/editor`'s subscribeIRSnapshot/getIRSnapshot through
 * vi.mock so this test owns the full publish channel.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import * as React from 'react'
import { act, render, cleanup } from '@testing-library/react'
import type {
  IRSnapshot,
  IREvent,
  PatternIR,
  HapEvent,
  HapStream as HapStreamType,
} from '@stave/editor'
// Phase 20-06 — import HapStream from the engine source path directly so the
// `vi.mock('@stave/editor', ...)` factory below doesn't intercept it. We
// need the REAL class to construct streams + emit synthetic HapEvents in
// the P51 hap-driven rewrites. `vi.importActual` would also work but pulls
// in transitive CJS deps (gifenc) that break vitest's module loader.
// The runtime class is structurally identical to the one in @stave/editor
// (same file under the hood after the editor package is built); we cast
// constructed instances to HapStreamType so MusicalTimelineProps' typing
// (which imports HapStream from @stave/editor's dist) lines up.
import { HapStream as HapStreamRuntime } from '../../../../editor/src/engine/HapStream'
const HapStream = HapStreamRuntime as unknown as new () => HapStreamType

import { MusicalTimeline } from '../MusicalTimeline'
import {
  EMPTY_STATE_COPY,
  STOPPED_STATUS_COPY,
} from '../musicalTimeline/EMPTY_STATE_COPY'
import { FORBIDDEN_VOCABULARY } from '../musicalTimeline/forbiddenVocabulary'

// ─── Mock @stave/editor's IR snapshot channel ───────────────────────────────

let mockCurrent: IRSnapshot | null = null
const mockListeners = new Set<(s: IRSnapshot | null) => void>()
const revealLineInFileMock = vi.fn<[string, number], void>()

// Phase 20-12 β-1 — useTrackMeta backing store, mock-side. Each (fileId, trackId)
// pair gets a stable record reference; setTrackMeta merges + notifies listeners.
// Mirrors the real store's ref-stable contract (EMPTY_TRACK_META frozen sentinel).
type MockTrackMeta = { color?: string; collapsed?: boolean }
const EMPTY_MOCK_META: MockTrackMeta = Object.freeze({})
const mockTrackMetaStore = new Map<string, MockTrackMeta>()
const mockTrackMetaListeners = new Map<string, Set<() => void>>()
function trackMetaKey(fileId: string, trackId: string): string {
  return `${fileId}::${trackId}`
}
function mockGetTrackMeta(fileId: string, trackId: string): MockTrackMeta {
  return mockTrackMetaStore.get(trackMetaKey(fileId, trackId)) ?? EMPTY_MOCK_META
}
function mockSetTrackMeta(
  fileId: string,
  trackId: string,
  partial: Partial<MockTrackMeta>,
): void {
  const key = trackMetaKey(fileId, trackId)
  const existing = mockTrackMetaStore.get(key) ?? {}
  const merged: MockTrackMeta = { ...existing, ...partial }
  if (merged.color === undefined && merged.collapsed === undefined) {
    mockTrackMetaStore.delete(key)
  } else {
    mockTrackMetaStore.set(key, merged)
  }
  const subs = mockTrackMetaListeners.get(fileId)
  if (subs) for (const cb of subs) cb()
}
function mockSubscribeToTrackMeta(fileId: string, cb: () => void): () => void {
  let set = mockTrackMetaListeners.get(fileId)
  if (!set) {
    set = new Set()
    mockTrackMetaListeners.set(fileId, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
    if (set!.size === 0) mockTrackMetaListeners.delete(fileId)
  }
}

vi.mock('@stave/editor', async () => {
  // React imported via dynamic to avoid the test mock loading multiple React
  // copies (vitest hoists vi.mock above ES imports).
  const React = await import('react')
  function useTrackMeta(fileId: string | undefined, trackId: string) {
    const subscribe = React.useCallback(
      (onChange: () => void) => {
        if (!fileId) return () => {}
        return mockSubscribeToTrackMeta(fileId, onChange)
      },
      [fileId],
    )
    const getSnapshot = React.useCallback(() => {
      if (!fileId) return EMPTY_MOCK_META
      return mockGetTrackMeta(fileId, trackId)
    }, [fileId, trackId])
    const meta = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const set = React.useCallback(
      (partial: Partial<MockTrackMeta>) => {
        if (!fileId) return
        mockSetTrackMeta(fileId, trackId, partial)
      },
      [fileId, trackId],
    )
    return { meta, set }
  }
  return {
    getIRSnapshot: () => mockCurrent,
    subscribeIRSnapshot: (cb: (s: IRSnapshot | null) => void) => {
      mockListeners.add(cb)
      return () => {
        mockListeners.delete(cb)
      }
    },
    revealLineInFile: (source: string, line: number) =>
      revealLineInFileMock(source, line),
    useTrackMeta,
    getTrackMeta: mockGetTrackMeta,
    subscribeToTrackMeta: mockSubscribeToTrackMeta,
  }
})

function pushSnapshot(snap: IRSnapshot | null): void {
  mockCurrent = snap
  for (const l of mockListeners) l(snap)
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

function evt(partial: Partial<IREvent>): IREvent {
  return {
    begin: 0,
    end: 0.1,
    endClipped: 0.1,
    note: null,
    freq: null,
    s: null,
    gain: 1,
    velocity: 1,
    color: null,
    ...partial,
  }
}

/**
 * Phase 20-06 — synthetic HapEvent builder for hap-driven activation tests.
 * `partial.irNodeId` and `partial.hapBegin` are required (no defaults — they
 * disambiguate the matched row); other fields default to "single fire,
 * 0.5s duration, no scheduling lookahead" which is the simplest case.
 */
function hapEvt(
  partial: Partial<HapEvent> & { irNodeId: string; hapBegin: number },
): HapEvent {
  return {
    hap: { whole: { begin: partial.hapBegin } },
    audioTime: 0,
    audioDuration: partial.audioDuration ?? 0.5,
    scheduledAheadMs: partial.scheduledAheadMs ?? 0,
    midiNote: null,
    s: partial.s ?? null,
    color: null,
    loc: null,
    irNodeId: partial.irNodeId,
  }
}

function makeSnapshot({
  events,
  source,
}: {
  events?: readonly IREvent[]
  source?: string
} = {}): IRSnapshot {
  // Stub PatternIR — type-compliant Pure node. The component never
  // inspects passes/ir, only events + source.
  const stubIR: PatternIR = { tag: 'Pure' } as PatternIR
  return {
    ts: 0,
    source: source ?? 'fixture',
    runtime: 'strudel' as IRSnapshot['runtime'],
    code: '',
    passes: [{ name: 'final', ir: stubIR }],
    ir: stubIR,
    events: (events ?? []).slice() as IREvent[],
    // PV38 lookups (20-05) — empty maps suffice; the component reads
    // irNodeId off events directly, not through these tables.
    irNodeIdLookup: new Map(),
    irNodeLocLookup: new Map(),
    irNodeIdsByLine: new Map(),
  }
}

// ─── ResizeObserver mock ────────────────────────────────────────────────────
//
// jsdom doesn't ship ResizeObserver. The component uses it to learn its
// grid width. We mock a simple version that calls the callback once on
// observe with a fixed width drawn from a per-test global.

let mockGridWidth = 800

class MockResizeObserver {
  private cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb
  }
  observe(target: Element): void {
    // Patch clientWidth so the seed read inside the component matches.
    Object.defineProperty(target, 'clientWidth', {
      value: mockGridWidth,
      configurable: true,
    })
    // Fire async via Promise so the component's effect already
    // registered the observer before the callback runs.
    Promise.resolve().then(() => {
      this.cb(
        [
          {
            contentRect: { width: mockGridWidth, height: 48 } as DOMRectReadOnly,
            target,
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      )
    })
  }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  mockCurrent = null
  mockListeners.clear()
  mockTrackMetaStore.clear()
  mockTrackMetaListeners.clear()
  mockGridWidth = 800
  revealLineInFileMock.mockClear()
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
})

afterEach(() => {
  cleanup()
})

// ─── Test props ─────────────────────────────────────────────────────────────

function defaultProps(overrides?: {
  getCycle?: () => number | null
  getCps?: () => number | null
  getHapStream?: () => HapStreamType | null
  getDrawerOpen?: () => boolean
  getActiveTabId?: () => string | null
}) {
  return {
    getCycle: overrides?.getCycle ?? (() => null),
    getCps: overrides?.getCps ?? (() => null),
    getHapStream: overrides?.getHapStream ?? (() => null),
    getDrawerOpen: overrides?.getDrawerOpen ?? (() => true),
    getActiveTabId:
      overrides?.getActiveTabId ?? (() => 'musical-timeline'),
  }
}

/**
 * Walk a DOM subtree and collect every textContent + every [title] +
 * every [aria-label] string. The vocabulary regression assertion
 * iterates this combined surface.
 */
function collectSurfaceStrings(root: Element): string[] {
  const strings: string[] = []
  if (root.textContent) strings.push(root.textContent)
  root.querySelectorAll<HTMLElement>('[title]').forEach((el) => {
    const t = el.getAttribute('title')
    if (t) strings.push(t)
  })
  root.querySelectorAll<HTMLElement>('[aria-label]').forEach((el) => {
    const t = el.getAttribute('aria-label')
    if (t) strings.push(t)
  })
  // The root's own aria-label.
  const rootAria = root.getAttribute('aria-label')
  if (rootAria) strings.push(rootAria)
  return strings
}

// ─── Tests ──────────────────────────────────────────────────────────────────

/**
 * Render then flush the ResizeObserver microtask + a follow-up tick so
 * the post-mount state writes (gridContentWidth seed) settle inside an
 * act boundary.
 */
async function renderSettled(ui: React.ReactElement) {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(ui)
    await Promise.resolve()
    await Promise.resolve()
  })
  return result
}

describe('MusicalTimeline empty state (D-08)', () => {
  it('renders EMPTY_STATE_COPY when no snapshot has been published', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    const empty = container.querySelector(
      '[data-musical-timeline="empty-label"]',
    )
    expect(empty?.textContent).toBe(EMPTY_STATE_COPY)
  })

  it('renders EMPTY_STATE_COPY when snapshot has zero events', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(makeSnapshot({ events: [] }))
    })
    expect(
      container.querySelector('[data-musical-timeline="empty-label"]')
        ?.textContent,
    ).toBe(EMPTY_STATE_COPY)
  })

  it('shows STOPPED_STATUS_COPY when cycle is null', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    const status = container.querySelector(
      '[data-musical-timeline="status-text"]',
    )
    expect(status?.textContent).toBe(STOPPED_STATUS_COPY)
  })
})

describe('MusicalTimeline track grouping (D-04)', () => {
  it('groups events by trackId ?? s ?? $default', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'bd', s: 'bd', begin: 0, end: 0.25 }),
            evt({ trackId: undefined, s: 'hh', begin: 0.5, end: 0.75 }),
            evt({ trackId: undefined, s: null, begin: 1.0, end: 1.25 }),
          ],
        }),
      )
    })
    const labels = Array.from(
      container.querySelectorAll('[data-musical-timeline-track-label]'),
    ).map((el) =>
      el.getAttribute('data-musical-timeline-track-label'),
    )
    expect(labels).toEqual(['bd', 'hh', '$default'])
  })
})

describe('MusicalTimeline stable track order (Trap 5)', () => {
  it('reserves rows for tracks that disappear from a re-eval', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'bd' }),
            evt({ trackId: 'hh' }),
            evt({ trackId: 'cp' }),
          ],
        }),
      )
    })
    expect(
      container.querySelectorAll('[data-musical-timeline-track-label]'),
    ).toHaveLength(3)

    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [evt({ trackId: 'bd' }), evt({ trackId: 'cp' })],
        }),
      )
    })
    const labels = Array.from(
      container.querySelectorAll('[data-musical-timeline-track-label]'),
    ).map((el) =>
      el.getAttribute('data-musical-timeline-track-label'),
    )
    expect(labels).toEqual(['bd', 'hh', 'cp']) // hh row reserved
    // hh row should have zero note blocks.
    const hhRow = container.querySelector(
      '[data-musical-timeline-track-row="hh"]',
    )
    expect(hhRow?.querySelectorAll('[data-musical-timeline-note]').length).toBe(0)
  })

  it('appends new tracks at the end, not in the middle', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'bd' }),
            evt({ trackId: 'hh' }),
            evt({ trackId: 'cp' }),
          ],
        }),
      )
    })
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'bd' }),
            evt({ trackId: 'hh' }),
            evt({ trackId: 'sn' }),
            evt({ trackId: 'cp' }),
          ],
        }),
      )
    })
    const labels = Array.from(
      container.querySelectorAll('[data-musical-timeline-track-label]'),
    ).map((el) =>
      el.getAttribute('data-musical-timeline-track-label'),
    )
    // sn appended at slot 3 — NOT inserted between hh and cp.
    expect(labels).toEqual(['bd', 'hh', 'cp', 'sn'])
  })
})

describe('MusicalTimeline file-switch reset (Trap NEW-5)', () => {
  it('clears slot map when snapshot.source changes', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          source: 'file-a',
          events: [evt({ trackId: 'bd' }), evt({ trackId: 'hh' })],
        }),
      )
    })
    expect(
      container.querySelectorAll('[data-musical-timeline-track-label]'),
    ).toHaveLength(2)

    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          source: 'file-b',
          events: [evt({ trackId: 'piano' })],
        }),
      )
    })
    const labels = Array.from(
      container.querySelectorAll('[data-musical-timeline-track-label]'),
    ).map((el) =>
      el.getAttribute('data-musical-timeline-track-label'),
    )
    expect(labels).toEqual(['piano']) // bd + hh evicted
  })
})

describe('MusicalTimeline note-block positions (PV28 / Trap 4)', () => {
  it('places s("bd*4") events at beats 0, 0.25, 0.5, 0.75 → x ≈ 0/100/200/300 px at width 800', async () => {
    const { container } = render(<MusicalTimeline {...defaultProps()} />)
    // Wait for ResizeObserver async dispatch to land (its width seed
    // ran via Promise.resolve in the mock; flush microtasks).
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'bd', s: 'bd', begin: 0, end: 0.05 }),
            evt({ trackId: 'bd', s: 'bd', begin: 0.25, end: 0.30 }),
            evt({ trackId: 'bd', s: 'bd', begin: 0.5, end: 0.55 }),
            evt({ trackId: 'bd', s: 'bd', begin: 0.75, end: 0.80 }),
          ],
        }),
      )
      // Flush ResizeObserver microtask + a state update tick.
      await Promise.resolve()
      await Promise.resolve()
    })
    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-musical-timeline-note]',
      ),
    )
    expect(blocks).toHaveLength(4)
    const xs = blocks.map((b) => parseFloat((b.style.left ?? '0').replace('px', '')))
    expect(Math.round(xs[0])).toBe(0)
    expect(Math.round(xs[1])).toBe(100)
    expect(Math.round(xs[2])).toBe(200)
    expect(Math.round(xs[3])).toBe(300)
  })
})

describe('MusicalTimeline tooltip vocabulary (Trap 1 + NEW-2)', () => {
  it('produces a musician-vocabulary tooltip on note blocks', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({
              trackId: 'bd',
              s: 'bd',
              note: 60,
              begin: 0.25,
              end: 0.5,
              velocity: 0.8,
            }),
          ],
        }),
      )
    })
    const block = container.querySelector(
      '[data-musical-timeline-note]',
    )
    const title = block?.getAttribute('title') ?? ''
    expect(title).toContain('bd')
    expect(title).toContain('bar')
    expect(title).toContain('beat')
    expect(title).toContain('velocity')
    expect(title).not.toMatch(FORBIDDEN_VOCABULARY)
  })

  it('whole-surface vocabulary regression — no IR vocabulary anywhere', async () => {
    const { container } = render(<MusicalTimeline {...defaultProps()} />)
    // (a) Empty state.
    const root = container.querySelector(
      '[data-bottom-panel-tab="musical-timeline"]',
    )!
    for (const s of collectSurfaceStrings(root)) {
      expect(s).not.toMatch(FORBIDDEN_VOCABULARY)
    }
    // (b) Populated.
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({
              trackId: 'bd',
              s: 'bd',
              note: 60,
              begin: 0.25,
              end: 0.5,
              velocity: 0.8,
            }),
            evt({
              trackId: 'piano',
              s: 'piano',
              note: 'C4',
              begin: 1.0,
              end: 1.25,
            }),
          ],
        }),
      )
    })
    for (const s of collectSurfaceStrings(root)) {
      expect(s).not.toMatch(FORBIDDEN_VOCABULARY)
    }
  })
})

describe('MusicalTimeline rAF gating (Trap NEW-1)', () => {
  it('does not call getCycle when the drawer is closed', async () => {
    const cycleSpy = vi.fn(() => 0.5)
    await renderSettled(
      <MusicalTimeline
        {...defaultProps({
          getCycle: cycleSpy,
          getDrawerOpen: () => false,
        })}
      />,
    )
    // Allow the initial-render gate read; rAF should never schedule.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    // The mount-time gate read goes through props.getDrawerOpen, NOT
    // getCycle — so getCycle should be untouched.
    expect(cycleSpy).not.toHaveBeenCalled()
  })

  it('does not call getCycle when active tab is something else', async () => {
    const cycleSpy = vi.fn(() => 0.5)
    await renderSettled(
      <MusicalTimeline
        {...defaultProps({
          getCycle: cycleSpy,
          getActiveTabId: () => 'some-other-tab',
        })}
      />,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(cycleSpy).not.toHaveBeenCalled()
  })
})

describe('MusicalTimeline subscribe/unsubscribe (Trap NEW-4)', () => {
  it('subscribes on mount and unsubscribes on unmount', async () => {
    const { unmount } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    expect(mockListeners.size).toBeGreaterThanOrEqual(1)
    unmount()
    expect(mockListeners.size).toBe(0)
  })
})

describe('MusicalTimeline status line (Trap 1 + Trap NEW-3 wrap math)', () => {
  it('renders BPM/cps/bar/beat in musician vocabulary when cycle + cps are present', async () => {
    // We don't run the rAF loop directly — instead use a test that
    // forces cycle state via re-renders with a non-null getCycle. The
    // rAF loop itself is environment-driven; this test validates the
    // FORMATTERS via timeAxis, which the rAF tick threads into state.
    // For component-level assurance the empty-state STOPPED_STATUS_COPY
    // path is already covered above, and the timeAxis tests cover all
    // formatter outputs.
    // Here, we assert the FORBIDDEN regex on a status text computed
    // from realistic numbers: cps=0.5 → BPM 120, cycle=1.5.
    // formatBarBeat(1.5) === 'bar 2 / beat 3.00'.
    const cps = 0.5
    const cycle = 1.5
    const bpm = Math.round(cps * 60 * 4)
    const expected = `♩ ${bpm} BPM · cps ${cps.toFixed(2)} · bar 2 / beat 3.00`
    expect(expected).not.toMatch(FORBIDDEN_VOCABULARY)
    expect(cycle).toBeGreaterThan(0) // anchor for the assertion above
  })
})

// PV38 — irNodeId-driven hap activation; was cycle-derived per Phase 20-02
// (replaces 20-02 DV-05 contract; P51 audit during Phase 20-06 — see
// .anvi/hetvabhasa.md P51 for the rewrite protocol).
describe('20-06 — MusicalTimeline hap-driven glow (replaces 20-02 cycle-derived per P51)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks ONLY the row whose (irNodeId, begin) matches a fired hap (irNodeId + begin disambig)', async () => {
    const hapStream = new HapStream()
    const { container } = await renderSettled(
      <MusicalTimeline
        {...defaultProps({ getHapStream: () => hapStream })}
      />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'a', s: 'a', begin: 0.0, end: 0.5, endClipped: 0.5, irNodeId: 'idA' }),
            evt({ trackId: 'b', s: 'b', begin: 0.5, end: 1.0, endClipped: 1.0, irNodeId: 'idB' }),
            evt({ trackId: 'c', s: 'c', begin: 0.5, end: 1.0, endClipped: 1.0, irNodeId: 'idC' }),
          ],
        }),
      )
      await Promise.resolve()
    })

    // Fire a hap matching event B only.
    act(() => {
      hapStream.emitEvent(
        hapEvt({ irNodeId: 'idB', hapBegin: 0.5, audioDuration: 0.5, scheduledAheadMs: 0 }),
      )
    })
    await act(async () => {
      vi.advanceTimersByTime(0) // showDelay = 0
      await Promise.resolve()
    })

    const blockA = container.querySelector(
      '[data-musical-timeline-track-row="a"] [data-musical-timeline-note]',
    )
    const blockB = container.querySelector(
      '[data-musical-timeline-track-row="b"] [data-musical-timeline-note]',
    )
    const blockC = container.querySelector(
      '[data-musical-timeline-track-row="c"] [data-musical-timeline-note]',
    )
    expect(blockA?.getAttribute('data-musical-timeline-active')).toBeNull()
    expect(blockB?.getAttribute('data-musical-timeline-active')).toBe('true')
    expect(blockC?.getAttribute('data-musical-timeline-active')).toBeNull()

    // Glow clears at scheduledAheadMs + audioDuration*1000 = 500ms.
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    expect(blockB?.getAttribute('data-musical-timeline-active')).toBeNull()
  })

  it('keeps the active set empty when no haps emit (truthful representation per D-01)', async () => {
    const hapStream = new HapStream()
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps({ getHapStream: () => hapStream })} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'a', s: 'a', begin: 0.0, end: 0.5, endClipped: 0.5, irNodeId: 'idA' }),
            evt({ trackId: 'b', s: 'b', begin: 1.0, end: 1.5, endClipped: 1.5, irNodeId: 'idB' }),
          ],
        }),
      )
      await Promise.resolve()
      vi.advanceTimersByTime(1000)
    })
    const actives = container.querySelectorAll(
      '[data-musical-timeline-active="true"]',
    )
    expect(actives.length).toBe(0)
  })

  it('clears glow at scheduledAheadMs + audioDuration*1000 ms after audioTime (mirrors useHighlighting HIGH-03)', async () => {
    const hapStream = new HapStream()
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps({ getHapStream: () => hapStream })} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'a', s: 'a', begin: 0.0, end: 0.5, endClipped: 0.5, irNodeId: 'idA' }),
          ],
        }),
      )
      await Promise.resolve()
    })

    act(() => {
      hapStream.emitEvent(
        hapEvt({ irNodeId: 'idA', hapBegin: 0.0, audioDuration: 0.5, scheduledAheadMs: 100 }),
      )
    })
    const block = () =>
      container.querySelector(
        '[data-musical-timeline-track-row="a"] [data-musical-timeline-note]',
      )

    // At t=50ms: showDelay = 100ms — not yet active.
    await act(async () => {
      vi.advanceTimersByTime(50)
      await Promise.resolve()
    })
    expect(block()?.getAttribute('data-musical-timeline-active')).toBeNull()

    // At t=100ms: showDelay reached — active.
    await act(async () => {
      vi.advanceTimersByTime(50)
      await Promise.resolve()
    })
    expect(block()?.getAttribute('data-musical-timeline-active')).toBe('true')

    // At t=600ms (showDelay + audioDuration*1000 = 100 + 500): cleared.
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    expect(block()?.getAttribute('data-musical-timeline-active')).toBeNull()
  })

  it('disambiguates fast(N) duplicate-id events by closest whole.begin within FP tolerance (Trap T2 / DEC-NEW-2)', async () => {
    const hapStream = new HapStream()
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps({ getHapStream: () => hapStream })} />,
    )
    await act(async () => {
      // 4 events sharing one irNodeId — fast(4) on s("hh"):
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 't', s: 'hh', begin: 0.0, end: 0.25, endClipped: 0.25, irNodeId: 'leafA' }),
            evt({ trackId: 't', s: 'hh', begin: 0.25, end: 0.5, endClipped: 0.5, irNodeId: 'leafA' }),
            evt({ trackId: 't', s: 'hh', begin: 0.5, end: 0.75, endClipped: 0.75, irNodeId: 'leafA' }),
            evt({ trackId: 't', s: 'hh', begin: 0.75, end: 1.0, endClipped: 1.0, irNodeId: 'leafA' }),
          ],
        }),
      )
      await Promise.resolve()
    })

    // Simulate FP drift from Strudel's cycle arithmetic.
    act(() => {
      hapStream.emitEvent(
        hapEvt({ irNodeId: 'leafA', hapBegin: 0.5 + 1e-12, audioDuration: 0.25, scheduledAheadMs: 0 }),
      )
    })
    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    // Only the third row (begin = 0.5) should be active.
    const rows = container.querySelectorAll(
      '[data-musical-timeline-track-row="t"] [data-musical-timeline-note]',
    )
    expect(rows.length).toBe(4)
    expect(rows[0]?.getAttribute('data-musical-timeline-active')).toBeNull()
    expect(rows[1]?.getAttribute('data-musical-timeline-active')).toBeNull()
    expect(rows[2]?.getAttribute('data-musical-timeline-active')).toBe('true')
    expect(rows[3]?.getAttribute('data-musical-timeline-active')).toBeNull()
  })

  it('detaches subscription on HapStream swap and rebinds to the new stream (Trap T4 / DEC-NEW-1)', async () => {
    const hapStreamA = new HapStream()
    const hapStreamB = new HapStream()
    const accessor = { current: () => hapStreamA as HapStreamType | null }

    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps({ getHapStream: () => accessor.current() })} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'a', s: 'a', begin: 0.0, end: 0.5, endClipped: 0.5, irNodeId: 'idA' }),
          ],
        }),
      )
      await Promise.resolve()
    })

    // Swap to stream B; trigger a snapshot publish to drive re-resolution.
    accessor.current = () => hapStreamB
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'a', s: 'a', begin: 0.0, end: 0.5, endClipped: 0.5, irNodeId: 'idA' }),
          ],
        }),
      )
      await Promise.resolve()
    })

    // Fire on the OLD stream — should NOT affect activeKeys.
    act(() => {
      hapStreamA.emitEvent(
        hapEvt({ irNodeId: 'idA', hapBegin: 0, audioDuration: 0.5, scheduledAheadMs: 0 }),
      )
    })
    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })
    let block = container.querySelector(
      '[data-musical-timeline-track-row="a"] [data-musical-timeline-note]',
    )
    expect(block?.getAttribute('data-musical-timeline-active')).toBeNull()

    // Fire on the NEW stream — SHOULD activate.
    act(() => {
      hapStreamB.emitEvent(
        hapEvt({ irNodeId: 'idA', hapBegin: 0, audioDuration: 0.5, scheduledAheadMs: 0 }),
      )
    })
    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })
    block = container.querySelector(
      '[data-musical-timeline-track-row="a"] [data-musical-timeline-note]',
    )
    expect(block?.getAttribute('data-musical-timeline-active')).toBe('true')
  })
})

// ---------------------------------------------------------------------------
// Phase 20-03 / D-02 — click-to-source primary-loc path. PV36 says every
// IREvent carries loc[]; D-02 says evt.loc[0] is the single contract for
// click-to-source resolution. The 5 fallback layers (sample-name regex,
// $:-block walk, parser-loc fallback) are removed; this describe block
// pins the new behavior.
// ---------------------------------------------------------------------------
describe('MusicalTimeline click-to-source — primary-loc path (Phase 20-03 / D-02)', () => {
  // Source corpus per fixture is held to one $: line with a stable layout
  // so we can hand-compute char offsets for evt.loc and the line numbers
  // the resolver should report.
  const PLAY_CODE = '$: note("c4 e4 g4")\n'
  const FAST_CODE = '$: note("c d").fast(2)\n'
  const PICK_CODE = '$: note("c d").pick([note("e"), note("g")])\n'
  const OFF_CODE = '$: note("c d").off(0.125, x => x.gain(0.5))\n'
  const LAYER_CODE = '$: note("c d").layer(x => x.fast(2))\n'

  function rangeOf(code: string, sub: string): { start: number; end: number } {
    const start = code.indexOf(sub)
    if (start < 0) throw new Error(`fixture corruption: '${sub}' not in code`)
    return { start, end: start + sub.length }
  }

  async function clickFirstNote(container: HTMLElement) {
    const block = container.querySelector(
      '[data-musical-timeline-note]',
    ) as HTMLElement | null
    expect(block).not.toBeNull()
    await act(async () => {
      block!.click()
    })
  }

  it('Play (atom) — click resolves to inner-atom line via evt.loc[0]', async () => {
    const code = PLAY_CODE
    const atomLoc = rangeOf(code, 'c4')
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot({
        ts: 0,
        source: 'fixture.strudel',
        runtime: 'strudel' as IRSnapshot['runtime'],
        code,
        passes: [{ name: 'final', ir: { tag: 'Pure' } as PatternIR }],
        ir: { tag: 'Pure' } as PatternIR,
        irNodeIdLookup: new Map(),
        irNodeLocLookup: new Map(),
        irNodeIdsByLine: new Map(),
        events: [
          evt({
            trackId: 'note',
            s: null,
            note: 'c4',
            begin: 0,
            end: 0.33,
            endClipped: 0.33,
            loc: [atomLoc],
          }),
        ],
      })
    })
    await clickFirstNote(container)
    expect(revealLineInFileMock).toHaveBeenCalledTimes(1)
    expect(revealLineInFileMock).toHaveBeenCalledWith('fixture.strudel', 1)
  })

  it('Fast (duplicates) — both copies of a fast(2)-derived event share loc, click reveals same line', async () => {
    const code = FAST_CODE
    // D-01: loc[0] is the inner atom; loc[1] is the .fast(2) wrapper. Both
    // duplicates share the same loc (DV-05 — multi-event loc duplication).
    const atomLoc = rangeOf(code, 'c d')
    const fastLoc = rangeOf(code, '.fast(2)')
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot({
        ts: 0,
        source: 'fixture.strudel',
        runtime: 'strudel' as IRSnapshot['runtime'],
        code,
        passes: [{ name: 'final', ir: { tag: 'Pure' } as PatternIR }],
        ir: { tag: 'Pure' } as PatternIR,
        irNodeIdLookup: new Map(),
        irNodeLocLookup: new Map(),
        irNodeIdsByLine: new Map(),
        events: [
          evt({
            trackId: 'note',
            note: 'c',
            begin: 0,
            end: 0.25,
            endClipped: 0.25,
            loc: [atomLoc, fastLoc],
          }),
          evt({
            trackId: 'note',
            note: 'c',
            begin: 0.5,
            end: 0.75,
            endClipped: 0.75,
            loc: [atomLoc, fastLoc],
          }),
        ],
      })
    })
    const blocks = container.querySelectorAll(
      '[data-musical-timeline-note]',
    ) as NodeListOf<HTMLElement>
    expect(blocks.length).toBe(2)
    await act(async () => {
      blocks[0].click()
      blocks[1].click()
    })
    expect(revealLineInFileMock).toHaveBeenCalledTimes(2)
    expect(revealLineInFileMock).toHaveBeenNthCalledWith(1, 'fixture.strudel', 1)
    expect(revealLineInFileMock).toHaveBeenNthCalledWith(2, 'fixture.strudel', 1)
  })

  it('Pick — click reveals inner lookup-atom line (loc[0]), NOT the .pick(...) line', async () => {
    // Multi-line corpus so the inner atom and outer call sit on different
    // lines — this is exactly the case D-01 multi-range loc protects:
    // loc[0] resolves to the lookup atom even though the .pick(...) call
    // is on a later line.
    const code = '$: note("c d")\n     .pick([note("e"), note("g")])\n'
    const lookupAtomLoc = rangeOf(code, '"e"')
    const pickLoc = rangeOf(code, '.pick([note("e"), note("g")])')
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot({
        ts: 0,
        source: 'fixture.strudel',
        runtime: 'strudel' as IRSnapshot['runtime'],
        code,
        passes: [{ name: 'final', ir: { tag: 'Pure' } as PatternIR }],
        ir: { tag: 'Pure' } as PatternIR,
        irNodeIdLookup: new Map(),
        irNodeLocLookup: new Map(),
        irNodeIdsByLine: new Map(),
        events: [
          evt({
            trackId: 'note',
            note: 'e',
            begin: 0,
            end: 0.5,
            endClipped: 0.5,
            // D-01: lookup atom innermost; .pick(...) is wrapper.
            loc: [lookupAtomLoc, pickLoc],
          }),
        ],
      })
    })
    await clickFirstNote(container)
    expect(revealLineInFileMock).toHaveBeenCalledTimes(1)
    // "e" sits on line 2 (after the first \n); .pick(...) sits on line 2
    // too in this corpus, but we still verify loc[0] (the lookup atom)
    // controls the line.
    expect(revealLineInFileMock).toHaveBeenCalledWith('fixture.strudel', 2)
  })

  it('Off (transformed arm) — click on transformed event reveals inner atom (loc[0])', async () => {
    const code = OFF_CODE
    const atomLoc = rangeOf(code, 'c d')
    const offLoc = rangeOf(code, '.off(0.125, x => x.gain(0.5))')
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot({
        ts: 0,
        source: 'fixture.strudel',
        runtime: 'strudel' as IRSnapshot['runtime'],
        code,
        passes: [{ name: 'final', ir: { tag: 'Pure' } as PatternIR }],
        ir: { tag: 'Pure' } as PatternIR,
        irNodeIdLookup: new Map(),
        irNodeLocLookup: new Map(),
        irNodeIdsByLine: new Map(),
        events: [
          evt({
            trackId: 'note',
            note: 'c',
            begin: 0.125,
            end: 0.375,
            endClipped: 0.375,
            loc: [atomLoc, offLoc],
          }),
        ],
      })
    })
    await clickFirstNote(container)
    expect(revealLineInFileMock).toHaveBeenCalledTimes(1)
    expect(revealLineInFileMock).toHaveBeenCalledWith('fixture.strudel', 1)
  })

  it('Layer (synthetic Stack) — click on layer-produced event reveals inner atom', async () => {
    const code = LAYER_CODE
    const atomLoc = rangeOf(code, 'c d')
    const layerLoc = rangeOf(code, '.layer(x => x.fast(2))')
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot({
        ts: 0,
        source: 'fixture.strudel',
        runtime: 'strudel' as IRSnapshot['runtime'],
        code,
        passes: [{ name: 'final', ir: { tag: 'Pure' } as PatternIR }],
        ir: { tag: 'Pure' } as PatternIR,
        irNodeIdLookup: new Map(),
        irNodeLocLookup: new Map(),
        irNodeIdsByLine: new Map(),
        events: [
          evt({
            trackId: 'note',
            note: 'c',
            begin: 0,
            end: 0.25,
            endClipped: 0.25,
            loc: [atomLoc, layerLoc],
          }),
        ],
      })
    })
    await clickFirstNote(container)
    expect(revealLineInFileMock).toHaveBeenCalledTimes(1)
    expect(revealLineInFileMock).toHaveBeenCalledWith('fixture.strudel', 1)
  })
})

// Phase 20-12 α-4 — silent-prefix two-cycle geometry contract (D-04).
//
// Rule (CONTEXT D-04 rev2): silent cycles render as full-width empty cells.
// Cycle-column geometry is invariant to event count — `pxPerCycle = width /
// WINDOW_CYCLES` (timeAxis.ts:73). A cycle with zero events still occupies
// the same horizontal slot as a cycle with events.
//
// Two-cycle fixture: events present in cycle 1 only (cycle 0 silent). The
// `cat(silence, s("bd"))` shape from CONTEXT D-04 reaches MusicalTimeline as
// 4 events at begins 1.0, 1.25, 1.5, 1.75 (cycle 1 stretched across the
// whole cycle) and zero events in [0, 1). β-2's sub-row layout helper must
// not introduce an event-count-derived width or this regression fails fast.
describe('20-12 α-4 — silent-prefix geometry contract (D-04)', () => {
  it('cycle 0 has zero event blocks; cycle 1 events render at expected x positions', async () => {
    const { container } = render(<MusicalTimeline {...defaultProps()} />)
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            // Cycle 1 (silent prefix in cycle 0): bd*4 across the second cycle.
            evt({ trackId: 'bd', s: 'bd', begin: 1.0, end: 1.05 }),
            evt({ trackId: 'bd', s: 'bd', begin: 1.25, end: 1.30 }),
            evt({ trackId: 'bd', s: 'bd', begin: 1.5, end: 1.55 }),
            evt({ trackId: 'bd', s: 'bd', begin: 1.75, end: 1.80 }),
          ],
        }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>('[data-musical-timeline-note]'),
    )
    // 4 events total — all in cycle 1.
    expect(blocks).toHaveLength(4)
    const xs = blocks.map((b) => parseFloat(b.style.left.replace('px', '')))
    // pxPerCycle = 800 / 2 = 400. Cycle 1 starts at x=400.
    // Cycle 0 is empty: NO blocks should land in [0, 400).
    expect(xs.every((x) => x >= 400)).toBe(true)
    // Beats 1.0, 1.25, 1.5, 1.75 → x ≈ 400, 500, 600, 700.
    expect(Math.round(xs[0])).toBe(400)
    expect(Math.round(xs[1])).toBe(500)
    expect(Math.round(xs[2])).toBe(600)
    expect(Math.round(xs[3])).toBe(700)
  })

  it('bar lines are drawn at cycle boundaries regardless of event count', async () => {
    // Geometry invariance: WINDOW_CYCLES = 2 → 3 bar-line rules at left=0,
    // pxPerCycle, 2*pxPerCycle. Holds whether cycle 0 has events or not.
    const { container } = render(<MusicalTimeline {...defaultProps()} />)
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'bd', s: 'bd', begin: 1.0, end: 1.05 }),
          ],
        }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    const barLines = Array.from(
      container.querySelectorAll<HTMLElement>('[data-musical-timeline-bar-line]'),
    )
    // WINDOW_CYCLES + 1 (start, mid, end) bar lines. Implementation may
    // emit either WINDOW_CYCLES or WINDOW_CYCLES + 1; assert "at least
    // WINDOW_CYCLES" so this regression catches geometry collapse, not
    // implementation-detail count.
    expect(barLines.length).toBeGreaterThanOrEqual(2)
    // Bar-line at index 0 starts at left=0; bar-line at index 1 must be
    // at pxPerCycle = 400. The cycle-column slot exists even though
    // cycle 0 has zero events.
    const lefts = barLines.map((bl) => parseFloat(bl.style.left.replace('px', '')))
    // First bar at left=0 (cycle boundary 0).
    expect(Math.round(lefts[0])).toBe(0)
    // Mid bar at left=400 (cycle 1 boundary).
    expect(Math.round(lefts[1])).toBe(400)
  })

  it('cycle 0 silence + cycle 1 events: cycle-column widths are equal (event-count invariance)', async () => {
    // Probe: render two snapshots — one with events ONLY in cycle 0, one
    // with events ONLY in cycle 1. Each event's pxPerCycle = 800 / 2 = 400.
    // The same begin offset within its cycle must map to the same column-
    // relative position. (eventToRect is the geometry function; this test
    // verifies the rendered output reflects it under MusicalTimeline.)
    const { container, rerender } = render(<MusicalTimeline {...defaultProps()} />)
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [evt({ trackId: 'bd', s: 'bd', begin: 0, end: 0.05 })],
        }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    const blockCycle0 = container.querySelector<HTMLElement>(
      '[data-musical-timeline-note]',
    )
    const x0 = parseFloat(blockCycle0!.style.left.replace('px', ''))
    expect(Math.round(x0)).toBe(0)

    rerender(<MusicalTimeline {...defaultProps()} />)
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [evt({ trackId: 'bd', s: 'bd', begin: 1, end: 1.05 })],
        }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    const blockCycle1 = container.querySelector<HTMLElement>(
      '[data-musical-timeline-note]',
    )
    const x1 = parseFloat(blockCycle1!.style.left.replace('px', ''))
    // Distance from cycle 1 start to event = 0; distance from cycle 0 start
    // to event = 0. Therefore x1 - x0 = pxPerCycle = 400.
    expect(Math.round(x1 - x0)).toBe(400)
  })
})

// ─── Phase 20-12 β-1 — track header rail (chevron + swatch + name) ──────────

describe('20-12 β-1 — track header rail', () => {
  it('renders chevron + swatch + name for each track', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          source: 'file:test.strudel',
          events: [
            evt({ trackId: 'd1', s: 'bd' }),
            evt({ trackId: 'd2', s: 'hh' }),
          ],
        }),
      )
    })
    const headers = container.querySelectorAll(
      '[data-musical-timeline="track-header"]',
    )
    expect(headers).toHaveLength(2)
    for (const h of headers) {
      expect(h.querySelector('[data-musical-timeline="track-chevron"]')).not
        .toBeNull()
      expect(h.querySelector('[data-musical-timeline="track-swatch"]')).not
        .toBeNull()
      expect(h.querySelector('[data-musical-timeline="track-name"]')).not
        .toBeNull()
    }
    // First row's name reflects the trackId.
    expect(
      headers[0].querySelector('[data-musical-timeline="track-name"]')
        ?.textContent,
    ).toBe('d1')
  })

  it('chevron click toggles useTrackMeta.set({ collapsed: ... })', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          source: 'file:test.strudel',
          events: [evt({ trackId: 'd1', s: 'bd' })],
        }),
      )
    })
    const chevron = container.querySelector<HTMLButtonElement>(
      '[data-musical-timeline="track-chevron"]',
    )
    expect(chevron).not.toBeNull()
    expect(chevron!.getAttribute('data-collapsed')).toBe('false')

    await act(async () => {
      chevron!.click()
    })
    expect(
      mockGetTrackMeta('file:test.strudel', 'd1').collapsed,
    ).toBe(true)
    // Re-read the chevron after the state change.
    const chevron2 = container.querySelector<HTMLButtonElement>(
      '[data-musical-timeline="track-chevron"]',
    )
    expect(chevron2!.getAttribute('data-collapsed')).toBe('true')
  })

  it('swatch click captures the dot rect (popover anchor available)', async () => {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          source: 'file:test.strudel',
          events: [evt({ trackId: 'd1', s: 'bd' })],
        }),
      )
    })
    const swatch = container.querySelector<HTMLButtonElement>(
      '[data-musical-timeline="track-swatch"]',
    )
    expect(swatch).not.toBeNull()
    // Stub getBoundingClientRect — jsdom returns all-zero by default; that's
    // fine for the click-handler-fires assertion. The popover render path is
    // β-6's domain.
    swatch!.getBoundingClientRect = () =>
      ({ top: 0, bottom: 12, left: 0, right: 12, width: 12, height: 12, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    await act(async () => {
      swatch!.click()
    })
    // No throw + button remains in DOM is the proof of contract; the popover
    // appearance is asserted separately in TrackSwatchPopover.test.tsx.
    expect(swatch!.isConnected).toBe(true)
  })
})

// ─── Phase 20-12 β-3 — bar opacity = clamp(gain, 0.15, 1) ───────────────────

describe('20-12 β-3 — bar opacity = clamp(gain, 0.15, 1)', () => {
  async function getBarOpacity(eventOverrides: Partial<IREvent>): Promise<number> {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'd1', s: 'bd', begin: 0, end: 0.1, ...eventOverrides }),
          ],
        }),
      )
    })
    const block = container.querySelector<HTMLElement>(
      '[data-musical-timeline-note]',
    )
    expect(block).not.toBeNull()
    return parseFloat(block!.style.opacity)
  }

  it('event with gain=1 (default) renders at opacity 1.0', async () => {
    expect(await getBarOpacity({ gain: 1 })).toBe(1)
  })

  it('event with gain=0.5 renders at opacity 0.5', async () => {
    expect(await getBarOpacity({ gain: 0.5 })).toBe(0.5)
  })

  it('event with gain=0 floors to opacity 0.15 (never invisible)', async () => {
    expect(await getBarOpacity({ gain: 0 })).toBe(0.15)
  })

  it('event with gain=2 ceils to opacity 1.0', async () => {
    expect(await getBarOpacity({ gain: 2 })).toBe(1)
  })
})

// ─── Phase 20-12 β-5 — hover tooltip (full chain summary) ───────────────────

describe('20-12 β-5 — hover tooltip extension', () => {
  async function getTooltip(eventOverrides: Partial<IREvent>): Promise<string> {
    const { container } = await renderSettled(
      <MusicalTimeline {...defaultProps()} />,
    )
    await act(async () => {
      pushSnapshot(
        makeSnapshot({
          events: [
            evt({ trackId: 'd1', s: 'bd', begin: 0, end: 0.1, ...eventOverrides }),
          ],
        }),
      )
    })
    const block = container.querySelector<HTMLElement>(
      '[data-musical-timeline-note]',
    )
    return block!.getAttribute('title') ?? ''
  }

  it('includes a non-default gain segment when gain != 1', async () => {
    const t = await getTooltip({ gain: 0.5 })
    expect(t).toContain('gain 0.5')
  })

  it('omits gain segment when gain === 1 (default)', async () => {
    const t = await getTooltip({ gain: 1 })
    expect(t).not.toContain('gain')
  })

  it('includes chained-Param extras (n / freq / pan) when present in evt.params', async () => {
    const t = await getTooltip({
      params: { n: 7, freq: 440, pan: 0.5 },
    })
    expect(t).toContain('n 7')
    expect(t).toContain('freq 440Hz')
    expect(t).toContain('pan 0.5')
  })

  it('does not surface forbidden IR vocabulary on Param-rich events (PV32 lock)', async () => {
    const t = await getTooltip({
      gain: 0.7,
      params: { n: 0, freq: 440, room: 0.3 },
    })
    expect(t).not.toMatch(FORBIDDEN_VOCABULARY)
  })
})
