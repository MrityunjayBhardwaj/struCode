# Requirements: Motif (formerly struCode)

**Defined:** 2026-03-21
**Updated:** 2026-03-22 (revised roadmap — THESIS phases A-G integrated)
**Core Value:** A renderer-agnostic, engine-agnostic live coding platform delivered as an embeddable React component library. The infrastructure layer for live coding music.

## v1 Requirements

### Engine (Validated — already implemented)

- [x] **ENG-01**: User can initialize the audio engine after a click (autoplay policy compliance)
- [x] **ENG-02**: User can evaluate a Strudel code string and get an error result if it fails
- [x] **ENG-03**: User can play and stop a Strudel pattern
- [x] **ENG-04**: Engine emits HapEvents with timing data (scheduledAheadMs, midiNote, loc, s, color) for every scheduled note
- [x] **ENG-05**: User can export a pattern as a WAV file via OfflineAudioContext fast-render (oscillator sounds only)
- [x] **ENG-06**: User can record live audio output as WAV (ScriptProcessorNode tap)
- [x] **ENG-07**: User can render multiple stems in parallel, each producing an isolated WAV blob
- [x] **ENG-08**: noteToMidi() correctly converts note name strings ("c3", "eb4", "f#2") and MIDI numbers

### Editor Core (Validated — already implemented)

- [x] **EDIT-01**: User sees a Monaco editor with Strudel code, dark theme, and monospace font
- [x] **EDIT-02**: Component supports controlled (code prop) and uncontrolled (defaultCode) modes
- [x] **EDIT-03**: Toolbar shows play/stop/export buttons, BPM display, and error badge
- [x] **EDIT-04**: Keyboard shortcut Ctrl+Enter toggles play/stop
- [x] **EDIT-05**: Exporting WAV triggers browser download when no onExport handler is provided
- [x] **EDIT-06**: engineRef prop lets integrators access the StrudelEngine instance directly
- [x] **EDIT-07**: Theme tokens (design system colors/fonts) applied via CSS custom properties

### Active Highlighting

- [x] **HIGH-01**: Monaco characters that generated a playing note are highlighted with accent-colored background and outline
- [x] **HIGH-02**: Highlights fire at the exact moment audio plays (delayed by scheduledAheadMs from HapEvent)
- [x] **HIGH-03**: Highlights clear automatically when the note ends (audioDuration from HapEvent)
- [x] **HIGH-04**: Multiple simultaneous haps (chords) each get independent highlight/clear cycles
- [x] **HIGH-05**: Highlights use decoration class `strudel-active-hap` with correct design token colors

### Visualizers — Pianoroll

- [x] **PIANO-01**: Full-panel Pianoroll canvas renders at 60fps via requestAnimationFrame
- [x] **PIANO-02**: Pianoroll shows a rolling 6-second time window (right edge = now, scrolls left)
- [x] **PIANO-03**: Y-axis spans MIDI 24 (C1) to MIDI 96 (C7)
- [x] **PIANO-04**: Note blocks colored by s field (drums=orange, bass=cyan, melody=violet, pad=emerald, default=accent) or by hap.value.color if present
- [x] **PIANO-05**: Percussion sounds (bd, sd, hh, etc.) shown at fixed MIDI positions below pitch area
- [x] **PIANO-06**: Inline pianoroll embedded in Monaco as a view zone below $: lines (120px height)
- [x] **PIANO-07**: Inline view zones re-added after every evaluate() call (they reset on editor re-layout)

### Visualizers — Audio Analysis

- [x] **VIZ-01**: Scope visualizer renders time-domain waveform from AnalyserNode at 60fps
- [x] **VIZ-02**: Scope uses zero-crossing trigger for stable waveform display
- [x] **VIZ-03**: FScope visualizer renders frequency bars from AnalyserNode at 60fps
- [x] **VIZ-04**: Spectrum visualizer renders scrolling waterfall with log-frequency Y axis
- [x] **VIZ-05**: Spiral visualizer maps note events to positions on a rotating spiral (cycle-based)
- [x] **VIZ-06**: Pitchwheel visualizer shows 12 pitch classes on a circle; active notes glow

