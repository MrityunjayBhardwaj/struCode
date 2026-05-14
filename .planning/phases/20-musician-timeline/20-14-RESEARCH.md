---
phase: 20-14
title: Strudel.cc parity — research (α-wave spec)
researcher: anvi-researcher
created: 2026-05-14
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
upstream_pin_date: 2026-05-07
confidence: HIGH
closes: "#110"
---

# Phase 20-14 — Research

User constraints (verbatim from `20-14-CONTEXT.md` — locked):
- **D-01** Parity rung = structural only (IR shape + event count + param keys).
- **D-02** Alias source = hand-curated TS const at `packages/editor/src/engine/aliases.ts`,
  consulted at `s()` call interception — NOT by mutating `soundMap`.
- **D-03** Tier policy = settings panel toggle, default OFF, in `EditorSettingsModal`.
- **D-04** Corpus = vendor 10-20 examples + upstream-SHA pin at
  `packages/app/tests/parity-corpus/`.

Upstream pin: `uzu/strudel` Codeberg, branch `main`, SHA `f73b3956…` (2026-05-07).
**NOTE:** Strudel migrated GitHub → Codeberg. `github.com/tidalcycles/strudel` is
frozen (`MOVED_TO_CODEBERG.md`). All upstream citations below are Codeberg paths.

---

## 1. Upstream init enumeration — α-WAVE SPEC

Bootstrap path: `useReplContext.jsx` → `loadModules()` + `prebake()` fire as
module-scope side-effects (see `useReplContext.jsx:44–46`).

### 1a. `loadModules()` — the evalScope call

Source: `website/src/repl/util.mjs:68–98` (raw at
`https://codeberg.org/uzu/strudel/raw/branch/main/website/src/repl/util.mjs`).

```js
// util.mjs:68-98
export function loadModules() {
  let modules = [
    import('@strudel/core'),
    import('@strudel/draw'),
    import('@strudel/edo'),         // ← NOT loaded by Stave
    import('@strudel/tonal'),
    import('@strudel/mini'),
    import('@strudel/xen'),
    import('@strudel/webaudio'),
    import('@strudel/codemirror'),  // ← editor concern, Stave uses Monaco
    import('@strudel/hydra'),       // ← NOT loaded by Stave
    import('@strudel/serial'),      // ← NOT loaded by Stave (heavy/permissioned)
    import('@strudel/soundfonts'),
    import('@strudel/csound'),      // ← NOT loaded by Stave (heavy)
    import('@strudel/tidal'),       // ← NOT loaded by Stave (5.8 MB!)
    import('@strudel/gamepad'),     // ← NOT loaded by Stave
    import('@strudel/motion'),      // ← NOT loaded by Stave (DeviceMotion permission)
    import('@strudel/mqtt'),        // ← NOT loaded by Stave
    import('@strudel/mondo'),       // ← NOT loaded by Stave (new mondo lang)
  ];
  if (isTauri()) {
    modules = modules.concat([
      import('@strudel/desktopbridge/loggerbridge.mjs'),
      import('@strudel/desktopbridge/midibridge.mjs'),
      import('@strudel/desktopbridge/oscbridge.mjs'),
    ]);
  } else {
    modules = modules.concat([
      import('@strudel/midi'),      // ✓ Stave loads this
      import('@strudel/osc'),       // ← NOT loaded by Stave
    ]);
  }
  return evalScope(settingPatterns, ...modules);
}
```

Stave's current load set (`StrudelEngine.ts:129–137`): core, mini, tonal,
webaudio, soundfonts, xen, midi. **Seven modules. Upstream loads
fifteen** (non-Tauri).

### 1b. Module-by-module classification

Sizes are npm `dist.unpackedSize` (verified via `registry.npmjs.org`), confidence HIGH.

