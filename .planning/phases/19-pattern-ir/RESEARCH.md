---
phase: 19
confidence: HIGH
researcher: anvi-researcher
created: 2026-03-26T00:00:00Z
---

# Phase 19 Research: Pattern IR

## Boundary Analysis

### Boundary 1: Event Type Union (NormalizedHap vs HapEvent vs SoundEvent vs QueryEvent)

Four event types exist across two projects. Here is a field-by-field comparison:

| Field | NormalizedHap | HapEvent | SoundEvent | QueryEvent |
|-------|:---:|:---:|:---:|:---:|
| begin/time (seconds) | `begin` (cycles) | `audioTime` (seconds) | `audioTime` (seconds) | `time` (seconds) |
| end/duration | `end` (cycles), `endClipped` | `audioDuration` (seconds) | `audioDuration` (seconds) | `duration` (seconds) |
| note | `note` (MIDI or string or null) | `midiNote` (number or null) | `midiNote` (number or null) | in `params.note` |
| freq | `freq` (Hz or null) | -- | -- | in `params.freq` |
| instrument/sample | `s` (string or null) | `s` (string or null) | `s` (string or null) | `type` + `params.name`/`params.synth` |
| gain | `gain` (0-1) | -- | -- | in `params` |
| velocity | `velocity` (0-1) | -- | -- | -- |
| color | `color` (string or null) | `color` (string or null) | -- | -- |
| source location | -- | `loc` (char ranges) | `srcLine` (1-based) | -- (Step has `srcLine`) |
| track ID | -- | -- | `trackId` | -- |
| scheduling | -- | `scheduledAheadMs` | `scheduledAheadMs` | -- |
| raw engine hap | -- | `hap` (any) | -- | -- |
| event kind | -- | -- | -- | `type` ('synth' or 'sample') |

**Finding:** The union of all fields is: `{ begin, end, endClipped?, note, freq, s, gain, velocity, color, loc, trackId, type, params }`. Two time domains exist: **cycle time** (NormalizedHap, used by Strudel queryable path) and **audio seconds** (everything else). The IR must either pick one or carry both.
**Confidence:** HIGH
**Source:** Direct code reading of all four types.
**Verified:** Yes.

**Critical decision point:** NormalizedHap uses cycle-position time (fractional cycle numbers). SoundEvent/HapEvent/QueryEvent use audio-seconds. The IR needs a clear time domain. Cycle time is more musically meaningful (engine-agnostic), audio-seconds is more universal. Recommendation: cycle time as primary (like NormalizedHap), with optional audio-time annotation for real-time scheduling.

### Boundary 2: PatternScheduler Interface

Current interface is minimal:
```typescript
interface PatternScheduler {
  now(): number
  query(begin: number, end: number): NormalizedHap[]
}
```

**Finding:** This is the consumer-facing query API. It works for viz. The thesis envisions a richer `PatternIR` with `onChange()`, `apply()`, and provenance. But the query interface itself is already correct for consumers. The IR should implement PatternScheduler (backward-compatible) while adding richer capabilities.
**Confidence:** HIGH
**Source:** `visualizers/types.ts`, THESIS_v2.md section 7.1
**Verified:** Yes.

### Boundary 3: Program (Free Monad) Location

The sonicPiWeb `Program` type (`Step[]`) is currently in the sonicPiWeb repo at `src/engine/Program.ts`. It is imported by struCode's SonicPiEngine adapter via a fragile relative path:
```typescript
import { SonicPiEngine } from '../../../../../../sonicPiWeb/src/engine/SonicPiEngine'
```

**Finding:** The Program type is Sonic Pi-specific (tags: `play`, `sample`, `sleep`, `useSynth`, `useBpm`, `fx`, `thread`, `cue`, `sync`). These are imperative, sequential steps -- fundamentally different from Strudel's declarative pattern algebra. The Program type should NOT become the IR. Instead, each engine compiles its native representation down to a common IR event stream. The Free Monad stays in sonicPiWeb; the IR lives in struCode (or a new shared package).
**Confidence:** HIGH
**Source:** Direct comparison of Program.ts (imperative step list) vs thesis IR design (transform tree).
**Verified:** Yes.

