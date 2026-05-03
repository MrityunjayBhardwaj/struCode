/**
 * collect — the "Execute" interpreter for PatternIR.
 *
 * Walks a PatternIR tree and produces IREvent[].
 * The flattening operation: evaluates the tree at a given time range and
 * returns concrete events with absolute time positions.
 *
 * Ownership: collect() CREATES IREvents. It is the sole producer.
 * Consumers (viz, DAW, highlighting) read the resulting array.
 */

import type { PatternIR } from './PatternIR'
import type { IREvent } from './IREvent'

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG used by the `Degrade` tag. We mirror Strudel's
// legacy random algorithm (signal.mjs:237-258) so per-event drop decisions
// match Strudel's `degradeBy` event-for-event when seed=0:
//   __timeToIntSeed(t) = __xorwise(trunc(frac(t/300) * 2**29))
//   __xorwise(x)       = ((((x<<13)^x) >> 17) ^ ((x<<13)^x)) << 5 ^ ...
//   __intSeedToRand(s) = (s % 2**29) / 2**29
//   rand(t)            = abs(__intSeedToRand(__timeToIntSeed(t + seed)))
// `degradeBy(x)` keeps an event when `rand(begin) > x`, so retention prob
// `p` (our IR convention) corresponds to filtering by `rand < p`.
// All operations done in 32-bit space via Math.imul/|0 to match JS bitwise
// semantics for negative shifts. `RAND_SEED = 0` is the Strudel default.
// ---------------------------------------------------------------------------
const RAND_SEED = 0

function xorwise(x: number): number {
  // 32-bit signed semantics — match Strudel's __xorwise exactly.
  const a = ((x << 13) ^ x) | 0
  const b = ((a >> 17) ^ a) | 0
  return ((b << 5) ^ b) | 0
}

function timeToIntSeed(t: number): number {
  const frac = t / 300 - Math.trunc(t / 300)
  return xorwise(Math.trunc(frac * 536870912))
}

function intSeedToRand(s: number): number {
  return (s % 536870912) / 536870912
}

/**
 * `rand` at time `t` with default seed 0 — deterministic, matches
 * Strudel's `getRandsAtTime(t, 1, 0)` for the legacy RNG path
 * (signal.mjs:262-264, the default in @strudel/core@1.2.6).
 */
function seededRand(t: number, seed: number): number {
  return Math.abs(intSeedToRand(timeToIntSeed(t + seed)))
}

export interface CollectContext {
  /** Query window start (cycles) */
  begin: number
  /** Query window end (cycles) */
  end: number
  /** Current position within the query window */
  time: number
  /** Current cycle number — used for Every, Cycle selection */
  cycle: number
  /** Base duration for one "slot" in cycles (1 = full cycle) */
  duration: number
  /** Accumulated speed factor (Fast multiplies, Slow divides) */
  speed: number
  /** Inherited parameters from enclosing FX/Ramp nodes */
  params: Record<string, number | string>
}

const DEFAULT_CONTEXT: CollectContext = {
  begin: 0,
  end: Infinity,  // no window by default — all events emitted
  time: 0,
  cycle: 0,
  duration: 1,
  speed: 1,
  params: {},
}

/**
 * Convert a note to frequency in Hz.
 * - String notes: parsed as MIDI note name (c4 = middle C = 261.63 Hz)
 * - Numeric notes: treated as MIDI note number and converted to Hz
 * Returns null if the string format is unrecognised.
 */
function noteToFreq(note: string | number): number | null {
  if (typeof note === 'number') {
    // MIDI note number → Hz (MIDI 69 = A4 = 440 Hz)
    return 440 * Math.pow(2, (note - 69) / 12)
  }
  const noteNames = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b']
  const lower = note.toLowerCase()
  for (let i = 0; i < noteNames.length; i++) {
    const name = noteNames[i]
    if (lower.startsWith(name)) {
      const octaveStr = lower.slice(name.length)
      const octave = parseInt(octaveStr, 10)
      if (!isNaN(octave)) {
        const midi = (octave + 1) * 12 + i
        return 440 * Math.pow(2, (midi - 69) / 12)
      }
    }
  }
  return null
}

function makeEvent(ctx: CollectContext, note: string | number, params: Record<string, unknown>): IREvent {
  const duration = ctx.duration / ctx.speed
  // ctx.params (from FX/Ramp) override Play's own params — Ramp/FX are intentional overrides
  const merged = { ...params, ...ctx.params }
  return {
    begin: ctx.time,
    end: ctx.time + duration,
    endClipped: ctx.time + duration,
    note: note,
    freq: noteToFreq(note),
    s: (merged.s as string | null) ?? null,
    type: merged.s ? 'sample' : 'synth',
    gain: (merged.gain as number) ?? 1,
    velocity: (merged.velocity as number) ?? 1,
    color: (merged.color as string | null) ?? null,
    params: merged,
  }
}

/**
 * Walk a PatternIR tree and return a flat array of IREvents.
 *
 * @param ir - the pattern tree to evaluate
 * @param partialCtx - optional context override (begin, end, cycle, etc.)
 */
