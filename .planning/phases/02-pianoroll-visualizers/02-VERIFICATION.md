---
phase: 02-pianoroll-visualizers
verified: 2026-03-22T10:08:30Z
status: human_needed
score: 13/13 must-haves verified (automated)
re_verification: false
human_verification:
  - test: "Pianoroll canvas renders rolling notes at 60fps"
    expected: "Note blocks scroll left smoothly at 60fps when pattern is playing. No dropped frames visible in DevTools Performance tab."
    why_human: "Canvas animation at 60fps requires browser rendering — cannot verify requestAnimationFrame cadence in jsdom."
  - test: "Note colors correct: drums orange at bottom lane, pitched notes in upper area"
    expected: "bd/sd/hh appear in orange (#f97316) in the bottom 20% drum lane. Pitched notes appear in the upper 80% pitch area with correct colors."
    why_human: "Visual pixel placement in p5 canvas cannot be verified without a real browser rendering context."
  - test: "Inline pianoroll view zones appear below $: lines in Monaco editor"
    expected: "120px inline pianoroll canvases appear below every $: line in the Monaco editor after clicking Play."
    why_human: "Monaco view zones require a real browser DOM with the editor rendered — jsdom does not support Monaco's view layer."
  - test: "View zones re-appear after re-evaluate"
    expected: "After editing code and pressing Play again (Ctrl+Enter), the inline view zones reappear below $: lines. Old zones are removed before new ones are added."
    why_human: "Requires full Monaco + evaluate() integration cycle in a real browser."
  - test: "VizPicker mode switching changes active canvas"
    expected: "Clicking scope/spectrum/spiral/pitchwheel buttons switches VizPanel to the corresponding blank-background sketch. Pianoroll is the default active mode."
    why_human: "p5 canvas rendering requires a real browser. jsdom cannot execute p5 draw loops."
  - test: "Layout pixel measurements: Toolbar 40px, VizPicker 32px"
    expected: "DevTools computed styles show Toolbar height=40px, VizPicker height=32px, editor fills remaining space, VizPanel at configured vizHeight (default 200px)."
    why_human: "CSS computed heights require a real browser with a rendered DOM layout."
---

# Phase 2: Pianoroll Visualizers Verification Report

