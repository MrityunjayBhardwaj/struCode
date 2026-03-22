# Phase 4: VizRenderer Abstraction — Research

**Researched:** 2026-03-22
**Domain:** TypeScript interface design, React hook refactoring, p5.js adapter pattern, test migration
**Confidence:** HIGH

---

## Summary

Phase 4 replaces the p5-coupled `SketchFactory` type with a renderer-agnostic `VizRenderer` interface
and wraps all 7 existing p5 sketches in a `P5VizRenderer` adapter. The canonical interfaces, file layout,
and gotchas are already fully designed — they are preserved in Claude memory (`project_viz_renderer_plan.md`)
and referenced in `THESIS.md` Section 4.1. This phase is a pure structural refactor: zero behavioral change,
zero new rendering code, zero new sketch logic.

The phase breaks down into five concerns: (1) rewrite `types.ts` to define the new interface family,
(2) create `P5VizRenderer` adapter and `mountVizRenderer` utility, (3) replace `useP5Sketch` with
`useVizRenderer`, (4) update `VizPanel` and `VizPicker` to consume the new types, and (5) update
`StrudelEditor` props and `index.ts` exports. Four existing test files must be migrated alongside the
source changes.

**Primary recommendation:** Execute in a single wave — all files are coupled through types.ts. Attempting
to land partial changes will leave TypeScript broken mid-flight.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REND-01 | VizRenderer interface defined with mount(container, refs, size, onError), resize(w,h), pause(), resume(), destroy() methods | Canonical interface in THESIS.md §4.1 and memory `project_viz_renderer_plan.md` |
| REND-02 | VizRefs type defined: hapStreamRef, analyserRef, schedulerRef as RefObject refs | Same canonical source; replaces the 3-arg SketchFactory signature |
| REND-03 | P5VizRenderer adapter class wraps existing SketchFactory sketches — mount creates p5 instance, resize calls resizeCanvas, pause/resume call noLoop/loop, destroy calls remove | Fully designed; P5SketchFactory (internal alias) is the existing function shape |
| REND-04 | VizDescriptor type defined: { id, label, requires?, factory: () => VizRenderer } | Canonical interface in THESIS.md §4.1 |
| REND-05 | DEFAULT_VIZ_DESCRIPTORS array exported — contains all 7 built-in viz modes wrapped in P5VizRenderer | Memory plan has the exact array |
| REND-06 | useVizRenderer hook replaces useP5Sketch — calls mountVizRenderer, wires ResizeObserver, handles cleanup | mountVizRenderer utility shared with viewZones.ts |
| REND-07 | VizPicker renders from VizDescriptor[] as a dropdown (not hardcoded VizMode tab bar) | Hard break: activeMode switches from VizMode string to descriptor.id string |
</phase_requirements>

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p5 | 2.2.3 (already installed) | Existing sketch runtime; stays internal | Zero behavior change — sketches unchanged |
| @types/p5 | 1.7.7 (v1 types, already installed) | TypeScript types for p5 v2 with known gaps | Do not upgrade; v2 official types not yet stable |
| React | existing | Hook and component layer | Already in use |
| TypeScript | existing | Interface definitions | Already in use |

**No new npm installs required.** All work is source-level refactoring.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `mountVizRenderer` utility function | Inline in hook + viewZones separately | Duplication: ResizeObserver setup is identical in both call sites |
| `VizDescriptor[]` prop on VizPicker | Keep `VizMode` string union | VizMode union can't scale to third-party renderers |
| Dropdown UI for VizPicker | Keep icon tab bar | Tab bar overflows at 10+ renderers — dropdown scales |

---

## Architecture Patterns

### Recommended File Layout

