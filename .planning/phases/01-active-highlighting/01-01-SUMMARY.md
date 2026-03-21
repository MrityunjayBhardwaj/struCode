---
phase: 01-active-highlighting
plan: 01
subsystem: editor/highlighting
tags: [hooks, monaco, highlighting, timing, tdd, css]
dependency_graph:
  requires: []
  provides:
    - useHighlighting React hook (HapStream to Monaco decoration bridge)
    - CSS fix for strudel-active-hap class
  affects:
    - packages/editor/src/monaco/StrudelMonaco.tsx (CSS stub corrected)
tech_stack:
  added: []
  patterns:
    - Per-hap IEditorDecorationsCollection for independent decoration lifecycles
    - window.setTimeout with Math.max(0, scheduledAheadMs) for audio-synced timing
    - Canvas ctx.fillStyle trick for runtime CSS color parsing
    - Module-level Map for per-color style injection deduplication
key_files:
  created:
    - packages/editor/src/monaco/useHighlighting.ts
    - packages/editor/src/monaco/useHighlighting.test.ts
  modified:
    - packages/editor/src/monaco/StrudelMonaco.tsx
decisions:
  - "Per-hap decoration collection (not shared collection): each hap gets its own IEditorDecorationsCollection for truly independent clear() calls"
  - "Flat timeoutIdsRef array for bulk cancellation — simple and correct for cleanup"
  - "Canvas color parsing for per-note color — graceful fallback to base class if canvas unavailable"
metrics:
  duration_minutes: 3
  completed_date: "2026-03-21T15:45:12Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 01 Plan 01: useHighlighting Hook and CSS Fix Summary

**One-liner:** HapStream-to-Monaco decoration bridge with setTimeout-based audio-synced timing, per-hap collection lifecycle, and corrected snap-off CSS.

## What Was Built

### Task 1: useHighlighting hook (TDD)

`packages/editor/src/monaco/useHighlighting.ts` implements `useHighlighting(editor, hapStream)` which:

- Subscribes to `HapStream.on()` in a `useEffect` (deps: `[editor, hapStream]`)
- For each `HapEvent` with `loc` data, schedules two `window.setTimeout` calls:
  - Show: fires at `Math.max(0, scheduledAheadMs)` ms — calls `editor.createDecorationsCollection()` with `className: 'strudel-active-hap'`
  - Clear: fires at `showDelay + audioDuration * 1000` ms — calls `collection.clear()`
- Each hap gets a unique key (`hap-N` via monotonic counter) and its own `IEditorDecorationsCollection` stored in `hapCollectionsRef`
- Cleanup: `hapStream.off(handler)` + cancel all pending timeouts + clear all collections
- Returns `{ clearAll }` for imperative clearing from parent (e.g., on evaluate())
- Per-note color: `getDecorationClassName(color)` injects a `<style>` tag with parsed RGB values, returns `'strudel-active-hap strudel-active-hap--cHASH'`

`packages/editor/src/monaco/useHighlighting.test.ts` has 8 tests:
- HIGH-01: decoration appears after scheduledAheadMs ms
- HIGH-02: exact timing — not at 99ms, yes at 100ms
- HIGH-03: clear fires at scheduledAheadMs + audioDuration*1000
- HIGH-04: two haps with independent clear cycles
- HIGH-05: null loc is silently skipped
- Cleanup: switching hapStream cancels pending timeouts
- Late hap: negative scheduledAheadMs clamps to 0
- Per-note color: className contains 'strudel-active-hap'

### Task 2: CSS stub fix

`StrudelMonaco.tsx` `injectHighlightStyles()` updated:
- Background opacity: `0.25` → `0.3` (matches `--code-active-hap` token and UI-SPEC)
- Removed `transition: opacity 80ms ease` (snap-off behavior per CONTEXT.md locked decision)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | bf713d9 | feat(01-01): implement useHighlighting hook with TDD tests |
| 2    | cb7644d | fix(01-01): correct CSS stub in StrudelMonaco.tsx per UI-SPEC |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test hap construction to produce valid loc data**
- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** Tests called `hapStream.emit({}, ...)` which produced `loc: null` because `HapStream.emit()` extracts loc from `hap?.context?.locations`. Empty `{}` hap has no context, so all location-dependent tests failed.
- **Fix:** Added `makeHap()` factory in tests that constructs a proper hap object with `context: { locations: [...] }`. Also removed unused `HapEvent` import.
- **Files modified:** `packages/editor/src/monaco/useHighlighting.test.ts`
- **Commit:** bf713d9

## Verification Results

- `pnpm test -- useHighlighting.test.ts --reporter=verbose`: 8/8 tests pass
- `pnpm test` (full suite): 13/13 tests pass (no regressions)
- `grep 'transition' StrudelMonaco.tsx`: returns 0 matches
- `grep 'strudel-active-hap' useHighlighting.ts`: present (2 matches)

## Known Stubs

None — hook is fully wired to HapStream and Monaco APIs. The `clearAll` return value is not yet consumed by the parent (`StrudelMonaco.tsx` or `StrudelEditor`) — that wiring is deferred to Plan 02 which integrates the hook into the editor component.

## Self-Check: PASSED

- packages/editor/src/monaco/useHighlighting.ts: FOUND
- packages/editor/src/monaco/useHighlighting.test.ts: FOUND
- packages/editor/src/monaco/StrudelMonaco.tsx: FOUND (modified)
- Commit bf713d9: FOUND
- Commit cb7644d: FOUND
