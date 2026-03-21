# Phase 2: Pianoroll Visualizers - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the p5.js visualizer infrastructure and the Pianoroll sketch — a rolling 6-second canvas panel below the editor showing all playing notes in real time, plus inline Monaco view zones below each `$:` line. Wire a VizPicker toolbar strip that lets users switch between visualizer modes (pianoroll, scope, spectrum, spiral, pitchwheel). Audio visualizer sketches (scope, spectrum, spiral, pitchwheel) are scaffolded but implemented in Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Sketch Data Architecture
- HapStream and AnalyserNode reach the p5 sketch via `useRef` — no stale closures, no re-renders when audio data updates
- SketchFactory signature: `(hapStreamRef: React.RefObject<HapStream | null>, analyserRef: React.RefObject<AnalyserNode | null>) => (p: p5) => void`
- Custom `vizSketch` prop replaces the default sketch entirely — one active sketch at a time
- VizPanel fills its container via ResizeObserver + `p.resizeCanvas(w, h)` — adapts to `vizHeight` prop and window resize
- Inline Monaco view zone canvases: fixed 120px height, fills Monaco content width

### Pianoroll Visual Design
- Note coloring: use `hap.value.color` when present (user-defined via `.color("cyan")` in pattern), fall back to `s`-field category colors: drums=`var(--warning)`, bass=`var(--info)`, melody=`var(--accent)`, pad=`var(--success)`, unknown=`var(--accent)`
- Percussion sounds (bd, sd, hh, cp, etc.) detected by sound name → fixed lane at bottom of canvas below pitch area; pitched notes span MIDI 24–96 on Y-axis
- No Y-axis labels or piano key overlay — clean canvas
- Inline view zones display all haps from all tracks (same data as full panel)

### VizPicker & Layout
- VizPicker: icon buttons + active-state highlight in a 32px horizontal strip between toolbar and editor
- Default visualizer on load: pianoroll
- VizPanel remains mounted when audio is stopped — canvas stays blank/idle (no unmount, no placeholder text)
- VizPicker visibility controlled by its own `showVizPicker` prop — independent of `showToolbar`

### Claude's Discretion
- Exact percussion sound name detection list (bd, sd, hh, cp, rim, mt, ht, lt, etc.)
- Drum lane height relative to pitch area (suggested: 20% of canvas height)
- VizPicker icon design (SVG icons for each mode)
- Exact s-field category matching logic (substring vs exact match)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HapStream.ts` — event bus emitting `HapEvent` with `scheduledAheadMs`, `audioDuration`, `loc`, `color`, `midiNote`, `s`
- `StrudelEngine.ts` — `engine.getHapStream()` returns HapStream; `engine.getAnalyser()` should be added to expose AnalyserNode
- `StrudelEditor.tsx` — holds `engineRef`, `editorRef`; integration point for VizPanel and VizPicker
- `tokens.ts` — CSS custom properties `var(--accent)`, `var(--warning)`, `var(--info)`, `var(--success)`, `var(--background)`
- Phase 1 `useHighlighting` hook — subscription pattern via `useEffect` + `hapStream.subscribe()` is the established model

### Established Patterns
- Hooks: `useEffect` for subscribe/cleanup, `useRef` with `Ref` suffix
- 2-space indentation, single quotes, semicolons
- No external CSS files — inline `style={{}}` props with `var(--*)` CSS custom properties
- Functional components only, named exports

### Integration Points
- `StrudelEditor.tsx` — add `VizPanel` below editor, `VizPicker` strip above editor, wire `vizHeight`/`showVizPicker`/`vizSketch` props
- `packages/editor/src/index.ts` — export `HapStream`, `HapEvent` types for user `vizSketch` typing
- Monaco view zones: added in `StrudelMonaco.tsx` or via callback after `evaluate()` — must re-add after every eval call
- `packages/editor/package.json` — add `p5` + `@types/p5` dependencies (install: `pnpm add p5 @types/p5 --filter @strucode/editor`)

</code_context>

<specifics>
## Specific Ideas

- Prior plan file at `/Users/mrityunjaybhardwaj/.claude/plans/delegated-stirring-flurry.md` contains file-level breakdown for the p5.js visualizer system
- REQUIREMENTS.md lists p5.js as "Out of Scope" — this entry is stale and should be removed; user confirmed p5.js in session (2026-03-22)
- `vizSketch` prop type: `SketchFactory` = `(hapStreamRef, analyserRef) => (p: p5) => void`

</specifics>

<deferred>
## Deferred Ideas

- Configurable time window (6s is hardcoded per spec, user-configurable is a v2 idea)
- Per-line hap filtering in inline view zones (show only notes from that `$:` line) — deferred, all-haps approach used in v1
- Pitchwheel, spiral, scope, spectrum sketches — scaffolded in this phase, implemented in Phase 3

</deferred>