```
packages/editor/src/visualizers/
├── types.ts                   (MODIFY — new interface family)
├── mountVizRenderer.ts        (NEW — shared imperative utility)
├── useVizRenderer.ts          (NEW — replaces useP5Sketch.ts)
├── defaultDescriptors.ts      (NEW — DEFAULT_VIZ_DESCRIPTORS)
├── VizPanel.tsx               (MODIFY — prop: source: VizRendererSource)
├── VizPicker.tsx              (MODIFY — prop: descriptors: VizDescriptor[])
├── viewZones.ts               (MODIFY — use mountVizRenderer, not hardcoded p5)
├── renderers/
│   └── P5VizRenderer.ts       (NEW — adapter class)
└── sketches/                  (UNCHANGED — all 7 files untouched)
    ├── PianorollSketch.ts
    ├── WordfallSketch.ts
    ├── ScopeSketch.ts
    ├── FscopeSketch.ts
    ├── SpectrumSketch.ts
    ├── SpiralSketch.ts
    └── PitchwheelSketch.ts
```

**File renaming:** `useP5Sketch.ts` is deleted; `useVizRenderer.ts` is its replacement. The old file is
not renamed — it is deleted and a new file with a clean implementation is created. This avoids carry-over
of p5-specific internals.

### Pattern 1: The VizRenderer Interface (canonical from THESIS.md §4.1)

**What:** Five-method interface that any rendering technology implements.
**When to use:** Every visualizer that renders into an HTMLDivElement.

```typescript
// Source: THESIS.md §4.1 / memory:project_viz_renderer_plan.md
interface VizRefs {
  hapStreamRef:  RefObject<HapStream | null>
  analyserRef:   RefObject<AnalyserNode | null>
  schedulerRef:  RefObject<PatternScheduler | null>
}

interface VizRenderer {
  mount(container: HTMLDivElement, refs: VizRefs, size: { w: number; h: number }, onError: (e: Error) => void): void
  resize(w: number, h: number): void
  pause(): void
  resume(): void
  destroy(): void
}

type VizRendererSource = (() => VizRenderer) | VizRenderer

interface VizDescriptor {
  id: string
  label: string
  requires?: 'webgl' | 'webgl2'
  factory: () => VizRenderer
}
```

### Pattern 2: P5VizRenderer Adapter (canonical)

**What:** Wraps the existing `SketchFactory` signature (renamed to `P5SketchFactory` as an internal type).
**When to use:** Anywhere a `SketchFactory` was used before.

```typescript
// Source: memory:project_viz_renderer_plan.md — P5SketchFactory is the internal alias
// for the existing (hapStreamRef, analyserRef, schedulerRef) => (p: p5) => void signature.
type P5SketchFactory = (
  hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
) => (p: p5) => void

class P5VizRenderer implements VizRenderer {
  private instance: p5 | null = null
  constructor(private sketch: P5SketchFactory) {}

  mount(container: HTMLDivElement, refs: VizRefs, size: { w: number; h: number }, onError: (e: Error) => void): void {
    try {
      this.instance = new p5(
        this.sketch(refs.hapStreamRef, refs.analyserRef, refs.schedulerRef),
        container
      )
      this.instance.resizeCanvas(size.w, size.h)
    } catch (e) { onError(e as Error) }
  }
  resize(w: number, h: number): void  { this.instance?.resizeCanvas(w, h) }
  pause(): void                        { this.instance?.noLoop() }
  resume(): void                       { this.instance?.loop() }
  destroy(): void                      { this.instance?.remove(); this.instance = null }
}
```

### Pattern 3: mountVizRenderer Shared Utility

**What:** Imperative function that creates a renderer, calls mount, and wires ResizeObserver.
**When to use:** Used by both `useVizRenderer` (React hook) and `viewZones.ts` (imperative).

```typescript
// Source: memory:project_viz_renderer_plan.md
function mountVizRenderer(
  container: HTMLDivElement,
  source: VizRendererSource,
  refs: VizRefs,
  size: { w: number; h: number },
  onError: (e: Error) => void
): { renderer: VizRenderer; disconnect: () => void } {
  const renderer = typeof source === 'function' ? source() : source
  renderer.mount(container, refs, size, onError)
  const ro = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0) renderer.resize(width, height)
  })
  ro.observe(container)
  return { renderer, disconnect: () => ro.disconnect() }
}
```

