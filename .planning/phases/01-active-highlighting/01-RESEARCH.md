# Phase 1: Active Highlighting - Research

**Researched:** 2026-03-21
**Domain:** Monaco Editor Decoration API + HapStream timing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Timing Mechanism**
- Use `setTimeout` with delay computed as `scheduledAheadMs - Date.now()` — fires highlight at exact audio playback moment
- Each hap gets an independent `setTimeout` for its clear: `delay + audioDuration * 1000`
- On stop: cancel all pending highlight/clear timeouts (store IDs, call clearTimeout) — no stale glows
- If `scheduledAheadMs` is already past (late hap): clamp delay to 0, apply highlight immediately

**Decoration Architecture**
- Logic lives in a `useHighlighting` hook in `src/monaco/` — keeps StrudelEditor.tsx clean
- Use `createDecorationsCollection` — map keyed by hap location string, each hap independently adds/removes its own decoration
- Hook API: `useHighlighting(editor, hapStream)` — accepts editor ref and HapStream instance directly
- Overlapping haps at the same location are independent — each has its own timeout pair, decorations stack

**Visual Style**
- When `hap.value.color` is present, use it as the decoration background; otherwise fall back to accent token
- Highlight intensity: 30% opacity background + full-color outline/border
- Use `className` decoration (not `inlineClassName`) — applies to full token, uses CSS custom properties from tokens.ts
- Decoration clears immediately (snap-off) — no CSS fade transition

**Integration & Cleanup**
- `useHighlighting(editor, hapStream)` accepts `hapStream: HapStream | null` directly — StrudelEditor passes it after engine init
- Subscribe in `useEffect` triggered by hapStream — subscribe when non-null, unsubscribe on unmount or hapStream change
- Clear all decorations on `evaluate()` — stale glows from previous pattern are confusing
- No `highlightEnabled` prop — always on while playing; YAGNI