**Phase Goal:** Users can see a rolling pianoroll displaying all playing notes in real time, both as a full panel below the editor and inline beneath individual pattern lines, with a toolbar that controls layout and visualizer selection.
**Verified:** 2026-03-22T10:08:30Z
**Status:** human_needed — all automated checks pass, 6 items require browser verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | useP5Sketch hook creates a p5 instance on mount and removes it on cleanup | VERIFIED | `useP5Sketch.ts` line 23: `const instance = new p5(sketch, containerRef.current)`. Cleanup at line 37: `instance.remove()`. 6 unit tests pass. |
| 2 | useP5Sketch hook includes ResizeObserver that calls p.resizeCanvas(w, h) on container resize | VERIFIED | `useP5Sketch.ts` lines 26–34: `new ResizeObserver` with `instance.resizeCanvas(width, height)`. Test confirms. |
| 3 | PianorollSketch draws note blocks at correct X positions for a 6-second rolling window | VERIFIED | `PianorollSketch.ts` exports `getNoteX`, `WINDOW_SECONDS=6`. 3 getNoteX unit tests pass (right edge=600, left edge=0, midpoint=300). |
| 4 | Y-axis maps MIDI 24 to bottom of pitch area and MIDI 96 to top | VERIFIED | `getNoteY(MIDI_MIN=24, 400)` returns 400, `getNoteY(MIDI_MAX=96, 400)` returns 0. 3 unit tests pass. |
| 5 | Note colors use hap.value.color when present, fall back to s-field category colors with unknown=var(--accent) | VERIFIED | `getColor()` at line 47: `if (event.color) return event.color`. Fallback chain: drums → bass → pad → accent. 7 unit tests pass including locked decision (sine → accent, not melody). |
| 6 | Percussion sounds detected and drawn in drum lane (bottom 20%) | VERIFIED | `DRUM_LANE_RATIO=0.20`, `isDrumSound()` and `getDrumSlot()` both exported and unit-tested. Draw loop at lines 106–112 uses `pitchH + (slot/slotCount) * drumH`. |
| 7 | VizPicker renders 5 mode buttons with pianoroll active by default | VERIFIED | `VizPicker.tsx` MODES array has all 5 modes. `data-testid="viz-btn-pianoroll"` etc. `data-active="true"` for active button. 9 unit tests pass. |
| 8 | Clicking a VizPicker button calls onModeChange and applies accent outline styling | VERIFIED | `onClick={() => onModeChange(mode)}` and `outline: isActive ? '1px solid var(--accent)' : 'none'`. Test: clicking scope fires onModeChange('scope'). |
| 9 | VizPanel renders container div hosting p5 canvas via useP5Sketch | VERIFIED | `VizPanel.tsx` calls `useP5Sketch(containerRef, sketchFactory, hapStream, analyser)`. `data-testid="viz-panel"`, `height: vizHeight` (default 200). 6 unit tests pass. |
| 10 | addInlineViewZones scans for $: lines and creates 120px view zones | VERIFIED | `viewZones.ts` line 34: `if (!line.trim().startsWith('$:')) return`. `heightInPx: VIEW_ZONE_HEIGHT` where `VIEW_ZONE_HEIGHT = 120`. 8 unit tests pass. |
| 11 | Inline view zones re-added after evaluate() call | VERIFIED | `StrudelEditor.tsx` lines 183–190: `if (_inlinePianoroll && editorRef.current)` block calls `viewZoneCleanupRef.current?.()` then `addInlineViewZones(...)` after `engine.evaluate()` succeeds. |
| 12 | StrudelEditor layout order: Toolbar > VizPicker > editor > VizPanel | VERIFIED | `StrudelEditor.tsx` JSX at lines 303–341: `Toolbar` → `<VizPicker>` → editor div → `{_visualizer !== 'off' && <VizPanel>}`. |
| 13 | VizPanel, VizPicker, SketchFactory, VizMode, and all 5 sketch factories exported from index.ts | VERIFIED | `index.ts` lines 19–26 export all 7 visualizer items. |

