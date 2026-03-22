---
phase: 06-inline-zones-via-abstraction
verified: 2026-03-23T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  note: "Phase was REPLANNED after previous verification. Previous verification targeted the OLD goal (blanket VizRendererSource param). This is a full re-verification against the REVISED goal (.viz() per-pattern opt-in system)."
  gaps_closed:
    - ".viz() opt-in system implemented (replanned goal — not present in old verification)"
    - "Legacy ._pianoroll() etc. aliased to .viz() (new requirement)"
    - "getVizRequests() added to StrudelEngine (new API)"
    - "viewZones.ts refactored to vizRequests + vizDescriptors (new signature)"
    - "inlinePianoroll prop removed from StrudelEditorProps (new requirement)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Inline zones appear only for patterns with .viz(), correct viz type, multi-line block placement"
    expected: "With code: setcps(120/240) / $: note('c3').viz('pianoroll') / $: note('e3') / $: note('g3').viz('scope') — pianoroll zone appears after line 2, NO zone after line 3, scope zone appears after line 4."
    why_human: "Visual rendering of canvas zones and their presence/absence under specific $: lines cannot be verified in jsdom."
  - test: "Multi-line block: zone placed after LAST continuation line, not after $: line"
    expected: "With: $: note('c4') / .s('sine') / .viz('pianoroll') — zone appears after line 3 (the .viz line), not after line 1."
    why_human: "afterLineNumber is unit-tested to be 3 but visual placement in the Monaco editor requires browser observation."
  - test: "Pause/resume lifecycle: zones freeze on stop, resume on play"
    expected: "Stop freezes inline zone animations at last frame; play resumes them without flash or zone recreation."
    why_human: "Visual animation freeze/resume behavior cannot be verified by unit tests."
---

# Phase 06: Inline Zones via Abstraction — Verification Report (REVISED)

**Phase Goal:** Per-pattern opt-in inline viz via .viz("name") method chaining. Zone after last line of pattern block. Any viz type via VizDescriptor lookup. Legacy ._pianoroll()/_scope()/etc. aliased to .viz("name"). inlinePianoroll prop removed.
**Verified:** 2026-03-23T00:00:00Z
**Status:** human_needed
**Re-verification:** Yes — FULL re-verification. Phase was REPLANNED after prior verification (prior goal was blanket VizRendererSource; new goal is .viz() per-pattern opt-in).

---

## Note on REQUIREMENTS.md Staleness

REQUIREMENTS.md still contains OLD descriptions for ZONE-01 and ZONE-02:

- **ZONE-01** in REQUIREMENTS.md: "addInlineViewZones accepts VizRendererSource parameter" — OLD GOAL
- **ZONE-02** in REQUIREMENTS.md: "Each inline zone resolves track-scoped VizRefs before mount" — partially applies to new goal