| # | Module | Stave loads? | Audio-pure? | Heavy? | Size (npm unpacked) | Tier flag | Notes |
|---|---|---|---|---|---|---|---|
| 1 | `@strudel/core` | ✓ | yes | no | (core) | — | required |
| 2 | `@strudel/mini` | ✓ | yes | no | — | — | mini-notation parser |
| 3 | `@strudel/tonal` | ✓ | yes | no | 121 KB | — | scale/chord operators |
| 4 | `@strudel/webaudio` | ✓ | yes | no | — | — | sound output |
| 5 | `@strudel/soundfonts` | ✓ | yes | mid | 278 KB | — | GM fonts lazy-fetched |
| 6 | `@strudel/xen` | ✓ | yes | **yes** | **2.47 MB** | — | xenharmonic (already loaded; audio-pure so stays unconditional per D-03) |
| 7 | `@strudel/midi` | ✓ | yes | no | 80 KB | `midi` (β) | already excludes `enableWebMidi()` per StrudelEngine.ts:142 |
| 8 | `@strudel/draw` | ✗ | no | mid | 90 KB | `draw` (γ?) | **intentionally excluded** (StrudelEngine.ts:143–146) — injects `id="test-canvas"` into `document.body`. Stave owns visuals. Keep excluded; surface as opt-out, not opt-in. Provides `getDrawContext`, `pianoroll`, `scope`, `spectrum`, `wordfall`, `punchcard`. |
| 9 | `@strudel/edo` | ✗ | yes | no | — | — | equal-divisions-of-octave operators. **Audio-pure → add unconditionally (α).** |
| 10 | `@strudel/hydra` | ✗ | no | mid | 39 KB | `hydra` (γ?) | injects hydra canvas. Same shape as `@strudel/draw` exclusion. Stave already has its own hydra renderer (P19 catalogue). **Keep excluded.** |
| 11 | `@strudel/serial` | ✗ | no | small | 42 KB | `serial` (β) | WebSerial API — permissioned. Behind tier flag. |
| 12 | `@strudel/csound` | ✗ | no | **YES** | 113 KB stub + **6.3 MB `@csound/browser`** | `csound` (β) | Behind tier flag. See §2. |
| 13 | `@strudel/tidal` | ✗ | yes | **YES** | **5.8 MB** | `tidal` (β) | Loads TidalCycles haskell-via-wasm interop. Audio-pure (no permission) but huge bundle. **Default OFF.** |
| 14 | `@strudel/gamepad` | ✗ | no | small | 54 KB | `gamepad` (β) | Gamepad API — permissioned. |
| 15 | `@strudel/motion` | ✗ | no | small | 134 KB | `motion` (β) | DeviceMotion API — permissioned. |
| 16 | `@strudel/mqtt` | ✗ | no | small | 42 KB | `mqtt` (β) | network-dependent. |
| 17 | `@strudel/mondo` | ✗ | yes | small | 42 KB | — | new mondo lang. Audio-pure. **Add unconditionally (α)** — its absence is a parity gap. |
| 18 | `@strudel/osc` | ✗ | no | small | 49 KB | `osc` (β) | needs SuperCollider backend. behind tier flag. |
| 19 | `@strudel/codemirror` | ✗ | n/a | — | — | — | editor — Stave uses Monaco. **Do NOT add.** |

**α-wave audio-pure additions (load unconditionally):**
1. `@strudel/edo` — currently missing, audio-pure, no cost. Add to `Promise.all`.
2. `@strudel/mondo` — currently missing, audio-pure, ~42 KB. Add to `Promise.all`.

**That is the entire α-wave evalScope diff.** `tidal` is intentionally tier-gated
even though it's audio-pure, on bundle-size grounds (5.8 MB).

`@strudel/draw` and `@strudel/hydra` remain excluded by design — both inject DOM
into `document.body`. Document this as "opt-out at α, never moves to opt-in
because Stave owns visuals." (See §7 open question on `pianoroll`/`scope`
re-export.)

### 1c. `prebake()` — the sample manifest fetches

