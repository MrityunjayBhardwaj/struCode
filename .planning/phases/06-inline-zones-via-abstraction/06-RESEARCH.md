# Phase 6: Inline Zones via Abstraction — REVISED APPROACH - Research

**Researched:** 2026-03-23
**Domain:** Monaco view zones, Pattern prototype monkey-patching, `.viz()` opt-in UX, per-track inline renderer dispatch
**Confidence:** HIGH — all findings from direct source inspection of the codebase; no external research required

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ZONE-01 | addInlineViewZones accepts VizRendererSource parameter (factory or instance) | Already implemented correctly in current viewZones.ts — function already accepts `source: VizRendererSource` as second param |
| ZONE-02 | Each inline zone resolves track-scoped VizRefs before mount — scheduler from getTrackSchedulers() | Already implemented correctly — viewZones.ts resolves `trackSchedulers.get('$N')` per zone |
| ZONE-03 | Zone div width from editor.getLayoutInfo().contentWidth (not container.clientWidth which is 0 pre-attach) | Already implemented correctly — viewZones.ts uses `editor.getLayoutInfo().contentWidth` |
| ZONE-04 | addInlineViewZones returns { cleanup, pause, resume } — StrudelEditor calls pause on stop, resume on play | Already implemented correctly — InlineZoneHandle interface, pause/resume wired in StrudelEditor |
</phase_requirements>

---

## CRITICAL: What the Previous Phase 6 Got Wrong

The previous Phase 6 implementation (Plans 01–02) **correctly implemented ZONE-01 through ZONE-04** at the technical layer:
- `viewZones.ts` accepts `VizRendererSource`, per-track schedulers, returns `InlineZoneHandle`
- `StrudelEditor.tsx` calls `pause()` on stop, `cleanup()` before re-add, `resume()` on play

**What it got wrong is the UX model:**

The `StrudelEditorProps` still has `inlinePianoroll?: boolean` — a blanket prop that adds pianoroll zones below **every** `$:` line when set to `true`. This is NOT how Strudel works.

**The intended UX is per-pattern opt-in via `.viz("name")`:**
```strudel
$: note("c4 e4 g4 b4").s("sawtooth").viz("pianoroll")
$: note("<c2 g2>").s("square").viz("scope")
$: note("<c3 e3 g3>").s("triangle")   // no inline viz — this one is clean
```

This phase REPLACES the blanket `inlinePianoroll` flag with a per-pattern capture system.

---

## Summary

The goal of this revised Phase 6 is to replace the blanket `inlinePianoroll={true}` prop with a per-pattern `.viz("name")` opt-in system. Only patterns where the user writes `.viz("name")` get an inline zone. The zone appears after the **last line** of that pattern block (not just after the `$:` line). Any viz type from `DEFAULT_VIZ_DESCRIPTORS` can be used — `.viz("pianoroll")`, `.viz("scope")`, `.viz("spectrum")`, etc.

The implementation requires three coordinated changes:

1. **Register `.viz()` as a Pattern method** during `evaluate()` using the same setter-intercept mechanism used for Pattern.prototype.p in Phase 5. The method captures `(pattern, vizName, lineIndex)` tuples into a `capturedVizRequests` map.

2. **Extend `addInlineViewZones`** to accept a `vizRequests` array (keyed by track or by last-line number) instead of adding a zone for every `$:` line. It adds a zone only for tracks that called `.viz()`.

3. **Remove `inlinePianoroll` prop** from `StrudelEditorProps` (or deprecate it) and replace the wiring in `StrudelEditor.handlePlay` to pass viz requests from the engine.

The existing ZONE-01 through ZONE-04 abstractions (VizRendererSource, InlineZoneHandle, per-track schedulers, contentWidth) are all correct — only the **trigger condition** (blanket vs. opt-in) and the **viz-type dispatch** (fixed pianoroll vs. name lookup) need to change.

**Primary recommendation:** Register `.viz()` via a second setter-intercept in `evaluate()` alongside the existing `.p` intercept. Capture `Map<trackKey, vizName>` from eval. Extend `addInlineViewZones` to only add zones for keys present in this map, and use `DEFAULT_VIZ_DESCRIPTORS` to resolve the factory by name.

