# Phase 1: Active Highlighting - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement real-time Monaco editor decorations that highlight the source characters of a playing Strudel note at the exact moment its audio plays, and clear when the note ends. The HapStream event bus is already implemented; this phase wires it to Monaco's decoration API via a dedicated React hook.

</domain>

<decisions>
## Implementation Decisions

### Timing Mechanism
- Use `setTimeout` with delay computed as `scheduledAheadMs - Date.now()` — fires highlight at exact audio playback moment
- Each hap gets an independent `setTimeout` for its clear: `delay + audioDuration * 1000`
- On stop: cancel all pending highlight/clear timeouts (store IDs, call clearTimeout) — no stale glows
- If `scheduledAheadMs` is already past (late hap): clamp delay to 0, apply highlight immediately

### Decoration Architecture
- Logic lives in a `useHighlighting` hook in `src/monaco/` — keeps StrudelEditor.tsx clean
- Use `createDecorationsCollection` — map keyed by hap location string, each hap independently adds/removes its own decoration
- Hook API: `useHighlighting(editor, hapStream)` — accepts editor ref and HapStream instance directly
- Overlapping haps at the same location are independent — each has its own timeout pair, decorations stack

### Visual Style
- When `hap.value.color` is present, use it as the decoration background; otherwise fall back to accent token
- Highlight intensity: 30% opacity background + full-color outline/border
- Use `className` decoration (not `inlineClassName`) — applies to full token, uses CSS custom properties from tokens.ts
- Decoration clears immediately (snap-off) — no CSS fade transition

### Integration & Cleanup
- `useHighlighting(editor, hapStream)` accepts `hapStream: HapStream | null` directly — StrudelEditor passes it after engine init
- Subscribe in `useEffect` triggered by hapStream — subscribe when non-null, unsubscribe on unmount or hapStream change
- Clear all decorations on `evaluate()` — stale glows from previous pattern are confusing
- No `highlightEnabled` prop — always on while playing; YAGNI

### Claude's Discretion
- Exact CSS class structure within `strudel-active-hap` (sub-classes for color variants are at Claude's discretion)
- Whether to use a `Map<string, IDisposable>` or `Map<string, number[]>` internally for decoration tracking
- Debounce strategy if the same location fires multiple haps in rapid succession

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HapStream.ts` — event bus already emits `HapEvent` with `scheduledAheadMs`, `audioDuration`, `loc` (character range), `color`, `midiNote`, `s`
- `tokens.ts` — `applyTheme()` and theme token maps with accent colors available as CSS custom properties
- `StrudelMonaco.tsx` — Monaco wrapper component; editor ref is accessible
- `StrudelEditor.tsx` — orchestrates engine, Monaco, and toolbar; is the integration point for the new hook

### Established Patterns
- Hooks use `useEffect` for subscription/cleanup (standard React pattern used in StrudelEditor.tsx)
- State variables: `camelCase` (e.g., `isPlaying`, `errorMsg`)
- Refs: `camelCase` with `Ref` suffix (e.g., `editorRef`, `containerRef`)
- 2-space indentation, single quotes, semicolons required

### Integration Points
- `StrudelEditor.tsx` holds the `engineRef` and `editorRef` — pass `engine.hapStream` and `editorRef` to `useHighlighting`
- CSS custom properties from `tokens.ts` are applied to `containerRef` — the decoration className can reference them
- `evaluate()` in StrudelEditor.tsx is where decoration clearing should be triggered

</code_context>

<specifics>
## Specific Ideas

- Decoration CSS class must be `strudel-active-hap` (per HIGH-05 requirement)
- Design token colors from tokens.ts — no hardcoded hex values in decoration styles

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
