# Phase 2: Pianoroll Visualizers - Research

**Researched:** 2026-03-22
**Domain:** p5.js canvas visualizers, Monaco view zones, React animation lifecycle
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- HapStream and AnalyserNode reach the p5 sketch via `useRef` — no stale closures, no re-renders when audio data updates
- SketchFactory signature: `(hapStreamRef: React.RefObject<HapStream | null>, analyserRef: React.RefObject<AnalyserNode | null>) => (p: p5) => void`
- Custom `vizSketch` prop replaces the default sketch entirely — one active sketch at a time
- VizPanel fills its container via ResizeObserver + `p.resizeCanvas(w, h)` — adapts to `vizHeight` prop and window resize
- Inline Monaco view zone canvases: fixed 120px height, fills Monaco content width
- Note coloring: use `hap.value.color` when present, fall back to `s`-field category colors: drums=`var(--warning)`, bass=`var(--info)`, melody=`var(--accent)`, pad=`var(--success)`, unknown=`var(--accent)`
- Percussion sounds (bd, sd, hh, cp, etc.) detected by sound name — fixed lane at bottom of canvas below pitch area; pitched notes span MIDI 24–96 on Y-axis
- No Y-axis labels or piano key overlay — clean canvas
- Inline view zones display all haps from all tracks (same data as full panel)
- VizPicker: icon buttons + active-state highlight in a 32px horizontal strip between toolbar and editor
- Default visualizer on load: pianoroll
- VizPanel remains mounted when audio is stopped — canvas stays blank/idle (no unmount, no placeholder text)
- VizPicker visibility controlled by its own `showVizPicker` prop — independent of `showToolbar`

### Claude's Discretion
- Exact percussion sound name detection list (bd, sd, hh, cp, rim, mt, ht, lt, etc.)
- Drum lane height relative to pitch area (suggested: 20% of canvas height)
- VizPicker icon design (SVG icons for each mode)
- Exact s-field category matching logic (substring vs exact match)

### Deferred Ideas (OUT OF SCOPE)
- Configurable time window (6s is hardcoded per spec, user-configurable is a v2 idea)
- Per-line hap filtering in inline view zones (show only notes from that `$:` line) — deferred, all-haps approach used in v1
- Pitchwheel, spiral, scope, spectrum sketches — scaffolded in this phase, implemented in Phase 3
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIANO-01 | Full-panel Pianoroll canvas renders at 60fps via requestAnimationFrame | p5 draw loop runs at display refresh rate; confirmed in p5 docs |
| PIANO-02 | Pianoroll shows a rolling 6-second time window (right edge = now, scrolls left) | `audioTime` on HapEvent provides scheduling time; `AudioContext.currentTime` gives now; X = (audioTime - now + 6) / 6 * canvasWidth |
| PIANO-03 | Y-axis spans MIDI 24 (C1) to MIDI 96 (C7) | 72 semitone range; Y = pitchArea * (1 - (midi - 24) / 72) |
| PIANO-04 | Note blocks colored by s field or hap.value.color | HapEvent exposes both `s` and `color` fields directly |
| PIANO-05 | Percussion sounds shown at fixed MIDI positions below pitch area | Drum lane = bottom 20% of canvas; fixed Y slots per drum name |
| PIANO-06 | Inline pianoroll as Monaco view zone below $: lines (120px height) | Monaco `changeViewZones` API with `heightInPx: 120` and canvas domNode |
| PIANO-07 | Inline view zones re-added after every evaluate() call | evaluate() returns before re-layout; hook re-adds zones in callback wired to evaluate |
| UI-01 | VizPicker toolbar lets user switch between visualizer modes | React state `activeViz` + 5 icon buttons; mode switch swaps sketchFactory passed to VizPanel |
| UI-02 | Layout: toolbar (40px) + viz-picker (32px) + editor + visualizer panel | Flex column; VizPicker is a 32px strip inserted between Toolbar and StrudelMonaco |
| UI-03 | vizHeight prop controls visualizer panel height (default 200px) | VizPanel container uses `height: vizHeight`; ResizeObserver calls `p.resizeCanvas` |
| UI-04 | showToolbar prop hides toolbar (default: shown) | Already implemented in StrudelEditor.tsx — no change needed |
</phase_requirements>