### Pattern 4: useVizRenderer Hook

**What:** React hook replacing `useP5Sketch`. Stabilizes `VizRefs` via refs updated each render.
**When to use:** VizPanel component.

```typescript
// Key insight: source stabilization via useEffect dep — same rule as useP5Sketch
// source must be stable (from useMemo or module-level) to avoid destroy/recreate on every render
function useVizRenderer(
  containerRef: RefObject<HTMLDivElement | null>,
  source: VizRendererSource,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null,
  scheduler: PatternScheduler | null
): void {
  const hapStreamRef  = useRef<HapStream | null>(null)
  const analyserRef   = useRef<AnalyserNode | null>(null)
  const schedulerRef  = useRef<PatternScheduler | null>(null)

  hapStreamRef.current  = hapStream
  analyserRef.current   = analyser
  schedulerRef.current  = scheduler

  useEffect(() => {
    if (!containerRef.current) return
    const refs: VizRefs = { hapStreamRef, analyserRef, schedulerRef }
    const size = {
      w: containerRef.current.clientWidth || 400,
      h: containerRef.current.clientHeight || 200,
    }
    const { renderer, disconnect } = mountVizRenderer(
      containerRef.current, source, refs, size, console.error
    )
    return () => {
      disconnect()
      renderer.destroy()
    }
  }, [source])  // same dep logic as useP5Sketch [sketchFactory]
}
```

### Pattern 5: DEFAULT_VIZ_DESCRIPTORS

```typescript
// Source: memory:project_viz_renderer_plan.md
export const DEFAULT_VIZ_DESCRIPTORS: VizDescriptor[] = [
  { id: 'pianoroll',  label: 'Piano Roll', factory: () => new P5VizRenderer(PianorollSketch) },
  { id: 'wordfall',   label: 'Wordfall',   factory: () => new P5VizRenderer(WordfallSketch) },
  { id: 'scope',      label: 'Scope',      factory: () => new P5VizRenderer(ScopeSketch) },
  { id: 'fscope',     label: 'FScope',     factory: () => new P5VizRenderer(FscopeSketch) },
  { id: 'spectrum',   label: 'Spectrum',   factory: () => new P5VizRenderer(SpectrumSketch) },
  { id: 'spiral',     label: 'Spiral',     factory: () => new P5VizRenderer(SpiralSketch) },
  { id: 'pitchwheel', label: 'Pitchwheel', factory: () => new P5VizRenderer(PitchwheelSketch) },
]
```

### Pattern 6: VizPicker — Descriptor-Driven

**What:** VizPicker no longer hardcodes MODES constant. It takes `descriptors: VizDescriptor[]` and
`activeId: string` instead of `activeMode: VizMode`.

Key change: the component renders `data-testid="viz-btn-{descriptor.id}"` — same testid pattern as
before. The 7 existing buttons keep their testids. Tests that check `viz-btn-pianoroll` etc. survive
as long as the prop changes are updated correctly.

The SVG icons currently hardcoded in VizPicker must move. Two options:
- Keep them in VizPicker as a private `ICON_MAP: Record<string, ReactNode>` keyed by descriptor id
- Move icons into VizDescriptor itself as an optional `icon?: ReactNode` field

The memory plan does not prescribe icon placement. The cleanest approach that avoids touching `THESIS.md`
canonical interfaces: keep icons private in VizPicker as a lookup map. VizDescriptor stays lean.

### Pattern 7: StrudelEditor Props Hard Break

**Current props being removed/changed:**

