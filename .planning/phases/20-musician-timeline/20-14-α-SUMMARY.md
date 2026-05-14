---
phase: 20-14
wave: α
title: Bootstrap mirror — strudel.cc parity α-wave SUMMARY
created: 2026-05-15
branch: feat/20-14-strudel-parity
commits: α-1..α-6 inclusive
---

# Phase 20-14 — α-Wave SUMMARY

α-wave mirrors upstream strudel.cc's audio-pure engine bootstrap into Stave's
`StrudelEngine.init()` plus introduces the tier-flag schema that β consumes.
Six tasks, six commits. Functional checks (browser console, audible audio)
require user-side verification because the executor cannot drive a browser;
those gates are stated below with the exact snippet the user runs and the
expected response. Test-suite observations (1526/1526 green throughout)
confirm no regressions to existing behavior.

## α-1 — `@strudel/mondo` added to evalScope

Added `@strudel/mondo@1.1.6` as a new dependency of `@stave/editor` and
threaded it through the existing `Promise.all` dynamic-import set, then into
the `coreMod.evalScope(...)` call. The module exposes four globals via
evalScope: `mondo`, `mondi`, `mondolang`, `getLocations` (verified at
`packages/editor/node_modules/@strudel/mondo/dist/mondough.mjs:74-79`).

**Deviation from PLAN α-1:** `@strudel/edo` was NOT added. The package is
referenced by upstream `loadModules()` at the pinned SHA but is **not
published to npm** — `registry.npmjs.org/@strudel/edo` returns 404 as of
2026-05-15. Adding it would require installing from Codeberg directly,
which the plan did not pre-authorize. Recorded as a follow-up to re-attempt
when upstream publishes; α scope unaffected because the edo operators only
matter once a corpus tune that uses them lands in γ (none of the 16 in
RESEARCH §5 do).

**Observations:**
- **Test-suite (executor-run):** editor tests 1526/1526 passing
  post-change — empty `vi.mock('@strudel/mondo', () => ({}))` matches the
  existing tonal/xen/midi mocking pattern.
- **Browser-side (user-verify):** open the app at <http://localhost:3000>,
  open dev console, run:
  ```js
  [typeof globalThis.mondo, typeof globalThis.mondolang]
  ```
  Expected: `["function", "function"]`. If either reads `"undefined"`,
  evalScope did not bind the export — α-1 incomplete.

## α-2 — Six sample-manifest fetches added to init