---

## Summary

Phase 2 builds the p5.js canvas visualizer infrastructure and wires it into StrudelEditor. The work breaks into four distinct sub-systems: (1) the `useP5Sketch` hook that bridges React lifecycle to p5 instance mode, (2) the `PianorollSketch` canvas logic that reads HapStream events and renders note blocks on a rolling time axis, (3) the `VizPanel` React component that hosts the p5 canvas and responds to container resizes, and (4) the inline Monaco view zone system that embeds a pianoroll canvas below every `$:` line.

The p5.js 2.x instance mode API is unchanged from 1.x for the patterns needed here: `new p5(sketch, container)`, `p.setup`, `p.draw`, `p.resizeCanvas(w, h)`, and `p.remove()`. React StrictMode safety is achieved entirely by calling `instance.remove()` in the `useEffect` cleanup — this is the established pattern and requires no special workarounds. The sketch factory receives `useRef`-wrapped data references so the draw loop always reads current values without stale closures and without triggering React re-renders.

For inline view zones, Monaco's `editor.changeViewZones(accessor => { accessor.addZone({...}) })` API is stable at `monaco-editor@0.50.0` (already in the project). The critical invariant to understand: Monaco discards all view zones whenever `editor.setModel()` is called or a full re-layout occurs — this is exactly what happens after every `evaluate()` call. The zones must be re-added in an `onEvaluate` callback wired from StrudelEditor.

**Primary recommendation:** Install `p5@2.2.3` and `@types/p5@1.7.7`. Implement in this order: `useP5Sketch` hook → `PianorollSketch` factory → `VizPanel` component → `VizPicker` component → StrudelEditor wiring → inline view zones. The sketches for Phase 3 (scope, spectrum, spiral, pitchwheel) are created as empty stubs returning a no-op draw function.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p5 | 2.2.3 | Canvas sketch runtime: setup/draw loop, canvas management | Chosen by user decision; instance mode is React-compatible |
| @types/p5 | 1.7.7 | TypeScript types for p5 instance mode | Paired with p5 package; provides `p5` type for sketch callbacks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React (existing) | 18.3.x | Component tree, hooks for lifecycle and refs | VizPanel, VizPicker are React function components |
| monaco-editor (existing) | 0.50.0 | View zone API for inline pianoroll | changeViewZones, IViewZone interface |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p5 instance mode | Native Canvas 2D + rAF | Less abstraction but more setup code; p5 chosen per user decision |
| p5 instance mode | react-p5 wrapper lib | Extra dependency with no benefit; direct new p5() is simpler |

**Installation:**
```bash
pnpm add p5@2.2.3 @types/p5@1.7.7 --filter @strucode/editor
```

**Version verification (confirmed 2026-03-22):**
- `p5`: 2.2.3 (published 2026-03-21)
- `@types/p5`: 1.7.7 (published 2025-10-24)

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── visualizers/
│   ├── useP5Sketch.ts        # Hook: p5 instance lifecycle, ref-based data
│   ├── VizPanel.tsx          # Container component with ResizeObserver
│   ├── VizPicker.tsx         # 32px toolbar strip with 5 mode buttons
│   └── sketches/
│       ├── PianorollSketch.ts  # Rolling 6s pianoroll (PIANO-01 to PIANO-05)
│       ├── ScopeSketch.ts      # Stub — blank canvas (Phase 3)
│       ├── SpectrumSketch.ts   # Stub — blank canvas (Phase 3)
│       ├── SpiralSketch.ts     # Stub — blank canvas (Phase 3)
│       └── PitchwheelSketch.ts # Stub — blank canvas (Phase 3)
├── monaco/
│   ├── StrudelMonaco.tsx     # Add onEvaluate callback prop + view zone logic
│   └── useViewZones.ts       # Hook: adds/removes inline pianoroll zones
```

### Pattern 1: useP5Sketch Hook (instance mode + React StrictMode safe)

**What:** Creates a p5 instance on mount, removes it on cleanup. Refs keep hapStream and analyser current inside draw loop.
**When to use:** Any component that hosts a p5 canvas.

```typescript
// Source: p5.js instance mode docs + established React pattern
import p5 from 'p5'
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'