| Old Prop | New Prop | Action |
|----------|----------|--------|
| `vizSketch?: SketchFactory` | removed entirely | Hard break — no migration shim |
| `visualizer?` string union | kept but becomes `activeViz` default init | `activeViz` state now seeds from `vizDescriptors[0].id` |
| N/A | `vizDescriptors?: VizDescriptor[]` | defaults to `DEFAULT_VIZ_DESCRIPTORS` |
| N/A | `vizRenderer?: VizRendererSource` | pass a specific renderer directly (overrides descriptors) |

**`activeViz` state change:** Was `VizMode` string union. Becomes `string` (descriptor id). Initial
value: `vizDescriptors[0].id` or `'pianoroll'` as fallback.

**`SKETCH_MAP` useMemo:** This block in `StrudelEditor` is deleted entirely. Replaced by descriptor
lookup: `vizDescriptors.find(d => d.id === activeViz)?.factory`.

**`key={activeViz}` on VizPanel:** Keep exactly as-is. The value changes from VizMode string to
descriptor id string — same semantic, different source. No structural change needed.

### Anti-Patterns to Avoid

- **Wrapping sketches in P5VizRenderer inside useVizRenderer:** Do it once in defaultDescriptors.ts.
  Each `factory: () => new P5VizRenderer(...)` creates a new instance per mount. Never share one
  P5VizRenderer instance across multiple mounts.
- **Inline factory in JSX:** `<VizPanel source={() => new P5VizRenderer(ScopeSketch)} />` creates a new
  reference every render → hook effect fires every render → destroy/create on every render. Always
  use a stable reference (useMemo, module-level constant, or descriptor factory).
- **Calling `noLoop()` before `setup()` in p5 v2:** This is safe — p5 v2 queues it internally. Not
  an anti-pattern, but do not assume it's dangerous.
- **Using `container.clientWidth` for mount size in viewZones.ts:** Always use
  `editor.getLayoutInfo().contentWidth` — the zone div has `clientWidth = 0` before DOM attachment.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ResizeObserver in hook AND viewZones | Two separate RO implementations | `mountVizRenderer` shared utility | Identical logic belongs in one place; divergence causes bugs |
| p5 instance cleanup | Custom tracking arrays | `P5VizRenderer.destroy()` via `VizRenderer` contract | Every renderer handles its own cleanup; caller just calls `destroy()` |
| Canvas size initialization | Reading `clientWidth` on mount | Explicit `size` param to `mount()` | Zones are not in DOM at mount time; explicit size is the only reliable path |
| Feature detection | `try/catch` on `getContext('webgl')` | `VizDescriptor.requires` check + disable in picker | Centralized; renderer authors declare their requirement, UI enforces it |

**Key insight:** The `mountVizRenderer` utility is the single seam between "who creates the renderer"
and "how the renderer is managed." Any place that mounts a renderer (hook, viewZones, future inline
zones) calls this one function. Do not duplicate its logic.

---

## Common Pitfalls

### Pitfall 1: Stale `vizSketch` prop references in consumer code

**What goes wrong:** External consumers who pass `vizSketch={MySketch}` to `StrudelEditor` get a
TypeScript error after this phase — the prop is removed entirely.
**Why it happens:** Hard break by design (THESIS.md decision, locked in STATE.md).
**How to avoid:** The error surfaces at compile time. No runtime regression. Document the break
in the phase's PLAN.
**Warning signs:** TypeScript reports "Property 'vizSketch' does not exist on type StrudelEditorProps".

### Pitfall 2: Unstable source reference causes destroy/create loop

**What goes wrong:** VizPanel destroys and recreates the renderer on every parent render because
the source reference is recreated inline.
**Why it happens:** `useVizRenderer` has `source` in its `useEffect` dep array (same as `useP5Sketch`
had `sketchFactory`). An inline `() => new P5VizRenderer(...)` in JSX is a new reference each render.
**How to avoid:** In `StrudelEditor`, derive the active source from `vizDescriptors` via `useMemo`
that depends only on `activeViz` and `vizDescriptors`. The descriptor array itself is typically stable
(module-level `DEFAULT_VIZ_DESCRIPTORS` or a `useMemo`-stabilized custom array).
**Warning signs:** Network tab shows p5 creating/destroying in rapid succession; canvas flickers.