---

## Current State (Exact Code as Implemented)

### viewZones.ts — Current Signature (CORRECT)

```typescript
export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  source: VizRendererSource,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null,
  trackSchedulers: Map<string, PatternScheduler>
): InlineZoneHandle
```

This function iterates over every line, adds a zone for each `$:` line using the provided `source` uniformly. Problem: all zones get the same `source`, and there is no way to say "only add zones for some $: lines, with different viz types per line."

### StrudelEditor.tsx — Current Wiring (WRONG UX)

```typescript
// StrudelEditorProps
inlinePianoroll?: boolean    // blanket flag — needs removal

// handlePlay (after evaluate succeeds):
if (_inlinePianoroll && editorRef.current) {
  viewZoneCleanupRef.current?.cleanup()
  viewZoneCleanupRef.current = addInlineViewZones(
    editorRef.current,
    currentSource,          // same source for all zones
    engine.getHapStream(),
    engine.getAnalyser(),
    engine.getTrackSchedulers()
  )
}
viewZoneCleanupRef.current?.resume()
```

### StrudelEngine.ts — Current evaluate() Structure (CORRECT FOUNDATION)

The setter-intercept for `.p` is in `evaluate()`:
```typescript
// Install setter trap — fires when injectPatternMethods does Pattern.prototype.p = fn
Object.defineProperty(Pattern.prototype, 'p', {
  configurable: true,
  set(strudelFn) {
    Object.defineProperty(Pattern.prototype, 'p', {
      configurable: true, writable: true,
      value: function(this, id) {
        // capture pattern, then call strudelFn.call(this, id)
      },
    })
  },
})
```

This same mechanism can host a second `.viz()` intercept.

---

## Architecture Patterns

### How Strudel Registers Pattern Methods

`Pattern.prototype` methods are registered in three ways:
1. **`register(name, func)`** — the main mechanism in `@strudel/core/pattern.mjs`. Adds `Pattern.prototype[name]` AND a curried global function in `strudelScope`. Methods registered this way are patternified (their arguments can be Patterns too).
2. **Direct prototype assignment** — `Pattern.prototype.p = fn` — used in `injectPatternMethods()` in `repl.mjs`. These are simple functions, not patternified.
3. **`evalScope(module)`** — copies all module exports to `globalThis` and `strudelScope`. This is how custom modules expose their functions to user code.

For `.viz()`, the cleanest approach is **direct prototype assignment** during `evaluate()` — exactly like how Phase 5 intercepts `.p`. We do NOT use `register()` or `evalScope()` because:
- `register()` is for patternified functions that need currying
- `.viz()` just needs to record a side-effect and return `this` — no patternification needed
- We want to capture viz requests in a closure-scoped Map, not into globalThis

### Pattern 1: Registering `.viz()` via Direct Prototype Assignment in evaluate()

The key insight: in `evaluate()`, after the `.p` setter-intercept is installed, we can **also** directly assign `Pattern.prototype.viz` before calling `this.repl.evaluate(code)`. When user code runs `.viz("pianoroll")`, our function fires, records the request, and returns `this` (so chaining continues).

```typescript
// In StrudelEngine.evaluate(), before calling this.repl.evaluate(code):

const capturedVizRequests = new Map<string, string>() // trackKey -> vizName
let vizAnonIndex = 0 // mirrors anonIndex for .p

const savedVizDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'viz')

// Install .viz() method that records which patterns want which viz type
Object.defineProperty(Pattern.prototype, 'viz', {
  configurable: true,
  writable: true,
  value: function(this: any, vizName: string) {
    // We don't know the track key yet (it's assigned by .p() later).
    // Strategy: tag the pattern instance with the viz request,
    // then resolve the key after .p() is called.
    this._pendingViz = vizName
    return this
  },
})
```

**Problem with naive approach:** `.viz()` is called BEFORE `.p()` in the chain. When `.viz("pianoroll")` fires, the pattern doesn't yet have its track key (that's assigned by `.p('$0')` which happens after). We need to resolve track key → viz name mapping AFTER both `.viz()` and `.p()` have been called.