**Key insight:** The thesis envisions the IR as a *transform tree* (source nodes, transform nodes, combinator nodes). This maps naturally to Strudel's pattern algebra but NOT to Sonic Pi's imperative model. For Sonic Pi, the "IR" is effectively the flattened event output of QueryInterpreter -- there's no transform tree to inspect. This is fine: S3 (state-accumulating) code can only produce flat events, not inspectable transform chains. The Stratum classification from sonicPiWeb already captures this distinction.

### Boundary 4: Module Location

**Options considered:**

| Option | Pros | Cons |
|--------|------|------|
| New `@strucode/ir` package | Clean boundary, shareable | Extra package overhead, coordination cost |
| Inside `@strucode/editor` (new `src/ir/` dir) | Simple, no new package | Couples IR to editor |
| Inside existing engine dir | No new structure | Muddies engine abstraction |

**Finding:** Currently there are only two packages (`app`, `editor`). Adding a third package is premature -- there's no third consumer yet. The IR types should live in `packages/editor/src/ir/` as a new module directory, exported from the package. When a third package needs the IR, extract then.
**Confidence:** MEDIUM (architectural judgment, not a technical fact)
**Source:** Package structure observation, YAGNI principle.

### Boundary 5: Migration Strategy

Current consumers of NormalizedHap (26 files touch it):
- All viz sketches (Pianoroll, Scope, Spectrum, Spiral, Pitchwheel, Wordfall, Fscope)
- BufferedScheduler
- useHighlighting
- VizPanel, useVizRenderer
- Tests