type SketchFactory = (
  hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>
) => (p: p5) => void

export function useP5Sketch(
  containerRef: RefObject<HTMLDivElement | null>,
  sketchFactory: SketchFactory,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null
) {
  const hapStreamRef = useRef<HapStream | null>(hapStream)
  const analyserRef = useRef<AnalyserNode | null>(analyser)

  // Update refs each render — no stale closure inside draw loop
  hapStreamRef.current = hapStream
  analyserRef.current = analyser

  useEffect(() => {
    if (!containerRef.current) return
    const sketch = sketchFactory(hapStreamRef, analyserRef)
    const instance = new p5(sketch, containerRef.current)
    return () => instance.remove()  // handles StrictMode double-mount + cleanup
  }, [sketchFactory])  // re-create only when sketch type changes
}
```

### Pattern 2: PianorollSketch Factory

**What:** Returns a p5 sketch function. Subscribes to HapStream on setup, stores note events in a buffer, draws rolling window each frame.
**When to use:** The pianoroll visualizer mode.

```typescript
// Source: HapEvent interface in HapStream.ts + p5 instance mode API
import type p5 from 'p5'
import type { RefObject } from 'react'
import type { HapStream, HapEvent } from '../../engine/HapStream'

const WINDOW_SECONDS = 6
const MIDI_MIN = 24
const MIDI_MAX = 96
const MIDI_RANGE = MIDI_MAX - MIDI_MIN  // 72 semitones
const DRUM_LANE_RATIO = 0.20  // bottom 20% for percussion

// Drum sound name detection list (Claude's discretion)
const DRUM_SOUNDS = new Set([
  'bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'mt', 'ht', 'lt',
  'cr', 'rd', 'cb', 'cy', 'ag', 'ma', 'perc', 'drum',
])

// Category → drum lane Y slot (0 = topmost drum lane row)
const DRUM_SLOT: Record<string, number> = {
  bd: 0, sd: 1, hh: 2, oh: 3, cp: 4, rim: 5, mt: 6, ht: 7, lt: 8,
}

function getColor(event: HapEvent, tokens: Record<string, string>): string {
  if (event.color) return event.color
  const s = event.s ?? ''
  // Exact match first, then prefix match for compound names like 'bd2', 'hh_open'
  const baseName = s.replace(/[0-9_-].*$/, '')
  if (DRUM_SOUNDS.has(baseName) || DRUM_SOUNDS.has(s)) {
    return tokens['--stem-drums'] ?? '#f97316'
  }
  if (/^(bass|b[0-9]|sub)/.test(s)) return tokens['--stem-bass'] ?? '#06b6d4'
  if (/^(pad|str|choir|voice)/.test(s)) return tokens['--stem-pad'] ?? '#10b981'
  return tokens['--stem-melody'] ?? '#a78bfa'
}