The REPLANNED phase 06 goal (from ROADMAP.md) supersedes these descriptions. The actual implementation delivers the new .viz() opt-in system, which is a superset of what ZONE-01/02 described (track-scoped VizRefs still resolved; the VizRendererSource is now resolved per-zone via VizDescriptor lookup rather than as a single param). ZONE-03 and ZONE-04 are unchanged. The traceability verification below uses the ROADMAP.md success criteria as ground truth.

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Phase 6 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `.viz("pianoroll")` chained on a pattern causes an inline zone with pianoroll to appear after that pattern's block | VERIFIED | `Pattern.prototype.viz` installed in StrudelEngine.evaluate() (line 158). `_pendingViz` resolved in `.p()` wrapper into `capturedVizRequests`. `addInlineViewZones` creates zone only when `vizRequests.get(key)` returns a name. `descriptor.factory` passed to `mountVizRenderer`. |
| 2 | Patterns without `.viz()` get no inline zone | VERIFIED | Opt-in gate at viewZones.ts line 71: `if (!vizName) return`. viewZones test "adds zone only for $: lines present in vizRequests" passes (16/16 tests pass). |
| 3 | Any viz type from DEFAULT_VIZ_DESCRIPTORS works (e.g. `.viz("scope")`, `.viz("spectrum")`) | VERIFIED | `vizDescriptors.find(d => d.id === vizName)` at viewZones.ts line 73 resolves any registered descriptor. `console.warn` for unknown names (line 75). `mockVizDescriptors` in tests includes 'pianoroll' and 'scope'. Unknown-name test passes. |
| 4 | Zone appears after the LAST LINE of the pattern block (not after the `$:` line) | VERIFIED | `lastLineIdx` loop at viewZones.ts lines 86-91 advances past continuation lines. `afterLineNumber: lastLineIdx + 1` at line 94. Test "places zone after last line of multi-line pattern block" asserts `afterLineNumber === 3` for a 3-line block and passes. |
| 5 | InlineZoneHandle pause/resume lifecycle works (pause on stop, resume on play) | VERIFIED | `viewZoneCleanupRef.current?.pause()` at StrudelEditor.tsx line 199 (handleStop). `viewZoneCleanupRef.current?.resume()` at line 180 (handlePlay). viewZones tests for pause/resume both pass. |
| 6 | `inlinePianoroll` prop removed from StrudelEditorProps | VERIFIED | `grep -r "inlinePianoroll" packages/editor/src` returns zero matches. StrudelEditorProps interface (StrudelEditor.tsx lines 23-53) has no such field. |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/editor/src/engine/StrudelEngine.ts` | `.viz()` capture via prototype intercept, `getVizRequests()` getter | VERIFIED | `private vizRequests` field (line 32). `Object.defineProperty(Pattern.prototype, 'viz', ...)` (line 158). `capturedVizRequests` (line 144). `savedVizDescriptor` saved/restored in finally (lines 153, 252-256). `legacyVizNames` array (line 169). `savedLegacyDescriptors` map (line 170). `getVizRequests()` public method (line 369). TypeScript compiles clean (no errors). |
| `packages/editor/src/visualizers/viewZones.ts` | Opt-in zone creation from `vizRequests` + `vizDescriptors`, last-line detection | VERIFIED | Signature: `(editor, hapStream, analyser, trackSchedulers, vizRequests: Map<string,string>, vizDescriptors: VizDescriptor[])`. No `source: VizRendererSource` param. `vizRequests.get(key)` opt-in gate (line 71). `vizDescriptors.find(d => d.id === vizName)` factory lookup (line 73). `console.warn` for unknown names (line 75). `lastLineIdx` multi-line detection (lines 86-94). `descriptor.factory` passed to `mountVizRenderer` (line 104). |
| `packages/editor/src/StrudelEditor.tsx` | Wiring of .viz() opt-in zones, removal of inlinePianoroll prop, `getVizRequests()` call | VERIFIED | `engine.getVizRequests()` at line 166. `vizRequests.size > 0` guard at line 167. `addInlineViewZones` called with `vizRequests, vizDescriptors` (lines 169-176). `viewZoneCleanupRef.current?.resume()` at line 180. `viewZoneCleanupRef.current?.pause()` at line 199. No `inlinePianoroll`, no `currentSource`, no `VizRendererSource` import. |
| `packages/editor/src/__tests__/viewZones.test.ts` | Tests covering opt-in filtering, unknown viz name warning, multi-line block placement, plus migrated existing tests | VERIFIED | 16 tests, all pass. New tests: "adds zone only for $: lines present in vizRequests" (line 254), "logs warning and skips zone for unknown vizName" (line 262), "places zone after last line of multi-line pattern block" (line 273). All existing tests migrated to new 6-param signature. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `StrudelEngine.evaluate()` | `Pattern.prototype.viz` | `Object.defineProperty(Pattern.prototype, 'viz', ...)` installs before eval | WIRED | Installed at line 158, BEFORE `.p` setter-intercept (line 186). `_pendingViz` tag resolved in `.p()` wrapper (lines 204-207). |
| `StrudelEngine.evaluate()` | `capturedVizRequests` | `_pendingViz` resolved into map at `.p()` time | WIRED | `capturedVizRequests.set(captureId, this._pendingViz)` at line 205. Committed to `this.vizRequests` at line 239 on success path. |
| `StrudelEditor.tsx handlePlay` | `StrudelEngine.getVizRequests()` | `engine.getVizRequests()` call | WIRED | Line 166 of StrudelEditor.tsx. Map passed as `vizRequests` to `addInlineViewZones`. |
| `StrudelEditor.tsx handlePlay` | `viewZones.ts addInlineViewZones` | `addInlineViewZones(editor, hapStream, analyser, trackSchedulers, vizRequests, vizDescriptors)` | WIRED | Lines 169-176. All 6 params supplied correctly. `cleanup()` called before re-add (line 168). |
| `viewZones.ts` | `mountVizRenderer.ts` | `mountVizRenderer(container, descriptor.factory, refs, size, onError)` | WIRED | Line 102-108 of viewZones.ts. `descriptor.factory` (not a static source) is passed — per-zone factory dispatch confirmed. |
| `StrudelEditor.tsx handleStop` | `InlineZoneHandle.pause()` | `viewZoneCleanupRef.current?.pause()` | WIRED | Line 199 of StrudelEditor.tsx. |
| `StrudelEditor.tsx handlePlay` | `InlineZoneHandle.resume()` | `viewZoneCleanupRef.current?.resume()` | WIRED | Line 180 of StrudelEditor.tsx, after the `addInlineViewZones` block. |

---

### Requirements Coverage

| Requirement | Source Plan | ROADMAP Description | Actual Implementation | Status |
|-------------|------------|--------------------|-----------------------|--------|
| ZONE-01 | 06-01-PLAN.md | REPLANNED: .viz() opt-in; zones created only for patterns in vizRequests with VizDescriptor lookup (REQUIREMENTS.md still says "accepts VizRendererSource" — stale) | `vizRequests: Map<string,string>` + `vizDescriptors: VizDescriptor[]` params. Opt-in gate. Factory resolved per-zone. | SATISFIED (new goal) |
| ZONE-02 | 06-01-PLAN.md | REPLANNED: getVizRequests() returns Map<string,string> after evaluate (REQUIREMENTS.md says "track-scoped VizRefs before mount" — partially stale, still implemented) | `getVizRequests()` on StrudelEngine. Per-zone `schedulerRef` still resolved from `trackSchedulers.get(key)`. | SATISFIED (new goal + old goal) |
| ZONE-03 | 06-01-PLAN.md | Zone div width from editor.getLayoutInfo().contentWidth | `editor.getLayoutInfo().contentWidth` at viewZones.ts line 55. `container.clientWidth` absent. | SATISFIED |
| ZONE-04 | 06-02-PLAN.md | { cleanup, pause, resume } — pause on stop, resume on play | `InlineZoneHandle` interface. `pause()` in handleStop, `resume()` in handlePlay. 16 tests pass. | SATISFIED |

**Orphaned requirements check:** No additional ZONE-* entries in REQUIREMENTS.md outside ZONE-01 to ZONE-04. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | No TODOs, FIXMEs, placeholders, empty return stubs, or console.log-only implementations in modified files. `console.warn` for unknown viz names is intentional documented behavior. |

---

### Human Verification Required

#### 1. Per-Pattern Opt-In Zone Appearance

**Test:** Start dev server (`cd packages/app && pnpm dev`). Enter this code in the editor:
```
setcps(120/240)
$: note("c3 e3 g3").s("sawtooth").viz("pianoroll")
$: note("<c2 g2>").s("square")
$: note("<c4 e4>").s("triangle").viz("scope")
```
Press Ctrl+Enter to play.
**Expected:** Inline pianoroll zone appears below line 2. NO zone appears below line 3. Inline scope zone appears below line 4.
**Why human:** Zone presence and absence under specific $: lines requires browser DOM inspection. Canvas rendering cannot be tested in jsdom.

#### 2. Multi-Line Pattern Block Placement

**Test:** Enter:
```
$: note("c4 e4 g4")
  .s("sine")
  .viz("pianoroll")