**Solution:** Tag the pattern instance with `_pendingViz` in the `.viz()` method, then in the **`.p()` wrapper** (which already exists in Phase 5), check if `this._pendingViz` is set and record `capturedVizRequests.set(trackKey, this._pendingViz)`.

### Pattern 2: Resolving viz requests in the existing .p() wrapper

```typescript
// In the existing .p() wrapper (Phase 5 setter-intercept), extend to capture viz requests:
value: function(this: any, id: string) {
  if (typeof id === 'string' && !(id.startsWith('_') || id.endsWith('_'))) {
    let captureId = id
    if (id.includes('$')) {
      captureId = `$${anonIndex}`
      anonIndex++
    }
    capturedPatterns.set(captureId, this)

    // NEW: if this pattern has a pending .viz() request, capture it
    if (this._pendingViz) {
      capturedVizRequests.set(captureId, this._pendingViz)
      delete this._pendingViz
    }
  }
  return strudelFn.call(this, id)
},
```

This works because:
- `$: note("c4").s("sine").viz("pianoroll")` transpiles to `note("c4").s("sine").viz("pianoroll").p('$')`
- `.viz()` fires first, tags `this._pendingViz = "pianoroll"`
- `.p('$')` fires second, sees `_pendingViz`, records `capturedVizRequests.set('$0', 'pianoroll')`

### Pattern 3: StrudelEngine exposes getVizRequests()

```typescript
// New private field in StrudelEngine:
private vizRequests: Map<string, string> = new Map() // trackKey -> vizName

// In evaluate(), after successful eval:
if (!result.error) {
  // ... existing trackSchedulers build ...
  this.vizRequests = capturedVizRequests
}

// New public getter:
getVizRequests(): Map<string, string> {
  return this.vizRequests
}
```

### Pattern 4: addInlineViewZones extended with viz requests

The function signature needs a new parameter `vizRequests: Map<string, string>` and access to `vizDescriptors` (to look up factory by name). Zones are only added for tracks with a viz request.

```typescript
export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null,
  trackSchedulers: Map<string, PatternScheduler>,
  vizRequests: Map<string, string>,          // NEW: trackKey -> vizName
  vizDescriptors: VizDescriptor[],           // NEW: for factory lookup by id
): InlineZoneHandle
```

Note: the existing `source: VizRendererSource` parameter is REMOVED from the signature. Each zone now uses its own factory resolved from `vizDescriptors` by `vizRequests.get(key)`. This is a **breaking change** to the current signature.

The internal loop changes:
```typescript
let anonIndex = 0
editor.changeViewZones((accessor) => {
  lines.forEach((line, i) => {
    if (!line.trim().startsWith('$:')) return

    const key = `$${anonIndex}`
    anonIndex++

    // Only add zone if this pattern requested .viz()
    const vizName = vizRequests.get(key)
    if (!vizName) return   // <-- key change: opt-in only

    const descriptor = vizDescriptors.find(d => d.id === vizName)
    if (!descriptor) return   // unknown viz name — skip silently

    const source: VizRendererSource = descriptor.factory
    // ... rest of zone creation unchanged ...
  })
})
```

### Pattern 5: Determining "last line" of a pattern block

**Requirement:** The zone appears after the LAST LINE of the pattern block, not after the `$:` line.

Current behavior: `afterLineNumber: i + 1` places the zone after the `$:` line itself. For a single-line pattern like `$: note("c4").s("sine").viz("pianoroll")`, this is correct — both the `$:` line and its last line are the same.

For multi-line patterns (future):
```strudel
$: note("c4 e4 g4")
  .s("sawtooth")
  .viz("pianoroll")   // line 3 — this is the last line
```

**Strategy:** After splitting on `\n`, for each `$:` line at index `i`, scan forward to find the last non-empty, non-`$:` continuation line. The last line index becomes the `afterLineNumber`.

```typescript
// Find last line of this pattern block
let lastLineIdx = i
for (let j = i + 1; j < lines.length; j++) {
  const nextLine = lines[j].trim()
  if (nextLine === '' || nextLine.startsWith('$:') || nextLine.startsWith('//')) break
  lastLineIdx = j
}
const zoneId = accessor.addZone({
  afterLineNumber: lastLineIdx + 1,  // Monaco is 1-indexed
  heightInPx: VIEW_ZONE_HEIGHT,
  domNode: container,
  suppressMouseDown: true,
})
```