### Toolbar & UI

- [x] **UI-01**: VizPicker toolbar component lets user switch between visualizer modes
- [x] **UI-02**: Layout follows spec: toolbar (40px) + viz-picker (32px) + editor + visualizer panel
- [x] **UI-03**: vizHeight prop controls visualizer panel height (default 200px)
- [x] **UI-04**: showToolbar prop hides toolbar (default: shown)

### VizRenderer Abstraction

- [x] **REND-01**: VizRenderer interface defined with mount(container, refs, size, onError), resize(w,h), pause(), resume(), destroy() methods
- [x] **REND-02**: VizRefs type defined: hapStreamRef, analyserRef, schedulerRef as RefObject refs
- [x] **REND-03**: P5VizRenderer adapter class wraps existing SketchFactory sketches — mount creates p5 instance, resize calls resizeCanvas, pause/resume call noLoop/loop, destroy calls remove
- [x] **REND-04**: VizDescriptor type defined: { id, label, requires?, factory: () => VizRenderer }
- [x] **REND-05**: DEFAULT_VIZ_DESCRIPTORS array exported from package — contains all 7 built-in viz modes wrapped in P5VizRenderer
- [x] **REND-06**: useVizRenderer hook replaces useP5Sketch — calls mountVizRenderer, wires ResizeObserver, handles cleanup
- [x] **REND-07**: VizPicker renders from VizDescriptor[] as a dropdown (not hardcoded VizMode tab bar)

### Per-Track Data

- [ ] **TRACK-01**: Pattern.prototype.p monkey-patched during evaluate() to capture per-$: Pattern objects into capturedPatterns map
- [ ] **TRACK-02**: Pattern.prototype.p always restored in finally block — even on evaluate error
- [ ] **TRACK-03**: StrudelEngine.getTrackSchedulers() returns Map<string, PatternScheduler> where each value queries its captured Pattern directly via queryArc
- [ ] **TRACK-04**: Anonymous $: patterns keyed as "$0", "$1" etc; named patterns (d1:) use literal name

### Inline Zones via Abstraction

- [ ] **ZONE-01**: addInlineViewZones accepts VizRendererSource parameter (factory or instance)
- [ ] **ZONE-02**: Each inline zone resolves track-scoped VizRefs before mount — scheduler from getTrackSchedulers()
- [ ] **ZONE-03**: Zone div width from editor.getLayoutInfo().contentWidth (not container.clientWidth which is 0 pre-attach)
- [ ] **ZONE-04**: addInlineViewZones returns { cleanup, pause, resume } — StrudelEditor calls pause on stop, resume on play

### Additional Renderers

- [ ] **EXTRA-01**: Canvas2DVizRenderer implements VizRenderer using raw Canvas 2D API (no p5 dependency)
- [ ] **EXTRA-02**: Three.js renderer dynamically imports three (~600KB) inside mount() — not a static import
- [ ] **EXTRA-03**: Shadertoy GLSL renderer wraps mainImage(out vec4, in vec2) in main(), routes gl.getShaderInfoLog to onError
- [ ] **EXTRA-04**: VizDescriptor.requires field checked before mount — unsupported renderers shown disabled in picker

### Engine Protocol

- [ ] **ENG-P-01**: LiveCodingEngine interface defined: init, evaluate, play, stop, getAnalyser, getPatternScheduler, getTrackSchedulers, getHapStream, dispose
- [ ] **ENG-P-02**: StrudelEngine refactored to implement LiveCodingEngine without behavioral change
- [ ] **ENG-P-03**: LiveCodingEditor component accepts engine prop — not hardcoded to StrudelEngine
- [ ] **ENG-P-04**: At least one proof-of-concept second engine adapter (e.g. SonicPiEngine stub via OSC/WebSocket)

### Normalized Hap Type

- [ ] **HAP-01**: Normalized Hap interface defined: begin, end, pitch?, gain?, duration?, label?, color?, trackId?
- [ ] **HAP-02**: StrudelEngine maps raw Strudel haps to normalized Hap type in getTrackSchedulers/getPatternScheduler
- [ ] **HAP-03**: All 7 sketches refactored to consume normalized Hap (not raw Strudel hap shape)