export function PianorollSketch(
  hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>
) {
  return (p: p5) => {
    const events: HapEvent[] = []

    const handler = (e: HapEvent) => events.push(e)

    p.setup = () => {
      p.createCanvas(p.windowWidth, 200)
      p.noStroke()
      hapStreamRef.current?.on(handler)
    }

    p.draw = () => {
      const now = performance.now() / 1000  // seconds (aligned to audioTime domain)
      const W = p.width
      const H = p.height
      const pitchH = H * (1 - DRUM_LANE_RATIO)
      const drumH = H * DRUM_LANE_RATIO
      const tokens = getCSSTokens(p.canvas)

      p.background(tokens['--background'] ?? '#090912')

      // Prune events older than window
      const cutoff = now - WINDOW_SECONDS
      while (events.length > 0 && events[0].audioTime < cutoff) events.shift()

      for (const e of events) {
        const x = ((e.audioTime - now + WINDOW_SECONDS) / WINDOW_SECONDS) * W
        const noteW = Math.max(2, (e.audioDuration / WINDOW_SECONDS) * W)
        const color = getColor(e, tokens)

        const baseName = (e.s ?? '').replace(/[0-9_-].*$/, '')
        const isDrum = DRUM_SOUNDS.has(baseName) || DRUM_SOUNDS.has(e.s ?? '')

        if (isDrum) {
          const slot = DRUM_SLOT[baseName] ?? DRUM_SLOT[e.s ?? ''] ?? 4
          const slotCount = Object.keys(DRUM_SLOT).length
          const y = pitchH + (slot / slotCount) * drumH
          const noteH = drumH / slotCount
          p.fill(color)
          p.rect(x, y, noteW, Math.max(2, noteH - 1))
        } else if (e.midiNote !== null) {
          const midi = Math.max(MIDI_MIN, Math.min(MIDI_MAX, e.midiNote))
          const y = pitchH * (1 - (midi - MIDI_MIN) / MIDI_RANGE)
          const noteH = Math.max(1, pitchH / MIDI_RANGE)
          p.fill(color)
          p.rect(x, y, noteW, noteH)
        }
      }
    }

    p.remove = () => {
      hapStreamRef.current?.off(handler)
    }
  }
}

function getCSSTokens(canvas: HTMLCanvasElement): Record<string, string> {
  const style = getComputedStyle(canvas.parentElement ?? canvas)
  return {
    '--background': style.getPropertyValue('--background').trim() || '#090912',
    '--stem-drums': style.getPropertyValue('--stem-drums').trim() || '#f97316',
    '--stem-bass': style.getPropertyValue('--stem-bass').trim() || '#06b6d4',
    '--stem-melody': style.getPropertyValue('--stem-melody').trim() || '#a78bfa',
    '--stem-pad': style.getPropertyValue('--stem-pad').trim() || '#10b981',
  }
}
```

**Key timing note:** `HapEvent.audioTime` is `AudioContext.currentTime` at fire time. To get "now" for pianoroll X position, use `AudioContext.currentTime` — but this is not available inside the sketch without the ref. The cleanest approach: store `audioCtx` in a module-level or ref-accessible variable, or use `performance.now() / 1000` and calibrate against the AudioContext offset at init. The analyserRef already holds the AnalyserNode whose context is accessible via `analyserRef.current?.context.currentTime`.

### Pattern 3: Monaco View Zones for Inline Pianoroll

**What:** Monaco's `changeViewZones` API inserts a DOM element (canvas) as a vertical zone below a given line. The zone's `domNode` is a plain `div` containing the canvas.
**When to use:** After every `evaluate()` call — view zones are discarded on model re-layout.

```typescript
// Source: Monaco Editor API (IViewZone, IViewZoneChangeAccessor)
// editor is Monaco.editor.IStandaloneCodeEditor