**Score: 13/13 truths verified (automated)**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/editor/src/visualizers/types.ts` | SketchFactory type and VizMode union | VERIFIED | Exports both `SketchFactory` and `VizMode`. 11 lines, substantive. |
| `packages/editor/src/visualizers/useP5Sketch.ts` | React hook for p5 lifecycle with ResizeObserver | VERIFIED | 41 lines. Exports `useP5Sketch`. Contains `new p5(...)`, `ResizeObserver`, `instance.remove()`. |
| `packages/editor/src/visualizers/sketches/PianorollSketch.ts` | Pianoroll sketch factory with full rendering logic | VERIFIED | 129 lines. Exports `PianorollSketch`, `DRUM_SOUNDS`, `DRUM_SLOT`, `getColor`, `getNoteY`, `getNoteX`, `isDrumSound`, `getDrumSlot`, `getBaseName`, plus constants. |
| `packages/editor/src/visualizers/VizPanel.tsx` | Container component hosting p5 canvas | VERIFIED | 34 lines. Exports `VizPanel`. Calls `useP5Sketch`, has `data-testid="viz-panel"`, `height: vizHeight`, `overflow: 'hidden'`. No ResizeObserver. |
| `packages/editor/src/visualizers/VizPicker.tsx` | 32px toolbar strip with 5 mode icon buttons | VERIFIED | 110 lines. Exports `VizPicker`. Has 5 SVG icon buttons, `height: 32`, `background: 'var(--surface)'`, `borderBottom: '1px solid var(--border)'`. |
| `packages/editor/src/visualizers/viewZones.ts` | Imperative addInlineViewZones function | VERIFIED | 64 lines. Exports `addInlineViewZones`. Has `changeViewZones`, `heightInPx: VIEW_ZONE_HEIGHT (120)`, `line.trim().startsWith('$:')`, returns cleanup function. |
| `packages/editor/src/StrudelEditor.tsx` | Updated editor with VizPanel/VizPicker integration | VERIFIED | 343 lines. Imports and renders `<VizPanel>` and `<VizPicker>`. Has `activeViz` state, `SKETCH_MAP`, `addInlineViewZones` call, `viewZoneCleanupRef`. No placeholder text. |
| `packages/editor/src/index.ts` | Updated public exports for all visualizer types | VERIFIED | Lines 19–26: exports VizPanel, VizPicker, SketchFactory, VizMode, PianorollSketch, ScopeSketch, SpectrumSketch, SpiralSketch, PitchwheelSketch. |
| `packages/editor/src/visualizers/sketches/ScopeSketch.ts` | Stub sketch factory | VERIFIED (stub, intentional) | Exports `ScopeSketch`. Intentional stub — Phase 3 scope per SUMMARY.md. |
| `packages/editor/src/visualizers/sketches/SpectrumSketch.ts` | Stub sketch factory | VERIFIED (stub, intentional) | Exports `SpectrumSketch`. Intentional Phase 3 stub. |
| `packages/editor/src/visualizers/sketches/SpiralSketch.ts` | Stub sketch factory | VERIFIED (stub, intentional) | Exports `SpiralSketch`. Intentional Phase 3 stub. |
| `packages/editor/src/visualizers/sketches/PitchwheelSketch.ts` | Stub sketch factory | VERIFIED (stub, intentional) | Exports `PitchwheelSketch`. Intentional Phase 3 stub. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useP5Sketch.ts` | p5 | `new p5(sketch, containerRef.current)` | WIRED | Line 23: `const instance = new p5(sketch, containerRef.current)` — confirmed. |
| `useP5Sketch.ts` | ResizeObserver | `new ResizeObserver` → `instance.resizeCanvas(w, h)` | WIRED | Lines 26–34: observer fires `instance.resizeCanvas(width, height)` — confirmed. |
| `PianorollSketch.ts` | HapStream | `hapStreamRef.current?.on(handler)` | WIRED | Line 82: subscribe. Line 125: `hapStreamRef.current?.off(handler)` on remove — confirmed. |
| `VizPanel.tsx` | `useP5Sketch.ts` | `useP5Sketch(containerRef, sketchFactory, hapStream, analyser)` | WIRED | Line 15: call present — confirmed. |
| `VizPicker.tsx` | `types.ts` | `VizMode` type for active state | WIRED | Line 2: `import type { VizMode } from './types'` — confirmed. |
| `StrudelEditor.tsx` | `VizPanel.tsx` | `<VizPanel hapStream analyser sketchFactory />` | WIRED | Lines 334–339: full prop surface wired — confirmed. |
| `StrudelEditor.tsx` | `VizPicker.tsx` | `<VizPicker activeMode onModeChange />` | WIRED | Lines 315–319: full prop surface wired — confirmed. |
| `viewZones.ts` | monaco-editor | `editor.changeViewZones(accessor => accessor.addZone(...))` | WIRED | Lines 32–56: `editor.changeViewZones` with `accessor.addZone` — confirmed. |
| `StrudelEditor.tsx` | `viewZones.ts` | `addInlineViewZones(editorRef.current, ...)` called after `evaluate()` | WIRED | Lines 183–190: call guarded by `_inlinePianoroll && editorRef.current` — confirmed. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PIANO-01 | 02-01 | Full-panel pianoroll canvas renders at 60fps via rAF | SATISFIED (human verify) | `PianorollSketch.ts` p5 `draw()` runs via p5's rAF loop. useP5Sketch hook creates/destroys lifecycle. 60fps behavior requires browser confirmation. |
| PIANO-02 | 02-01 | Rolling 6-second time window, right edge=now | SATISFIED | `WINDOW_SECONDS=6`, `getNoteX` formula verified by 3 unit tests. |
| PIANO-03 | 02-01 | Y-axis spans MIDI 24 (C1) to MIDI 96 (C7) | SATISFIED | `MIDI_MIN=24`, `MIDI_MAX=96`, `getNoteY` verified by 3 unit tests. |
| PIANO-04 | 02-01 | Note color by s field; hap.value.color overrides | SATISFIED (with note) | `getColor()` verified. NOTE: REQUIREMENTS.md text says "melody=violet" but the locked plan decision dropped the melody branch — unknown sounds use `--accent` (#8b5cf6) not `--stem-melody` (#a78bfa). This is an intentional deviation from the requirement text, documented as a locked decision in 02-01-PLAN.md and 02-01-SUMMARY.md. The requirement text in REQUIREMENTS.md does not yet reflect this decision. |
| PIANO-05 | 02-01 | Percussion sounds at fixed positions below pitch area | SATISFIED | `DRUM_LANE_RATIO=0.20`, `isDrumSound`, `getDrumSlot` unit-tested. Draw loop renders drums to bottom lane. |
| PIANO-06 | 02-03 | Inline pianoroll as Monaco view zone below $: lines (120px) | SATISFIED (human verify) | `viewZones.ts` creates zones with `heightInPx: 120`, triggers on `$:` lines. 8 unit tests pass. Browser confirmation needed for visual rendering. |
| PIANO-07 | 02-03 | Inline view zones re-added after every evaluate() | SATISFIED | `StrudelEditor.tsx` lines 183–190: cleanup then re-add after `engine.evaluate()` succeeds. |
| UI-01 | 02-02 | VizPicker toolbar lets user switch visualizer modes | SATISFIED | `VizPicker.tsx` with 5 mode buttons and `onModeChange` callback. 9 unit tests pass. |
| UI-02 | 02-02, 02-03 | Layout: toolbar (40px) + viz-picker (32px) + editor + viz panel | SATISFIED (human verify) | JSX order in StrudelEditor confirmed. Pixel heights require browser measurement. |
| UI-03 | 02-02 | vizHeight prop controls panel height (default 200px) | SATISFIED | `VizPanel.tsx` `vizHeight = 200` default, `height: vizHeight` in style. Unit tested. |
| UI-04 | 02-02 | showToolbar prop hides toolbar | SATISFIED | `StrudelEditor.tsx` line 303: `{showToolbar && <Toolbar ... />}`. Pre-existing behavior, confirmed present. |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `ScopeSketch.ts`, `SpectrumSketch.ts`, `SpiralSketch.ts`, `PitchwheelSketch.ts` | Stub sketches (render solid background only) | Info — intentional | These stubs are explicitly planned for Phase 3 implementation. They accept the correct SketchFactory signature and can be selected via VizPicker, showing a blank canvas. The Phase 2 goal only requires pianoroll to work. |

No blocker or warning anti-patterns found in production code. Stubs are scoped, documented, and intentional.

---

### PIANO-04 Requirement Text Discrepancy

The REQUIREMENTS.md text for PIANO-04 reads:

> Note blocks colored by s field (drums=orange, bass=cyan, **melody=violet**, pad=emerald, default=accent)

However, the actual implementation has **no melody branch**. The locked decision (documented in 02-01-PLAN.md and 02-01-SUMMARY.md) explicitly chose `--accent` (#8b5cf6) as the fallback for ALL unrecognized sounds, including those that might semantically be "melody" sounds. The plan states:

> "Unknown/unrecognized instrument sounds (s field) fall back to --accent (#8b5cf6), not --stem-melody — no melody branch in getColor()"

The implementation is internally consistent and the unit tests verify the accent fallback. However, the REQUIREMENTS.md text is stale relative to this decision. This is a documentation gap, not an implementation gap. The feature works correctly per the locked decision; the requirement text should be updated to remove the "melody=violet" claim.

**Severity:** Documentation only — does not affect goal achievement.

---

### Human Verification Required

#### 1. Pianoroll canvas 60fps rendering

**Test:** Run `pnpm dev --filter app`, open browser, click Play on a pattern with pitched notes (e.g., `$: note("c3 e3 g3").s("sine")`).
**Expected:** Note blocks appear on the VizPanel canvas and scroll left smoothly. DevTools Performance tab should show consistent ~16ms frames.
**Why human:** Canvas animation cadence cannot be verified in jsdom.

#### 2. Note colors and drum lane visual placement

**Test:** Play `$: s("bd sd hh")` — confirm orange blocks in bottom 20% of VizPanel. Play `$: note("c3").s("sine")` — confirm accent-colored blocks in upper 80%.
**Expected:** Drums (bd/sd/hh) in orange (#f97316) at bottom lane. Pitched notes in upper pitch area with accent color (#8b5cf6) since sine is unrecognized.
**Why human:** p5 canvas pixel content requires visual inspection.

#### 3. Inline pianoroll view zones appear in Monaco

**Test:** Set `inlinePianoroll={true}` in the demo app. Write code with `$:` lines. Click Play.
**Expected:** 120px pianoroll canvases appear directly below each `$:` line in the Monaco editor.
**Why human:** Monaco view zone rendering requires a real browser DOM.

#### 4. View zones re-add after re-evaluate

**Test:** While playing, edit the code and press Play again (or Ctrl+Enter). Confirm view zones disappear briefly and reappear correctly below each `$:` line.
**Expected:** Old zones removed, new zones added cleanly. No zone accumulation.
**Why human:** Requires Monaco + evaluate() integration cycle in a real browser.

#### 5. VizPicker mode switching

**Test:** Click scope, spectrum, spiral, pitchwheel buttons in VizPicker. Verify VizPanel changes.
**Expected:** Canvas switches to a dark background (stub sketches). Pianoroll default shows rolling notes.
**Why human:** p5 canvas content requires visual inspection.

#### 6. Layout pixel measurement

**Test:** Open browser DevTools, inspect the StrudelEditor layout. Check computed heights.
**Expected:** Toolbar = 40px, VizPicker = 32px, Monaco editor fills remaining flex space, VizPanel = 200px (default vizHeight).
**Why human:** CSS computed layout requires a real browser rendering pass.

---

### Gaps Summary

No gaps. All 13 automated must-haves are verified against the actual codebase. The 6 human verification items are visual/rendering behaviors that cannot be confirmed without a browser — they represent expected behavior based on correct wiring, not known defects.

The only notable finding is the **PIANO-04 requirement text stale reference** to "melody=violet" — the implementation correctly uses `--accent` for all unrecognized sounds per a locked design decision. This is a documentation discrepancy in REQUIREMENTS.md, not a code defect.

---

### Test Suite Results

```
Test Files  7 passed (7)
     Tests  63 passed (63)
  Duration  515ms
```

All 63 tests pass including:
- `PianorollSketch.test.ts` — 21 tests (getNoteX, getNoteY, getColor, isDrumSound, getDrumSlot)
- `useP5Sketch.test.ts` — 6 tests (p5 lifecycle, ResizeObserver wiring)
- `VizPanel.test.tsx` — 6 tests (container styles, useP5Sketch call)
- `VizPicker.test.tsx` — 9 tests (5 buttons, active state, onModeChange, showVizPicker)
- `viewZones.test.ts` — 8 tests (zone creation, heightInPx=120, cleanup, line detection)
- `WavEncoder.test.ts` — 5 tests (pre-existing)
- `useHighlighting.test.ts` — 8 tests (pre-existing)

---

_Verified: 2026-03-22T10:08:30Z_
_Verifier: Claude (gsd-verifier)_