### Pitfall 3: `key={activeViz}` on VizPanel stops working after VizMode → string change

**What goes wrong:** Mode switching stops forcing a React remount of VizPanel.
**Why it happens:** If `activeViz` state type changes but the actual value used as `key` is empty,
undefined, or not updated on mode change, React won't remount.
**How to avoid:** Verify `setActiveViz` is called with `descriptor.id` (a non-empty string) in the
`onModeChange` handler, not with a VizMode string that's no longer meaningful.
**Warning signs:** Switching modes doesn't reset the canvas — old sketch continues drawing.

### Pitfall 4: Four test files break simultaneously

**What goes wrong:** `useP5Sketch.test.ts`, `VizPanel.test.tsx`, `viewZones.test.ts`, `VizPicker.test.tsx`
all reference the old API. Running `vitest` after source changes but before test updates reports 4 failures.
**Why it happens:** Each test file imports from the changed modules or passes the old prop shapes.
**How to avoid:** Update tests in the same plan as the source changes. Never ship source without test
parity. See "Test File Migration" section below.
**Warning signs:** Vitest reports "Cannot find module 'useP5Sketch'" or "sketchFactory is not a valid prop".

### Pitfall 5: `PianorollSketch.setup()` uses `window.innerWidth` (line 49)

**What goes wrong:** When P5VizRenderer calls `resizeCanvas(size.w, size.h)` after constructing the
p5 instance, the sketch's `setup()` has already fired with `window.innerWidth` as the initial canvas
width. For inline zones (120px wide), this creates a canvas wider than the container.
**Why it happens:** p5 calls `setup()` synchronously inside the `new p5(...)` constructor before
`resizeCanvas()` can be called.
**How to avoid:** `P5VizRenderer.mount()` calls `this.instance.resizeCanvas(size.w, size.h)` immediately
after construction. This corrects the canvas size before the first `draw()` frame. The one-frame
glitch is acceptable — confirmed by the memory plan.
**Warning signs:** Inline zone canvas appears 1px-wide for one frame, then snaps to correct size.

### Pitfall 6: viewZones.ts currently passes 3 args — signature change breaks existing test

**What goes wrong:** `viewZones.test.ts` calls `addInlineViewZones(editor, null, null)` with the
old 3-argument signature. After Phase 4, the function takes different arguments.
**Why it happens:** The test was written for the p5-hardcoded implementation.
**How to avoid:** viewZones.ts in Phase 4 still takes roughly the same shape (editor + refs), but
the PianorollSketch is no longer hardcoded. The new signature adds `source: VizRendererSource` as
a parameter. Tests must pass a mock source.
**Note:** Phase 4 scope for viewZones.ts is limited — per the memory plan, Phase C (Phase 6 in the
roadmap) is when viewZones fully adopts the abstraction for per-track use. Phase 4 only introduces
`mountVizRenderer` usage; the viewZones.ts change in Phase 4 is minimal (replace hardcoded
`new p5(PianorollSketch(...), container)` with `mountVizRenderer(...)`).

---

## Code Examples

### Complete types.ts replacement

```typescript
// Source: THESIS.md §4.1 + memory:project_viz_renderer_plan.md
import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'

export interface PatternScheduler {
  now(): number
  query(begin: number, end: number): any[]
}

export interface VizRefs {
  hapStreamRef: RefObject<HapStream | null>
  analyserRef:  RefObject<AnalyserNode | null>
  schedulerRef: RefObject<PatternScheduler | null>
}

export interface VizRenderer {
  mount(container: HTMLDivElement, refs: VizRefs, size: { w: number; h: number }, onError: (e: Error) => void): void
  resize(w: number, h: number): void
  pause(): void
  resume(): void
  destroy(): void
}

export type VizRendererSource = (() => VizRenderer) | VizRenderer

export interface VizDescriptor {
  id: string
  label: string
  requires?: 'webgl' | 'webgl2'
  factory: () => VizRenderer
}

// Keep P5SketchFactory as internal type (not exported) — used only by P5VizRenderer
// SketchFactory and VizMode are REMOVED — breaking changes
```