function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null
): () => void {
  const model = editor.getModel()
  if (!model) return () => {}

  const code = model.getValue()
  const lines = code.split('\n')
  const zoneIds: string[] = []
  const p5Instances: p5[] = []

  editor.changeViewZones((accessor) => {
    lines.forEach((line, i) => {
      if (!line.trim().startsWith('$:')) return

      const container = document.createElement('div')
      container.style.cssText = 'overflow:hidden;'

      const zoneId = accessor.addZone({
        afterLineNumber: i + 1,  // Monaco lines are 1-based
        heightInPx: 120,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      // Attach p5 pianoroll into container
      const instance = new p5(
        PianorollSketch(
          { current: hapStream } as React.RefObject<HapStream | null>,
          { current: analyser } as React.RefObject<AnalyserNode | null>
        ),
        container
      )
      p5Instances.push(instance)
    })
  })

  // Return cleanup function
  return () => {
    p5Instances.forEach((inst) => inst.remove())
    editor.changeViewZones((accessor) => {
      zoneIds.forEach((id) => accessor.removeZone(id))
    })
  }
}
```

**Critical:** Do NOT call `changeViewZones` during the Monaco `onMount` callback — call it after each `evaluate()` completes. Store the cleanup function and call it before adding new zones.

### Pattern 4: VizPanel with ResizeObserver

**What:** Flex container that hosts the p5 canvas. ResizeObserver calls `p.resizeCanvas(w, h)` when dimensions change.
**When to use:** VizPanel component implementation.

```typescript
// Source: ResizeObserver Web API + p5 resizeCanvas docs
// ResizeObserver fires on mount and on container size change
useEffect(() => {
  if (!containerRef.current) return
  const ro = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const { width, height } = entry.contentRect
    p5InstanceRef.current?.resizeCanvas(width, height)
  })
  ro.observe(containerRef.current)
  return () => ro.disconnect()
}, [])
```

### Anti-Patterns to Avoid

- **Reading CSS tokens inside p5 setup only:** Token values change with theme switches. Read them on each `draw()` call from `canvas.parentElement` computed style.
- **Using `window.AudioContext.currentTime` in sketch:** Access via `analyserRef.current?.context.currentTime` — the ref is always current.
- **Creating view zones in `onMount`:** View zones added at mount are removed when the user first evaluates. Add zones only in the post-evaluate callback.
- **Mutating the hapEvents array while iterating:** The draw loop reads `events` on every frame. The HapStream handler pushes to the same array. Use a simple array push/shift strategy — JS is single-threaded so this is safe.
- **Using `p.mouseX` / `p.mouseY` in sketch body:** These require p5 event handlers to be active; sketches here are display-only and should not register mouse handlers.
- **Forgetting to call `hapStreamRef.current?.off(handler)` on cleanup:** p5's built-in `remove()` does not know about HapStream. Override or wrap `p.remove` to also unsubscribe.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animation loop at 60fps | Custom rAF loop + cleanup | p5 `draw()` | p5 manages rAF, visibility API pause, cleanup |
| Canvas resize | Manual canvas.width/height | `p.resizeCanvas(w, h)` | Handles pixel ratio, triggers redraw |
| Container size tracking | Polling or window.resize | `ResizeObserver` | Fires only on actual layout change; no polling overhead |
| p5 React lifecycle | Workaround flags, refs to p5 | `instance.remove()` in useEffect cleanup | One-liner StrictMode safety |
| CSS token reading | Hardcoded hex colors | `getComputedStyle(el).getPropertyValue('--token')` | Picks up light/dark theme changes automatically |

**Key insight:** The entire p5 + React integration fits in ~15 lines via the `useP5Sketch` hook. Do not introduce wrapper libraries (react-p5, p5i) — they add indirection without solving anything new.

---

## Common Pitfalls

### Pitfall 1: Stale HapStream Reference in Sketch Closure
**What goes wrong:** The sketch closure captures `hapStream` at creation time. If `hapStream` changes (e.g. after a second `play()` call) the sketch subscribes to the old stream.
**Why it happens:** JavaScript closures close over values at creation, not by reference.
**How to avoid:** Pass `hapStreamRef` (a `RefObject`) into the sketch factory. The draw loop reads `hapStreamRef.current` on every call — always current, no re-create needed.
**Warning signs:** Notes from second play session don't appear on canvas.

### Pitfall 2: View Zones Reset After evaluate()
**What goes wrong:** Inline pianorolls disappear after user edits and re-evaluates.
**Why it happens:** Monaco calls `editor.setModel()` internally on evaluate, which discards all view zones.
**How to avoid:** Wire an `onEvaluate` callback in StrudelEditor.tsx. After `engine.evaluate()` returns, call the view zone cleanup + re-add function. Store cleanup in a ref so it survives re-renders.
**Warning signs:** View zones visible after mount but gone after first Ctrl+Enter.

### Pitfall 3: audioTime Domain Mismatch
**What goes wrong:** Notes are drawn at wrong X position — either too far right (future) or off the left edge.
**Why it happens:** `HapEvent.audioTime` is `AudioContext.currentTime` at scheduling time. In the draw loop "now" must also be `AudioContext.currentTime`, not `Date.now()` or `performance.now()`.
**How to avoid:** Access `analyserRef.current?.context.currentTime` in the draw loop. This is the same clock as `audioTime`.
**Warning signs:** Notes appear at X=0 and jump or notes always appear at X=maxWidth.

### Pitfall 4: p5 Canvas Injected Outside Container
**What goes wrong:** p5 creates its canvas as a direct child of `document.body` instead of the container div.
**Why it happens:** The `container` argument to `new p5(sketch, container)` must be the actual DOM element, not an ID string. If `containerRef.current` is null when the effect runs, p5 falls back to body.
**How to avoid:** Guard the `useEffect` with `if (!containerRef.current) return`. The effect runs after mount so the ref is populated.
**Warning signs:** Canvas appears as a floating element over the page; VizPanel appears empty.

### Pitfall 5: Multiple p5 Instances on StrictMode Mount
**What goes wrong:** Two canvases appear in VizPanel during development (React StrictMode mounts twice).
**Why it happens:** React StrictMode intentionally double-mounts to detect side effects. If cleanup is missing, the first instance is orphaned.
**How to avoid:** The `return () => instance.remove()` in `useP5Sketch`'s useEffect is the complete fix. Verify cleanup fires before adding new assertions.
**Warning signs:** Two overlapping canvases visible in DevTools DOM, one orphaned event listener.

### Pitfall 6: View Zone domNode Height Mismatch
**What goes wrong:** View zone appears but has wrong height — either too small (content clipped) or too large (blank space).
**Why it happens:** `heightInPx` on the IViewZone controls the reserved editor space. The `domNode` div must also have an explicit height matching `heightInPx`, otherwise the p5 canvas will be created at 0px.
**How to avoid:** Set both `heightInPx: 120` on the zone AND `container.style.height = '120px'` on the domNode div before attaching p5.
**Warning signs:** Monaco shows a blank gap of correct size but canvas is invisible.

### Pitfall 7: p5 remove() Does Not Unsubscribe from HapStream
**What goes wrong:** After unmounting VizPanel, HapEvent handlers still fire and push to the (now dead) events array. Memory leak + potential errors.
**Why it happens:** p5's `remove()` stops the draw loop and removes the canvas, but does not know about external event subscriptions.
**How to avoid:** In the sketch body, define a cleanup handler and call it from `p.remove`. Override: store the handler reference and call `hapStreamRef.current?.off(handler)` inside a wrapper around `p.remove`, or call it explicitly in the `useEffect` cleanup before `instance.remove()`.

---

## Code Examples

### VizPanel Component Skeleton
```typescript
// Full component pattern — confirmed against React 18 + p5 2.x API
import React, { useRef, useEffect } from 'react'
import type { HapStream } from '../engine/HapStream'
import { useP5Sketch } from './useP5Sketch'
import type { SketchFactory } from './useP5Sketch'

