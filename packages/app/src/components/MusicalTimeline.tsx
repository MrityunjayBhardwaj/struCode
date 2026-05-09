/**
 * MusicalTimeline — read-only multi-track musical timeline that lives
 * in the bottom drawer's "Timeline" tab (Phase 20-01 PR-B slice β).
 *
 * Audience: MUSICIAN (PV35 lock). Vocabulary discipline (PV32 / D-06)
 * applies to every visible string — see `forbiddenVocabulary.ts` for
 * the regex source-of-truth and the vitest + Playwright probes that
 * enforce it on both static literals and runtime-templated tooltips.
 *
 * Data flow:
 *   subscribeIRSnapshot ──▶ snapshot
 *                         ──▶ groupEventsByTrack (D-04 fallback chain)
 *                              ──▶ stableTrackOrder (Trap 5: row order
 *                                  stable across re-evals)
 *                                   ──▶ render: track rows + note blocks
 *
 *   getCycle (rAF tick, gated) ──▶ cycleToPlayheadX ──▶ playhead `style.left`
 *   getCps  (same)             ──▶ cpsToBpm + formatBarBeat
 *                              ──▶ status line "♩ {bpm} BPM · cps {x.xx} · bar Y / beat Z.ZZ"
 *
 * Lifecycle gates (DB-02 + DB-08 + Trap NEW-1):
 *   - Snapshot subscription is ALWAYS on (cheap fan-out; PK9).
 *   - rAF playhead loop is gated on (drawerOpen && tabActive). When
 *     gated off, the rAF loop suspends; a 250ms poll-interval re-kicks
 *     it when conditions return so the loop doesn't burn CPU on a
 *     drawer that's display:none for hours.
 *   - File-switch reset: when the snapshot's `source` changes (different
 *     editor tab), the slot map is cleared so File A's tracks don't
 *     leak into File B's row order (Trap NEW-5).
 *
 * Click-to-source: evt.loc[0] is the contract (PV36 / D-02). No fallbacks.
 * Multi-range loc supports modifier-click reveal of wrapping ranges (D-01).
 */
'use client'

import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type IRSnapshot,
  type IREvent,
  type HapStream,
  type HapEvent,
  type TrackMeta,
  getIRSnapshot,
  subscribeIRSnapshot,
  revealLineInFile,
  useTrackMeta,
} from '@stave/editor'
import { groupEventsByTrack } from './musicalTimeline/groupEventsByTrack'
import { stableTrackOrder } from './musicalTimeline/stableTrackOrder'
import {
  WINDOW_CYCLES,
  eventToRect,
  cycleToPlayheadX,
  formatBarBeat,
  cpsToBpm,
} from './musicalTimeline/timeAxis'
import { paletteForTrack, trackIndexOf } from './musicalTimeline/colors'
import { Ruler } from './musicalTimeline/Ruler'
import {
  EMPTY_STATE_COPY,
  STOPPED_STATUS_COPY,
} from './musicalTimeline/EMPTY_STATE_COPY'

export interface MusicalTimelineProps {
  /** Current cycle (post-collect coords) from the active runtime, or
   *  null when stopped / non-Strudel runtime. Read on each rAF tick
   *  through a closure so the active runtime can change without
   *  re-registering the tab content. */
  readonly getCycle: () => number | null
  /** Current cycles-per-second from the active runtime, or null. Used
   *  for the BPM segment of the status line. */
  readonly getCps: () => number | null
  /**
   * Phase 20-06 (PV38, PK13 step 7+8) — closure-bound accessor onto the
   * active runtime's HapStream. Returns null when the engine isn't
   * running or the runtime is non-Strudel. The timeline subscribes to
   * this stream to drive activeKeys (D-01: real-hap REPLACES cycle-derived).
   */
  readonly getHapStream: () => HapStream | null
  /** Drawer open state — gates the rAF loop (Trap NEW-1). */
  readonly getDrawerOpen: () => boolean
  /** Active tab id — must equal `'musical-timeline'` for the rAF loop
   *  to run. Same gating purpose as `getDrawerOpen`. */
  readonly getActiveTabId: () => string | null
}

const TAB_ID = 'musical-timeline'
const TRACK_LABEL_WIDTH = 90 // mockup: .daw-gutter width 90px (DV-02)
const ROW_HEIGHT = 24
const STATUS_HEIGHT = 24
const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>())