### VizPanel updated props

```typescript
// Before
interface VizPanelProps {
  sketchFactory: SketchFactory
  hapStream: HapStream | null
  analyser: AnalyserNode | null
  scheduler: PatternScheduler | null
  vizHeight?: number | string
}

// After
interface VizPanelProps {
  source: VizRendererSource
  hapStream: HapStream | null
  analyser: AnalyserNode | null
  scheduler: PatternScheduler | null
  vizHeight?: number | string
}
```

### VizPicker updated props

```typescript
// Before
interface VizPickerProps {
  activeMode: VizMode
  onModeChange: (mode: VizMode) => void
  showVizPicker?: boolean
}

// After
interface VizPickerProps {
  descriptors: VizDescriptor[]
  activeId: string
  onIdChange: (id: string) => void
  showVizPicker?: boolean
}
```

### index.ts — new exports to add

```typescript
// New exports for Phase 4
export type { VizRenderer, VizRefs, VizRendererSource, VizDescriptor } from './visualizers/types'
export { P5VizRenderer } from './visualizers/renderers/P5VizRenderer'
export { DEFAULT_VIZ_DESCRIPTORS } from './visualizers/defaultDescriptors'

// Remove from exports (hard break):
// SketchFactory, VizMode — no longer exported
// Individual sketch factories (PianorollSketch etc.) — kept exported for advanced users who
// want to wrap them manually, but VizPanel/VizPicker no longer require them
```

---

## Test File Migration

Four test files must be updated in the same plan as the source changes.

### `useP5Sketch.test.ts` → `useVizRenderer.test.ts`

**What breaks:** Imports from `useP5Sketch` (deleted module). Uses `fakeSketchFactory` (old API).
**Migration:** Rename file. Import `useVizRenderer`. Create a `mockSource: VizRendererSource` that
returns a mock `VizRenderer` object (with jest `vi.fn()` for all 5 methods). Verify `mount()` is
called on effect, `destroy()` on unmount, ResizeObserver wired via `mountVizRenderer`.

### `VizPanel.test.tsx`

**What breaks:** Passes `sketchFactory={sketchFactory}` prop — prop no longer exists.
**Migration:** Change mock to use `useVizRenderer` instead of `useP5Sketch`. Pass
`source={mockSource}` where `mockSource` is a `VizRendererSource`. The 6 style-assertion tests
(height, background, borderTop, overflow) survive unchanged — they test the div, not the hook.

### `VizPicker.test.tsx`

**What breaks:** Passes `activeMode="pianoroll"` and `onModeChange` — props renamed.
**Migration:** Render `<VizPicker descriptors={DEFAULT_VIZ_DESCRIPTORS} activeId="pianoroll" onIdChange={fn} />`.
Test `data-testid="viz-btn-pianoroll"` etc. — still valid if testids are generated as `viz-btn-{descriptor.id}`.
`onModeChange` tests: verify `onIdChange` called with `"scope"` instead of `VizMode`.
**Note:** The test currently checks for 5 buttons. DEFAULT_VIZ_DESCRIPTORS has 7. Tests should
check all 7 or test specific ones by testid.

### `viewZones.test.ts`

