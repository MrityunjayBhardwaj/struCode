---
phase: 04-vizrenderer-abstraction
plan: 01
subsystem: ui
tags: [vizrenderer, p5, abstraction, typescript, react]

# Dependency graph
requires:
  - phase: 03-audio-visualizers
    provides: 7 p5 SketchFactory-based visualizer sketches (pianoroll, scope, fscope, spectrum, spiral, pitchwheel, wordfall)
provides:
  - VizRenderer interface with 5 lifecycle methods (mount/resize/pause/resume/destroy)
  - VizRefs type bundling hapStreamRef + analyserRef + schedulerRef
  - P5VizRenderer adapter class wrapping all SketchFactory sketches
  - VizDescriptor type with id/label/requires/factory
  - DEFAULT_VIZ_DESCRIPTORS array with all 7 built-in modes
  - useVizRenderer hook replacing useP5Sketch
  - mountVizRenderer shared utility with ResizeObserver wiring
  - VizPicker upgraded to descriptor-driven rendering
  - VizPanel upgraded to VizRendererSource prop
  - viewZones.ts using mountVizRenderer + P5VizRenderer
  - StrudelEditor using vizDescriptors/vizRenderer props (hard break on vizSketch)
affects: [05-per-track-data, 06-inline-zones, 07-multi-renderer, phase-04-vizrenderer-abstraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VizRenderer interface — renderer-agnostic lifecycle (mount/resize/pause/resume/destroy)"
    - "P5VizRenderer adapter — wraps legacy SketchFactory into VizRenderer interface"
    - "VizDescriptor — data-driven descriptor pattern (id, label, factory) for extensible picker UI"
    - "mountVizRenderer — shared imperative utility usable by both React hooks and imperative code"
    - "useVizRenderer — hook with stable refs pattern, source as useEffect dep"

key-files:
  created:
    - packages/editor/src/visualizers/types.ts
    - packages/editor/src/visualizers/renderers/P5VizRenderer.ts
    - packages/editor/src/visualizers/mountVizRenderer.ts
    - packages/editor/src/visualizers/useVizRenderer.ts
    - packages/editor/src/visualizers/defaultDescriptors.ts
    - packages/editor/src/__tests__/useVizRenderer.test.ts
  modified:
    - packages/editor/src/visualizers/VizPanel.tsx
    - packages/editor/src/visualizers/VizPicker.tsx
    - packages/editor/src/visualizers/viewZones.ts
    - packages/editor/src/StrudelEditor.tsx
    - packages/editor/src/index.ts
    - packages/editor/src/visualizers/sketches/PianorollSketch.ts
    - packages/editor/src/__tests__/VizPanel.test.tsx
    - packages/editor/src/__tests__/VizPicker.test.tsx
    - packages/editor/src/__tests__/viewZones.test.ts
  deleted:
    - packages/editor/src/visualizers/useP5Sketch.ts
    - packages/editor/src/__tests__/useP5Sketch.test.ts

key-decisions:
  - "VizRenderer interface with 5 lifecycle methods is the foundational abstraction — all future renderers (Canvas2D, Three.js, GLSL) implement this interface"
  - "P5SketchFactory kept as internal type (not exported) — P5VizRenderer is the only consumer"
  - "VizDescriptor uses factory: () => VizRenderer so each mount creates a fresh instance"
  - "ICON_MAP in VizPicker kept as private React-specific lookup — keeps VizDescriptor lean"
  - "schedulerRef always passed (not optional) in P5SketchFactory — all 7 sketches require it"

patterns-established:
  - "VizRenderer pattern: all renderers implement mount/resize/pause/resume/destroy"
  - "Descriptor pattern: VizDescriptor drives picker UI with id/label/factory — no React in descriptor"
  - "mountVizRenderer utility: single mount entrypoint for both hook and imperative usage"
  - "Source dep pattern: useVizRenderer depends only on source, not on refs (refs are stable via useRef)"

requirements-completed: [REND-01, REND-02, REND-03, REND-04, REND-05, REND-06, REND-07]

# Metrics
duration: 12min
completed: 2026-03-22
---

# Phase 04 Plan 01: VizRenderer Abstraction Summary

**Renderer-agnostic VizRenderer interface replacing SketchFactory — P5VizRenderer adapter wraps all 7 p5 sketches, VizDescriptor drives picker UI, mountVizRenderer shared utility wires ResizeObserver for both hook and imperative contexts**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-22T10:05:58Z
- **Completed:** 2026-03-22T10:17:58Z
- **Tasks:** 3
- **Files modified:** 14 (created 6, modified 8, deleted 2)

## Accomplishments
- Replaced p5-coupled SketchFactory/VizMode type system with renderer-agnostic VizRenderer interface (5 lifecycle methods)
- Created P5VizRenderer adapter that wraps all 7 existing SketchFactory sketches without behavioral change
- Built DEFAULT_VIZ_DESCRIPTORS with all 7 modes + VizDescriptor-driven VizPicker (descriptor.id string keys)
- Introduced mountVizRenderer shared imperative utility (ResizeObserver wiring) used by both useVizRenderer hook and viewZones.ts
- Updated all consuming components: VizPanel (source prop), VizPicker (descriptors/activeId/onIdChange), viewZones (mountVizRenderer+P5VizRenderer), StrudelEditor (vizDescriptors/vizRenderer props), index.ts (new exports)
- TypeScript compiles clean (zero errors)

## Task Commits

1. **Task 1: VizRenderer types, P5VizRenderer adapter, mountVizRenderer utility** - `75a8ee1` (feat)
2. **Task 2: useVizRenderer hook, defaultDescriptors, VizPanel/VizPicker/viewZones updates** - `d78b77d` (feat)
3. **Task 3: StrudelEditor props and index.ts exports; test fixes** - `94b4af6` (feat)

## Files Created/Modified
- `packages/editor/src/visualizers/types.ts` - VizRenderer, VizRefs, VizDescriptor, VizRendererSource, P5SketchFactory interfaces (replaces SketchFactory + VizMode)
- `packages/editor/src/visualizers/renderers/P5VizRenderer.ts` - P5VizRenderer adapter class (new directory)
- `packages/editor/src/visualizers/mountVizRenderer.ts` - Shared imperative mount utility with ResizeObserver
- `packages/editor/src/visualizers/useVizRenderer.ts` - Renderer-agnostic hook replacing useP5Sketch
- `packages/editor/src/visualizers/defaultDescriptors.ts` - DEFAULT_VIZ_DESCRIPTORS array with 7 entries
- `packages/editor/src/visualizers/VizPanel.tsx` - Updated: source:VizRendererSource prop, useVizRenderer hook
- `packages/editor/src/visualizers/VizPicker.tsx` - Updated: descriptor-driven (descriptors/activeId/onIdChange, ICON_MAP)
- `packages/editor/src/visualizers/viewZones.ts` - Updated: mountVizRenderer + P5VizRenderer, no direct p5 import
- `packages/editor/src/StrudelEditor.tsx` - Updated: vizDescriptors/vizRenderer props, removed SKETCH_MAP, currentSource useMemo
- `packages/editor/src/index.ts` - Updated: new VizRenderer exports, removed SketchFactory/VizMode (hard break)
- `packages/editor/src/visualizers/sketches/PianorollSketch.ts` - Added exported utility functions: getNoteX, getNoteY, getColor, isDrumSound, getDrumSlot, WINDOW_SECONDS, MIDI_MIN, MIDI_MAX
- `packages/editor/src/__tests__/useVizRenderer.test.ts` - New test (replaces useP5Sketch.test.ts)
- `packages/editor/src/__tests__/VizPanel.test.tsx` - Updated to new source prop API
- `packages/editor/src/__tests__/VizPicker.test.tsx` - Updated to descriptors/activeId/onIdChange API

## Decisions Made
- `schedulerRef` is non-optional in P5SketchFactory — all 7 sketches require it, confirmed by examining each signature
- `ICON_MAP` stays private in VizPicker (not in VizDescriptor) — keeps the descriptor data-only, no React coupling
- `VizDescriptor.factory` always returns new instance — prevents shared state across multiple mounts
- Exported utility functions from PianorollSketch (getNoteX, getNoteY, etc.) to satisfy pre-existing test contract

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed pre-existing TypeScript errors blocking tsc --noEmit**
- **Found during:** Task 3 (TypeScript verification)
- **Issue:** Pre-existing test files used old APIs (sketchFactory, activeMode, onModeChange props), old hook import (useP5Sketch), circular type annotation in viewZones.test.ts, and missing exports in PianorollSketch.test.ts
- **Fix:** Updated VizPanel.test.tsx and VizPicker.test.tsx to new API; deleted useP5Sketch.test.ts and created useVizRenderer.test.ts; fixed circular type in viewZones.test.ts; added utility function exports to PianorollSketch; added mountVizRenderer mock to viewZones.test.ts
- **Files modified:** All __tests__ files listed above
- **Verification:** tsc --noEmit exits with code 0
- **Committed in:** 94b4af6 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical: pre-existing test failures blocking tsc)
**Impact on plan:** Necessary to satisfy plan acceptance criteria (tsc --noEmit passes). No scope creep — all changes are test file updates to match the new API.

## Issues Encountered
- P5SketchFactory initially defined with optional schedulerRef (?) but all 7 sketches have it required — fixed by removing the `?` to match actual sketch signatures
- viewZones.ts had `{ current: null } as RefObject<null>` but VizRefs expects `RefObject<PatternScheduler | null>` — fixed cast

## Known Stubs
None — all 7 visualizers are fully wired via P5VizRenderer. DEFAULT_VIZ_DESCRIPTORS produces live renderers from factory functions.

## Next Phase Readiness
- VizRenderer interface in place — Canvas2D, Three.js, and GLSL renderers can be added by implementing VizRenderer and adding a VizDescriptor
- Per-track data (Phase 04-02) will be able to pass track-specific refs through VizRefs pattern
- Hard break on `vizSketch` prop is in effect — consumers must migrate to `vizDescriptors`/`vizRenderer`

---
*Phase: 04-vizrenderer-abstraction*
*Completed: 2026-03-22*