**Finding:** NormalizedHap can become a type alias for the new IREvent, or IREvent can extend NormalizedHap with additional fields. Re-export strategy: `export type { IREvent as NormalizedHap }` preserves backward compatibility. The PatternScheduler interface stays as-is (it's already correct).
**Confidence:** HIGH
**Source:** Grep of all NormalizedHap/PatternScheduler imports.
**Verified:** Yes.

## Technical Findings

### F1: IREvent Field Design (Union)

The minimal IR event type based on the four-type union:

```typescript
interface IREvent {
  // Time (cycle-based, engine-agnostic)
  begin: number          // cycle position start
  end: number            // cycle position end
  endClipped?: number    // for active detection (optional)

  // Pitch
  note: number | string | null  // MIDI number or note name
  freq: number | null           // Hz (derivable from note, but pre-computed for perf)

  // Instrument
  s: string | null       // instrument/sample name
  type?: 'synth' | 'sample'  // event kind (from QueryEvent)

  // Dynamics
  gain: number           // 0-1 (default 1)
  velocity: number       // 0-1 (default 1)

  // Display
  color: string | null

  // Provenance (new -- thesis requirement)
  loc?: SourceLocation[] // source code ranges
  trackId?: string       // which track produced this

  // Extensible params bag (from QueryEvent.params)
  params?: Record<string, unknown>
}
```

**Confidence:** HIGH for the base fields (observed in all types). MEDIUM for `params` bag (design choice).

### F2: Transforms Needed

From the thesis and current usage, the essential transforms are:

1. **merge** -- combine events from multiple patterns/tracks (already implicit in Strudel's `stack`)
2. **timestretch** -- `.fast()`, `.slow()` -- scale cycle positions
3. **transpose** -- shift note values
4. **filter** -- select events by predicate (track, time range, instrument)
5. **gain/velocity scale** -- multiply dynamics

These are NOT methods on IREvent. They operate on `IREvent[]` or on an `IRPattern` (the queryable container). They should be pure functions: `(events: IREvent[]) => IREvent[]`.

**Confidence:** MEDIUM (thesis-driven, not yet proven by consumer demand).

### F3: Strudel vs Sonic Pi Compilation Paths

- **Strudel** already has `queryArc()` which returns haps with cycle times. `normalizeStrudelHap()` converts to NormalizedHap. This becomes: `queryArc() -> normalize -> IREvent[]`.
- **Sonic Pi** has `QueryInterpreter.queryProgram()` which returns QueryEvents in audio-seconds. Needs a seconds-to-cycles conversion (divide by beat duration). Then map to IREvent.
- **BufferedScheduler** already bridges HapStream (real-time) to NormalizedHap (queryable). It maps audio-seconds to... audio-seconds (not cycles). This is a lurking inconsistency: NormalizedHap documents "cycle position" but BufferedScheduler fills it with audioContext.currentTime. This needs to be resolved.

**Finding:** BufferedScheduler stores `audioTime` in the `begin`/`end` fields that NormalizedHap documents as "cycle position." Strudel's normalizer puts actual cycle positions. Consumers (viz sketches) use `scheduler.now()` which returns `audioContext.currentTime` for BufferedScheduler but cycle position for Strudel's native scheduler. This works because each scheduler's `now()` matches its own time domain -- but it means the "NormalizedHap" time domain is NOT actually normalized across engines.
**Confidence:** HIGH
**Source:** Direct comparison of BufferedScheduler.ts line 32-33 vs NormalizedHap.ts line 6-9.
**Verified:** Yes. This is a real inconsistency that the IR must resolve.

## Invariants

### Existing (from vyapti.md)
- **UV6:** Observation without mutation -- IR must be read-only snapshots, never mutate engine state.
- **UV3:** Pipeline argument transformation -- Strudel's transpiler reifies strings; IR must handle both raw and transformed types.
- **PV1:** Strudel Pattern methods return new instances -- tagging for provenance must be on return values.

### New Invariants for Phase 19

- **IRV1: Time Domain Consistency** -- Wherever an IREvent is produced, its `begin`/`end` must be in the same time domain as the PatternScheduler's `now()`. If cycle-based, both must be cycles. If audio-seconds, both must be audio-seconds.
- **IRV2: Field Presence** -- Wherever an IREvent has `note != null`, `freq` should be derivable (and vice versa). Producers should compute both; consumers should tolerate either being null.
- **IRV3: Backward Compatibility** -- Wherever NormalizedHap is consumed today, IREvent must be assignable to NormalizedHap without breaking. New fields must be optional.

## Risks & Mitigations

### R1: Time Domain Split (HIGH risk)
**Risk:** BufferedScheduler uses audio-seconds, Strudel uses cycle-time. Unifying means one or both must change. Changing BufferedScheduler affects all Sonic Pi viz.
**Mitigation:** Keep time domain engine-specific for now. IREvent carries both: `begin`/`end` (scheduler-local time, matches `now()`) and optional `cycleBegin`/`cycleEnd` (true cycle position, null for streaming-only engines). This preserves backward compatibility while enabling cross-engine comparison in the future.

### R2: Premature Abstraction (MEDIUM risk)
**Risk:** Building a full transform tree IR (thesis section 7.1) before there are consumers for it. Only two engines exist. The DAW view and Transform Graph view don't exist yet.
**Mitigation:** Phase 19 should define the flat IREvent type and the IRPattern query interface only. The transform tree (IRNode, IRMutation, ProvenanceHap) is Phase 20+ work. Ship the event layer first.

### R3: Breaking Existing Viz (LOW risk)
**Risk:** Renaming NormalizedHap to IREvent or changing its shape breaks 26 files.
**Mitigation:** IREvent extends NormalizedHap shape. Re-export `NormalizedHap` as a type alias. Viz code doesn't change.

### R4: sonicPiWeb Coupling (MEDIUM risk)
**Risk:** The adapter imports sonicPiWeb via a fragile `../../../../../../sonicPiWeb/` path. If IR types move, this path may need updating.
**Mitigation:** IR types are struCode-internal. The adapter already translates SoundEvent -> HapEvent. It will translate SoundEvent -> IREvent instead. No new coupling to sonicPiWeb.

## Recommended Approach

1. **Define `IREvent`** in `packages/editor/src/ir/IREvent.ts` as the superset of NormalizedHap + new fields (loc, trackId, params). Make NormalizedHap a type alias for backward compatibility.

2. **Define `IRPattern`** in `packages/editor/src/ir/IRPattern.ts` as a superset of PatternScheduler: `{ now(): number, query(begin, end): IREvent[], meta?: { trackId, stratum, engineId } }`. PatternScheduler becomes an alias.

3. **Add pure transform functions** in `packages/editor/src/ir/transforms.ts`: `merge`, `filter`, `transpose`, `timestretch`. These are `(events: IREvent[]) => IREvent[]`. No classes, no state.

4. **Migrate producers** (normalizeStrudelHap, BufferedScheduler, sonicpi adapter) to emit IREvent. This is additive -- existing fields stay, new optional fields added.

5. **Do NOT move the Program type.** sonicPiWeb's Free Monad stays in sonicPiWeb. It compiles down to IREvent[] via the adapter. The IR is the shared consumer-facing type, not the engine-internal representation.

6. **Do NOT build the transform tree yet.** IRNode, IRMutation, ProvenanceHap are thesis features for the DAW/debugger views. They have no consumer in the current codebase. Ship flat events first.
