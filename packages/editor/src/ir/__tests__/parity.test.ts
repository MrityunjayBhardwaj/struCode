// @vitest-environment node
/**
 * parity.test.ts — Tier 4 JS API parity harness.
 *
 * Scope (Phase 19-03 D-03): each modeled Strudel transform (jux/off/late/
 * degrade/chunk/ply) gets an `it()` block that compares two pipelines and
 * asserts event-list equivalence on the dimensions our IR claims to model.
 *
 * Pipeline A (reference): construct the equivalent Strudel pattern via the
 *   real `@strudel/core/pattern.mjs` + `signal.mjs` exports, then call
 *   `pattern.queryArc(c, c+1)` per cycle. Pan range is normalised from
 *   Strudel's [0,1] (juxBy at pattern.mjs:2356-2381) to our IR's [-1,1]
 *   convention (PatternIR.ts:23) via `normalizeStrudelPan`.
 *
 * Pipeline B (ours): parseStrudel → collect, looped per-cycle via the
 *   inline `collectCycles` helper.
 *
 * --- Why no `evalScope` / `evaluate` / mini-notation ---
 *
 * The natural approach (RESEARCH §6.1) was `await evalScope(core, mini);
 * miniAllStrings()` followed by `evaluate(code)`. That requires importing
 * `@strudel/core` (package root) and `@strudel/mini` (which itself
 * imports `@strudel/core`). The package root resolves to
 * `dist/index.mjs`, which does `import { SalatRepl } from
 * '@kabelsalat/web'`. Under vitest the `@kabelsalat/web` package
 * resolves to its CJS `dist/index.js`, which has no named ESM exports;
 * the static ESM linker rejects the import before any test setup runs.
 * Vite alias / `server.deps.inline` configurations did not redirect the
 * transitive import (vite-node externalises node_modules via the native
 * Node ESM resolver, which does not honour vite aliases for transitive
 * imports inside externalised packages).
 *
 * Resolution: import the source-level Strudel submodules directly
 * (`pattern.mjs`, `signal.mjs`, `controls.mjs`, …). These do not
 * transitively import `repl.mjs` and so do not pull in kabelsalat. We
 * build expected patterns via the registered combinators (`fastcat`,
 * `pure`, `s`, `note`, `late`, `jux`, `off`, `chunk`, …) directly. This
 * gives us Strudel's real evaluator behaviour without going through the
 * code-string parser. Per-method tests document the JS construction
 * alongside the Strudel string our parser sees.
 *
 * Diff: sort both sides by (begin, s, note); assert lengths; per pair
 *   assert each requested dimension matches and `loc` is present on the
 *   actual (ours) event (PV24 — every IREvent must carry loc).
 *
 * Init: nothing. Source-level submodule imports register their
 *   combinators on Strudel's internal Pattern prototype at module-load
 *   time.
 *
 * Known scope limitations (documented in test bodies as they land):
 *   - Inputs use decimal literals (`0.125`), not fraction literals
 *     (`1/8`); same as `.fast()` today.
 *   - `chunk` parity uses single-cycle bodies; multi-cycle bodies need
 *     Strudel's repeatCycles(n) modelling (follow-up).
 *   - `degrade` uses event-count tolerance (seededRand differs from
 *     Strudel's getRandsAtTime; RESEARCH §5).
 */
import { describe, it, expect } from 'vitest'
// Source-level Strudel imports — see header comment for why we cannot
// use `@strudel/core` (package root).
import * as corePattern from '@strudel/core/pattern.mjs'
import * as coreSignal from '@strudel/core/signal.mjs'
import * as coreControls from '@strudel/core/controls.mjs'

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
// Pipeline A — Strudel reference events from a constructed Pattern.
// `buildPattern` is per-method: each per-method `it()` block constructs
// the equivalent Strudel pattern manually using the registered
// combinators (e.g., `s('bd').late(0.125)` becomes
// `corePattern.s('bd').late(0.125)`).
// --------------------------------------------------------------------------
type StrudelPattern = {
  queryArc: (begin: number, end: number) => unknown[]
}

export function strudelEventsFromPattern(
  pattern: StrudelPattern,
  cyclesToQuery = 1,
): IREvent[] {
  const haps: unknown[] = []
  for (let c = 0; c < cyclesToQuery; c++) {
    haps.push(...pattern.queryArc(c, c + 1))
  }
  return haps.map((h) => normalizeStrudelHap(h))
}

// Re-export a tightened handle on the Strudel surface we use, so per-
// method tests can build patterns without re-importing the .mjs files.
// Merge the three source-level submodules into one bag — `s`/`note` from
// controls, `late`/`jux`/`off`/`chunk` from pattern, `degrade*` from
// signal.
export const strudel: Record<string, unknown> = {
  ...(corePattern as unknown as Record<string, unknown>),
  ...(coreSignal as unknown as Record<string, unknown>),
  ...(coreControls as unknown as Record<string, unknown>),
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
// Boot smoke — verifies the file loads under vitest node env, the
// Strudel source-level imports register cleanly, and an empty body
// yields 0 events on both pipelines. Per-method `it()` blocks land in
// subsequent waves.
// --------------------------------------------------------------------------
describe('parity harness', () => {
  it('boots: source-level Strudel submodules load and register pattern combinators', () => {
    // The fact that this `it()` runs at all proves all imports resolved
    // (no kabelsalat fallout). Surface-checks: `s` and `late` are
    // present on the Strudel pattern surface.
    expect(typeof (strudel as { s?: unknown }).s).toBe('function')
    expect(typeof (strudel as { late?: unknown }).late).toBe('function')
    expect(typeof (strudel as { fastcat?: unknown }).fastcat).toBe('function')
  })

  it('empty pattern yields 0 events on the ours pipeline', () => {
    const ours = collectCycles(parseStrudel(''), 0, 1)
    expect(ours.length).toBe(0)
  })
})