**Caveats:** This is heuristic-based. The exact block detection depends on code style. For Phase 6, the single-line case covers the majority of Strudel patterns. Multi-line support is a nice-to-have.

### Pattern 6: StrudelEditor wiring — remove inlinePianoroll, add vizDescriptors pass-through

```typescript
// REMOVE from StrudelEditorProps:
inlinePianoroll?: boolean

// StrudelEditor.handlePlay after evaluate() succeeds:
const vizRequests = engine.getVizRequests()
if (vizRequests.size > 0 && editorRef.current) {
  viewZoneCleanupRef.current?.cleanup()
  viewZoneCleanupRef.current = addInlineViewZones(
    editorRef.current,
    engine.getHapStream(),
    engine.getAnalyser(),
    engine.getTrackSchedulers(),
    vizRequests,
    vizDescriptors         // from StrudelEditorProps, already available
  )
}
viewZoneCleanupRef.current?.resume()
```

### Anti-Patterns to Avoid

- **Do NOT register `.viz()` via `evalScope()`** — that would put it in globalThis and Strudel's scope permanently; we want it available only during our evaluate() call and captured in our closure.
- **Do NOT try to parse the AST** to find `.viz()` calls — the runtime interception approach is simpler, correct, and already proven by Phase 5's `.p` intercept.
- **Do NOT add a zone for every `$:` line** — the whole point of this revision is per-pattern opt-in.
- **Do NOT share a single VizRenderer instance** across multiple zones — each zone needs its own fresh instance from `descriptor.factory()`.
- **Do NOT forget to restore `Pattern.prototype.viz`** in the `finally` block of `evaluate()`, just like `.p` is restored.
- **Do NOT use `container.clientWidth`** — it remains 0 before DOM attach; keep using `editor.getLayoutInfo().contentWidth`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resolving factory from viz name | Custom registry | `DEFAULT_VIZ_DESCRIPTORS.find(d => d.id === vizName)` | Already exists, type-safe |
| Mounting renderer in zone | Custom canvas setup | `mountVizRenderer()` | Already handles factory resolution, ResizeObserver, mount |
| Renderer lifecycle | Custom loop toggle | `renderer.pause()` / `renderer.resume()` | P5VizRenderer already delegates to p5 `noLoop()`/`loop()` |
| Pattern method registration | Complex evalScope wiring | Direct `Pattern.prototype.viz = fn` assignment | Same mechanism as Phase 5's `.p` interception |
| Width measurement | DOM introspection | `editor.getLayoutInfo().contentWidth` | Only reliable source when zone container is off-DOM |

---

## Common Pitfalls

### Pitfall 1: `.viz()` fires BEFORE `.p()` in the chain

**What goes wrong:** If you try to capture `capturedVizRequests.set(trackKey, vizName)` directly inside `.viz()`, you don't have the track key yet — `.p()` hasn't been called.

**Why it happens:** `$: note("c4").viz("pianoroll")` transpiles to `note("c4").viz("pianoroll").p('$')`. Method call order: `note("c4")` → `.viz("pianoroll")` → `.p('$')`.

**How to avoid:** Tag the pattern instance with `this._pendingViz = vizName` in the `.viz()` handler, then read and clear `_pendingViz` in the `.p()` wrapper when the track key becomes known.

**Warning signs:** `capturedVizRequests` is always empty after evaluate; zones never appear.

### Pitfall 2: Pattern prototype cleanup — must restore in finally

**What goes wrong:** If `evaluate()` throws or rejects between installing `.viz()` and the finally block, `Pattern.prototype.viz` remains as the capturing function for all future user code evaluations, leaking state.

**Why it happens:** Same issue as `.p` restoration — the finally block exists for exactly this reason in Phase 5 code.

**How to avoid:** Add `Pattern.prototype.viz` restoration to the existing `finally` block alongside the `.p` restoration. Save `savedVizDescriptor` before installing, restore it after.

**Warning signs:** After a failed evaluate(), `.viz()` calls from subsequent evaluations silently fail (or cause errors).