### Monaco Intelligence

- [ ] **MON-01**: Monaco uses a custom 'strudel' language with Monarch tokenizer
- [ ] **MON-02**: Strudel functions (note, s, gain, stack, every, jux, fast, slow, etc.) highlighted in blue
- [ ] **MON-03**: Note names (c3, eb4, f#2) highlighted in green
- [ ] **MON-04**: Mini-notation strings get sub-tokenized (operators, note names, numbers distinct)
- [ ] **MON-05**: Dot completions offer all chainable Strudel function names with signatures
- [ ] **MON-06**: Inside note("...") — completions for note names and mini-notation operators
- [ ] **MON-07**: Inside s("...") — completions for oscillator types and common percussion names
- [ ] **MON-08**: Error from evaluate() shown as Monaco red squiggles via setModelMarkers
- [ ] **MON-09**: Hover over a Strudel function shows documentation and an example

### Library Polish

- [ ] **LIB-01**: Vitest unit tests for WavEncoder (header correctness, stereo interleaving, mono fallback)
- [ ] **LIB-02**: Vitest unit tests for noteToMidi (note names, MIDI pass-through, invalid inputs)
- [ ] **LIB-03**: Vitest test for highlight timing (scheduledAheadMs fires at correct time)
- [ ] **LIB-04**: tsup build produces valid ESM + CJS bundles with correct package.json exports field
- [ ] **LIB-05**: All public API types exported from index.ts (StrudelEditor, StrudelEngine, all visualizers, StrudelEditorProps, StrudelTheme, HapEvent)
- [ ] **LIB-06**: Storybook stories for StrudelEditor (default, with pianoroll, with scope, read-only)
- [ ] **LIB-07**: Storybook stories for each visualizer component in isolation
- [ ] **LIB-08**: README.md with npm install instructions and minimal usage example

### App (Demo Site)

- [ ] **APP-01**: packages/app renders StrudelEditor with play/stop/export working
- [ ] **APP-02**: App demo page shows all visualizer types switchable via VizPicker
- [ ] **APP-03**: App includes an examples gallery with 3-5 starter Strudel patterns
- [ ] **APP-04**: App polished as public-facing demo site (landing page, usage docs)

## v2 Requirements

### Export

- **EXP-01**: Multi-stem ZIP export from toolbar (fflate, lazy import)
- **EXP-02**: Progress indicator during offline render (onProgress callback)

### Advanced Monaco

- **MON-10**: setcps() BPM formula suggestion in completions
- **MON-11**: Inline error messages (Monaco inline decoration)

### Audio

- **AUDIO-01**: Sample-based sounds in OfflineRenderer (requires AudioWorklet workaround or fallback)

## Out of Scope

| Feature | Reason |
|---------|--------|
| iframe or strudel-editor web component | Replaced by direct @strudel/core integration — no iframe boundary |
| Application-specific CDN/upload logic | Integrators provide onExport hook — Motif stays generic |
| Zustand / Redux state management | Not needed in a component library |
| Server-side audio rendering | Browser Web Audio API only |
| Real-time sample playback in OfflineRenderer | AudioWorklet cannot be re-registered in OfflineAudioContext — oscillators only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01..08 | Existing | Complete |
| EDIT-01..07 | Existing | Complete |
| HIGH-01..05 | Phase 1 | Complete |
| PIANO-01..07 | Phase 2 | Complete |
| UI-01..04 | Phase 2 | Complete |
| VIZ-01..06 | Phase 3 | Complete |
| REND-01..07 | Phase 4 | Pending |
| TRACK-01..04 | Phase 5 | Pending |
| ZONE-01..04 | Phase 6 | Pending |
| EXTRA-01..04 | Phase 7 | Pending |
| ENG-P-01..04 | Phase 8 | Pending |
| HAP-01..03 | Phase 9 | Pending |
| MON-01..09 | Phase 10 | Pending |
| LIB-01..08 | Phase 11 | Pending |
| APP-01..04 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 67 active (35 complete, 32 pending)
- Mapped to phases: 67/67
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-22 after THESIS roadmap integration*