Source: `website/src/repl/prebake.mjs:1–161` (raw available; full file 174
lines). All calls run in `Promise.all` after `await initAudioOnFirstClick`
(triggered by user gesture — already covered by Stave's `init()` contract).

```js
// prebake.mjs:13-160
import { aliasBank, registerSynthSounds, registerZZFXSounds, samples } from '@strudel/webaudio';
import { registerSamplesFromDB } from './idbutils.mjs';   // ← website-only
import './piano.mjs';                                      // ← prototype injection

await Promise.all([
  registerSynthSounds(),                                                          // ✓ Stave (:163)
  registerZZFXSounds(),                                                           // ✓ Stave (:166)
  registerSamplesFromDB(),                                                        // ✗ Stave — website IndexedDB feature
  import('@strudel/soundfonts').then(({ registerSoundfonts }) => registerSoundfonts()), // ✓ Stave (:170)
  samples(`${baseCDN}/piano.json`, `${baseCDN}/piano/`, { prebake: true }),       // ✗ Stave — Salamander piano
  samples(`${baseCDN}/vcsl.json`, `${baseCDN}/VCSL/`, { prebake: true }),         // ✗ Stave — VCSL orchestra
  samples(`${baseCDN}/tidal-drum-machines.json`, ..., { tag: 'drum-machines' }),  // ✗ Stave — tr909/808/etc.
  samples(`${baseCDN}/uzu-drumkit.json`, ..., { tag: 'drum-machines' }),          // ✗ Stave
  samples(`${baseCDN}/uzu-wavetables.json`, ...),                                 // ✗ Stave
  samples(`${baseCDN}/mridangam.json`, ..., { tag: 'drum-machines' }),            // ✗ Stave
  samples({ casio:[...], crow:[...], insect:[...], wind:[...], jazz:[...],       // ✗ Stave — inline manifest
            metal:[...], east:[...], space:[...], numbers:[...], num:[...] },
          `${baseCDN}/Dirt-Samples/`, { prebake: true }),
]);
aliasBank(`${baseCDN}/tidal-drum-machines-alias.json`);                            // ✗ Stave — see §3
// Pattern.prototype.piano injection (piano.mjs)                                   // ✗ Stave
```

Stave currently does `samples('github:tidalcycles/Dirt-Samples/master')`
(StrudelEngine.ts:175) — that loads a different manifest. Upstream's drum-machine
banks (`tr909`, `tr808`, `RolandTR909`, `LinnLM1` …) are **NOT** in
`tidalcycles/Dirt-Samples`. They come from
`strudel.b-cdn.net/tidal-drum-machines.json`.

The default code at upstream `useReplContext.jsx:148` is
`$: s("[bd <hh oh>]*2").bank("tr909").dec(.4)` — relies on
`.bank("tr909")` which needs the drum-machines manifest (NOT Dirt-Samples).

**α-wave prebake additions (all audio-pure):**

| Call | Why it matters for parity | Cost | Decision |
|---|---|---|---|
| `samples('${baseCDN}/piano.json', '${baseCDN}/piano/')` | unlocks `s("piano")` with Salamander samples (CC-by) — currently the **exact symptom of issue #110**. Without it, `s("piano")` only works if our alias map points `piano → gm_piano` (a soundfont). The upstream `piano` is a sample bank, not a soundfont. | 1 lazy json fetch | **add unconditionally (α).** |
| `samples('${baseCDN}/tidal-drum-machines.json', ..., { tag: 'drum-machines' })` | unlocks `.bank("tr909")` `.bank("RolandTR808")` etc. Affects ~half the corpus tunes. | 1 lazy json fetch | **add unconditionally (α).** |
| `samples('${baseCDN}/uzu-drumkit.json', ..., { tag: 'drum-machines' })` | extra banks | small | **add unconditionally (α).** |
| `samples('${baseCDN}/uzu-wavetables.json')` | wavetables for synth | small | **add unconditionally (α).** |
| `samples('${baseCDN}/mridangam.json', ..., { tag: 'drum-machines' })` | percussion bank | small | **add unconditionally (α).** |
| `samples('${baseCDN}/vcsl.json', '${baseCDN}/VCSL/')` | VCSL orchestral library (CC0). Big bank — but lazy-loaded; manifest is small. | manifest only at boot | **add unconditionally (α).** |
| Inline Dirt-Samples object (casio, crow, insect, wind, jazz, metal, east, space, numbers, num) | upstream uses the b-cdn copy, not `github:tidalcycles/Dirt-Samples`. The github source is older/smaller. | manifest is in-source | **decide α (lean): keep our current `github:tidalcycles/Dirt-Samples/master` AND ADD the inline manifest.** Both succeed; second one wins on duplicate keys per `soundMap.setKey` semantics. |
| `aliasBank('${baseCDN}/tidal-drum-machines-alias.json')` | adds e.g. `RolandTR909 → 909`, `KorgKR55 → KR55` (69 entries verified at fetch-time). **This is bank-level aliasing**, NOT bare-name aliasing. Does NOT solve `s("piano")` vs `s("gm_piano")` directly. | 1 json fetch (1.7 KB) | **add unconditionally (α)** — gives parity on `.bank("RolandTR909")` etc. |
| `registerSamplesFromDB()` | website-only IndexedDB user sample feature. | n/a | **skip** — not relevant to Stave's parity story. |
| `Pattern.prototype.piano` (piano.mjs injection) | adds `.piano()` chain method (sets `clip=1`, applies `.s('piano')`, `.release(.1)`, `pan` by pitch). Twelve+ corpus tunes use `.piano()`. | tiny inline | **port verbatim into Stave's init or vendor `piano.mjs`** — α-wave decision. |

### 1d. The default code line — bare-name baseline

Upstream `useReplContext.jsx:148`:
```js
code = '$: s("[bd <hh oh>]*2").bank("tr909").dec(.4)';
```

This is the empty-REPL placeholder. After α-wave (drum-machines manifest +
aliasBank), this code runs unchanged on Stave. **This is the simplest parity
smoke test.**

---

## 2. Csound footprint — verified

`@strudel/csound` npm package itself = **113 KB unpacked** (just a thin wrapper).
Its hard dependency `@csound/browser` (v7.0.0-beta31) = **6.33 MB unpacked**.
Deps include `google-closure-library`, `pako`, `ramda`,
`standardized-audio-context`, `text-encoding-shim`, `unmute-ios-audio`,
`web-midi-api`.

**Verdict:** monolithic. The 6+ MB is wasm+glue and isn't tree-shakeable. Tier
toggle is non-negotiable. Default OFF is correct (D-03 ratified).

**Mechanism:** lazy `await import('@strudel/csound')` ONLY when the tier flag
is on at boot. If the flag is off, no import statement evaluates → no bundle
inclusion (Vite/esbuild dynamic-import code-split). Confirmed pattern used by
upstream `prebake.mjs:24` (`import('@strudel/soundfonts').then(...)`).

Loading `@strudel/csound` exposes `loadCsound` as a tagged template (used by the
`csoundDemo` example, see §1c reference). No `evalScope` re-registration needed
post-init; the import side-effect populates `globalThis.loadCsound`.

---

## 3. soundMap interception strategy — concrete sketch

D-02 forbids mutating `soundMap`. Investigation of `s()` resolution:

- `s()` is a Pattern method registered by `register('s', …)` in `@strudel/webaudio`.
  At runtime each hap's `value.s` is the string the user passed.
- Sound resolution happens at SCHEDULE time inside
  `onTriggerSample()` (superdough/sampler.mjs:291) via
  `getSound(s)` → `soundMap.get()[s.toLowerCase()]`
  (`superdough/superdough.mjs:165–170`).
- If `getSound` returns nothing, superdough throws `sound X not found! Is it
  loaded?` — already caught by Stave's `wrappedOutput` error handler
  (StrudelEngine.ts:227–233).

**Two interception choices:**

| Strategy | Where | Pros | Cons |
|---|---|---|---|
| **A. Pre-trigger rewrite** in `wrappedOutput` | StrudelEngine.ts:207 | one-line addition, no Strudel internals touched, runs AFTER transpiler reify, sees the final `hap.value.s` | runs every hap (cheap — Map.get); silent for callers passing a Pattern (P1 — but `s()` itself accepts a Pattern fan, so the hap's `s` field is always a string by the time we see it) |
| **B. Wrap exported `s()` function** | inject into globalThis after evalScope | catches at parse time, before any audio | `s()` accepts Patterns + strings + arrays; replicating its full type machinery is risky; transpiler reification (P1) means we see Patterns most of the time, defeating string-based alias lookup |

**Recommendation: Strategy A.** Concrete shape:

```ts
// In wrappedOutput, before the breakpoint hit-check (line ~211):
const rawS = hap?.value?.s
if (typeof rawS === 'string') {
  const aliased = ALIASES[rawS.toLowerCase()]
  if (aliased && !soundMap.get()[rawS.toLowerCase()]) {
    // Only rewrite when the raw name has no upstream entry — preserves
    // "GM names are GM names" for advanced users (D-02 invariant #2).
    hap.value = { ...hap.value, s: aliased }
  }
}
```

`loadedSoundNames` (StrudelEngine.ts:179) — D-02 says keep autocomplete-honest.
Strategy A leaves `soundMap` untouched, so `loadedSoundNames` stays unpolluted.
**To surface aliases in autocomplete**, the editor pulls a SECOND list via a
new `getAliasNames()` getter and merges in the UI. The autocomplete itself
classifies them visually ("alias → bd") — out of α/β scope, queue for follow-up.

**soundMap mutation timing (CONTEXT open question):** `aliasBank` calls
`soundMap.set({ ...soundDictionary })` (`superdough.mjs:117`). After init, `soundMap`
is **mutated** if user code calls `samples(...)` or `aliasBank(...)`. If we
ever snapshot for "does this name exist?", we must re-read live, NOT cache.
Strategy A is a live read (`soundMap.get()[name]`) — safe.

The other mutation site: `registerSound` (`superdough.mjs:61`) calls
`soundMap.setKey(...)`. This happens during `registerSynthSounds`,
`registerZZFXSounds`, `registerSoundfonts`, and during `samples()` parse. After
init completes, `loadedSoundNames` (line 179 snapshot) is **frozen**, missing
any sounds registered post-init by user-eval'd `samples()` calls. Existing bug,
out of scope for 20-14, but flag for follow-up.

---

## 4. Heavy module list — confirmed

| Module | Tier flag | Default | Rationale |
|---|---|---|---|
| `@strudel/csound` | `csound` | OFF | 6.3 MB wasm + glue (§2). |
| `@strudel/tidal` | `tidal` | OFF | 5.8 MB. Audio-pure but bloats audio-pure bundle. |
| `@strudel/midi` with `enableWebMidi()` | `midi` | OFF | Module loaded; `enableWebMidi()` requires permission. Two-step flag: load on/off + permission prompt timing (β-wave UX call, see CONTEXT gray-area #3). |
| `@strudel/osc` | `osc` | OFF | Needs SuperCollider backend running locally. |
| `@strudel/serial` | `serial` | OFF | WebSerial permission. |
| `@strudel/gamepad` | `gamepad` | OFF | Gamepad permission. |
| `@strudel/motion` | `motion` | OFF | DeviceMotion permission. |
| `@strudel/mqtt` | `mqtt` | OFF | Network broker config. |

8 tier flags. Schema lives in `EditorSettingsModal` per D-03. Each is a `boolean`
that `StrudelEngine.init()` reads from the workspace settings snapshot at boot.

**Not a tier flag (stay OFF permanently):** `@strudel/draw`, `@strudel/hydra`,
`@strudel/codemirror` — these collide with Stave's own UI/visualizer stack.

**Toggle UX** (note for β-wave): toggles take effect **on reload**, not
immediately. The CONTEXT gray-area #3 raises the MIDI prompt question — recommend
"early prompt at toggle-on" via a one-shot `enableWebMidi()` call queued for
the next init. Surface in β-wave's discuss-phase.

---

## 5. Parity corpus candidates — 10-20 from upstream

Source: `website/src/repl/tunes.mjs` @ SHA `f73b395648645aabe699f91ba0989f35a6fd8a3c`,
32 named exports.

**Curated 16 (covers full parity surface):**

| # | Tune | Why curated | Surface tested |
|---|---|---|---|
| 1 | `chop` | minimal, single sample chop | bare-sample resolve |
| 2 | `delay` | simple FX | param keys |
| 3 | `orbit` | `.orbit()` chain | orbit routing |
| 4 | `belldub` | `.s("bell")` bare name | **alias layer** |
| 5 | `sampleDrums` | bare `bd/sd/hh` | Dirt-Samples baseline |
| 6 | `randomBells` | `.note().scale()` | tonal ops |
| 7 | `barryHarris` | jazz harmony, scales | tonal + xen edge |
| 8 | `echoPiano` | `.piano()` chain | **Pattern.prototype.piano injection** |
| 9 | `holyflute` | soundfont (`gm_…`) | soundfont parity |
| 10 | `flatrave` | `.bank("tr909")` | **drum-machines manifest + aliasBank** |
| 11 | `amensister` | sample chop + stutter | sequencing ops |
| 12 | `juxUndTollerei` | `.jux()` higher-order | combinator IR shape |
| 13 | `bassFuge` | polyphony + voicing | `.voicing()` |
| 14 | `dinofunk` | drum-machines + polyrhythm | mini-notation polyrhythm |
| 15 | `meltingsubmarine` | `.color()` + viz hints | metadata pass-through |
| 16 | `arpoon` | arp + chord ops | tonal chord progression |

**Deliberately omitted:**
- `csoundDemo` — requires `@strudel/csound` (heavy tier flag). Add when csound
  tier shipped (out of scope).
- `swimming`, `giantSteps`, `caverave`, `zeldasRescue`, `goodTimes`,
  `festivalOfFingers*`, `sml1`, `waa2`, `outroMusic`, `undergroundPlumber`,
  `wavyKalimba`, `blippyRhodes`, `loungeSponge`, `sampleDemo` — variations of
  the surface already covered. Add if a parity gap appears.

**P62 audit** (quote-rewriting): scanning the 16 tunes, **all** use double-quoted
strings inside chain methods (`.s("bd")`, `.bank("tr909")`, etc.). Strudel's
transpiler reifies these as Patterns intentionally — that IS the upstream
behavior. **Corpus should NOT be hand-rewritten to single quotes.** The parity
assertion is "after eval, our IR matches upstream's eval", and both go through
the same transpiler. P62 only bites in `.p()`, `.viz()`-style "string-id"
chains, not the audio-side `.s()`/`.bank()` chains in the corpus.

**Corpus storage layout** (per D-04):
```
packages/app/tests/parity-corpus/
  CORPUS-SOURCE.md              ← SHA pin + license note (AGPL-3.0)
  chop.strudel                  ← (copy of tunes.mjs export, trailing newline)
  delay.strudel
  ...
  arpoon.strudel
```

**Refresh script** (γ-wave): `pnpm parity:refresh` re-fetches `tunes.mjs` at a
new SHA and `diff -u` against current corpus — surfaces upstream additions for
manual review. Does NOT run on PRs (D-04).

---

## 6. Friendly-errors integration — one-line vs deeper

`friendlyErrors.ts:240` uses `detect.alias` for a runtime-doc alias mechanism
(e.g., "user typed `volume`, doc entry for `gain` lists `volume` as a
CommonMistake alias"). **Different concept** from the sound-name alias layer
this phase introduces. They do not collide structurally.

**β-wave touch:**
1. Add an `aliasResolved` field to the friendly-error payload when a hap's `s`
   was rewritten by the alias map (Strategy A in §3). Surface in the error
   panel: "tried alias `kick` → `bd` (resolved)". One-liner where we already
   build the message.
2. On a MISS at `getSound` after alias resolution attempted: the existing
   "sound X not found" path stays. Augment the friendly-error message
   builder to mention "alias map: no entry for `xyz`" when the user's
   identifier didn't resolve via alias either. One-liner in the doc-lookup
   step.

**Verdict: one-line additions** on both paths. No deep refactor. Defer the
"suggest a close alias via fuzzy match" UX to a γ+1 follow-up; existing
`detect.alias` per-doc CommonMistake handling already covers most fuzzy cases.

---

## 7. Boundary scan — what we still don't know

Open questions for the PLAN pre-mortem:

1. **`Pattern.prototype.piano` injection ordering vs Stave's `.p()` setter trap
   (P2).** Upstream `prebake.mjs:165` assigns
   `Pattern.prototype.piano = function(){…}` at boot. Stave's
   `injectPatternMethods` (per UV2, P2 in hetvabhasa) overwrites prototypes
   during `evaluate()`. If we vendor `piano.mjs`, when does the assignment
   fire — boot, or every eval? Boot is correct (upstream behavior); confirm
   `.p()` setter trap doesn't strip it. (Likely safe: the trap is on `.p`,
   `.viz`, and legacy viz names — `.piano` isn't in that list.) **VERIFY in α.**

2. **`tidal-drum-machines` baseURL invariant.** Upstream sources are pinned at
   `https://strudel.b-cdn.net/…`. If b-cdn.net moves or expires, our parity
   corpus breaks silently (samples fail to load, IR shape still matches → smoke
   test passes, but `s("RolandTR909")` produces no audio). D-01 (structural
   parity) explicitly does NOT catch this. **Document as accepted risk; flag
   for monitoring.**

3. **`.bank()` shape after α-wave.** After loading `tidal-drum-machines.json` +
   `aliasBank(tidal-drum-machines-alias.json)`, does `.bank("tr909")` produce
   the same IR shape on Stave as upstream? Need to eval one tune (`flatrave`)
   in both to verify. **Mark γ-wave as "first sample tune that exercises bank
   must pass on first run."**

4. **Pre-init alias lookup race.** Strategy A reads `soundMap.get()[name]` at
   trigger time. But the alias is in our hand-rolled TS const. What if a user
   `samples(...)` call registers a sound with the SAME name as one of our
   aliases? Strategy A's guard (`!soundMap.get()[rawS]`) deferring to upstream
   wins is correct — user-registered names override our alias. Document this
   precedence in `aliases.ts` header.

5. **`settingPatterns` first arg.** Upstream `loadModules()` passes
   `settingPatterns` as the FIRST arg to `evalScope` (util.mjs:97). This is a
   module-shape object exporting setting-bound pattern functions. Stave doesn't
   currently expose this. **Audit `settings.mjs:settingPatterns` — likely
   audio-pure adds.** Low-priority but a real gap.

6. **Codemirror-specific globals.** `@strudel/codemirror` registers
   `highlightHaps` and other globals that user code might reference. If a
   corpus tune (unlikely) depends on a codemirror-exported global, parity
   fails. Out of scope; flag if it surfaces.

7. **Audio-pure-but-heavy boundary case.** `@strudel/xen` is currently loaded
   (Stave) — 2.47 MB. Defensible: it's audio-pure (no permission), already
   shipping, and removing it breaks current code. `@strudel/tidal` is the same
   shape (audio-pure, heavy) but NOT shipping — defensible to gate behind
   `tidal` flag. The line is "is it already in the bundle?" not "is it audio
   pure?" Document this decision rule in α SUMMARY.

---

## 8. Boundary scan summary (cognitive)

Boundaries crossed by this phase, with silent-failure modes:

| Boundary | Silent-failure mode | Mitigation |
|---|---|---|
| `StrudelEngine` ↔ upstream `@strudel/*` | new register* in upstream we don't mirror = silent gap | corpus smoke test (γ); refresh script flags adds |
| Engine init ↔ user-eval'd globals | tier flag toggled but not re-init = stale globals | "reload required" copy on toggle |
| `EditorSettingsModal` ↔ engine init | settings snapshot read at boot only | mid-session toggle requires reload; document explicitly |
| Corpus snapshot ↔ live upstream | corpus drifts; smoke test passes against stale shape | refresh PR cadence in CORPUS-SOURCE.md |
| Alias map ↔ user `samples(…)` calls | user shadows an alias key | Strategy A guard: `!soundMap.get()[name]` defers to upstream |
| `Pattern.prototype.piano` ↔ Stave's `.p()` setter trap (P2) | trap strips the injected method | confirm `.piano` not in `legacyVizNames`; observe in α |

Known invariants respected:
- **UV2** (Framework Prototype Sovereignty) — α-wave does not add prototype
  installers; β-wave's `.piano` injection mirrors upstream's boot-time install,
  no per-eval re-install.
- **UV3** (Pipeline Argument Transformation) — Strategy A reads the post-reify
  `hap.value.s` which is always a string by the time superdough sees it.

Known error patterns respected:
- **P1** (transpiler reification) — Strategy A intercepts AFTER reify; sees the
  resolved string.
- **P2** (injectPatternMethods overwrite) — α adds NO prototype installs; β's
  `.piano` install is boot-time (mirrors upstream — outside the evaluate-time
  trap zone).
- **P11** (re-applied registrations) — `evalScope` is idempotent
  (`evaluate.mjs:37–51` — just `globalThis[name] = value` per export). New
  `register*` calls are mostly idempotent (`registerSound` does
  `soundMap.setKey` which overwrites). Safe to call repeatedly.
- **P62** (transpiler quote rewriting) — corpus tunes use double quotes
  intentionally; Strategy A operates downstream of reify, so it's a non-issue
  here. Document for future maintainers.

Krama (lifecycle) preserved (per `feedback_strudel_init.md`):
- α additions slot at the **same lifecycle stage** as their current siblings:
  - `@strudel/edo`, `@strudel/mondo` → inside the `Promise.all` at
    StrudelEngine.ts:129–137
  - Sample manifests → after `registerSoundfonts`, before the
    `loadedSoundNames` snapshot
  - `aliasBank` JSON fetch → after all sample manifests resolve
  - `Pattern.prototype.piano` injection → after `Pattern` is in `globalThis`
    (i.e., after `evalScope`)

---

## 9. References

Codeberg (upstream-pinned SHA `f73b395648645aabe699f91ba0989f35a6fd8a3c`):

- `website/src/repl/util.mjs:68-98` — `loadModules()` evalScope set.
  https://codeberg.org/uzu/strudel/raw/branch/main/website/src/repl/util.mjs
- `website/src/repl/prebake.mjs:1-174` — sample manifest + `aliasBank` + piano.
  https://codeberg.org/uzu/strudel/raw/branch/main/website/src/repl/prebake.mjs
- `website/src/repl/useReplContext.jsx:44-46,148` — boot orchestration + default
  pattern. https://codeberg.org/uzu/strudel/raw/branch/main/website/src/repl/useReplContext.jsx
- `website/src/repl/tunes.mjs` — 32 example tunes.
  https://codeberg.org/uzu/strudel/raw/branch/main/website/src/repl/tunes.mjs
- `packages/core/evaluate.mjs:37-51` — `evalScope` idempotence proof.
  https://codeberg.org/uzu/strudel/raw/branch/main/packages/core/evaluate.mjs
- `packages/superdough/superdough.mjs:61-170` — `registerSound`, `aliasBank`,
  `aliasBankMap`, `soundAlias`, `getSound`.
  https://codeberg.org/uzu/strudel/raw/branch/main/packages/superdough/superdough.mjs
- `packages/superdough/sampler.mjs:291` — `onTriggerSample` (alias resolution
  read-site for Strategy A).
  https://codeberg.org/uzu/strudel/raw/branch/main/packages/superdough/sampler.mjs

npm registry (size metadata):
- `https://registry.npmjs.org/@strudel/csound/latest`
- `https://registry.npmjs.org/@csound/browser/latest`
- `https://registry.npmjs.org/@strudel/tidal/latest`
- (and remaining packages enumerated in §1b)

Strudel CDN:
- `https://strudel.b-cdn.net/tidal-drum-machines-alias.json` — 1.7 KB, 69 entries
  (Roland*/Korg*/Yamaha*/etc. → short name).

Local files:
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/editor/src/engine/StrudelEngine.ts:121-180` — current init.
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/editor/src/engine/StrudelEngine.ts:207-234` — `wrappedOutput` (Strategy A insertion site).
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/editor/src/engine/friendlyErrors.ts:227-306` — `detect.alias` (orthogonal to phase aliases).
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/app/src/components/EditorSettingsModal.tsx` — tier flag UI insertion site.
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/.anvi/hetvabhasa.md` — P1, P2, P11, P62 catalogue entries referenced.

Catalogue cross-refs:
- P1 (`hetvabhasa.md:42`) — Strudel Transpiler Reification.
- P2 (`hetvabhasa.md:47`) — Strudel injectPatternMethods Overwrite.
- P62 (`hetvabhasa.md:1530`) — Strudel transpiler quote-rewriting.
- `feedback_strudel_init.md` — krama (init order).
- `feedback_editor_watch_mode.md` (PV48) — `pnpm --filter @stave/editor dev` MUST run during work on this phase.