### Pitfall 3: `vizRequests.size === 0` when no patterns use .viz()

**What goes wrong:** `addInlineViewZones` is called with an empty `vizRequests` map and creates no zones (correct behavior), but StrudelEditor still calls cleanup/resume on the previous zones unnecessarily.

**How to avoid:** Guard in StrudelEditor: only call `addInlineViewZones` if `vizRequests.size > 0`. Always call `viewZoneCleanupRef.current?.resume()` unconditionally — it's a no-op if there's nothing to resume.

### Pitfall 4: Unknown viz name silently skips zone

**What goes wrong:** User writes `.viz("customThing")` but that descriptor doesn't exist in `vizDescriptors`. The zone is silently skipped — the user sees nothing.

**How to avoid:** Two options: (a) log a warning to console with the unknown name, (b) fall back to a default (e.g., pianoroll). Log a warning is simplest: `console.warn('[motif] Unknown viz name: "${vizName}". Available: ${vizDescriptors.map(d => d.id).join(", ")}')`.

### Pitfall 5: Test mocks need updating — viewZones.ts signature changes

**What goes wrong:** The current `viewZones.test.ts` calls `addInlineViewZones(editor, mockSource, null, null, new Map())` (5 params). The new signature removes `source` and adds `vizRequests` and `vizDescriptors`. All existing test calls break.