/**
 * Tiny MIDI int → note name converter. C4 = 60. Used in tooltips when
 * the event carries `note: number`. Strings pass through.
 */
function midiToName(n: number): string {
  if (!Number.isFinite(n)) return ''
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const idx = Math.floor(n) % 12
  const octave = Math.floor(Math.floor(n) / 12) - 1
  const safeIdx = idx < 0 ? idx + 12 : idx
  return `${names[safeIdx]}${octave}`
}

/**
 * Build the tooltip string for a note block. Every interpolation site
 * is here so the test surface is small (Trap NEW-2: runtime-computed
 * vocabulary leaks). All segments use musician vocabulary only.
 */
function formatNoteTooltip(event: IREvent, fallbackTrackId: string): string {
  const sample = event.s ?? fallbackTrackId
  const noteSegment =
    typeof event.note === 'number'
      ? `note ${midiToName(event.note)}`
      : typeof event.note === 'string' && event.note.length > 0
        ? `note ${event.note}`
        : null
  // Bar/beat shown using the SAME formatter as the status line so the
  // tooltip stays consistent with what the playhead displays.
  const barBeat = formatBarBeat(event.begin)
  const velocitySegment =
    typeof event.velocity === 'number' && event.velocity !== 1
      ? `velocity ${event.velocity.toFixed(2)}`
      : null
  return [sample, noteSegment, barBeat, velocitySegment]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' · ')
}

/**
 * Phase 20-12 β-1 — Row header rail (chevron + swatch + name).
 *
 * Per-row component so `useTrackMeta` is called from a stable component (not
 * from inside a `.map()` in the parent) — rules-of-hooks compliant. The
 * parent (`MusicalTimeline`) passes `fileId` derived from `IRSnapshot.source`;
 * this component reads/writes meta through `useTrackMeta` keyed on
 * (fileId, trackId).
 *
 * Width budget (RESEARCH §B.5): chevron 12 + gap 4 + swatch 12 + gap 4 +
 * name fills the remainder. Total = TRACK_LABEL_WIDTH (90px). aria-labels
 * on both buttons keep the rail screen-reader navigable.
 */
interface TrackHeaderRowProps {
  fileId: string | undefined
  trackId: string
  autoColor: string
  top: number
  height: number
  onOpenSwatch: (trackId: string, anchor: DOMRect) => void
}

