// @vitest-environment node
/**
 * parity.test.ts — Tier 4 JS API parity harness.
 *
 * Scope (Phase 19-03 D-03): each modeled Strudel transform (jux/off/late/
 * degrade/chunk/ply) gets an `it()` block that compares two pipelines and
 * asserts event-list equivalence on the dimensions our IR claims to model.
 *
 * Pipeline A (reference): the *real* Strudel evaluator path documented in
 *   RESEARCH §6.1 — `await evalScope(core, mini); miniAllStrings()` once
 *   in `beforeAll`, then per-test `await evaluate(code)` followed by
 *   `pattern.queryArc(c, c+1)` per cycle. This is the same boot sequence
 *   the production engine uses (StrudelEngine.init), so parity mismatches
 *   here would surface in real playback.
 *
 * Pipeline B (ours): parseStrudel → collect, looped per-cycle via the
 *   inline `collectCycles` helper.
 *
 * --- Boot enablement: vitest config + kabelsalat stub ---
 *
 * `@strudel/core` (package root → dist/index.mjs) imports `SalatRepl`
 * from `@kabelsalat/web`. Under vite-node the kabelsalat package
 * resolves to its CJS UMD `dist/index.js`, which has no named ESM
 * exports — the static linker rejects the import before any test setup
 * runs. We work around this in TWO PLACES that must both be present:
 *
 *   1. `vitest.config.ts` aliases `@kabelsalat/web` to a tiny ESM stub
 *      (`test/stubs/kabelsalat-web.mjs`) exporting `class SalatRepl {}`.
 *   2. `vitest.config.ts` inlines `@strudel/*` via `server.deps.inline`
 *      so vite-node transforms Strudel rather than externalising it
 *      through Node's resolver. Aliases applied to externalised package
 *      transitive imports are silently ignored; inlining flips that.
 *
 * We never call into `repl.mjs` during tests, so the stub is sufficient.
 * Production builds use the real kabelsalat package — the alias is
 * scoped to vitest only.
 *
 * Diff: sort both sides by (begin, s, note); dedupe Strudel's clipped
 *   boundary pairs by `(whole.begin, s)`; assert lengths; per pair
 *   assert each requested dimension matches and `loc` is present on the
 *   actual (ours) event (PV24 — every IREvent must carry loc).
 *
 * Known scope limitations (documented in test bodies as they land):
 *   - Inputs use decimal literals (`0.125`), not fraction literals
 *     (`1/8`); same as `.fast()` today.
 *   - `chunk` parity uses single-cycle bodies; multi-cycle bodies need
 *     Strudel's repeatCycles(n) modelling (follow-up).
 *   - `degrade` uses event-count tolerance (seededRand differs from
 *     Strudel's getRandsAtTime; RESEARCH §5).
 */
import { describe, it, expect, beforeAll } from 'vitest'
// Documented Strudel evaluator path (RESEARCH §6.1). The package-root
// import works under vitest because the config inlines `@strudel/*` and
// aliases `@kabelsalat/web` to a stub — see header comment.
import { evalScope, evaluate } from '@strudel/core/evaluate.mjs'
import * as strudelCore from '@strudel/core'
import { mini, miniAllStrings } from '@strudel/mini/mini.mjs'

import {
  parseStrudel,
  collect,
  type IREvent,
  type PatternIR,
  type CollectContext,
} from '../../ir'
// normalizeStrudelHap lives in engine/, imported directly to keep the
// parity test surface lean. PK10 barrel discipline is enforced by tasks
// that introduce *new* exports (e.g., `collectCycles` in Task 19-03-08).
import { normalizeStrudelHap } from '../../engine/NormalizedHap'

// --------------------------------------------------------------------------
// One-time Strudel scope boot. evalScope+miniAllStrings registers core
// combinators on Pattern.prototype and wires the mini-notation transpiler
// into the global scope so `evaluate('s("bd hh")')` parses the string.
// --------------------------------------------------------------------------
beforeAll(async () => {
  await evalScope(Promise.resolve(strudelCore), Promise.resolve({ mini }))
  miniAllStrings()
})

// --------------------------------------------------------------------------
// Pipeline A — Strudel reference events from a code string.
// `evaluate(code)` returns `{ pattern, mode, meta }`. We query the
// pattern per cycle and normalise haps into IREvents.
//
// `whole.begin` (preserved by normalizeStrudelHap as `event.begin`) is
// the un-clipped onset — events crossing a cycle boundary are returned
// twice by Strudel (once on each side, both clipped); both copies share
// the same `whole.begin`. We dedupe by `(begin, s)` to recover the
// whole-event view that our IR uses.
// --------------------------------------------------------------------------
type StrudelPattern = {
  queryArc: (begin: number, end: number) => unknown[]
}

async function strudelEventsFromCode(
  code: string,
  cyclesToQuery = 1,
  startCycle = 0,
): Promise<IREvent[]> {
  const evaluated = await evaluate(code)
  const pattern = evaluated.pattern as StrudelPattern
  const haps: unknown[] = []
  for (let c = startCycle; c < startCycle + cyclesToQuery; c++) {
    haps.push(...pattern.queryArc(c, c + 1))
  }
  return haps.map((h) => normalizeStrudelHap(h))
}

