---
phase: 06-inline-zones-via-abstraction
plan: 01
subsystem: visualizers
tags: [viewZones, VizRenderer, InlineZoneHandle, trackSchedulers, tdd]
dependency_graph:
  requires:
    - 04-vizrenderer-abstraction/04-01 (VizRenderer interface, mountVizRenderer)
    - 05-per-track-data/05-01 (getTrackSchedulers)
  provides:
    - InlineZoneHandle interface (cleanup/pause/resume)
    - addInlineViewZones with VizRendererSource + trackSchedulers
    - StrudelEditor wired to use pause-on-stop + cleanup-before-re-add
  affects:
    - packages/editor/src/visualizers/viewZones.ts
    - packages/editor/src/StrudelEditor.tsx
    - packages/editor/src/__tests__/viewZones.test.ts
tech_stack:
  added: []
  patterns:
    - InlineZoneHandle object return (replaces () => void)
    - Per-zone schedulerRef resolved from trackSchedulers Map by $N key
    - editor.getLayoutInfo().contentWidth for zone initial width
    - pause-on-stop / cleanup-before-re-add zone lifecycle
key_files:
  created: []
  modified:
    - packages/editor/src/visualizers/viewZones.ts
    - packages/editor/src/StrudelEditor.tsx
    - packages/editor/src/__tests__/viewZones.test.ts
decisions:
  - InlineZoneHandle object returned instead of bare function — enables pause/resume without destroy
  - pause() on stop freezes inline zones at last frame; cleanup() only before re-adding
  - Per-zone schedulerRef keyed by $N (anonIndex) mirrors Phase 5 setter-intercept convention
  - contentWidth from editor.getLayoutInfo() avoids zero-width issue (zone div not yet in DOM at mount time)
metrics:
  duration: "~2 minutes"
  completed: "2026-03-22"
  tasks: 2
  files_modified: 3
---

# Phase 06 Plan 01: Inline Zones via VizRenderer Abstraction Summary

**One-liner:** InlineZoneHandle (cleanup/pause/resume) replaces bare cleanup function, viewZones now renderer-agnostic via VizRendererSource + per-track schedulers from trackSchedulers Map.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refactor viewZones.ts — InlineZoneHandle, VizRendererSource, trackSchedulers, contentWidth | 4765696 | viewZones.ts, viewZones.test.ts |
| 2 | Wire InlineZoneHandle into StrudelEditor — pause on stop, cleanup before re-add | 06b5f4b | StrudelEditor.tsx |

## What Was Built

### viewZones.ts refactor
- Exported `InlineZoneHandle` interface with `cleanup()`, `pause()`, `resume()` methods
- Changed `addInlineViewZones` from 3-param `(editor, hapStream, analyser) => () => void` to 5-param `(editor, source, hapStream, analyser, trackSchedulers) => InlineZoneHandle`
- Removed hardcoded `P5VizRenderer` and `PianorollSketch` imports — any `VizRendererSource` works
- Zone initial width now uses `editor.getLayoutInfo().contentWidth` (not `container.clientWidth` which is 0 before DOM insert)
- Per-zone `schedulerRef` resolved from `trackSchedulers.get('$N')` where N is the anonymous index

### StrudelEditor.tsx wiring
- Import `InlineZoneHandle` type from viewZones
- `viewZoneCleanupRef` type changed from `(() => void) | null` to `InlineZoneHandle | null`
- handlePlay: calls `cleanup()` before re-adding zones, passes `currentSource` and `engine.getTrackSchedulers()`
- handleStop: calls `pause()` instead of `cleanup()` — zones stay visible frozen at last frame
- `currentSource` added to handlePlay useCallback deps

### Tests migrated (TDD)
- All 8 existing tests migrated to new 5-param signature and InlineZoneHandle return type
- 5 new tests added: ZONE-01 (source passed through), ZONE-02 (schedulerRef from trackSchedulers), ZONE-03 (contentWidth), ZONE-04 (pause/resume forwarding)
- 13 tests total, all passing

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. All wiring is complete and functional.

## Self-Check: PASSED
- packages/editor/src/visualizers/viewZones.ts — FOUND
- packages/editor/src/StrudelEditor.tsx — FOUND
- packages/editor/src/__tests__/viewZones.test.ts — FOUND
- Commit 4765696 — FOUND
- Commit 06b5f4b — FOUND
- All 90 tests pass