```
Press Ctrl+Enter.
**Expected:** Zone appears below line 3 (the `.viz("pianoroll")` line), NOT below line 1 (the `$:` line).
**Why human:** `afterLineNumber` is unit-tested to be 3, but visual zone placement in Monaco editor requires browser observation.

#### 3. Pause/Resume Lifecycle

**Test:** Play the multi-pattern code from test 1. Observe zones animating. Press Ctrl+. to stop.
**Expected:** Zones stay visible but animation freezes at last frame. Press Ctrl+Enter again — animation resumes immediately without zone recreation or visual flash.
**Why human:** Visual animation freeze/resume and absence of flash cannot be verified by unit tests.

#### 4. Legacy Alias Compatibility

**Test:** Enter code using the legacy Strudel syntax:
```
$: note("c3 e3").s("sine")._pianoroll()
```
Press Ctrl+Enter.
**Expected:** Inline pianoroll zone appears below the pattern, same as `.viz("pianoroll")`.
**Why human:** `_pianoroll()` alias is unit-testable in principle but requires browser validation to confirm it actually creates a visible zone end-to-end.

---

### Gaps Summary

No automated gaps. All 6 observable truths from the ROADMAP.md Phase 6 success criteria are VERIFIED against actual code. The 4 requirement IDs (ZONE-01 through ZONE-04) are satisfied.

The REQUIREMENTS.md descriptions for ZONE-01 and ZONE-02 are stale (describe the old phase goal), but the actual implementations satisfy both the old track-scoped VizRefs concern and the new .viz() opt-in concern. No action needed on code — REQUIREMENTS.md can be updated editorially to reflect the replanned goal.

---

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| viewZones.test.ts | 16/16 | All pass |
| Full editor suite | 93/93 | All pass (10 test files) |
| TypeScript compilation | — | Clean (no errors) |

---

_Verified: 2026-03-23T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