**What breaks:** Calls `addInlineViewZones(editor, null, null)` with 3-arg signature. Mocks
`vi.mock('../visualizers/sketches/PianorollSketch', ...)` which is no longer used directly.
**Migration:** The function signature changes minimally in Phase 4 (adds `source` param with a
default). Tests pass a mock source or rely on a default. The structural assertions (zones added/removed,
cleanup function, afterLineNumber) remain valid — only the mock setup changes.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SketchFactory = (...refs) => (p: p5) => void` | `VizRenderer` interface with 5 lifecycle methods | Phase 4 (this phase) | p5 no longer in the public API surface |
| `VizMode` string union hardcoded in `VizPicker` | `VizDescriptor[]` data-driven | Phase 4 (this phase) | Picker scales to any number of renderers |
| `useP5Sketch` hook | `useVizRenderer` hook via `mountVizRenderer` | Phase 4 (this phase) | Hook is now renderer-agnostic |
| `vizSketch?: SketchFactory` prop | removed, `vizDescriptors?: VizDescriptor[]` | Phase 4 (this phase) | Hard break |

**Deprecated/outdated after this phase:**
- `SketchFactory` type: removed from types.ts, no longer exported
- `VizMode` type: removed from types.ts, no longer exported
- `useP5Sketch.ts`: deleted file
- `vizSketch` prop: removed from `StrudelEditorProps`
- Individual sketch exports (`PianorollSketch`, `ScopeSketch`, etc.) from `index.ts`: kept as
  convenience exports for advanced consumers but no longer required for normal use

---

## Open Questions

1. **VizPicker icon placement**
   - What we know: Icons currently live as SVG components inside `VizPicker.tsx`, hardcoded to VizMode
   - What's unclear: Should icons move to `VizDescriptor` (requires adding `icon?: ReactNode` to the
     canonical THESIS interface) or stay as a private lookup map in VizPicker?
   - Recommendation: Keep icons as a private `ICON_MAP: Record<string, ReactNode>` in `VizPicker.tsx`,
     keyed by descriptor id. This avoids polluting the canonical `VizDescriptor` interface with a
     React-specific field. THESIS.md does not mention icons; don't extend the interface without reason.

2. **viewZones.ts scope in Phase 4 vs Phase 6**
   - What we know: Phase 4 introduces `mountVizRenderer`. Phase 6 (ZONE-01..04) does the full
     per-track refactor of viewZones.ts including the `source` param, `pause/resume` return, etc.
   - What's unclear: How much of viewZones.ts changes in Phase 4 vs Phase 6?
   - Recommendation: In Phase 4, viewZones.ts should replace the hardcoded `new p5(PianorollSketch(...), container)`
     call with `mountVizRenderer(container, () => new P5VizRenderer(PianorollSketch), refs, size, onError)`.
     This makes the test change minimal and keeps Phase 6 as the "full abstraction" milestone. The
     function signature stays the same for now.

3. **`scheduler` prop removal from VizPanel**
   - What we know: Current VizPanel has `scheduler: PatternScheduler | null` as a prop, passed
     through to `useP5Sketch`. In the new design, `VizRefs` bundles all three refs.
   - What's unclear: Does VizPanel expose a `scheduler` prop and pass it into `useVizRenderer`
     alongside hapStream/analyser, or does it take a single `refs: VizRefs`?
   - Recommendation: Keep individual props (`hapStream`, `analyser`, `scheduler`) on VizPanel and
     bundle them into `VizRefs` inside `useVizRenderer`. This preserves the ergonomic API at the
     component level.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already configured) |
| Config file | `packages/editor/vitest.config.ts` |
| Quick run command | `pnpm --filter @strucode/editor test --run` |
| Full suite command | `pnpm --filter @strucode/editor test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REND-01 | VizRenderer interface exists and P5VizRenderer implements all 5 methods | unit | `pnpm --filter @strucode/editor test --run -- useVizRenderer` | ❌ Wave 0 |
| REND-02 | VizRefs bundles the 3 refs correctly | unit | `pnpm --filter @strucode/editor test --run -- useVizRenderer` | ❌ Wave 0 |
| REND-03 | P5VizRenderer.mount creates p5 instance, resize calls resizeCanvas, pause/resume call noLoop/loop, destroy calls remove | unit | `pnpm --filter @strucode/editor test --run -- P5VizRenderer` | ❌ Wave 0 |
| REND-04 | VizDescriptor type compiles without error | type-check | `pnpm --filter @strucode/editor tsc --noEmit` | N/A (type) |
| REND-05 | DEFAULT_VIZ_DESCRIPTORS has 7 entries, each with id/label/factory | unit | `pnpm --filter @strucode/editor test --run -- defaultDescriptors` | ❌ Wave 0 |
| REND-06 | useVizRenderer calls mount on effect, disconnect+destroy on cleanup | unit | `pnpm --filter @strucode/editor test --run -- useVizRenderer` | ❌ Wave 0 (rename from useP5Sketch.test.ts) |
| REND-07 | VizPicker renders one button per descriptor with correct testid | unit | `pnpm --filter @strucode/editor test --run -- VizPicker` | ✅ (needs migration) |

