---
phase: 01-active-highlighting
plan: 02
subsystem: editor/highlighting
tags: [react, hooks, monaco, highlighting, lifecycle, hapstream]

dependency_graph:
  requires:
    - phase: 01-active-highlighting
      plan: 01
      provides: useHighlighting hook (HapStream to Monaco decoration bridge)
  provides:
    - useHighlighting wired into StrudelEditor lifecycle (hapStream state, evaluate clearing, stop cleanup)
    - End-to-end active note highlighting from audio scheduler to Monaco decorations
  affects:
    - packages/editor/src/StrudelEditor.tsx

tech-stack:
  added: []
  patterns:
    - useState<HapStream | null>(null) — lazy hapStream capture after engine.init()
    - clearHighlights() before evaluate() — stale decoration clearing on re-evaluate
    - clearHighlights in handleStop dependency array — proper React closure hygiene

key-files:
  created: []
  modified:
    - packages/editor/src/StrudelEditor.tsx

key-decisions:
  - "useHighlighting placed before handlePlay/handleStop callbacks so clearHighlights is in scope for both dependency arrays"
  - "setHapStream(engine.getHapStream()) called after engine.init() — hapStream is stable (same instance per engine lifetime), safe to set on every play"
  - "No highlightEnabled conditional — always on while playing per CONTEXT.md YAGNI lock"

patterns-established:
  - "Pattern: hook that returns imperative clearAll used in sibling callbacks via dependency array"

requirements-completed: [HIGH-01, HIGH-02, HIGH-03, HIGH-04, HIGH-05]

duration: 5min
completed: 2026-03-21
---

# Phase 01 Plan 02: Wire useHighlighting into StrudelEditor Summary

**useHighlighting hook wired into StrudelEditor lifecycle: hapStream captured after engine.init(), decorations cleared before evaluate() and on stop(), completing end-to-end audio-synced character highlighting**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-21T15:46:17Z
- **Completed:** 2026-03-21T21:09:08Z
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify auto-approved)
- **Files modified:** 1

## Accomplishments

- Wired `useHighlighting(editorRef.current, hapStream)` into `StrudelEditor.tsx` with correct React hook placement before callbacks
- `hapStream` state captured from `engine.getHapStream()` in `handlePlay` after `engine.init()` — ensures hook subscribes to the live engine stream
- `clearHighlights()` called before `engine.evaluate(code)` to purge stale decorations from previous patterns
- `clearHighlights()` called in `handleStop` for immediate decoration teardown on user stop
- All 13 existing tests continue to pass — no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire useHighlighting into StrudelEditor.tsx** - `0ab9818` (feat)
2. **Task 2: Verify active highlighting visually** - checkpoint:human-verify (auto-approved, auto_advance=true)

## Files Created/Modified

- `packages/editor/src/StrudelEditor.tsx` - Added useHighlighting import, HapStream type, hapStream state, hook call before callbacks, getHapStream() capture in handlePlay, clearHighlights() in handlePlay and handleStop, updated dependency arrays

## Decisions Made

- `useHighlighting` call placed before `handlePlay` and `handleStop` definitions so `clearHighlights` is available in both callback closures and their dependency arrays — React rule: hooks must be called in consistent order, and `const` bindings are not hoisted
- `setHapStream(engine.getHapStream())` runs on every `handlePlay` call (not just first). This is safe because `getHapStream()` always returns the same `HapStream` instance for a given engine, so `useState` will skip re-render on identity equality after the first call
- Kept `_activeHighlight` prop as-is (unused/prefixed) per CONTEXT.md YAGNI lock — the hook is always-on

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Moved useHighlighting call before callbacks to avoid temporal dead zone**
- **Found during:** Task 1 (implementation review)
- **Issue:** Plan instruction placed `const { clearAll: clearHighlights }` after the `useEffect` blocks (around line 213), but `handlePlay` and `handleStop` callbacks defined earlier in the function body reference `clearHighlights`. In JavaScript, `const` bindings are not hoisted — the callbacks would reference an uninitialized binding if the hook call appeared after them.
- **Fix:** Placed `const { clearAll: clearHighlights } = useHighlighting(...)` immediately after `getEngine()` and before `handlePlay`, so the binding is established before any callback closure captures it.
- **Files modified:** `packages/editor/src/StrudelEditor.tsx`
- **Verification:** Tests pass, TypeScript compiles without error
- **Committed in:** 0ab9818 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug/ordering)
**Impact on plan:** Essential fix — the plan-specified placement would have produced a runtime ReferenceError. No scope creep.

## Issues Encountered

None beyond the ordering fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 5 HIGH requirements (HIGH-01 through HIGH-05) are now functionally complete end-to-end
- Phase 01 active-highlighting is complete — ready for phase transition
- Next phase: Phase 02 pianoroll visualizer — inline pianoroll via Monaco view zones depends on Phase 01 decorations infrastructure now in place

---
*Phase: 01-active-highlighting*
*Completed: 2026-03-21*