function TrackHeaderRow({
  fileId,
  trackId,
  autoColor,
  top,
  height,
  onOpenSwatch,
}: TrackHeaderRowProps): React.ReactElement {
  const { meta, set } = useTrackMeta(fileId, trackId)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const color = meta.color ?? autoColor
  const collapsed = meta.collapsed ?? false
  const handleToggle = useCallback(() => {
    set({ collapsed: !collapsed })
  }, [collapsed, set])
  const handleOpenSwatch = useCallback(() => {
    if (swatchRef.current) {
      onOpenSwatch(trackId, swatchRef.current.getBoundingClientRect())
    }
  }, [onOpenSwatch, trackId])
  return (
    <div
      data-musical-timeline="track-header"
      data-musical-timeline-track-label={trackId}
      data-track-id={trackId}
      title={trackId}
      style={{
        position: 'absolute',
        top,
        height,
        width: TRACK_LABEL_WIDTH,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        paddingLeft: 4,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        data-musical-timeline="track-chevron"
        data-collapsed={collapsed ? 'true' : 'false'}
        aria-label={collapsed ? `Expand ${trackId}` : `Collapse ${trackId}`}
        aria-expanded={!collapsed}
        onClick={handleToggle}
        style={{
          width: 12,
          height: 12,
          border: 'none',
          background: 'transparent',
          color: 'rgba(255,255,255,0.6)',
          cursor: 'pointer',
          padding: 0,
          fontSize: 10,
          lineHeight: '12px',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 100ms',
          flexShrink: 0,
        }}
      >
        ▾
      </button>
      <button
        ref={swatchRef}
        type="button"
        data-musical-timeline="track-swatch"
        aria-label={`Pick color for ${trackId}`}
        onClick={handleOpenSwatch}
        style={{
          width: 12,
          height: 12,
          padding: 0,
          border: 'none',
          background: color,
          borderRadius: 6,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      />
      <span
        data-musical-timeline="track-name"
        style={{
          fontSize: 10,
          lineHeight: '12px',
          color: 'rgba(255,255,255,0.4)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {trackId}
      </span>
    </div>
  )
}

/**
 * Count newlines in `src` up to character offset `offset`.
 * Returns 1-based line number. Mirrors IRInspectorPanel.tsx's countLines.
 */
function countLines(src: string, offset: number): number {
  if (offset <= 0) return 1
  let line = 1
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') line++
  }
  return line
}

export function MusicalTimeline(
  props: MusicalTimelineProps,
): React.ReactElement {
  // ── Snapshot subscription (Trap NEW-4: re-sync after subscribe) ─────────
  const [snapshot, setSnapshot] = useState<IRSnapshot | null>(getIRSnapshot)
  useEffect(() => {
    const unsub = subscribeIRSnapshot(setSnapshot)
    // Re-sync in case publishIRSnapshot raced our mount.
    setSnapshot(getIRSnapshot())
    return unsub
  }, [])

  // ── Grid width via ResizeObserver (DB-04) ───────────────────────────────
  const [gridContentWidth, setGridContentWidth] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') {
      // Fallback: read the current width once. Real browsers always
      // have ResizeObserver; this keeps tests in environments without
      // the polyfill from crashing.
      setGridContentWidth(el.clientWidth ?? 0)
      return
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setGridContentWidth(Math.max(0, w))
    })
    ro.observe(el)
    // Seed with the current measured width so the first render after
    // mount can already place blocks (ResizeObserver fires once after
    // attach, but exact timing varies across implementations).
    setGridContentWidth(el.clientWidth ?? 0)
    return () => ro.disconnect()
  }, [])

  // ── rAF playhead loop with gating (DB-02 + Trap NEW-1) ──────────────────
  // Stash the latest accessor refs so the rAF callback closure doesn't
  // need to re-capture on every render (or worse, fire stale refs).
  const accessorsRef = useRef(props)
  accessorsRef.current = props

  const [currentCycle, setCurrentCycle] = useState<number | null>(null)
  const [currentCps, setCurrentCps] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let rafHandle: number | null = null

    const tick = (): void => {
      if (cancelled) return
      const a = accessorsRef.current
      if (!a.getDrawerOpen() || a.getActiveTabId() !== TAB_ID) {
        // Gate flipped off — stop the loop. Poke interval will re-kick.
        rafHandle = null
        return
      }
      const cycle = a.getCycle()
      const cps = a.getCps()
      // setState bails on referential equality for primitives, so the
      // playhead only triggers a re-render when the cycle actually
      // changes.
      setCurrentCycle((prev) => (prev === cycle ? prev : cycle))
      setCurrentCps((prev) => (prev === cps ? prev : cps))
      rafHandle = requestAnimationFrame(tick)
    }

    // Initial kick — only if conditions allow. Otherwise the poke
    // interval below catches the next open transition.
    if (
      props.getDrawerOpen() &&
      props.getActiveTabId() === TAB_ID
    ) {
      rafHandle = requestAnimationFrame(tick)
    }

    // Re-kick if the user opens the drawer / switches the tab while
    // we're suspended. 250ms is a balance: quick enough that opening
    // the drawer feels instant; cheap enough that the steady-state
    // suspended cost is ~0.
    const pokeInterval = setInterval(() => {
      if (cancelled) return
      if (
        rafHandle == null &&
        accessorsRef.current.getDrawerOpen() &&
        accessorsRef.current.getActiveTabId() === TAB_ID
      ) {
        rafHandle = requestAnimationFrame(tick)
      }
    }, 250)

    return () => {
      cancelled = true
      clearInterval(pokeInterval)
      if (rafHandle != null) {
        cancelAnimationFrame(rafHandle)
        rafHandle = null
      }
      // Reset cycle state on unmount so a remount starts in the
      // stopped state instead of a stale playhead position.
      setCurrentCycle(null)
      setCurrentCps(null)
    }
    // The accessors are read through the ref; depending on them in
    // the deps would re-create the rAF loop on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Slot-map derivation (Trap 5 + Trap NEW-5 file-switch reset) ─────────
  const slotMapRef = useRef<Map<string, number>>(new Map())
  const lastSourceRef = useRef<string | undefined>(undefined)

  // File-switch reset: run BEFORE slot-map derivation so the new file's
  // tracks claim slots starting from 0 instead of inheriting the prior
  // file's row order.
  if (snapshot && snapshot.source !== lastSourceRef.current) {
    slotMapRef.current = new Map()
    lastSourceRef.current = snapshot.source
  }

  const groups = snapshot ? groupEventsByTrack(snapshot.events) : []
  const currentIds = groups.map((g) => g.trackId)
  slotMapRef.current = stableTrackOrder(slotMapRef.current, currentIds)
  const slotMap = slotMapRef.current

  const orderedTracks = Array.from(slotMap.entries())
    .sort(([, a], [, b]) => a - b)
    .map(([trackId]) => ({
      trackId,
      events: groups.find((g) => g.trackId === trackId)?.events ?? [],
    }))

  // ── Phase 20-06: HapStream subscription drives activeKeys (D-01 / DEC-NEW-1)
  // ────────────────────────────────────────────────────────────────────────
  //
  // PV38 / PK13 step 8 — the cycle-derived `useMemo` (20-02 DV-12) is gone.
  // Active-event derivation now mirrors the firing of actual haps: glow on
  // hap fire, clear after audioDuration. Mirrors useHighlighting.ts:174-175
  // arithmetic exactly.
  //
  // Resolve the live HapStream reactively. The accessor returns a different
  // instance after a runtime swap (file-switch). Snapshot publish triggers
  // re-render; a `useEffect` keyed on snapshot identity picks up the new
  // HapStream (RESEARCH DEC-NEW-1 — snapshot is the reactive seam, not a
  // 250ms poll). The accessor itself is closure-stable (StaveApp routes
  // through a ref), so deps suppression is sound.
  const [resolvedHapStream, setResolvedHapStream] = useState<HapStream | null>(
    () => props.getHapStream(),
  )
  useEffect(() => {
    const next = props.getHapStream()
    setResolvedHapStream((prev) => (prev === next ? prev : next))
    // Including snapshot in deps is the explicit reactive seam (DEC-NEW-1).
    // props.getHapStream is closure-stable (ref-routed at StaveApp); not a
    // missing dep but exhaustive-deps can't see through that, hence:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  const [activeKeys, setActiveKeys] = useState<ReadonlySet<string>>(EMPTY_SET)
  const timeoutIdsRef = useRef<number[]>([])

  // orderedTracks is recomputed on every render (new array reference). If we
  // depend on it directly in the subscription's deps array, every state
  // update triggers cleanup → re-subscribe → setActiveKeys(EMPTY_SET) →
  // re-render → infinite cleanup loop. Reading through a ref breaks the
  // dep cycle while still letting the handler see the latest events.
  const orderedTracksRef = useRef(orderedTracks)
  orderedTracksRef.current = orderedTracks

  useEffect(() => {
    const hapStream = resolvedHapStream
    if (!hapStream) return

    const handler = (event: HapEvent): void => {
      // Skip runtime-only haps (PV37 alignment — no IR identity, no glow).
      if (!event.irNodeId) return
      // Disambig within the irNodeId-group via FP-tolerant begin compare
      // (RESEARCH DEC-NEW-2). hap-side begin via Number() to unwrap
      // Strudel's Fraction objects.
      const hapBegin = Number(event.hap?.whole?.begin ?? 0)

      // Find the (trackId, eventIndex) row that fired. Read latest tracks
      // through the ref so the handler always sees the current snapshot.
      let matchedKey: string | null = null
      for (const { trackId, events } of orderedTracksRef.current) {
        const idx = events.findIndex(
          (e) =>
            e.irNodeId === event.irNodeId &&
            Math.abs(e.begin - hapBegin) < 1e-9,
        )
        if (idx >= 0) {
          matchedKey = `${trackId}-${idx}`
          break
        }
      }
      // PV37 — silently skip the no-match path; no fallback ladder per P50.
      if (!matchedKey) return

      // Mirror useHighlighting.ts:174-175 timing arithmetic exactly.
      const showDelay = Math.max(0, event.scheduledAheadMs)
      const clearDelay = showDelay + event.audioDuration * 1000

      const showId = window.setTimeout(() => {
        setActiveKeys((prev) => {
          const next = new Set(prev)
          next.add(matchedKey!)
          return next
        })
      }, showDelay)

      const clearId = window.setTimeout(() => {
        setActiveKeys((prev) => {
          if (!prev.has(matchedKey!)) return prev
          const next = new Set(prev)
          next.delete(matchedKey!)
          return next
        })
      }, clearDelay)

      timeoutIdsRef.current.push(showId, clearId)
    }

    hapStream.on(handler)
    return () => {
      hapStream.off(handler)
      // Bulk-clear pending show/clear timeouts so stale fires don't mutate
      // activeKeys after the subscription is gone (Trap T8).
      for (const id of timeoutIdsRef.current) clearTimeout(id)
      timeoutIdsRef.current = []
      setActiveKeys(EMPTY_SET)
    }
    // Only rebind on HapStream identity change. orderedTracks read through
    // a ref above so re-renders from setActiveKeys don't churn the
    // subscription (which would otherwise loop: cleanup → setActiveKeys →
    // re-render → orderedTracks new ref → cleanup again).
  }, [resolvedHapStream])

  // ── Phase 20-12 β-1 — swatch popover anchor state ──────────────────────
  // Single shared anchor for the row-header swatch popover; β-6 renders the
  // popover at the parent level so it floats above all rows. `null` = closed.
  // The anchor rect is captured at click-time from the swatch button's
  // bounding rect (mirrors BackdropPopover.tsx anchor convention).
  const [swatchAnchor, setSwatchAnchor] = useState<{
    trackId: string
    rect: DOMRect
  } | null>(null)
  const handleOpenSwatch = useCallback((trackId: string, rect: DOMRect) => {
    setSwatchAnchor({ trackId, rect })
  }, [])

  const fileId = snapshot?.source

  const playheadX = cycleToPlayheadX(currentCycle, { gridContentWidth })

  // Click-to-source — single contract per PV36 / D-02. evt.loc[0] is the
  // innermost atom range (D-01); modifier-click variants would walk the
  // rest of evt.loc[] to reveal wrapping call-sites. The 5-commit regex
  // fallback ladder (cc19d5b..eab49d5) was a workaround cascade for
  // missing-loc events in the IR — PV36 codifies the contract collect()
  // now upholds, so the fallbacks have no scenarios left to handle.
  const handleNoteClick = React.useCallback(
    (evt: IREvent) => {
      if (!snapshot?.source || !evt.loc || evt.loc.length === 0) return
      const line = countLines(snapshot.code, evt.loc[0].start)
      revealLineInFile(snapshot.source, line)
    },
    [snapshot],
  )

  const bpm = cpsToBpm(currentCps)
  const barBeat = formatBarBeat(currentCycle)

  // Status line content — single template site keeps the vocabulary
  // surface narrow.
  let statusContent: React.ReactNode
  if (bpm == null || barBeat === '') {
    statusContent = (
      <span data-musical-timeline="status-text">{STOPPED_STATUS_COPY}</span>
    )
  } else {
    const cpsDisplay =
      currentCps != null && Number.isFinite(currentCps)
        ? currentCps.toFixed(2)
        : '—'
    statusContent = (
      <span data-musical-timeline="status-text">
        {`♩ ${bpm} BPM · cps ${cpsDisplay} · ${barBeat}`}
      </span>
    )
  }

  const empty = orderedTracks.length === 0

  return (
    <div
      data-bottom-panel-tab="musical-timeline"
      role="region"
      aria-label="Timeline"
      style={styles.root}
    >
      <div data-musical-timeline="status" style={styles.status}>
        {statusContent}
      </div>
      <Ruler currentCycle={currentCycle} gridContentWidth={gridContentWidth} />
      <div style={styles.body}>
        <div
          data-musical-timeline="track-labels"
          style={{ ...styles.labels, position: 'relative' }}
        >
          {empty ? (
            <div
              data-musical-timeline="empty-label"
              style={styles.emptyLabel}
            >
              {EMPTY_STATE_COPY}
            </div>
          ) : (
            orderedTracks.map(({ trackId, events }, slotIndex) => {
              const firstEventSample = events[0]?.s ?? undefined
              const autoColor = paletteForTrack(
                trackIndexOf(trackId),
                firstEventSample,
              )
              return (
                <TrackHeaderRow
                  key={trackId}
                  fileId={fileId}
                  trackId={trackId}
                  autoColor={autoColor}
                  top={slotIndex * ROW_HEIGHT}
                  height={ROW_HEIGHT}
                  onOpenSwatch={handleOpenSwatch}
                />
              )
            })
          )}
        </div>
        <div
          data-musical-timeline="grid"
          ref={gridRef}
          style={styles.grid}
        >
          {/* Bar lines — one per cycle boundary (DV-16). The 1/4-beat
              sub-grid was removed in Phase 20-02; the Ruler above carries
              minor-tick cues. */}
          {gridContentWidth > 0 &&
            Array.from({ length: WINDOW_CYCLES + 1 }).map((_, cycleIdx) => {
              const left = (cycleIdx / WINDOW_CYCLES) * gridContentWidth
              return (
                <div
                  key={cycleIdx}
                  data-musical-timeline-bar-line={cycleIdx}
                  style={{ ...styles.barLine, left }}
                />
              )
            })}
          {/* Track rows + note blocks */}
          {orderedTracks.map(({ trackId, events }, slotIndex) => (
            <div
              key={trackId}
              data-musical-timeline-track-row={trackId}
              style={{ ...styles.row, top: slotIndex * ROW_HEIGHT }}
            >
              {events.map((evt, i) => {
                const { x, w } = eventToRect(evt, { gridContentWidth })
                const isActive = activeKeys.has(`${trackId}-${i}`)
                return (
                  <div
                    key={`${trackId}-${i}`}
                    data-musical-timeline-note={trackId}
                    data-musical-timeline-active={isActive ? 'true' : undefined}
                    title={formatNoteTooltip(evt, trackId)}
                    onClick={() => handleNoteClick(evt)}
                    style={{
                      ...styles.noteBlock,
                      left: x,
                      width: w,
                      background:
                        evt.color ??
                        paletteForTrack(trackIndexOf(trackId), evt.s ?? undefined),
                      ...(isActive ? styles.noteBlockActive : null),
                    }}
                  />
                )
              })}
            </div>
          ))}
          {/* Playhead — fixed-position marker, pointer-events: none so it
              doesn't intercept click-to-source on note blocks behind it. */}
          <div
            data-musical-timeline="playhead"
            style={{ ...styles.playhead, left: playheadX }}
          />
        </div>
      </div>
    </div>
  )
}

// ───── Styles ───────────────────────────────────────────────────────────────
// Inline styles with mockup-literal values (Phase 20-02 DV-08). All CSS
// variable references from PR #92 replaced with the mockup's color tokens.
// No external theme dependency — the tab is a self-contained visual unit.

const FONT_MONO = '"JetBrains Mono", "Fira Code", ui-monospace, monospace'

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    fontFamily: FONT_MONO,
    fontSize: 11, // mockup body font-size: 11px (DV-02)
    color: '#e2e8f0',
    background: '#090912',
  },
  status: {
    height: STATUS_HEIGHT,
    minHeight: STATUS_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.4)',
    background: '#14141f',
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: 11,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    overflow: 'auto',
    background: '#090912',
  },
  labels: {
    width: TRACK_LABEL_WIDTH, // 90px (DV-02)
    flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  trackLabel: {
    height: ROW_HEIGHT,
    padding: '0 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 6, // mockup: .track-label gap: 6px
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer' as const,
  },
  trackDot: {
    width: 7, // mockup: .track-dot 7×7
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-block',
  },
  trackName: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  emptyLabel: {
    padding: 8,
    fontStyle: 'italic' as const,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    lineHeight: 1.4,
  },
  grid: {
    flex: 1,
    minWidth: 200,
    position: 'relative' as const,
    overflow: 'hidden',
    background: '#0f0f1a',
  },
  barLine: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 1,
    background: 'rgba(255,255,255,0.04)', // Trap 9 — faint cycle cue
    pointerEvents: 'none' as const,
  },
  row: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  noteBlock: {
    position: 'absolute' as const,
    top: 4,
    height: 16,
    borderRadius: 2,
    opacity: 0.85,
    cursor: 'pointer' as const,
    boxSizing: 'border-box' as const,
  },
  noteBlockActive: {
    outline: '1px solid rgba(139,92,246,0.8)',
    boxShadow: '0 0 6px rgba(139,92,246,0.5)',
  },
  playhead: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 1,
    background: 'rgba(255,255,255,0.55)', // mockup: .playhead
    boxShadow: '0 0 4px rgba(255,255,255,0.3)', // mockup: .playhead box-shadow
    pointerEvents: 'none' as const,
  },
} satisfies Record<string, React.CSSProperties>