### Claude's Discretion
- Exact CSS class structure within `strudel-active-hap` (sub-classes for color variants are at Claude's discretion)
- Whether to use a `Map<string, IDisposable>` or `Map<string, number[]>` internally for decoration tracking
- Debounce strategy if the same location fires multiple haps in rapid succession

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIGH-01 | Monaco characters that generated a playing note are highlighted with accent-colored background and outline | `createDecorationsCollection` + `className: 'strudel-active-hap'` + injected CSS using `--accent-rgb` token |
| HIGH-02 | Highlights fire at the exact moment audio plays (delayed by scheduledAheadMs from HapEvent) | `scheduledAheadMs` field confirmed in HapStream.ts; `setTimeout(delay)` where `delay = scheduledAheadMs` (already in ms) |
| HIGH-03 | Highlights clear automatically when the note ends (audioDuration from HapEvent) | `audioDuration` field confirmed in HapStream.ts (in AudioContext seconds); clear timeout = `delay + audioDuration * 1000` |
| HIGH-04 | Multiple simultaneous haps (chords) each get independent highlight/clear cycles | `IEditorDecorationsCollection.append()` + independent timeout pairs per hap; collection manages stacking |
| HIGH-05 | Highlights use decoration class `strudel-active-hap` with correct design token colors | `--code-active-hap` token already exists in tokens.ts; `injectHighlightStyles()` stub already in StrudelMonaco.tsx |
</phase_requirements>

---

## Summary

Phase 1 wires the existing HapStream event bus to Monaco's decoration API via a `useHighlighting` React hook. The HapStream already emits richly typed `HapEvent` objects with `scheduledAheadMs`, `audioDuration`, and `loc` (array of `{start, end}` character offsets). Monaco 0.50.0 ships `createDecorationsCollection` as the canonical decoration management API — `deltaDecorations` is deprecated. The `IEditorDecorationsCollection.append()` / `clear()` API is used to add individual decorations without disturbing other active ones.

The timing mechanism is straightforward: `scheduledAheadMs` is already in milliseconds (computed as `(time - audioCtxCurrentTime) * 1000` in HapStream.emit). Each hap gets two `setTimeout` calls — one to add the decoration at audio-play time, one to remove it after `audioDuration` seconds. This means the hook holds a `Map<string, number[]>` (location key → [showTimeoutId, clearTimeoutId]) to allow individual cancellation on engine stop or evaluate.

The CSS stub `injectHighlightStyles()` already exists in StrudelMonaco.tsx with `.strudel-active-hap` using `--accent-rgb`. The tokens.ts file already defines `--code-active-hap: 'rgba(139,92,246,0.3)'` for the base background color. When `hap.value.color` is present the hook injects an inline style via a per-hap sub-class, which is the area left to Claude's discretion.

**Primary recommendation:** Implement `useHighlighting` in `src/monaco/useHighlighting.ts` using `createDecorationsCollection`, per-hap `append`/`clear` via independent timeouts keyed by `locKey`, and wire it into `StrudelEditor.tsx` after engine init.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| monaco-editor | 0.50.0 (installed) | Decoration API — createDecorationsCollection, IEditorDecorationsCollection | Already in the project; authoritative version from package.json |
| @monaco-editor/react | ^4.6.0 (installed) | React wrapper — provides IStandaloneCodeEditor via onMount | Already used in StrudelMonaco.tsx |
| React | 18.x (peer dep) | useEffect/useRef for subscription lifecycle | Project requirement |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^1.6.0 (installed) | Unit testing with jsdom environment | Already configured; use for timing and decoration lifecycle tests |

**No new installations required.** All needed libraries are already in the project.

---

## Architecture Patterns

### Recommended Project Structure

```
packages/editor/src/
├── monaco/
│   ├── StrudelMonaco.tsx       # existing — injectHighlightStyles() stub already here
│   ├── language.ts             # existing
│   └── useHighlighting.ts      # NEW — the hook created in this phase
├── StrudelEditor.tsx           # existing — wire useHighlighting here
└── theme/
    └── tokens.ts               # existing — --code-active-hap, --accent-rgb already defined
```

### Pattern 1: useHighlighting Hook Shape

**What:** A React hook that subscribes to a HapStream and manages Monaco decorations. Lives in `src/monaco/useHighlighting.ts`.

**When to use:** Called once in StrudelEditor.tsx after `editorRef` and `hapStream` are available.

```typescript
// Source: verified against HapStream.ts and Monaco 0.50.0 monaco.d.ts
import { useEffect, useRef } from 'react'
import type * as Monaco from 'monaco-editor'
import type { HapStream } from '../engine/HapStream'

export function useHighlighting(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  hapStream: HapStream | null
): void {
  // Holds timeout IDs so they can be cancelled on stop/unmount
  const timeoutsRef = useRef<Map<string, number[]>>(new Map())
  // Single decorations collection — append/clear per hap
  const collectionRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)

  useEffect(() => {
    if (!editor || !hapStream) return

    // Create collection once per editor instance
    collectionRef.current = editor.createDecorationsCollection()
    const collection = collectionRef.current

    const handler = (event: HapEvent) => { /* ... timing logic ... */ }

    hapStream.on(handler)
    return () => {
      hapStream.off(handler)
      collection.clear()
      // Cancel all pending timeouts
      for (const ids of timeoutsRef.current.values()) {
        ids.forEach(clearTimeout)
      }
      timeoutsRef.current.clear()
    }
  }, [editor, hapStream])
}
```

### Pattern 2: Per-Hap Timing with setTimeout

**What:** Fires decoration exactly at audio-play time using `scheduledAheadMs` (already in ms).

**Key insight from HapStream.ts code review:** `scheduledAheadMs` is computed as `(time - audioCtxCurrentTime) * 1000` — it is already a millisecond delay from *now* (the moment the event is emitted). Pass it directly to `setTimeout` without additional arithmetic.

```typescript
// Source: HapStream.ts line 52 — scheduledAheadMs = (time - audioCtxCurrentTime) * 1000
const showDelay = Math.max(0, event.scheduledAheadMs)  // clamp negatives (late haps)
const clearDelay = showDelay + event.audioDuration * 1000

const showId = window.setTimeout(() => {
  // apply decoration
}, showDelay) as unknown as number

const clearId = window.setTimeout(() => {
  // remove this hap's decoration
}, clearDelay) as unknown as number

timeoutsRef.current.set(locKey, [showId, clearId])
```

### Pattern 3: Converting Character Offsets to Monaco IRange

**What:** HapEvent.loc provides `Array<{start: number, end: number}>` as zero-based character offsets. Monaco decorations require `IRange` (1-based line/column).

**Verified API:** `model.getPositionAt(offset: number): Position` — zero-based offset to 1-based Position. Available on `ITextModel` (monaco.d.ts line 2136).

```typescript
// Source: monaco.d.ts line 2136 — getPositionAt(offset: number): Position
function locToRange(
  model: Monaco.editor.ITextModel,
  start: number,
  end: number
): Monaco.IRange {
  const startPos = model.getPositionAt(start)
  const endPos = model.getPositionAt(end)
  return {
    startLineNumber: startPos.lineNumber,
    startColumn: startPos.column,
    endLineNumber: endPos.lineNumber,
    endColumn: endPos.column,
  }
}
```

### Pattern 4: Adding and Removing Individual Decorations

**What:** `IEditorDecorationsCollection` from `createDecorationsCollection` supports `append()` to add without disturbing existing decorations, and returns IDs for targeted removal. `clear()` removes everything.

**Verified API from monaco.d.ts lines 2843–2850:**
- `collection.append(newDecorations: readonly IModelDeltaDecoration[]): string[]` — returns decoration IDs
- `collection.clear(): void` — removes ALL decorations in collection

**Critical finding:** `IEditorDecorationsCollection` does not have a per-ID remove method. To remove individual decorations while leaving others, the pattern is: track all active decoration IDs, then call `collection.set(remainingDecorations)`. Alternatively, use one collection per hap (create/clear pattern), which is the simpler approach for independent hap lifecycles.

**Recommended approach (simpler):** One `IEditorDecorationsCollection` per hap, created at show-time, cleared at clear-time:

```typescript
// Source: monaco.d.ts lines 2812, 2850 — createDecorationsCollection, clear()
const showId = window.setTimeout(() => {
  const model = editor.getModel()
  if (!model || !event.loc) return
  const decorations = event.loc.map(({ start, end }) => ({
    range: locToRange(model, start, end),
    options: { className: 'strudel-active-hap', stickiness: 1 },
  }))
  const hapCollection = editor.createDecorationsCollection(decorations)
  // Store hapCollection reference for clearing
  hapCollectionMap.set(hapKey, hapCollection)
}, showDelay)

const clearId = window.setTimeout(() => {
  hapCollectionMap.get(hapKey)?.clear()
  hapCollectionMap.delete(hapKey)
}, clearDelay)
```

### Pattern 5: Integrating useHighlighting into StrudelEditor.tsx

**What:** StrudelEditor holds `editorRef` and creates the engine lazily. The hook needs both.

**HapStream access:** `StrudelEngine.getHapStream()` returns the `HapStream` instance (confirmed in StrudelEngine.ts line 174). The engine is available on `engineRef.current` after `getEngine()` is called.

**Integration point:** The `handleMonacoMount` callback already sets `editorRef.current = editor`. A `useState<HapStream | null>` for `hapStream` is set when `handlePlay` calls `engine.init()` for the first time.

```typescript
// In StrudelEditor.tsx
const [hapStream, setHapStream] = useState<HapStream | null>(null)

// In handlePlay, after engine.init():
setHapStream(engine.getHapStream())

// After all existing hooks:
useHighlighting(editorRef.current, hapStream)
```

**Evaluate cleanup:** In `handlePlay`, before/after `engine.evaluate(code)`, clear stale decorations. The hook itself should expose a `clearAll()` or the `evaluate()` call should trigger a re-render. Simplest: add a `clearDecorations()` ref exposed from the hook, or use a separate `useEffect` watching `code` changes.

### Anti-Patterns to Avoid

- **Using `deltaDecorations` (deprecated):** Monaco 0.50.0 marks it with `@deprecated`. Use `createDecorationsCollection` instead. (Source: monaco.d.ts line 5994)
- **Using `inlineClassName`:** Applies only to the text span within the token, not the full character background. `className` is correct for background + outline effects. (Source: monaco.d.ts line 1772 — "Please use this only for CSS rules that must impact the text")
- **Hardcoding hex colors in CSS:** All colors must use CSS custom properties from tokens.ts so they work in both dark and light themes.
- **Using `performance.now()` for delay:** The `scheduledAheadMs` is relative to `Date.now()` / wall clock milliseconds, not `performance.now()`. Keep consistent.
- **Firing setTimeout from a stale closure:** The `hapStream` effect cleanup must cancel all pending timeouts to prevent decorating an editor that may have been unmounted or re-initialized.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decoration management | Custom overlay DOM elements | `createDecorationsCollection` | Monaco handles z-ordering, line wrapping, scroll sync, and editor re-layout automatically |
| Character offset to line/column | Custom string-split logic | `model.getPositionAt(offset)` | Monaco's model correctly handles multi-byte characters, CRLF, and tab widths |
| CSS injection for class | Inline styles on decoration | `injectHighlightStyles()` (already exists in StrudelMonaco.tsx) | Already handles the singleton injection pattern |

**Key insight:** Monaco's decoration system is designed for exactly this use case (syntax highlighting overlays). All positioning, z-ordering, and lifecycle tracking is handled internally. The only custom code needed is the timing bridge between `scheduledAheadMs` and `setTimeout`.

---

## HapEvent Shape — Verified Fields

Verified directly from `packages/editor/src/engine/HapStream.ts`:

| Field | Type | Notes |
|-------|------|-------|
| `hap` | `any` | Raw Strudel Hap object — `hap.value.color` for per-note color |
| `audioTime` | `number` | AudioContext.currentTime when note fires |
| `audioDuration` | `number` | Duration in **AudioContext seconds** (multiply by 1000 for ms) |
| `scheduledAheadMs` | `number` | Delay in **milliseconds** from emission to audio-play — pass directly to setTimeout |
| `midiNote` | `number \| null` | Computed MIDI note (null for unpitched percussion) |
| `s` | `string \| null` | Instrument/sample name |
| `color` | `string \| null` | From `.color()` in pattern — CSS color string |
| `loc` | `Array<{start: number; end: number}> \| null` | Zero-based character offsets in source |

**Critical:** `loc` can be `null` (haps without source location — e.g., programmatically generated). The hook must guard against null loc. When `loc` is null, skip the decoration entirely.

**Critical:** `scheduledAheadMs` can be negative if the scheduler is running behind. Clamp to 0 with `Math.max(0, event.scheduledAheadMs)`.

---

## Design Token Reference — Verified from tokens.ts

The following CSS custom properties are applied to the `containerRef` element by `applyTheme()`. Decoration CSS in `injectHighlightStyles()` can reference them via `var(...)`.

| Token | Dark Value | Light Value | Use For |
|-------|-----------|-------------|---------|
| `--accent` | `#8b5cf6` | `#7c3aed` | Border/outline color |
| `--accent-rgb` | `139, 92, 246` | `124, 58, 237` | `rgba(var(--accent-rgb), 0.3)` background |
| `--code-active-hap` | `rgba(139,92,246,0.3)` | `rgba(124,58,237,0.25)` | Pre-built background token — use directly |

**Existing CSS stub in StrudelMonaco.tsx (lines 119–128):**
```css
.strudel-active-hap {
  background: rgba(var(--accent-rgb, 139, 92, 246), 0.25);
  border-radius: 2px;
  outline: 1px solid rgba(var(--accent-rgb, 139, 92, 246), 0.5);
  box-shadow: 0 0 8px rgba(var(--accent-rgb, 139, 92, 246), 0.3);
  transition: opacity 80ms ease;
}
```

**Note:** The existing stub includes `transition: opacity 80ms ease` but CONTEXT.md locks "snap-off" (no fade). Remove the transition. The stub is otherwise correct and should be updated in-place during implementation.

**Per-note color variant (Claude's discretion area):** When `event.color` is non-null, the cleanest approach is a data attribute style: inject a CSS variable override via a dynamically generated class or use an inline `backgroundColor` style passed via `IModelDecorationOptions`. Monaco does not support inline styles on decorations directly — the standard approach is to generate a unique class name per color and inject a `<style>` rule. A `Map<string, string>` of `color → className` can serve as a cache to avoid duplicate injection.

---

## Common Pitfalls

### Pitfall 1: scheduledAheadMs Already in Milliseconds
**What goes wrong:** Developer mistakes it for seconds (AudioContext uses seconds everywhere else) and multiplies by 1000, firing 1000x too late.
**Why it happens:** HapStream.ts computes `(time - audioCtxCurrentTime) * 1000` — the multiplication is already done.
**How to avoid:** Read HapStream.ts line 52. The field name says "Ms". Pass directly to `setTimeout`.
**Warning signs:** Highlights firing ~1000 seconds after notes play.

### Pitfall 2: loc Is Null — No Guard
**What goes wrong:** `event.loc.map(...)` throws TypeError, crashing the handler and silently breaking highlighting for all subsequent haps (HapStream swallows errors per hap, so the subscribe loop continues).
**Why it happens:** Strudel does not always attach location info to haps.
**How to avoid:** `if (!event.loc || event.loc.length === 0) return` at top of handler.
**Warning signs:** No highlights for any notes — look at console for TypeError inside hap handler.

### Pitfall 3: Stale Timeouts After Engine Stop
**What goes wrong:** User stops playback; pending `setTimeout` callbacks fire and add decorations to a stopped editor, causing phantom glows.
**Why it happens:** `clearTimeout` must be called on ALL pending IDs when the engine stops.
**How to avoid:** The hook's `useEffect` cleanup cancels all timeout IDs. Additionally, `StrudelEditor.handleStop` must either call a cleanup function exposed by the hook, or the hook must subscribe to an engine `stop` event.
**Warning signs:** Decorations appearing after stop, or after evaluate() changes the code.

### Pitfall 4: createDecorationsCollection Not Available on Model (Wrong Target)
**What goes wrong:** Developer calls `editor.getModel()?.createDecorationsCollection()` — but `createDecorationsCollection` is on the **editor** (`IStandaloneCodeEditor`), not the model (`ITextModel`).
**Why it happens:** Monaco has two objects with overlapping APIs. `deltaDecorations` exists on both; `createDecorationsCollection` is editor-only.
**How to avoid:** Call `editor.createDecorationsCollection()` (verified: monaco.d.ts line 2812 — on IStandaloneCodeEditor).
**Warning signs:** `TypeError: model.createDecorationsCollection is not a function`.

### Pitfall 5: Multiple `createDecorationsCollection` Calls on Same Editor
**What goes wrong:** Hook creates a new collection every render cycle, leaking decoration collections that are never cleared.
**Why it happens:** useEffect dependency array is incomplete, causing re-runs.
**How to avoid:** Store collection in `useRef`. Create it once when editor becomes non-null.
**Warning signs:** Memory leak visible in DevTools; old decorations persist alongside new ones.

---

## Code Examples

### Full Offset-to-Range Conversion
```typescript
// Source: monaco.d.ts line 2136 — getPositionAt(offset: number): Position
// IRange uses 1-based line/column; getPositionAt returns 1-based Position
function locToRange(
  model: Monaco.editor.ITextModel,
  start: number,
  end: number
): Monaco.IRange {
  const s = model.getPositionAt(start)
  const e = model.getPositionAt(end)
  return {
    startLineNumber: s.lineNumber,
    startColumn: s.column,
    endLineNumber: e.lineNumber,
    endColumn: e.column,
  }
}
```

### Decoration Creation with className
```typescript
// Source: monaco.d.ts lines 1685–1694 (IModelDecorationOptions.className)
// and lines 2818–2847 (IEditorDecorationsCollection.append)
const hapCollection = editor.createDecorationsCollection([
  {
    range: locToRange(model, start, end),
    options: {
      className: 'strudel-active-hap',
      stickiness: 1, // TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    },
  },
])
// Later: hapCollection.clear() to remove just this hap's decoration
```

### Stop Cleanup Pattern
```typescript
// In useHighlighting cleanup (useEffect return)
return () => {
  hapStream.off(handler)
  // Cancel all pending show/clear timeouts
  for (const ids of timeoutMapRef.current.values()) {
    ids.forEach(id => clearTimeout(id))
  }
  timeoutMapRef.current.clear()
  // Clear all active decorations
  for (const col of hapCollectionMapRef.current.values()) {
    col.clear()
  }
  hapCollectionMapRef.current.clear()
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `editor.deltaDecorations()` | `editor.createDecorationsCollection()` | Monaco 0.47+ | `deltaDecorations` is now `@deprecated`; new API returns a collection object with `append/set/clear` methods — no manual ID array management |
| `inlineClassName` for background | `className` for background | Always | `inlineClassName` affects only text spans; `className` applies to the full glyph background including padding |

**Deprecated/outdated:**
- `editor.deltaDecorations(oldIds, newDecorations)`: Deprecated in favor of `createDecorationsCollection`. Still functional in 0.50.0 but will eventually be removed.

---

## Open Questions

1. **Per-note color sub-class injection**
   - What we know: `event.color` is a CSS color string when set; `className` must reference a CSS class
   - What's unclear: Best strategy for injecting per-color rules at runtime without leaking `<style>` tags
   - Recommendation: Use a `Map<string, string>` cache of `color → className`; inject one `<style>` rule per unique color seen. Class name can be `strudel-active-hap--${sanitizedColor}`. This is Claude's discretion per CONTEXT.md.

2. **Evaluate-time decoration clearing**
   - What we know: CONTEXT.md says "clear all decorations on evaluate()"; the hook owns the collections
   - What's unclear: How StrudelEditor.tsx calls into the hook's cleanup imperatively
   - Recommendation: The hook can expose a `clearAll` callback via a returned function or ref; alternatively, a `evaluateVersion` counter state in StrudelEditor can be passed to the hook as a dependency to trigger clearing.

---

## Validation Architecture

> nyquist_validation is true in .planning/config.json — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.0 |
| Config file | `packages/editor/vitest.config.ts` |
| Quick run command | `cd packages/editor && pnpm test -- --reporter=verbose` |
| Full suite command | `cd packages/editor && pnpm test` |

Existing environment: `jsdom` (set in vitest.config.ts). Monaco itself cannot run in jsdom (no DOM canvas, no worker), so decoration tests must mock the Monaco editor API.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIGH-01 | Decoration is added with className `strudel-active-hap` when HapEvent fires | unit | `pnpm test -- src/monaco/useHighlighting.test.ts` | ❌ Wave 0 |
| HIGH-02 | Decoration fires after `scheduledAheadMs` ms delay, not immediately | unit | `pnpm test -- src/monaco/useHighlighting.test.ts` | ❌ Wave 0 |
| HIGH-03 | Decoration is cleared after `audioDuration * 1000` ms past the show time | unit | `pnpm test -- src/monaco/useHighlighting.test.ts` | ❌ Wave 0 |
| HIGH-04 | Two haps at same loc each get independent lifecycles; first clear does not remove second | unit | `pnpm test -- src/monaco/useHighlighting.test.ts` | ❌ Wave 0 |
| HIGH-05 | `strudel-active-hap` class is used; decoration references CSS token not hardcoded hex | unit + manual | `pnpm test -- src/monaco/useHighlighting.test.ts` (class name assertion) + visual inspection | ❌ Wave 0 |

### Key Testing Strategies

**Timing tests (HIGH-02, HIGH-03):** Use Vitest's fake timers (`vi.useFakeTimers()`). After emitting a mock HapEvent, advance timers with `vi.advanceTimersByTime(scheduledAheadMs - 1)` and assert decoration not yet added; then advance 1ms more and assert it is added. Same pattern for clear.

**Mock Monaco editor:** Create a minimal stub implementing `createDecorationsCollection`, `getModel`, and `getPositionAt`. The collections stub tracks `append/clear` calls via Vitest mock functions (`vi.fn()`).

```typescript
// Suggested mock pattern — verified against IEditorDecorationsCollection interface
const mockCollection = {
  append: vi.fn().mockReturnValue(['id-1']),
  clear: vi.fn(),
  set: vi.fn(),
  length: 0,
  has: vi.fn(),
  getRange: vi.fn(),
  getRanges: vi.fn(),
  onDidChange: { dispose: vi.fn() },
}
const mockEditor = {
  createDecorationsCollection: vi.fn().mockReturnValue(mockCollection),
  getModel: vi.fn().mockReturnValue({
    getPositionAt: vi.fn().mockImplementation((offset: number) => ({
      lineNumber: 1,
      column: offset + 1,
    })),
  }),
}
```

**Multi-hap independence (HIGH-04):** Emit two HapEvents with the same loc, different scheduledAheadMs. Advance timers to clear the first; assert the second's collection has not been cleared.

**LIB-03 requirement (highlight timing test):** REQUIREMENTS.md line 79 already calls out `LIB-03: Vitest test for highlight timing (scheduledAheadMs fires at correct time)`. This is Phase 1's test coverage obligation.

### Sampling Rate
- **Per task commit:** `cd packages/editor && pnpm test -- src/monaco/useHighlighting.test.ts`
- **Per wave merge:** `cd packages/editor && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/editor/src/monaco/useHighlighting.test.ts` — covers HIGH-01 through HIGH-05, partially covers LIB-03
- [ ] No additional fixtures or config needed — `vitest.config.ts` jsdom environment already configured

---

## Sources

### Primary (HIGH confidence)
- `packages/editor/src/engine/HapStream.ts` — exact HapEvent interface and scheduledAheadMs computation verified by direct read
- `packages/editor/src/engine/StrudelEngine.ts` — getHapStream() confirmed at line 174
- `packages/editor/src/StrudelEditor.tsx` — editorRef, engineRef, handlePlay, handleStop patterns verified
- `packages/editor/src/theme/tokens.ts` — --accent-rgb, --code-active-hap tokens verified
- `packages/editor/src/monaco/StrudelMonaco.tsx` — injectHighlightStyles() stub and existing CSS verified
- `node_modules/.pnpm/monaco-editor@0.50.0/node_modules/monaco-editor/monaco.d.ts` — createDecorationsCollection (line 2812), IEditorDecorationsCollection interface (lines 2818–2850), IModelDecorationOptions.className (line 1694), getPositionAt (line 2136), deltaDecorations @deprecated (line 5994) — all verified by direct read of installed package

### Secondary (MEDIUM confidence)
- `packages/editor/vitest.config.ts` — jsdom environment and test script confirmed; fake timers available in vitest 1.6.x

### Tertiary (LOW confidence)
- None — all claims verified from installed source files

---

## Metadata

**Confidence breakdown:**
- HapEvent shape: HIGH — read directly from HapStream.ts
- Monaco decoration API: HIGH — read directly from installed monaco-editor 0.50.0 type declarations
- Timing arithmetic: HIGH — read scheduledAheadMs computation from HapStream.ts line 52
- CSS tokens: HIGH — read directly from tokens.ts
- Test strategy: HIGH — read vitest.config.ts; fake timer approach is standard vitest pattern

**Research date:** 2026-03-21
**Valid until:** 2026-04-20 (stable libraries — monaco-editor 0.50.0, vitest 1.6.0 are not fast-moving at patch level)
