---
phase: 05-per-track-data
plan: 01
subsystem: engine
tags: [strudel, pattern, scheduler, tdd, vitest, monkey-patch, setter-intercept]

# Dependency graph
requires:
  - phase: 04-vizrenderer-abstraction
    provides: PatternScheduler interface in types.ts

provides:
  - StrudelEngine.getTrackSchedulers() returning Map<string, PatternScheduler> after evaluate()
  - setter-intercept pattern for capturing per-$: Pattern instances during evaluate()
  - Unit tests (StrudelEngine.test.ts) covering TRACK-01 through TRACK-04

affects:
  - 06-inline-zones (consumes getTrackSchedulers() for per-track visualization)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Object.defineProperty setter trap to intercept injectPatternMethods assigning Pattern.prototype.p"
    - "Two-level defineProperty: outer setter intercepts assignment, inner value wraps the assigned fn"
    - "anonIndex reset to 0 per evaluate() call to mirror Strudel's anonymousIndex reset in hush()"
    - "savedDescriptor/finally restore to ensure Pattern.prototype.p is never permanently mutated"

key-files:
  created:
    - packages/editor/src/engine/StrudelEngine.test.ts
  modified:
    - packages/editor/src/engine/StrudelEngine.ts

key-decisions:
  - "Use Object.defineProperty setter trap (not naive prototype.p= assignment) because injectPatternMethods overwrites any pre-set monkey-patch before user code runs"
  - "Dynamic import('@strudel/core') inside evaluate() to access Pattern after init() loads it"
  - "Only restore savedDescriptor in finally — next evaluate() injectPatternMethods will re-install .p correctly regardless"
  - "Skip muted patterns (id starts/ends with _) to match Strudel's own silence logic"
  - "trackSchedulers map replaced entirely on re-evaluate to prevent stale pattern references"

patterns-established:
  - "Setter-intercept pattern: defineProperty with set handler wraps the assigned fn at intercept time"
  - "Mock repl.evaluate() simulates injectPatternMethods by doing Pattern.prototype.p = fn directly"

requirements-completed: [TRACK-01, TRACK-02, TRACK-03, TRACK-04]

# Metrics
duration: 8min
completed: 2026-03-22
---

# Phase 05 Plan 01: Per-Track Data Summary

**StrudelEngine.getTrackSchedulers() via Object.defineProperty setter-intercept on Pattern.prototype.p, capturing per-$: Pattern instances with anonymous key normalization and always-restore finally block**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-22T11:28:00Z
- **Completed:** 2026-03-22T11:36:00Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Implemented `getTrackSchedulers(): Map<string, PatternScheduler>` on StrudelEngine — returns one PatternScheduler per $: block after evaluate()
- Anonymous `$:` blocks produce keys `"$0"`, `"$1"` etc.; named `d1:` blocks produce key `"d1"`; muted `_x:` / `x_:` patterns are skipped
- Pattern.prototype.p always restored in finally block — no permanent prototype mutation even on evaluate error
- Re-evaluate replaces the map entirely preventing stale pattern references
- 9 unit tests covering all TRACK-01 through TRACK-04 requirements; full 85-test suite green

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for getTrackSchedulers() (RED)** - `bdbdb45` (test)
2. **Task 2: Implement getTrackSchedulers() with setter-intercept pattern (GREEN)** - `eacefb3` (feat)

_TDD plan: test commit (RED) then implementation commit (GREEN)_

## Files Created/Modified

- `packages/editor/src/engine/StrudelEngine.test.ts` - 9 unit tests for TRACK-01 through TRACK-04; mocks @strudel/core Pattern and @strudel/webaudio webaudioRepl; mock repl.evaluate() simulates injectPatternMethods assigning Pattern.prototype.p then calling .p(id) on mock Pattern instances
- `packages/editor/src/engine/StrudelEngine.ts` - Added `private trackSchedulers: Map<string, PatternScheduler>`; replaced evaluate() with setter-intercept version; added `getTrackSchedulers()` method

## Decisions Made

- **Setter-intercept over naive monkey-patch:** A naive `Pattern.prototype.p = fn` before calling `this.repl.evaluate()` is overwritten by `injectPatternMethods()` which runs synchronously inside `repl.evaluate()` before user code. The setter-intercept approach uses `Object.defineProperty` with a `set` handler so our capture fires when `injectPatternMethods` assigns `Pattern.prototype.p`.
- **Dynamic import inside evaluate():** Pattern imported as `await import('@strudel/core')` inside evaluate() to avoid top-level ESM import issues; by evaluate() time, the module is already loaded from init().
- **anonIndex reset to 0 per evaluate() call:** Strudel's internal `anonymousIndex` is reset to 0 via `hush()` inside each evaluate(). Our counter must also reset per call. If not reset, second evaluate gives wrong keys like `"$2"`, `"$3"`.
- **trackSchedulers replaced entirely on success:** On re-evaluate, old PatternScheduler wrappers close over stale Pattern instances. Replacing the entire map ensures consumers get fresh schedulers after each evaluate().

## Deviations from Plan

None — plan executed exactly as written. The setter-intercept approach was specified in the plan and research, and the implementation follows it precisely.

## Issues Encountered

None — the setter-intercept pattern worked correctly on first implementation attempt. All 9 tests passed after the GREEN phase implementation.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `getTrackSchedulers()` is ready for consumption by Phase 6 (inline zones)
- Returns `Map<string, PatternScheduler>` — same `PatternScheduler` interface already used by `getPatternScheduler()` and all existing visualizers
- Phase 6 can call `engine.getTrackSchedulers()` after each `evaluate()` to get per-track schedulers for inline pianoroll view zones

---
*Phase: 05-per-track-data*
*Completed: 2026-03-22*