interface VizPanelProps {
  vizHeight?: number | string
  hapStream: HapStream | null
  analyser: AnalyserNode | null
  sketchFactory: SketchFactory
}

export function VizPanel({ vizHeight = 200, hapStream, analyser, sketchFactory }: VizPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useP5Sketch(containerRef, sketchFactory, hapStream, analyser)

  return (
    <div
      ref={containerRef}
      style={{
        height: vizHeight,
        background: 'var(--background)',
        borderTop: '1px solid var(--border)',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  )
}
```

### VizPicker Button Active State
```typescript
// Icon button — active vs idle style
const buttonStyle = (isActive: boolean): React.CSSProperties => ({
  width: 32,
  height: 24,
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: isActive ? 'var(--accent-dim)' : 'transparent',
  outline: isActive ? '1px solid var(--accent)' : 'none',
  color: isActive ? 'var(--foreground)' : 'var(--foreground-muted)',
})
```

### Scaffolded Stub Sketch (Phase 3 placeholders)
```typescript
// ScopeSketch.ts, SpectrumSketch.ts, SpiralSketch.ts, PitchwheelSketch.ts
export function ScopeSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  _analyserRef: RefObject<AnalyserNode | null>
) {
  return (p: p5) => {
    p.setup = () => { p.createCanvas(300, 200) }
    p.draw = () => { /* blank until Phase 3 */ }
  }
}
```

### StrudelEditor Wiring for View Zones
```typescript
// In StrudelEditor.tsx — after engine.evaluate() call
const viewZoneCleanupRef = useRef<(() => void) | null>(null)

// Inside handlePlay, after engine.evaluate() returns without error:
viewZoneCleanupRef.current?.()
viewZoneCleanupRef.current = addInlineViewZones(
  editorRef.current,
  engine.getHapStream(),
  engine.getAnalyser()
)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| p5 preload() for async resources | async setup() | p5 2.0 (2025) | Not relevant here — no async resources in sketches |
| window.p5 global mode | Instance mode `new p5(sketch, container)` | Long-established | Required for React; global mode pollutes window |
| react-p5 wrapper library | Direct `new p5()` in useEffect | Community best practice 2023+ | Fewer dependencies, same result |

**Deprecated/outdated:**
- `p5.remove()` as method call vs return value: still `instance.remove()` in 2.x — no change.
- `preload()`: replaced by async setup in p5 2.0, but this phase does not load any assets so this is irrelevant.

---

## Open Questions

1. **audioTime clock alignment for pianoroll X position**
   - What we know: `HapEvent.audioTime` = AudioContext.currentTime at scheduling. For correct X, "now" in draw loop must be the same clock.
   - What's unclear: `AudioContext.currentTime` advances even when audio is stopped (it's a wall clock). Notes from before stop will persist in the buffer. Whether this is acceptable UX or whether the buffer should be cleared on stop.
   - Recommendation: Clear `events` array on `handleStop()`. Pass a `isPlaying` ref or call `events.length = 0` via a method on the sketch.