export function collect(ir: PatternIR, partialCtx?: Partial<CollectContext>): IREvent[] {
  const ctx: CollectContext = { ...DEFAULT_CONTEXT, ...partialCtx }
  return walk(ir, ctx)
}

function walk(ir: PatternIR, ctx: CollectContext): IREvent[] {
  switch (ir.tag) {
    case 'Pure':
      return []

    case 'Code':
      // Opaque fallback — cannot be evaluated without Strudel runtime
      return []

    case 'Play': {
      // Respect the query window: skip events outside [begin, end)
      if (ctx.time < ctx.begin || ctx.time >= ctx.end) return []
      const event = makeEvent(ctx, ir.note, { ...ir.params })
      // Propagate parser-side loc onto the produced event so consumers
      // (Inspector click-to-source, Monaco highlighting) can map this
      // event back to its source range. parseMini sets this when it
      // sees an atom; nodes built by hand via IR.play() without loc
      // produce events with loc undefined.
      if (ir.loc && ir.loc.length > 0) event.loc = ir.loc
      return [event]
    }

    case 'Sleep':
      // Sleep advances the cursor but produces no events
      return []

    case 'Seq': {
      // Sequential: each child runs after the previous, advancing time.
      // Children weight the available cycle proportionally — default 1
      // per child, with `Elongate(f, body)` declaring weight = f. Total
      // weight is the sum; each slot gets `(weight / total) * ctx.duration`.
      if (ir.children.length === 0) return []
      const weights = ir.children.map(c => (c.tag === 'Elongate' ? c.factor : 1))
      const total = weights.reduce((s, w) => s + w, 0)
      if (total <= 0) return []
      const events: IREvent[] = []
      let cursor = ctx.time
      for (let i = 0; i < ir.children.length; i++) {
        const child = ir.children[i]
        const slotDuration = ctx.duration * (weights[i] / total)
        // Unwrap Elongate so its body sees the weighted slot directly.
        const target = child.tag === 'Elongate' ? child.body : child
        const childCtx: CollectContext = {
          ...ctx,
          time: cursor,
          duration: slotDuration,
        }
        const childEvents = walk(target, childCtx)
        events.push(...childEvents)
        cursor += slotDuration / ctx.speed
      }
      return events
    }

    case 'Stack': {
      // Parallel: all tracks at same time
      const events: IREvent[] = []
      for (const track of ir.tracks) {
        events.push(...walk(track, ctx))
      }
      return events
    }

    case 'Choice': {
      // Probabilistic: pick one branch (seeded determinism deferred to Phase 19)
      const chosen = Math.random() < ir.p ? ir.then : ir.else_
      return walk(chosen, ctx)
    }

    case 'Every': {
      // Periodic: body fires on matching cycles, default otherwise
      const fires = ctx.cycle % ir.n === 0
      if (fires) return walk(ir.body, ctx)
      if (ir.default_) return walk(ir.default_, ctx)
      return []
    }

    case 'Cycle': {
      // Alternation: pick item based on current cycle
      if (ir.items.length === 0) return []
      const item = ir.items[ctx.cycle % ir.items.length]
      return walk(item, ctx)
    }

    case 'When': {
      // Conditional: evaluate gate string at current time
      // Gate is a mini-notation boolean pattern like "1 0 1 1"
      // Simple evaluation: split by spaces, pick slot by position
      const slots = ir.gate.trim().split(/\s+/)
      if (slots.length === 0) return []
      const slotIndex = Math.floor((ctx.time % 1) * slots.length)
      const slot = slots[Math.min(slotIndex, slots.length - 1)]
      const active = slot !== '0' && slot !== '' && slot !== '~'
      if (active) return walk(ir.body, ctx)
      return []
    }

    case 'FX': {
      // FX adds params metadata — does not affect timing
      const childCtx: CollectContext = {
        ...ctx,
        params: { ...ctx.params, ...ir.params },
      }
      return walk(ir.body, childCtx)
    }

    case 'Ramp': {
      // Ramp interpolates a param value over cycles
      const progress = ir.cycles > 0 ? Math.min(ctx.cycle / ir.cycles, 1) : 1
      const value = ir.from + (ir.to - ir.from) * progress
      const childCtx: CollectContext = {
        ...ctx,
        params: { ...ctx.params, [ir.param]: value },
      }
      return walk(ir.body, childCtx)
    }

    case 'Fast': {
      // Time compression: events happen faster (more events per cycle)
      const childCtx: CollectContext = {
        ...ctx,
        speed: ctx.speed * ir.factor,
        duration: ctx.duration,
      }
      return walk(ir.body, childCtx)
    }

    case 'Slow': {
      // Time dilation: events happen slower (fewer events per cycle)
      const childCtx: CollectContext = {
        ...ctx,
        speed: ctx.speed / ir.factor,
        duration: ctx.duration,
      }
      return walk(ir.body, childCtx)
    }

    case 'Loop': {
      // Loop is structural — the scheduler handles repetition.
      // collect() evaluates body once (for the current cycle window).
      return walk(ir.body, ctx)
    }

    case 'Elongate': {
      // Inside a Seq parent the weight is consumed there. Standalone
      // (e.g. `Elongate(2, Play(c4))` at the top level) is degenerate
      // — there is no sibling to take time from, so we just walk the
      // body unchanged. The factor is recoverable from the tree if a
      // future consumer needs structural intent.
      return walk(ir.body, ctx)
    }

    case 'Late': {
      // Strudel's late(t) = early(-t). early(t) does
      //   pat.withQueryTime(t => t.add(offset)).withHapTime(t => t.sub(offset))
      // (pattern.mjs:2061-2069). The net effect is a forward time shift
      // by `offset` cycles that PRESERVES cycle length — i.e., events
      // wrap modulo 1 within the current cycle window.
      //
      // Per-cycle collect (ctx.begin..ctx.end == [cycle, cycle+1)) means
      // the wrap reduces to: shifted begin >= cycle+1 → subtract 1;
      // shifted begin < cycle → add 1. For offsets in (-1, 1) — the
      // overwhelming-typical Strudel use case — at most one wrap unit is
      // needed.
      const events = walk(ir.body, ctx)
      return events.map((e) => {
        let begin = e.begin + ir.offset
        let end = e.end + ir.offset
        let endClipped = e.endClipped + ir.offset
        if (begin >= ctx.cycle + 1) {
          begin -= 1
          end -= 1
          endClipped -= 1
        } else if (begin < ctx.cycle) {
          begin += 1
          end += 1
          endClipped += 1
        }
        return { ...e, begin, end, endClipped }
      })
    }

    case 'Degrade': {
      // Strudel's `degradeBy(x)` (signal.mjs:699-706) is
      //   pat._degradeByWith(rand, x)
      // i.e. keep events where the rand signal at the event's time
      // exceeds x. Our IR's `p` is the RETENTION probability — keep
      // when `seededRand(begin) < p`. The seededRand helper mirrors
      // Strudel's legacy `__timeToRands` exactly so seed=0 produces
      // the same drop set as Strudel for matching event onsets.
      // Event `loc` is preserved on retained events (PV24).
      const events = walk(ir.body, ctx)
      return events.filter((e) => seededRand(e.begin, RAND_SEED) < ir.p)
    }

    case 'Chunk': {
      // Strudel's `chunk(n, func)` (pattern.mjs:2569-2578):
      //   binary = [true, false × (n-1)]; binary_pat = _iter(n, sequence(binary), true)
      //   pat = pat.repeatCycles(n)
      //   return pat.when(binary_pat, func)
      //
      // `repeatCycles(n)` (pattern.mjs:2530-2545) makes one source cycle
      // span `n` outer cycles — outer cycle k plays only the source's
      // [k/n, (k+1)/n) slice. Combined with the rotated binary, every
      // event the source emits during outer cycle k is in the active
      // slot, so `func` is applied to ALL emitted events.
      //
      // We model this by querying the body in its NATURAL single-cycle
      // window (ctx adjusted to begin=0, end=1, cycle=0), then keeping
      // only events whose source-time falls in the slot for the current
      // outer cycle. Slot events are taken from `ir.transform` (parsed
      // at the same body position by `parseTransform`) so that arbitrary
      // user-supplied transforms — including ones that change params or
      // re-time within the slot — produce the right output. Events
      // outside the active slot are dropped (they belong to other outer
      // cycles, just like Strudel's slowed body wouldn't emit them
      // here). The active-slot events are then re-timed from
      // [slot/n, (slot+1)/n) up to fill [outerCycle, outerCycle+1).
      //
      // v1 limitation (documented in PLAN pre-mortem 3): bodies that are
      // themselves multi-cycle aren't handled — we always pull from a
      // single normalised body cycle. Strudel's repeatCycles handles
      // multi-cycle source patterns by rolling the source forward; we
      // don't model that here.
      const slot = ((ctx.cycle % ir.n) + ir.n) % ir.n
      const slotStart = slot / ir.n
      const slotEnd = (slot + 1) / ir.n
      const sourceCtx: CollectContext = {
        ...ctx,
        cycle: 0,
        time: 0,
        begin: 0,
        end: 1,
        duration: 1,
      }
      const transformedEvents = walk(ir.transform, sourceCtx)
      const inSlot = (e: IREvent): boolean =>
        e.begin >= slotStart - 1e-9 && e.begin < slotEnd - 1e-9
      const slotEvents = transformedEvents.filter(inSlot)
      // Re-time: stretch [slotStart, slotEnd) → [outerCycle, outerCycle+1).
      // outer = (within - slotStart) * n + ctx.cycle
      return slotEvents.map((e) => {
        const remappedBegin = (e.begin - slotStart) * ir.n + ctx.cycle
        const remappedEnd = (e.end - slotStart) * ir.n + ctx.cycle
        const remappedEndClipped =
          (e.endClipped - slotStart) * ir.n + ctx.cycle
        return {
          ...e,
          begin: remappedBegin,
          end: remappedEnd,
          endClipped: remappedEndClipped,
        }
      })
    }
  }
}