**How to avoid:** Update ALL test call sites in `viewZones.test.ts`. The mock for `mountVizRenderer` remains unchanged (it's already mocked at module level). Add new test cases for:
- Zone appears only for tracks with viz request (not for all `$:` lines)
- Correct factory resolved from vizDescriptors by vizName
- Zones with unknown viz names are skipped

### Pitfall 6: anonIndex sync between evaluate() and viewZones.ts

**What goes wrong:** `capturedVizRequests` uses keys `"$0"`, `"$1"` (from the `.p()` wrapper's `anonIndex`). `viewZones.ts` also maintains its own `anonIndex` to match lines to keys. These must stay in sync.

**Why it happens:** Both counters count sequential anonymous `$:` patterns. If either skips a count (e.g., for named patterns), they desync.

**How to avoid:** Keep both counters incrementing only for anonymous `$:` patterns (lines containing `$` in the id). Named patterns (`d1:`, `bass:`) do not increment the anon counter in either place. The current Phase 5 code already handles this: `if (id.includes('$')) { captureId = \`$${anonIndex}\`; anonIndex++ }`.

---

## Code Examples

### Full Revised evaluate() with .viz() capture

```typescript
// In StrudelEngine.evaluate(), extend Phase 5's setup:

async evaluate(code: string): Promise<{ error?: Error }> {
  if (!this.initialized) await this.init()

  const capturedPatterns = new Map<string, any>()
  const capturedVizRequests = new Map<string, string>()  // NEW
  let anonIndex = 0

  const { Pattern } = await import('@strudel/core') as any

  // Save existing descriptors
  const savedDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'p')
  const savedVizDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'viz')  // NEW

  // Install .viz() capture method  NEW
  Object.defineProperty(Pattern.prototype, 'viz', {
    configurable: true,
    writable: true,
    value: function(this: any, vizName: string) {
      this._pendingViz = vizName
      return this
    },
  })

  // Install .p setter trap (EXISTING Phase 5, with .viz() resolution added)
  Object.defineProperty(Pattern.prototype, 'p', {
    configurable: true,
    set(strudelFn: (id: string) => any) {
      Object.defineProperty(Pattern.prototype, 'p', {
        configurable: true,
        writable: true,
        value: function(this: any, id: string) {
          if (typeof id === 'string' && !(id.startsWith('_') || id.endsWith('_'))) {
            let captureId = id
            if (id.includes('$')) {
              captureId = `$${anonIndex}`
              anonIndex++
            }
            capturedPatterns.set(captureId, this)

            // NEW: resolve pending .viz() request
            if (this._pendingViz) {
              capturedVizRequests.set(captureId, this._pendingViz)
              delete this._pendingViz
            }
          }
          return strudelFn.call(this, id)
        },
      })
    },
  })

  try {
    const result = await new Promise<{ error?: Error }>((resolve) => {
      this.evalResolve = resolve
      this.repl.evaluate(code).then(() => {
        if (this.evalResolve) { this.evalResolve({}); this.evalResolve = null }
      })
    })

    if (!result.error) {
      // Existing trackSchedulers build...
      const sched = (this.repl as any).scheduler
      this.trackSchedulers = new Map<string, PatternScheduler>()
      for (const [id, pattern] of capturedPatterns) {
        const captured = pattern
        this.trackSchedulers.set(id, {
          now: () => sched.now(),
          query: (begin: number, end: number) => {
            try { return captured.queryArc(begin, end) } catch { return [] }
          },
        })
      }

      // NEW: store viz requests
      this.vizRequests = capturedVizRequests
    }

    return result
  } finally {
    // Restore BOTH prototype properties
    if (savedDescriptor) {
      Object.defineProperty(Pattern.prototype, 'p', savedDescriptor)
    } else {
      delete (Pattern.prototype as any).p
    }
    // NEW: restore .viz()
    if (savedVizDescriptor) {
      Object.defineProperty(Pattern.prototype, 'viz', savedVizDescriptor)
    } else {
      delete (Pattern.prototype as any).viz
    }
  }
}

// NEW public getter
getVizRequests(): Map<string, string> {
  return this.vizRequests
}
```

### Full Revised addInlineViewZones signature

```typescript
// packages/editor/src/visualizers/viewZones.ts

export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null,
  trackSchedulers: Map<string, PatternScheduler>,
  vizRequests: Map<string, string>,        // trackKey -> vizName
  vizDescriptors: VizDescriptor[],         // for factory lookup
): InlineZoneHandle {
  const model = editor.getModel()
  if (!model) {
    return { cleanup: () => {}, pause: () => {}, resume: () => {} }
  }

  const code = model.getValue()
  const lines = code.split('\n')
  const zoneIds: string[] = []
  const renderers: VizRenderer[] = []
  const disconnects: (() => void)[] = []

  const contentWidth = editor.getLayoutInfo().contentWidth
  const hapStreamRef = { current: hapStream } as RefObject<HapStream | null>
  const analyserRef = { current: analyser } as RefObject<AnalyserNode | null>

  let anonIndex = 0

  editor.changeViewZones((accessor) => {
    lines.forEach((line, i) => {
      if (!line.trim().startsWith('$:')) return

      const key = `$${anonIndex}`
      anonIndex++

      // Opt-in: only add zone if .viz() was called on this pattern
      const vizName = vizRequests.get(key)
      if (!vizName) return

      const descriptor = vizDescriptors.find(d => d.id === vizName)
      if (!descriptor) {
        console.warn(`[motif] Unknown viz name: "${vizName}". Available: ${vizDescriptors.map(d => d.id).join(', ')}`)
        return
      }

      const trackScheduler = trackSchedulers.get(key) ?? null
      const schedulerRef = { current: trackScheduler } as RefObject<PatternScheduler | null>

      const container = document.createElement('div')
      container.style.cssText = 'overflow:hidden;height:120px;'

      // Find last line of pattern block for zone placement
      let lastLineIdx = i
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (next === '' || next.startsWith('$:') || next.startsWith('setcps') || next.startsWith('//')) break
        lastLineIdx = j
      }

      const zoneId = accessor.addZone({
        afterLineNumber: lastLineIdx + 1,   // 1-indexed, after last line
        heightInPx: VIEW_ZONE_HEIGHT,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      const refs: VizRefs = { hapStreamRef, analyserRef, schedulerRef }
      const { renderer, disconnect } = mountVizRenderer(
        container,
        descriptor.factory,            // factory from descriptor
        refs,
        { w: contentWidth || 400, h: VIEW_ZONE_HEIGHT },
        console.error
      )
      renderers.push(renderer)
      disconnects.push(disconnect)
    })
  })

  return {
    cleanup() {
      disconnects.forEach(fn => fn())
      renderers.forEach(r => r.destroy())
      editor.changeViewZones((accessor) => {
        zoneIds.forEach(id => accessor.removeZone(id))
      })
    },
    pause() { renderers.forEach(r => r.pause()) },
    resume() { renderers.forEach(r => r.resume()) },
  }
}
```

### StrudelEditor.tsx — Revised Wiring

```typescript
// REMOVE from StrudelEditorProps:
// inlinePianoroll?: boolean

// In handlePlay, replace the inlinePianoroll block:
const vizRequests = engine.getVizRequests()
if (vizRequests.size > 0 && editorRef.current) {
  viewZoneCleanupRef.current?.cleanup()
  viewZoneCleanupRef.current = addInlineViewZones(
    editorRef.current,
    engine.getHapStream(),
    engine.getAnalyser(),
    engine.getTrackSchedulers(),
    vizRequests,
    vizDescriptors       // already in scope from StrudelEditorProps
  )
}
// Always resume (no-op if no zones exist)
viewZoneCleanupRef.current?.resume()

// handleStop remains unchanged:
viewZoneCleanupRef.current?.pause()
```

---

## Structural Impact Analysis

### Files Modified
| File | Change Type | What Changes |
|------|------------|--------------|
| `packages/editor/src/engine/StrudelEngine.ts` | Extend | Add `.viz()` prototype intercept, `capturedVizRequests` map, `this.vizRequests` field, `getVizRequests()` method |
| `packages/editor/src/visualizers/viewZones.ts` | Signature change | Replace `source: VizRendererSource` param with `vizRequests + vizDescriptors`; change loop to opt-in only; add last-line detection |
| `packages/editor/src/StrudelEditor.tsx` | Wiring change | Remove `inlinePianoroll` prop; replace `_inlinePianoroll` check with `vizRequests.size > 0`; pass `vizRequests + vizDescriptors` to `addInlineViewZones` |
| `packages/editor/src/__tests__/viewZones.test.ts` | Migration | Update all call sites to new signature; add tests for opt-in behavior and factory dispatch |
| `packages/editor/src/engine/StrudelEngine.test.ts` | Extend (if exists) | Add test for `.viz()` capture: pattern with `.viz("pianoroll")` populates `getVizRequests()` |

### Files NOT Modified
- `types.ts` — no new types needed; `VizDescriptor` already has `id` and `factory`
- `mountVizRenderer.ts` — unchanged
- `defaultDescriptors.ts` — unchanged; factory lookup uses this as-is
- `VizPanel.tsx`, `VizPicker.tsx` — unchanged

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom environment) |
| Config file | `packages/editor/vitest.config.ts` |
| Quick run command | `pnpm --filter @strucode/editor test --run viewZones` |
| Full suite command | `pnpm --filter @strucode/editor test --run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ZONE-01 | addInlineViewZones accepts factory from vizDescriptors (not fixed source) | unit | `pnpm --filter @strucode/editor test --run viewZones` | existing `viewZones.test.ts` — needs signature migration |
| ZONE-02 | Each zone gets track-scoped schedulerRef from trackSchedulers | unit | `pnpm --filter @strucode/editor test --run viewZones` | existing — needs call site update |
| ZONE-03 | Initial size uses contentWidth | unit | `pnpm --filter @strucode/editor test --run viewZones` | existing — needs call site update |
| ZONE-04 | InlineZoneHandle pause/resume; zone only for patterns with .viz() | unit | `pnpm --filter @strucode/editor test --run viewZones` | existing — needs new test cases |

### New Test Cases Required

For `viewZones.test.ts`:
```
- "adds zone only for $: lines that appear in vizRequests"
- "does not add zone for $: lines NOT in vizRequests"
- "resolves factory from vizDescriptors by vizName"
- "logs warning for unknown vizName"
- "zone placed after last line of multi-line pattern block"
```

For `StrudelEngine.test.ts` (if exists, or new test file):
```
- "getVizRequests() returns empty map before evaluate"
- "getVizRequests() returns trackKey -> vizName for patterns with .viz()"
- "getVizRequests() does not include tracks without .viz()"
- "Pattern.prototype.viz is restored after evaluate error"
```

### Wave 0 Gaps

None — existing test infrastructure (Vitest, jsdom, mocks) is sufficient. Test file `viewZones.test.ts` exists and needs call-site migration.

---

## Open Questions

1. **Backward compat for `inlinePianoroll` prop**
   - What we know: Current `StrudelEditorProps` has `inlinePianoroll?: boolean`. Removing it is a breaking API change for any consumers of the library.
   - What's unclear: Is this library published yet, or only used internally? (STATE.md suggests all phases are still in-progress / not published)
   - Recommendation: Remove `inlinePianoroll` cleanly since the library isn't published. If backward compat is needed later, the prop can be kept as deprecated (no-op with a console.warn).

2. **Multi-line pattern block detection**
   - What we know: Simple forward-scan heuristic breaks on patterns with blank lines, comments in the middle, or patterns that spread across many lines.
   - What's unclear: Do Strudel users commonly write multi-line `$:` blocks?
   - Recommendation: Implement simple heuristic for Phase 6 (stop at blank line or next `$:` line). Document limitation. Full AST-based block detection can wait until Phase 10 (Monaco Intelligence phase).

3. **Named patterns with .viz()**
   - What we know: `d1: note("c3").viz("scope")` transpiles to `note("c3").viz("scope").p('d1')`. Our `.viz()` capture also works for named patterns — `captureId = 'd1'` (not `$N`).
   - What's unclear: Does `viewZones.ts` need to handle named `d1:` patterns as well as `$:` patterns?
   - Recommendation: Named patterns are valid but rare. The `anonIndex` counter in `viewZones.ts` only increments for `$:` lines, so `d1:` zones would need a separate pass. For Phase 6, support only `$:` (anonymous) patterns in the zone loop. Named patterns get silently skipped (no zone rendered).

---

## State of the Art

| Old Approach | Current Approach | Why Changed |
|--------------|------------------|-------------|
| `inlinePianoroll={true}` blanket prop | `.viz("name")` per-pattern opt-in | Matches Strudel's UX; user controls which patterns get viz |
| Fixed `PianorollSketch` in view zones | Factory resolved from `vizDescriptors` by name | Any viz type works inline; consistent with REND architecture |
| Zone placed after `$:` line | Zone placed after LAST LINE of pattern block | Visually associated with the whole pattern, not just the first line |

---

## Sources

### Primary (HIGH confidence)

- `packages/editor/src/engine/StrudelEngine.ts` — Phase 5 setter-intercept pattern for `.p`, confirmed as the model for `.viz()` capture
- `packages/editor/src/visualizers/viewZones.ts` — current signature (5 params), loop structure, zone placement logic
- `packages/editor/src/StrudelEditor.tsx` — current `inlinePianoroll` wiring (lines 176–185), confirmed as the call site to replace
- `packages/editor/src/__tests__/viewZones.test.ts` — 13 existing tests, all call `addInlineViewZones(editor, mockSource, null, null, new Map())` — will need migration
- `packages/editor/src/visualizers/defaultDescriptors.ts` — confirmed `id` field present on all 7 descriptors; factory lookup pattern is `.find(d => d.id === vizName)?.factory`
- `packages/editor/src/visualizers/types.ts` — `VizDescriptor` type confirmed: `{ id, label, requires?, factory: () => VizRenderer }`
- `node_modules/.pnpm/@strudel+transpiler@1.2.6/node_modules/@strudel/transpiler/transpiler.mjs` — confirmed `labelToP()`: `$: expr` → `expr.p('$')`, so `.viz()` fires BEFORE `.p()`
- `node_modules/.pnpm/@strudel+core@1.2.6/node_modules/@strudel/core/repl.mjs` — confirmed `injectPatternMethods()` sets `Pattern.prototype.p` directly (triggering Phase 5's setter trap); same mechanism will trigger `.viz()` install/restore
- `node_modules/.pnpm/@strudel+core@1.2.6/node_modules/@strudel/core/evaluate.mjs` — confirmed `evalScope()` mechanism: copies to globalThis; NOT the right approach for `.viz()` (we want closure-scoped capture)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all types/utilities from Phases 4 and 5 in place
- Architecture: HIGH — transpiler source confirmed method call order; setter-intercept proven by Phase 5; factory lookup pattern trivially follows from existing types
- Pitfalls: HIGH — `.viz() before .p()` ordering derived directly from transpiler source; all other pitfalls from direct code inspection

**Research date:** 2026-03-23
**Valid until:** Until Phase 10 changes the Monaco/transpiler architecture