2. **p5 canvas pixel ratio (retina/HiDPI)**
   - What we know: p5 2.x `createCanvas()` does not automatically set `pixelDensity` to `window.devicePixelRatio`.
   - What's unclear: Whether blurry rendering on retina displays is acceptable for v1.
   - Recommendation: Call `p.pixelDensity(window.devicePixelRatio || 1)` inside `setup`. This is one line and avoids blurry notes.

3. **View zone cleanup ref threading in StrudelEditor**
   - What we know: `evaluate()` is async; the view zone re-add must happen after it resolves.
   - What's unclear: Whether the `editorRef` is populated by the time `handlePlay` runs on first call (it is, since Monaco mounts synchronously before play is possible via UI).
   - Recommendation: Guard with `if (!editorRef.current) return` before calling `addInlineViewZones`.

---

## Validation Architecture

> `nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.x |
| Config file | `packages/editor/vitest.config.ts` (environment: jsdom, globals: true) |
| Quick run command | `cd packages/editor && pnpm test` |
| Full suite command | `cd packages/editor && pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIANO-01 | p5 draw loop registered and called | unit (mock p5) | `pnpm test -- --reporter=verbose` | Wave 0 |
| PIANO-02 | X position calculation: audioTime=now → x=rightEdge, audioTime=now-6 → x=0 | unit | `pnpm test` | Wave 0 |
| PIANO-03 | Y position: MIDI 24 → bottom of pitch area, MIDI 96 → top | unit | `pnpm test` | Wave 0 |
| PIANO-04 | Color selection: hap.value.color takes priority; s-field category fallback | unit | `pnpm test` | Wave 0 |
| PIANO-05 | Drum detection: 'bd' → drum lane; 'bd2' → drum lane; 'sine' → pitch area | unit | `pnpm test` | Wave 0 |
| PIANO-06 | changeViewZones called with afterLineNumber=line+1, heightInPx=120, domNode | unit (mock Monaco) | `pnpm test` | Wave 0 |
| PIANO-07 | View zone cleanup called before re-add on second evaluate | unit | `pnpm test` | Wave 0 |
| UI-01 | VizPicker activeViz state updates on button click; sketchFactory prop changes | unit (React Testing Library) | `pnpm test` | Wave 0 |
| UI-02 | VizPicker rendered between Toolbar and Monaco in DOM order | unit (React Testing Library) | `pnpm test` | Wave 0 |
| UI-03 | VizPanel height equals vizHeight prop | unit (React Testing Library) | `pnpm test` | Wave 0 |
| UI-04 | showToolbar=false hides Toolbar — already validated in Phase 1 | (existing) | `pnpm test` | Exists |