/**
 * Reduce Strudel's hap stream to one event per unique `whole.begin` (the
 * stable un-clipped onset). Boundary-crossing events that Strudel returns
 * as two clipped pieces (same `whole.begin`, different `part`) collapse
 * to a single event — matching our IR's whole-event view.
 */
function dedupeByWholeBegin(events: IREvent[]): IREvent[] {
  const seen = new Set<string>()
  const out: IREvent[] = []
  for (const e of events) {
    const key = `${e.begin.toFixed(9)}|${e.s ?? ''}|${e.note ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/**
 * Filter Strudel events to those whose un-clipped onset (`whole.begin`)
 * falls inside the queried cycle window. Strudel's transforms can leak
 * neighbouring cycles' events into a queried window (e.g. `late(t)`
 * pulls the previous cycle's tail forward into the current cycle).
 * Our IR collects per-cycle and wraps within the cycle window — to
 * compare like-for-like, drop the leaked neighbours.
 */
function withOnsetInWindow(
  events: IREvent[],
  begin: number,
  end: number,
): IREvent[] {
  return events.filter((e) => e.begin >= begin && e.begin < end)
}

// --------------------------------------------------------------------------
// Pan normalisation — Strudel uses [0,1] centered at 0.5; we use [-1,1]
// centered at 0 (PatternIR.ts:23). Apply to expected (Strudel) side only.
// --------------------------------------------------------------------------
export function normalizeStrudelPan(e: IREvent): IREvent {
  if (e.params && typeof e.params.pan === 'number') {
    const p = e.params.pan as number
    return { ...e, params: { ...e.params, pan: p * 2 - 1 } }
  }
  return e
}

// --------------------------------------------------------------------------
// Multi-cycle collect — loops per-cycle calls and concatenates events.
// Lives inline in the test for Wave 1; promoted to ir/collect.ts in
// Task 19-03-08 when Chunk semantics need it for production callers.
// --------------------------------------------------------------------------
export function collectCycles(
  ir: PatternIR,
  startCycle: number,
  endCycle: number,
): IREvent[] {
  const events: IREvent[] = []
  for (let c = startCycle; c < endCycle; c++) {
    const ctx: Partial<CollectContext> = {
      cycle: c,
      time: c,
      begin: c,
      end: c + 1,
      duration: 1,
    }
    events.push(...collect(ir, ctx))
  }
  return events
}

// --------------------------------------------------------------------------
// Diff helper — sort both sides; assert lengths; per pair assert each
// dimension and loc presence on ours.
// --------------------------------------------------------------------------
export type DiffDim = 'note' | 'begin' | 'end' | 's' | 'gain' | 'pan'

function sortKey(e: IREvent): string {
  return `${e.begin.toFixed(6)}|${e.s ?? ''}|${e.note ?? ''}`
}

function readDim(e: IREvent, dim: DiffDim): unknown {
  if (dim === 'pan') return e.params?.pan
  return (e as unknown as Record<string, unknown>)[dim]
}

export function diffEvents(
  expected: IREvent[],
  actual: IREvent[],
  dims: DiffDim[],
): void {
  const exp = [...expected].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const act = [...actual].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  expect(act.length).toBe(exp.length)
  for (let i = 0; i < exp.length; i++) {
    for (const dim of dims) {
      const e = readDim(exp[i], dim)
      const a = readDim(act[i], dim)
      // Numeric tolerance for time/pan/gain — Strudel uses Fraction; we use
      // Number. Equivalence within 1e-9 is the standard PatternIR tolerance.
      if (typeof e === 'number' && typeof a === 'number') {
        expect(Math.abs(a - e)).toBeLessThan(1e-9)
      } else {
        expect(a).toEqual(e)
      }
    }
    // PV24 — every IREvent must carry loc on our side.
    expect(act[i].loc).toBeDefined()
  }
}

// --------------------------------------------------------------------------
// Boot smoke — verifies evalScope+miniAllStrings ran cleanly and the
// mini-notation transpiler is wired into the global scope.
// --------------------------------------------------------------------------
describe('parity harness', () => {
  it('boots: evalScope+miniAllStrings registered combinators and mini transpiler', async () => {
    const r = await evaluate('s("bd")')
    const haps = (r.pattern as StrudelPattern).queryArc(0, 1)
    expect(haps.length).toBe(1)
  })

  it('empty pattern yields 0 events on the ours pipeline', () => {
    const ours = collectCycles(parseStrudel(''), 0, 1)
    expect(ours.length).toBe(0)
  })

  // ------------------------------------------------------------------
  // Phase 19-03 Task 03 — `.late(t)` parity.
  //
  // Parses the user-typed Strudel string into our IR (Late tag), then
  // collects events. Asks Strudel's real evaluator for the same code
  // string and queries the resulting pattern. Diff asserts EVENT COUNT,
  // SET-OF-(s,note), and PER-EVENT `begin`.
  //
  // Strudel's `queryArc(0, 1)` returns clipped haps for events that
  // cross the cycle boundary (an event at [0.875, 1.125) becomes two
  // clipped pieces [0.875, 1) and [0, 0.125)). `whole.begin` (preserved
  // as IREvent.begin via normalizeStrudelHap) is the stable un-clipped
  // onset; we dedupe by `(begin, s)` to recover the whole-event view
  // our IR uses, then compare per-event begins directly.
  // ------------------------------------------------------------------
  it('late parity: s("bd hh sd cp").late(0.125) — count, (s,note) set, and per-event begin match Strudel', async () => {
    const code = 's("bd hh sd cp").late(0.125)'
    // Strudel's queryArc(0,1) for `late(t)` returns:
    //   - 4 in-window haps with whole.begin in [0.125, 0.875]
    //   - the boundary-crossing cp split into two clipped pieces (same
    //     whole.begin=0.875)
    //   - the *previous* cycle's cp leaking forward (whole.begin=-0.125)
    // We dedupe by `whole.begin` to collapse the boundary pair, then
    // restrict to onsets in [0, 1) so the leaked previous-cycle hap
    // doesn't inflate the count. The result is the same whole-event
    // view our IR produces.
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 1)
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // Count + (s,note) set.
    const expectedSounds = new Set(expected.map((e) => e.s))
    const oursSounds = new Set(ours.map((e) => e.s))
    expect(oursSounds).toEqual(expectedSounds)
    expect(ours.length).toBe(oursSounds.size)
    expect(ours.length).toBe(expected.length)
    // Per-event `begin` — the load-bearing assertion that the relaxed
    // Wave 1 harness could not check. Strudel reports `whole.begin` for
    // each hap; our IR's `Late` wraps within the cycle window. They
    // should agree on the unique-by-`s` onset.
    const byS = (es: IREvent[]) => new Map(es.map((e) => [e.s as string, e]))
    const expBy = byS(expected)
    const ourBy = byS(ours)
    for (const [s, oe] of ourBy) {
      const ee = expBy.get(s)
      expect(ee).toBeDefined()
      expect(Math.abs(oe!.begin - ee!.begin)).toBeLessThan(1e-9)
    }
    // PV24 — every IREvent on our side must carry loc.
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  // ------------------------------------------------------------------
  // Phase 19-03 Task 04 — `.off(t, f)` parity.
  //
  // Ground truth: pattern.mjs:2236-2238 — off literally desugars to
  //   stack(pat, func(pat.late(time_pat)))
  // Our `case 'off':` in parseStrudel mirrors this 1:1 as
  //   Stack(body, transform(Late(t, body)))
  // — transform is applied to `body.late(t)`, so Late is INSIDE the
  // transform, not outside. Order matters when the transform re-times.
  //
  // Input: s("bd hh sd cp").off(0.125, x => x.gain(0.5))
  //   body events @ {0, 0.25, 0.5, 0.75}: bd, hh, sd, cp
  //   late(0.125)(body) shifts each by +0.125, wrapping cp@0.875 → 0.0.
  //   gain(0.5) applied to that adds {gain: 0.5} to each event's params.
  //   Stack of body + offset gives 8 unique-by-(begin,s) events per cycle.
  //
  // Choice of `gain(0.5)` (not `fast(2)` as the orchestrator brief
  // suggested): Strudel's `fast(N)` plays the body N times per cycle
  // (event-count-multiplying), but our IR's `Fast` only compresses time
  // without re-playing the body — a documented limitation predating this
  // wave. A `fast(2)` transform on the offset side produces 8 Strudel
  // events but only 4 ours. To keep the parity assertion strict and
  // load-bearing for the off-desugar (rather than a Fast-semantics
  // discrepancy), we use a non-multiplying transform. Fast-multiplication
  // parity is its own follow-up.
  //
  // We dedupe Strudel's clipped boundary pairs by (begin, s, note) and
  // restrict to in-window onsets. Diff is on count, (begin, s) tuples,
  // and gain dimension on the offset side.
  // ------------------------------------------------------------------
  it('off parity: s("bd hh sd cp").off(0.125, x => x.gain(0.5)) — count and per-event (begin, s) match Strudel', async () => {
    const code = 's("bd hh sd cp").off(0.125, x => x.gain(0.5))'
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 1)
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // 4 body + 4 offset = 8.
    expect(ours.length).toBe(expected.length)
    expect(ours.length).toBe(8)
    // (begin, s) tuples must match as sets — same onset set, same sample
    // assignments. This is the load-bearing diff for the off desugar.
    const tuple = (e: IREvent): string =>
      `${e.begin.toFixed(9)}|${e.s ?? ''}`
    const expSet = new Set(expected.map(tuple))
    const oursSet = new Set(ours.map(tuple))
    expect(oursSet).toEqual(expSet)
    // PV24 — every IREvent on our side must carry loc (presence, not
    // value precision — parseTransform doesn't thread baseOffset, so
    // events from the transform sub-tree carry the body's loc, which
    // is acceptable per pre-mortem item 10).
    for (const e of ours) expect(e.loc).toBeDefined()
  })
})