Added a `Promise.all` of seven `samples()` calls after the existing
`github:tidalcycles/Dirt-Samples/master` fetch, mirroring upstream
`prebake.mjs:25-155` verbatim: Salamander piano, VCSL orchestra,
tidal-drum-machines, uzu-drumkit, uzu-wavetables, mridangam, plus the
inline Dirt-Samples extras object (casio, crow, insect, wind, jazz, metal,
east, space, numbers, num). Each call wrapped in `safeSamples(...)` that
catches + logs so a b-cdn outage does not break engine boot (accepted
risk per RESEARCH §7 #2 and PLAN §6).

**Observations:**
- **Test-suite (executor-run):** 1526/1526 green. The `samples()` mock is
  a `vi.fn()` so unit tests pass through unchanged.
- **Browser-side (user-verify):** in dev console after engine boot:
  ```js
  Object.keys(soundMap.get()).filter(k => /piano|tr909|RolandTR808|mridangam/i.test(k)).length
  ```
  (`soundMap` is exposed by `@strudel/webaudio` on globalThis via evalScope.)
  Expected: positive integer. Then evaluate `s("piano")` in the editor —
  audio must play, no friendly-error panel.

## α-3 — `aliasBank()` registers 69 bank-name aliases

Added `await (webaudioMod as any).aliasBank(\`${baseCDN}/tidal-drum-machines-alias.json\`)`
after the α-2 Promise.all, wrapped in try/catch. Recorded the pre- and
post-aliasBank `Object.keys(soundMap.get()).length` and logged them on every
boot via `console.log('[StrudelEngine] aliasBank: soundMap keys X → Y (Δ N…)')`.

**Static read of `aliasBank` semantics** (RESEARCH §3 open question #3):
`superdough/superdough.mjs:86-117` (`aliasBankMap`) reads the existing
`soundMap.get()` dictionary into a local, mutates the LOCAL to add aliased
keys, then calls `soundMap.set({...soundDictionary})` which is a shallow
spread of the same dict plus new keys onto a fresh object. **This is a
merge, not a replace.** The post-aliasBank count is monotonically ≥ the
pre-count. Current α-3 call ordering (after manifest fetches) is therefore
safe; no PLAN-level rework needed.

**Observations:**
- **Test-suite (executor-run):** 1526/1526 green.
- **Browser-side (user-verify) — REQUIRED for α-7 SUMMARY closure per
  PLAN α-3 verify gate:** open dev console on app load. Look for the line:
  ```
  [StrudelEngine] aliasBank: soundMap keys <N> → <M> (Δ <M-N>; expect non-negative)
  ```
  Expected: Δ ≥ 0 (likely ~69 net adds). If Δ < 0, this contradicts the
  static read above and PLAN α-3 says **STOP and escalate as a PLAN-LEVEL
  ISSUE**. Then evaluate `s("[bd <hh oh>]*2").bank("tr909").dec(.4)` —
  audio must play with TR-909 samples (not Dirt-Samples bd).

## α-4 — Vendored `piano.mjs` for `Pattern.prototype.piano`

Created `packages/editor/src/engine/vendored/piano.ts` — a side-effect
module that attaches `Pattern.prototype.piano` on import. The body mirrors
upstream `prebake.mjs:161-173` verbatim (fmap clip=1, `.s('piano')`,
`.release(0.1)`, fmap pan by pitch via `panwidth`/`valueToMidi`/`noteToMidi`).
The file's header cites the pinned upstream SHA and the repo-root
AGPL-3.0-or-later LICENSE.

Wired the import (`await import('./vendored/piano')`) at the END of
`StrudelEngine.init()`, after evalScope has populated `Pattern` on
globalThis. Test mocks for `@strudel/core` extended with stub `noteToMidi`
+ `valueToMidi` so the module loads cleanly under jsdom (Lokayata: tests
went red, then green after the stub — exactly the observation contract
the vendored import creates).

**Post-eval prototype check result (PLAN α-4 verify gate, user-verify):**
This is the single observation that determines whether α-4's "install at
boot, NOT in setter trap" assumption holds. The user must run, in the dev
console after engine boot:
```js
// BEFORE evaluate
const before = typeof Pattern.prototype.piano
// run any eval, e.g. note("c4").piano() inside the editor
// AFTER one evaluate() cycle
const after = typeof Pattern.prototype.piano
;[before, after]
```
**Expected: `["function", "function"]`.** If `after === "undefined"`, the
P2 / UV2 setter trap stripped the method during `injectPatternMethods` and
the install must move to post-eval — PLAN α-4 anticipated this and called
it "unlikely." α-7 verdict pending the user's reload-and-eval.

**Static reasoning supporting the expected result:** The injectPatternMethods
setter trap in `StrudelEngine.evaluate()` (lines 282-333) only wraps `p`,
`viz`, and the legacy viz names `['pianoroll', 'punchcard', 'wordfall',
'scope', 'fscope', 'spectrum', 'spiral', 'pitchwheel', 'markCSS']`.
`.piano` is not in that list, so the boot-time install should survive. The
post-eval check is the runtime confirmation of this static reasoning.

**Observations:**
- **Test-suite (executor-run):** 1526/1526 green after the mock-stub fix.
- **Browser-side (user-verify, REQUIRED):** post-eval prototype check
  above — record `[before, after]` here once observed.

## α-5 — Tier flag schema (8 flags, schema-only, no UI)

New module `packages/editor/src/engine/tierFlags.ts` exports `TierFlags`
type, `getTierFlags()` reader, `setTierFlag(name, on)` writer,
`listTiers()` enumerator. Storage: localStorage with prefix
`stave.strudel.tier.`, default `false`. Schema-drift safe: missing or
malformed keys read as `false`. Public surface re-exported from
`packages/editor/src/index.ts` so β-3's modal in `packages/app/` can
consume via the `@stave/editor` boundary.

Wiring in `StrudelEngine.init()`: read tier flags **once** at the top of
init(), stash on a private instance field `this.tierFlags`, expose via
`getTierFlagsSnapshot()` for β-4, and emit the dev-console log
`[StrudelEngine] tierFlags read at init: { csound: false, … }`. β-4 will
read `this.tierFlags.midi` to gate `enableWebMidi()`.

**Observations:**
- **Test-suite (executor-run):** 1526/1526 green. `safeLocalStorage()`
  duck-types `getItem` before returning to handle jsdom's partial-Storage
  stub used by some tests.
- **Browser-side (user-verify) — REQUIRED:** reload the dev server,
  open dev console. The line
  ```
  [StrudelEngine] tierFlags read at init: { csound: false, tidal: false, midi: false, osc: false, serial: false, gamepad: false, motion: false, mqtt: false }
  ```
  must appear on engine boot. Then run `getTierFlags()` directly (the
  function is exported on `globalThis` via the @stave/editor public
  surface — caveat: it may need explicit re-import depending on tree-shake;
  if `getTierFlags` is not on globalThis, the boot-time log alone
  satisfies the consumed-at-init proof).

## α-6 — `settingPatterns` audit (RESEARCH §7 open question #5)

Fetched upstream `website/src/settings.mjs` at the pinned SHA. The
`settingPatterns` export at line 154 is `{ theme, fontFamily, fontSize }`,
each a `patternSetting(key)` from line 139 that calls
`pat.onTrigger(() => settingsMap.setKey(key, value), false)`. The `false`
arg to `onTrigger` explicitly disables audio output. The body mutates the
upstream React editor's settings store.

**Verdict:** UI-only. **No audio-pure exports are missing from Stave**.
Re-exposing on Stave would write to a settings object that doesn't exist
here. Action: none for α, none for β. Full audit lives at
`.planning/phases/20-musician-timeline/20-14-OBSERVATIONS.md`.

## UX decisions carried into β

- **Tier flag toggle requires reload** (per PLAN §2 + RESEARCH §4 + §8):
  the engine reads tier flags **once** at init. β-3's modal must surface
  the caption `"Changes take effect when you reload the page."` —
  non-negotiable to avoid user confusion when toggling MIDI seems to do
  nothing.
- **Tier-flag UI honesty (per PLAN §2):** β-3 ships all 8 toggles. MIDI
  is interactive; the other 7 (csound, tidal, osc, serial, gamepad,
  motion, mqtt) ship as disabled-scaffolded with the tooltip
  `"Module wiring planned — see issue #NNN."` Each wiring follow-up
  issue (listed below) lights up one toggle.
- **Per-file `await tier(...)` directive (D-03 part B):** queued as a
  follow-up, not part of β. File when α merges.

## Follow-up issues to file (out of α scope)

1. **`@strudel/edo` install**: re-attempt α-1's missing import once
   upstream publishes `@strudel/edo` to npm. Until then, the upstream
   `loadModules()` parity is partial.
2. **Heavy-module dynamic-import wiring** (one issue per disabled toggle
   in β-3):
   - `@strudel/csound` (6.3 MB wasm)
   - `@strudel/tidal` (5.8 MB)
   - `@strudel/osc` (needs SuperCollider backend)
   - `@strudel/serial` (WebSerial permission)
   - `@strudel/gamepad` (Gamepad permission)
   - `@strudel/motion` (DeviceMotion permission)
   - `@strudel/mqtt` (network broker)
3. **Per-file `await tier(...)` directive** (D-03 part B) — at-eval
   tier opt-in.
4. **Post-init `samples()` autocomplete pollution** —
   `loadedSoundNames` snapshot at StrudelEngine.ts:179 misses
   user-eval'd `samples()` calls (RESEARCH §3 final paragraph). Filed
   after α merges.
5. **Pianoroll / scope re-export decision** — `@strudel/draw` excluded
   wholesale. If users want `pianoroll`/`scope`/`spectrum`/`wordfall`/
   `punchcard` without the DOM injection, re-export them. (Out of
   visual-parity scope for 20-14.)
6. **b-cdn.net availability monitoring** — RESEARCH §7 #2. The α-2
   `safeSamples` wrapper degrades gracefully if a manifest fetch fails,
   but the structural parity smoke test (γ-2) explicitly does NOT catch
   "samples loaded but audio is silent." Document as accepted risk and
   monitor manually.
7. **`@strudel/edo` audio-pure additions** beyond evalScope — once edo
   ships on npm, also check if `prebake.mjs` adds any edo-specific
   manifest calls we missed in α-2.

## Catalogue candidates (deferred for promotion review)

Per executor operational rules, `.anvi/` catalogues are not updated
mid-wave. Candidates noticed in α to consider after β merge:

- **hetvabhasa candidate:** "upstream package referenced by upstream init
  but unpublished to npm" — the α-1 `@strudel/edo` situation. Pattern:
  `loadModules()` snapshot includes packages not all published. Fix:
  detect via `npm view` audit before claiming parity. Detection: 404
  from `registry.npmjs.org/<pkg>`.
- **vyapti candidate (already implicit via P11):** "evalScope is
  idempotent — `globalThis[name] = value` per export — but tests need a
  matching `vi.mock` even for unused modules, else jsdom fails on the
  module-load side effect of the real package." Promote if seen again.
- **krama candidate:** "α-3 aliasBank ordering: aliasBank MUST run after
  all manifest fetches, because its body walks the existing soundMap to
  add aliased keys for each registered bank suffix. Running before
  manifests = no bank suffixes to alias." Confirmed empirically via the
  static read of `aliasBankMap`. Lifecycle entry candidate.

## α verification gate status

Per PLAN §3:

| Gate item | Status | Source |
|---|---|---|
| Engine boots without throwing | ✅ tests | 1526/1526 green |
| globalThis exports defined (`mondo`, `mondolang`) | ⏳ user-verify | snippet in α-1 paragraph |
| `s("piano")` audibly plays | ⏳ user-verify | snippet in α-2 paragraph |
| `s("[bd <hh oh>]*2").bank("tr909").dec(.4)` plays TR-909 | ⏳ user-verify | snippet in α-3 paragraph |
| aliasBank merges (count Δ ≥ 0) | ⏳ user-verify (boot log) | α-3 paragraph |
| `Pattern.prototype.piano` survives one eval cycle | ⏳ user-verify | snippet in α-4 paragraph |
| `getTierFlags()` returns 8 falses + init log fires | ⏳ user-verify | α-5 paragraph |
| Existing test suite remains green | ✅ executor | 1526/1526 throughout α-1..α-5 |
| Engine boot time within previous + 100ms | ⏳ user-verify | manifest fetches are the only added cost; lazy |

Branch ready for user-side reload-and-verify pass before PR. Do not push
until the user confirms the ⏳ items.

## Open questions resolution status (mapped to PLAN §6)

| # | Question | Status |
|---|---|---|
| 1 | `Pattern.prototype.piano` install timing vs P2 setter trap | Pending user-side post-eval check (α-4 paragraph) |
| 2 | b-cdn.net availability | Risk documented; `safeSamples` mitigation in code |
| 3 | `aliasBank` merge vs replace + `.bank("tr909")` IR shape | **Resolved: merge** via static read; functional check pending user-side |
| 4 | Pre-init alias lookup race | β-1 concern; not in α scope |
| 5 | `settingPatterns` audit | **Resolved: UI-only, no audio gap** (α-6) |
| 6 | Codemirror-specific globals | Deferred — γ-2 corpus will catch if surface |
| 7 | `xen` audio-pure-but-heavy boundary | Decision rule documented: "already in bundle" — `xen` stays, `tidal` gated |