**Manual-only:** Visual 60fps rendering quality cannot be automated — verify by running `pnpm dev` in `packages/app` and observing notes scroll.

### Sampling Rate
- **Per task commit:** `cd packages/editor && pnpm test`
- **Per wave merge:** `cd packages/editor && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
All test files for Phase 2 logic are new — none exist yet:

- [ ] `packages/editor/src/visualizers/pianoroll.test.ts` — covers PIANO-02, PIANO-03, PIANO-04, PIANO-05 (pure functions, no DOM)
- [ ] `packages/editor/src/visualizers/useViewZones.test.ts` — covers PIANO-06, PIANO-07 (mock Monaco editor)
- [ ] `packages/editor/src/visualizers/VizPanel.test.tsx` — covers UI-03 (React Testing Library)
- [ ] `packages/editor/src/visualizers/VizPicker.test.tsx` — covers UI-01, UI-02 (React Testing Library)
- [ ] `packages/editor/src/visualizers/__mocks__/p5.ts` — manual mock for p5 constructor (jsdom cannot run canvas)

---

## Sources

### Primary (HIGH confidence)
- p5.js official docs (p5js.org/reference) — instance mode constructor, resizeCanvas, remove()
- p5.js GitHub wiki (Global-and-instance-mode) — instance mode syntax confirmed
- npm registry (2026-03-22) — p5@2.2.3 published 2026-03-21; @types/p5@1.7.7 published 2025-10-24
- HapStream.ts (codebase) — HapEvent shape, audioTime, audioDuration, s, color, midiNote fields
- StrudelEngine.ts (codebase) — getHapStream(), getAnalyser() confirmed present
- StrudelMonaco.tsx (codebase) — onMount callback pattern, editorRef available
- tokens.ts (codebase) — --stem-drums, --stem-bass, --stem-melody, --stem-pad, --accent confirmed
- vitest.config.ts (codebase) — jsdom environment, globals: true confirmed
- Prior plan file (~/.claude/plans/delegated-stirring-flurry.md) — architecture blueprint

### Secondary (MEDIUM confidence)
- Monaco Editor API search results (microsoft.github.io) — IViewZone: afterLineNumber, heightInPx, domNode, suppressMouseDown properties confirmed across multiple search results
- p5.js 2.0 release notes (medium.com/processing-foundation) — breaking change: async setup replaces preload; instance mode constructor unchanged
- React StrictMode + p5 pattern (lloydatkinson.net, dev.to) — `return () => instance.remove()` confirmed as complete StrictMode fix across multiple sources

### Tertiary (LOW confidence)
- audioTime/performance.now clock alignment strategy — inferred from Web Audio API spec; not directly verified against struCode runtime behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry confirmed p5@2.2.3 and @types/p5@1.7.7
- Architecture: HIGH — codebase read + prior plan file + p5 official docs all consistent
- Pianoroll sketch logic: HIGH — pure math (time/pitch mapping), confirmed against HapEvent fields
- Monaco view zones: MEDIUM-HIGH — API confirmed via search results; could not access typedoc page directly
- Pitfalls: HIGH — all from direct codebase analysis + React StrictMode docs

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (p5 is stable; Monaco API is locked at 0.50.0 in project)