### Sampling Rate

- **Per task commit:** `pnpm --filter @strucode/editor test --run`
- **Per wave merge:** `pnpm --filter @strucode/editor test --run`
- **Phase gate:** Full suite green + `tsc --noEmit` clean before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/useVizRenderer.test.ts` — covers REND-01, REND-02, REND-06 (rename + rewrite from useP5Sketch.test.ts)
- [ ] `src/__tests__/P5VizRenderer.test.ts` — covers REND-03 (new file)
- [ ] `src/__tests__/defaultDescriptors.test.ts` — covers REND-05 (new file)
- [ ] `src/__tests__/VizPanel.test.tsx` — migrate prop from `sketchFactory` to `source` (exists, needs update)
- [ ] `src/__tests__/VizPicker.test.tsx` — migrate from VizMode to VizDescriptor props (exists, needs update)
- [ ] `src/__tests__/viewZones.test.ts` — update for mountVizRenderer usage (exists, needs update)

---

## Sources

### Primary (HIGH confidence)

- `THESIS.md §4.1` — canonical VizRenderer, VizRefs, VizDescriptor interfaces (read this session)
- `memory/project_viz_renderer_plan.md` — full Phase A file layout, P5VizRenderer implementation,
  mountVizRenderer implementation, gotchas per phase (read this session)
- `packages/editor/src/visualizers/types.ts` — current SketchFactory/VizMode types (read this session)
- `packages/editor/src/visualizers/useP5Sketch.ts` — current hook (read this session)
- `packages/editor/src/visualizers/VizPanel.tsx` — current panel (read this session)
- `packages/editor/src/visualizers/VizPicker.tsx` — current picker with MODES constant (read this session)
- `packages/editor/src/visualizers/viewZones.ts` — current inline zones (read this session)
- `packages/editor/src/StrudelEditor.tsx` — current SKETCH_MAP, prop wiring (read this session)
- `packages/editor/src/index.ts` — current exports (read this session)
- `packages/editor/src/__tests__/*.test.ts(x)` — all 4 breaking test files (read this session)

### Secondary (MEDIUM confidence)

- p5 v2.2.3 `noLoop()`/`loop()` methods — used correctly by P5VizRenderer; p5 queues `noLoop()` before
  `setup()` completes (confirmed by Phase 3 experience documented in memory)

### Tertiary (LOW confidence)

None — all claims in this document are backed by direct code inspection or canonical project documents.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; entire phase is source-level refactoring
- Architecture: HIGH — canonical interfaces from THESIS.md and memory plan; verified against current code
- Pitfalls: HIGH — identified from current code inspection + documented gotchas in memory plan
- Test migration: HIGH — all 4 breaking test files read; migration paths fully specified

**Research date:** 2026-03-22
**Valid until:** Stable indefinitely (no external dependencies; phase is pure internal refactoring)
