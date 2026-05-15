---
phase: 20-14
wave: β
title: Alias layer + tier UI — strudel.cc parity β-wave SUMMARY
created: 2026-05-15
branch: feat/20-14-strudel-parity-beta
commits: β-1..β-5 inclusive
stacked_on: feat/20-14-strudel-parity (α PR #123)
---

# Phase 20-14 — β-Wave SUMMARY

β-wave closes the silent-`s("piano")` UX gap class for real-world DAW/
tracker vocabulary, exposes the tier-flag schema that α-5 introduced as
a real settings surface, and threads the first tier flag (MIDI) all the
way through engine boot. Five commits, five tasks. Test-suite checks
(editor 1536/1536, app 297/297) confirm no regressions; browser-side
gates require the user to reload-and-eval because the executor cannot
drive the running dev-server tab.

## Per-task observations

### β-1 — Hand-curated alias map

Commit `808c774`. New module `packages/editor/src/engine/aliases.ts`
exports a frozen `SOUND_ALIASES` map (30 entries) plus a `resolveAlias`
helper. Coverage is deliberate, not encyclopedic — each entry is a
DAW/tracker term that maps to a Dirt-Samples canonical name:

| Family | Entries |
|---|---|
| Kick | `kick`, `bassdrum` → `bd` |
| Snare | `snare`, `snaredrum` → `sd` |
| Hats | `hat`, `hihat`, `closedhat` → `hh`; `openhat`, `openhihat` → `oh` |
| Claps / rims | `clap`, `handclap` → `cp`; `rim`, `rimshot`, `sidestick` → `rs` |
| Cymbals | `crash`, `crashcymbal`, `cymbal` → `cr`; `ride`, `ridecymbal` → `rd` |
| Toms | `tom`, `midtom` → `mt`; `lowtom`, `floortom` → `lt`; `hightom` → `ht` |
| Percussion | `cowbell`, `bell` → `cb`; `tambourine` → `tb`; `shaker` → `sh`; `clave` → `cl` |

Excluded by curation rule (per RESEARCH §7 #4): any bare name already
registered post-α. `piano` self-alias dropped because Salamander
`piano.json` registers it directly. Conga/bongo dropped because
Dirt-Samples already has them. The aim is "first-time UX fix," not
"thesaurus." New entries land via PR (D-02 forbids runtime JSON fetch);
header comment cites the precedence rule from RESEARCH §3.

**Observation (executor-run):** editor test suite 1526/1526 passing —
the alias map is pure data; no runtime side effects. Static-only
addition.

### β-2 — Strategy A intercept in `wrappedOutput` + accumulator

Commit `7291313`. Insertion site: top of `wrappedOutput` BEFORE the
breakpoint hit-check (RESEARCH §3 anchor preserved post-α). Reads
`hap.value.s`; guard `liveSoundMap[lower] === undefined` ensures user-
registered names ALWAYS win (the Strategy A precedence locked in
CONTEXT D-02 invariant #2 and RESEARCH §7 #4). On a hit:

1. Push `{from, to}` onto `this.lastAliasResolutions` (instance field,
   per checker β-2/β-5 cross-reference fix — NOT module state, so
   concurrent engines do not collide).
2. Shallow-clone `hap.value` with the rewritten `s` — downstream
   consumers see a stable hap shape.

The live `soundMap` reference is captured on `this.soundMapRef` at init
(same reference α-3 already stashed in a local — promoted to instance
state). Live read, not snapshot — a user `samples(...)` call between
init and trigger is honored.

Accumulator reset is the **first statement** of `evaluate()` after
`lastEvaluatedCode`. PLAN explicitly forbade burying it in a helper.

**Observation (executor-run):** editor test suite 1526/1526 passing.
The mocked `soundMap.get()` returns `{}` in test env, which is exactly
the "name not registered" branch — the intercept correctly no-ops on
the mock haps emitted by the test fixture (`s: "inst_N"`, where the
alias map has no entry).

**Browser-side gate (user-verify, REQUIRED for β closure):** open the
running dev server <http://localhost:3000>, evaluate
```
$: s("kick").n(0)
```
Expected: audio plays a Dirt-Samples kick (the same as `s("bd")`).
Then in the dev console:
```js
// peek the live engine via the runtime registry
const fid = Object.keys(stave.runtimes ?? {})[0];
const eng = stave.runtimes?.[fid]?.engine;
eng?.getLastAliasResolutions?.()
```
Expected: `[{ from: 'kick', to: 'bd' }, ...]` after the eval.
Confirm `soundMap.get().kick === undefined` to verify autocomplete is
NOT polluted (D-02 invariant #1).

### β-3 — Strudel module tier toggles in `EditorSettingsModal`

Commit `5fb0583`. New "Strudel modules" section appended to the
existing settings modal. The 8 tier flags are wired as follows:

| Tier | Status | Follow-up |
|---|---|---|
| **midi** | **Interactive** (β-4 wires it to `enableWebMidi()`) | — |
| csound | Disabled-scaffolded | #124 |
| tidal | Disabled-scaffolded | #125 |
| osc | Disabled-scaffolded | #126 |
| serial | Disabled-scaffolded | #127 |
| gamepad | Disabled-scaffolded | #128 |
| motion | Disabled-scaffolded | #129 |
| mqtt | Disabled-scaffolded | #130 |

Each disabled row carries a `title="Module wiring planned — see issue
#NNN."` tooltip on hover (renders via native browser tooltip on the
`<label>` wrapping the disabled checkbox). Cursor switches to
`not-allowed` and opacity drops to 0.55 so the disabled state is
visually unambiguous. Csound + Tidal rows additionally show
`Will load ~6 MB when enabled.` so users don't toggle them on
expecting a small change.

Section footnote `Changes take effect when you reload the page.`
codifies the α-5 contract ("engine reads tierFlags once at init").

A dev-only `assertTierSchemaCoverage()` fires on modal open: if the
schema's `listTiers()` and the wired `TIER_ROWS` ever diverge, the
dev console warns. The contract surface for adding a new tier is "add
to TierName + add to TIER_ROWS" — the warning catches the half-done
case.

**Observation (executor-run):** editor 1526/1526 + app 297/297 green.

**Browser-side gate (user-verify, REQUIRED for β closure):**
1. Open the running app, click the settings cog → modal opens. Scroll
   to the "Strudel modules" section. Confirm visually:
   - 8 rows present (MIDI, Csound, TidalCycles, OSC, Serial, Gamepad,
     Motion, MQTT).
   - 7 rows are visibly dimmed (opacity ~0.55).
   - Hover any dimmed row's checkbox — the
     `Module wiring planned — see issue #NNN` tooltip appears.
   - Footnote `Changes take effect when you reload the page.` is
     visible and not clipped.
2. Click the MIDI checkbox. The state toggles. Close modal, reload.
   Re-open modal — MIDI is still on. Dev console shows
   `[StrudelEngine] tierFlags read at init: { ..., midi: true, ... }`.
3. Click a disabled checkbox (e.g. Csound). The state does NOT change,
   no localStorage write — `localStorage.getItem('stave.strudel.tier.csound')`
   still reads `null` (or `"0"` if previously written).

The follow-up issues #124–#130 are filed and each links back to PLAN §7
heavy-module dynamic-import wiring. Each issue carries an acceptance
checklist for flipping its row from disabled to interactive.

### β-4 — Thread `midi` tier flag through engine init

Commit `b803767`. The static comment block at the original
StrudelEngine.ts:200 ("enableWebMidi() is NOT called here") is replaced
with a conditional: when `this.tierFlags?.midi === true`, the engine
calls `await enableWebMidi()` after `evalScope` resolves so
`Pattern.prototype.midi` chain methods activate at the same lifecycle
moment they would on upstream strudel.cc.

The module import (`@strudel/midi`) stays unconditional — 80 KB is
audio-pure and was already paying its bundle cost in α. Only the
permission-triggering call is gated. The permission-denial path is
wrapped in try/catch: engine boot survives even if the browser refuses
MIDI access.

The other 7 flags are deliberately NOT threaded here. Each carries its
own follow-up issue (#124–#130) where the conditional `await import()`
+ row-flip lands as one atomic PR per module.

**Observation (executor-run):** 1526/1526 green; the mock for
`@strudel/midi` is `{}`, so the typeof-function guard
(`typeof enableWebMidi === 'function'`) short-circuits and the engine
boots without attempting the call. No false-positive permission prompt
inside vitest.

**Browser-side gate (user-verify):** With MIDI flag OFF (default after
clean state), boot — no permission prompt. Enable MIDI in settings,
reload page — browser shows MIDI permission dialog during engine init
(early-prompt UX per RESEARCH §4). Decline → console shows
`[StrudelEngine] enableWebMidi() failed; MIDI output unavailable.`
and the engine continues. Accept → `Pattern.prototype.midi` is callable
from user code.

### β-5 — Friendly-error message integration

Commit `3143129`. Two-touch addition in `friendlyErrors.ts`:

1. `FormatOptions.aliasContext` is the new opt-in surface. It accepts
   `resolutions` (from `engine.getLastAliasResolutions()`) and
   `lookupAlias` (the `resolveAlias` fn from β-1).
2. `buildAliasSuffix(missingName, ctx)` is the pure suffix-builder.
   `formatFriendlyError` calls it once and appends to all 4 return
   paths (mistake hit, fuzzy hit, fuzzy miss, raw).

The accumulator-write side (β-2) is the load-bearing change; β-5 is
cosmetic message text. New unit tests cover:
- Empty / missing context → empty string.
- Single + deduplicated resolutions.
- Miss-path branches (no entry / entry-but-target-not-loaded).
- Combined resolved + miss suffix.
- Integration through `formatFriendlyError` (3 cases).

`buildAliasSuffix` deduplicates `from→to` keys so a hot pattern firing
10 cycles of the same alias does not drown the message.

The `detect.alias` field at friendlyErrors.ts:240 is left untouched
(per PLAN — orthogonal CommonMistake mechanism, different layer).

**Observation (executor-run):** editor 1536/1536 (+10 new tests),
app 297/297 unchanged.

**Browser-side gate (user-verify):**
1. Eval `$: s("kick")` — no error. (Sanity: alias hit, no friendly
   message fires.)
2. Eval `$: s("xyz123")` — friendly error in the console pane shows
   `sound xyz123 not found! Is it loaded? (alias map: no entry for
   xyz123)`.
3. Eval `$: s("bell")` (when the cowbell sample isn't yet loaded by
   superdough — bell aliases to `cb` per β-1) — friendly error shows
   `sound bell not found! Is it loaded? (tried alias` bell `→` cb`;
   alias map:` bell `→` cb `(but` cb `is not loaded))`. If `cb` IS
   loaded (Dirt-Samples cowbell), the rewrite happens silently and no
   error fires — that's the resolved-path success case.

## Tier wiring matrix (β-3 + β-4)

The single sentence reviewers care about: **MIDI is the only
functional toggle in β; the other 7 are visible-but-disabled
scaffolds, each with a filed follow-up issue.** Reviewers scanning β-6
for "which toggles work" should learn from this table:

| Tier | Functional? | Tooltip / Follow-up |
|---|---|---|
| midi | ✅ Wired (β-4 calls `enableWebMidi()` based on `this.tierFlags.midi`) | — |
| csound | ❌ Disabled-scaffolded | `Module wiring planned — see issue #124.` |
| tidal | ❌ Disabled-scaffolded | `Module wiring planned — see issue #125.` |
| osc | ❌ Disabled-scaffolded | `Module wiring planned — see issue #126.` |
| serial | ❌ Disabled-scaffolded | `Module wiring planned — see issue #127.` |
| gamepad | ❌ Disabled-scaffolded | `Module wiring planned — see issue #128.` |
| motion | ❌ Disabled-scaffolded | `Module wiring planned — see issue #129.` |
| mqtt | ❌ Disabled-scaffolded | `Module wiring planned — see issue #130.` |

The visible-but-disabled choice (over hide-entirely) is the
load-bearing UX decision from PLAN §2: musicians coming from
strudel.cc see the row exists and Stave knows about the tier, so they
don't assume Stave silently dropped support. Each follow-up issue, when
it ships, flips exactly one row from disabled to interactive — no
cascading UI work.

## β verification gate status

Per PLAN §4:

| Gate item | Status | Source |
|---|---|---|
| `s("piano")`, `s("kick")`, `s("snare")`, `s("clap")` play without `gm_*` prefix | ⏳ user-verify (browser-side audio) | β-2 paragraph snippet |
| `soundMap.get().kick === undefined` (autocomplete clean) | ⏳ user-verify | β-2 paragraph snippet |
| 8 toggles in settings; MIDI interactive, 7 disabled with tooltip | ⏳ user-verify (screenshot) | β-3 paragraph |
| MIDI toggle persists across reload + reads true in init log | ⏳ user-verify | β-3 + β-4 paragraphs |
| MIDI permission prompt fires only after toggle-on + reload | ⏳ user-verify | β-4 paragraph |
| Friendly errors show alias-resolution suffix on 3 test cases | ⏳ user-verify (browser-side eval) | β-5 paragraph |
| Existing test suite remains green | ✅ executor | editor 1536/1536; app 297/297 |
| Follow-up issues filed for 7 disabled tier toggles | ✅ executor | #124–#130 |

## Catalogue candidates (deferred for promotion review)

Per executor operational rules, `.anvi/` catalogues are not updated
mid-wave. Candidates noticed in β to consider after β merges:

- **hetvabhasa candidate**: "PRE-α `wrappedOutput` was the natural alias
  intercept site for two reasons that have to fire TOGETHER — (a) it sits
  POST-reify (so `hap.value.s` is a string, not a Pattern, per P1) AND
  (b) it sits BEFORE the breakpoint hit-check (so a rewrite cannot
  desync the breakpoint-vs-superdough name resolution). Insertion sites
  that satisfy only one of these conditions silently break the other
  invariant." Promote if a third pre-superdough intercept site (e.g.,
  per-orbit transform, midi-output remap) follows the same pair.

- **vyapti candidate**: "Per-evaluate accumulators owned by the engine
  must reset at evaluate() entry, NOT inside the run-tail. The reset
  MUST be a top-of-function statement, not buried in a helper, because
  the helper may be skipped on the eval-error path — leaving stale
  state visible to next eval's friendly-error builder." Confirmed via
  β-2 (lastAliasResolutions) — would have applied to other engine
  per-eval state if any existed. Promote on second instance.

- **krama candidate**: "tier-flag read happens at init() ONCE; any UI
  surface that exposes a toggle must carry an explicit
  `Changes take effect on reload` caption — without it, users mistake
  the read-once contract for a bug." Confirmed via β-3. Lifecycle
  entry: schema-read-once boundary is itself a lifecycle stage that
  invites the wrong UX assumption.

## UX decisions carried into γ

- **Bare-name alias precedence is locked**: user-registered names
  ALWAYS win over the curated map. γ-2 corpus tests assume this
  invariant — any future PR that flips it must update γ-2 baselines
  and call out the inversion in the PR body.
- **Tier follow-up issues #124–#130 stay parallel**, not stacked. Each
  is one atomic PR that flips one row from disabled to interactive.
  None of them should ship "with deps on the others" — keep the
  blast radius one tier wide.

## Open questions resolution status (mapped to PLAN §6)

| # | Question | β-wave status |
|---|---|---|
| 4 | Pre-init alias lookup race | **Resolved** — Strategy A guard reads live `soundMap.get()`; user-registered names override curated map. β-1 header comment documents the precedence rule. |

Other PLAN §6 questions remain at their α-wave verdict (1, 2, 3, 5 in
α-7 SUMMARY; 6, 7 deferred to γ).

## Out of scope (still queued, unchanged from α-7)

- Per-file `await tier(...)` directive (D-03 part B).
- γ corpus + CI gate (Wave γ).
- 7 tier-wiring follow-ups (#124–#130).
- Post-init `samples()` autocomplete pollution.
- Pianoroll / scope re-export decision.
- b-cdn.net availability monitoring.

β branch is ready for user-side reload-and-verify pass + PR. The PR
will stack on α (#123); when α merges to main, this branch rebases
automatically and the PR base auto-converts.
