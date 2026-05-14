---
phase: 20-14
title: Strudel.cc parity — eval-scope mirror + alias layer
created: 2026-05-14
decisions: 4
closes: "#110"
---

# Phase 20-14 — Strudel.cc Parity

## Goal

Any code that runs on strudel.cc should run on Stave with the same audible +
visual result. Closes the silent-gap class surfaced by 20-12's manual gate
(`s("piano")` failing because Stave registers GM names as `gm_piano` and there
is no bare-name alias).

Three waves anticipated:

- **α — Bootstrap mirror.** Read upstream `tidalcycles/strudel` REPL init,
  enumerate every `evalScope` / `samples()` / `register*()` call, copy into
  `StrudelEngine.init()` with tier flags for heavy modules.
- **β — Alias layer.** Curated alias map (`piano → gm_piano`, `kick → bd`, etc.)
  consulted before `soundMap.get()` reports a miss. Closes the most painful UX gap.
- **γ — Parity smoke test corpus + CI gate.** 10-20 canonical strudel.cc
  examples vendored at a pinned upstream SHA, asserted on every PR.

## Locked Decisions

### D-01: Parity rung — structural only for v1

**Decision:** Smoke test asserts **IR shape + event count + param keys** match
after eval. No scheduler-time comparison. No waveform comparison.

**Rationale:** Three rungs (structural / schedule / audible). Structural is the
cheapest reliable signal — deterministic, no audio rendering, drift surfaces as
IR shape difference. Schedule + audible parity have well-known fragility:
floating-point sample-rate edges, AudioWorklet timing variance, OfflineAudioContext
divergence from live. Defer schedule (B) to a future phase once we have a stable
shape gate; defer audible (C) unless real drift surfaces that structural can't catch.

**Implication:** The CI gate is a vitest spec, not a Playwright spec. Eval each
corpus example through Stave's pipeline → IR → assert shape against a snapshot
captured from the same example. Updates to the corpus require regenerating
snapshots (intentional — that's the "drift moment").

---

### D-02: Alias source — hand-curated TS const

**Decision:** Maintain alias map as a TypeScript constant
(`packages/editor/src/engine/aliases.ts`), ~20-50 entries, imported by
`StrudelEngine` and consulted **before** `soundMap.get()` reports a miss.

**Rationale:** Three alternatives (curated / generated-from-upstream / runtime
JSON fetch). Hand-curated wins on explicitness and reviewability — every alias
is a deliberate choice, easy to grep, easy to extend in a PR. Drift risk is
real (upstream adds a name we don't alias) but is caught by the D-04 corpus
smoke test, not silently shipped to users. Generated-from-upstream creates a
build-time coupling to strudel.cc's internal registration script structure
(brittle through their refactors). Runtime fetch introduces a network
dependency on engine boot.

**Implication:** The alias resolution lives at `s()` call interception point,
not as a soundMap mutation. Two reasons: (1) keeps `loadedSoundNames`
honest for autocomplete (don't pollute it with alias keys), (2) preserves the
"GM names are GM names" invariant for advanced users who want to address them
directly.

---

### D-03: Tier policy — settings panel toggle

**Decision:** Heavy modules (`@strudel/csound`, `@strudel/midi` with
`enableWebMidi`, `@strudel/osc`, `@strudel/serial`, additional soundfont packs
beyond GM) are **off by default**. Each gets a toggle in `EditorSettingsModal`.
Toggles persist via the workspace's existing settings store. `StrudelEngine.init()`
reads the settings snapshot at boot and conditionally `await import()`s + registers.

**Rationale:** Four alternatives considered (settings / per-file directive /
both / build flag). Settings panel wins on UX clarity for the 90% case — a one-time
opt-in, no per-program ritual, boot cost stays low for users who never touch
Csound/MIDI. Per-file directive (B) is closer to Strudel's own idioms (`await samples(...)`,
`await initHydra()`) and matches the spirit of "any program that runs on strudel.cc
runs on Stave" — but it forces a runtime layer change for every imported module,
which is α-wave scope creep. Option C (both) is a logical v2 once settings are
in place — defer.

**Implication:**
- α-wave registers all **audio-pure** modules unconditionally (current 7 modules
  + any audio-only additions enumerated from upstream).
- α-wave introduces the tier flag schema in settings; flags default OFF; init
  reads them at boot.
- β-wave threads MIDI / OSC behind their flags (already partially wired —
  `enableWebMidi()` is intentionally NOT called at init, per comment in
  StrudelEngine.ts:141-142).
- Per-file directive deferred to a follow-up issue. Note the decision in
  α-wave SUMMARY so future-us doesn't re-litigate.

---

### D-04: Parity corpus — vendor 10-20 examples with upstream-SHA pin

**Decision:** Copy canonical examples from `tidalcycles/strudel/website/src/examples/`
(or equivalent) into `packages/app/tests/parity-corpus/`. Record the upstream
commit SHA in a `CORPUS-SOURCE.md` alongside. Refresh manually when upstream
moves and the maintainer wants to re-verify parity.

**Rationale:** Three alternatives (vendor with SHA pin / live fetch at CI /
author own corpus). Vendor + SHA wins because:
- No network at CI time — deterministic, fast, no rate-limit risk.
- Explicit drift moments — refresh requires a PR, which documents the parity
  surface as it evolves.
- Authoritative — these are the examples strudel.cc users see; passing them
  is the strongest signal we provide parity.

Live fetch is fragile (CI network flake, upstream availability). Stave-owned
corpus loses the authoritativeness argument — we'd be testing what we think
parity means, not what upstream demonstrates.

**Implication:**
- α-wave creates the corpus directory + CORPUS-SOURCE.md with initial SHA.
- γ-wave writes the vitest spec that loads each `.strudel` file, evals through
  Stave's pipeline, asserts IR shape against a snapshot.
- A separate `pnpm parity:refresh` script (γ-wave) re-fetches upstream and
  diffs — surfaces upstream changes for review but does NOT run on PRs.

---

## Scope Boundary

**In scope (v1):**
- Audit upstream REPL init + enumerate calls (α-wave research output).
- Mirror missing audio-pure registrations into `StrudelEngine.init()`.
- Alias map + interception layer at `s()` call site.
- Tier flag schema in settings + UI toggles in `EditorSettingsModal`.
- Parity corpus + vitest smoke test + CI gate.
- A single Ground Truth doc traceable to the upstream init path (created as
  part of α-wave if absent).

**Out of scope (v1, queued for follow-ups):**
- Bakery UI (sample-pack sharing) — separate phase, eval parity ≠ UI parity.
- Per-file `await tier(...)` directive — D-03 part B; v2 once settings ship.
- Csound bundle by default — opt-in only via the tier flag.
- Schedule-time parity (parity rung B) — defer until structural surfaces drift
  that shape can't catch.
- Audible parity (parity rung C) — same.
- Migration of existing GM-name code in user files (no breaking changes — bare
  names work via alias, gm-prefixed names continue to work too).

## Codebase Context

**StrudelEngine.init()** — `packages/editor/src/engine/StrudelEngine.ts:121-180`
- Current init order: dynamic imports → `evalScope` → `miniAllStrings` →
  transpiler → `initAudio` → `registerSynthSounds` → `registerZZFXSounds` →
  `registerSoundfonts` → `samples('github:.../Dirt-Samples/master')` →
  analyser tap + onTrigger fan-out.
- Comments at 141-145 already document `enableWebMidi()` not being called +
  `@strudel/draw` intentional exclusion — established pattern of explicit
  opt-out documentation. β-wave's tier comments should match this style.
- `loadedSoundNames` (line 179) is the autocomplete source — D-02 keeps it
  honest by aliasing at call site, not by polluting `soundMap`.

**Settings infrastructure** — `packages/app/src/components/EditorSettingsModal.tsx`
- Existing modal hosts editor preferences (track row height, etc. per
  `layoutTrackRows.ts:97`). Tier toggles plug in here.
- Settings persistence already wired through workspace's existing store
  (review during α-wave research; document in RESEARCH.md).

**Friendly errors** — `packages/editor/src/engine/friendlyErrors.ts:240,269`
- The alias resolution layer interacts with friendly-error detection (an
  unknown sound name currently produces a friendly hint). After β-wave the
  hint flow should reflect "tried alias `kick` → resolved to `bd`" or "tried
  alias `xyz` → no match, no alias".
- Pre-existing fuzzy-match (`detect.alias` field) is separate from the new
  curated alias layer — different intent (suggestion vs. resolution).

**Discovery memory** — `feedback_strudel_init.md`
- Required init sequence: `evalScope` → `miniAllStrings` → `registerSynthSounds`
  → `transpiler`. α-wave must preserve this order when adding new
  `register*()` calls from upstream — likely they slot AFTER the existing
  registrations, not before.

## Anticipated Gray Areas (Pre-α)

These don't need user input now but should surface in α-wave RESEARCH:

- **Upstream init path discovery.** Where exactly is strudel.cc's REPL
  bootstrap? `tidalcycles/strudel/website/src/repl/` is the educated guess but
  needs verification. May be split across multiple files. May have changed
  recently.
- **Csound footprint.** Confirm the WASM size + whether it's tree-shakeable at
  all (some WASM modules are monolithic). If it's ~5MB unshakable, tier toggle
  is non-negotiable; if smaller / shakeable, revisit default.
- **MIDI permission UX.** `enableWebMidi()` triggers a browser permission
  prompt. β-wave needs to decide if the settings toggle calls it immediately
  on enable (early prompt) or lazily on first MIDI op (late prompt). User-facing
  decision — surface in β-wave's discuss-phase if it makes it that far.
- **soundMap mutation timing.** Some upstream `register*()` calls may mutate
  `soundMap` after init returns. If alias layer caches the keyset, it gets stale.
  α-wave research: confirm whether alias resolution must be a live lookup or
  can snapshot.

## Catalogue Pointers

- `hetvabhasa.md` P11 — re-applied registrations can throw or no-op silently.
  α-wave's new `register*()` calls must be idempotent or guarded.
- `hetvabhasa.md` P62 — Strudel transpiler quote-rewriting. Confirmed gotcha;
  parity examples that use string args must use single quotes — corpus
  curation must respect this.
- `feedback_strudel_init.md` — exact init-sequence ordering rule (above).
- `feedback_editor_watch_mode.md` PV48 — when iterating on StrudelEngine.ts
  during this phase, `pnpm --filter @stave/editor dev` MUST run.

## Wave Plan (Preview — Detailed in PLAN.md)

| Wave | Output | User-facing? |
|---|---|---|
| α | Bootstrap mirror: missing register calls + tier flag schema | No (engine boot only) |
| β | Alias layer + EditorSettingsModal tier toggles + friendly-errors integration | Yes (toggles + alias-resolution hint) |
| γ | Parity corpus + vitest smoke test + CI gate + refresh script | No (CI infra) |

## Verification Gate Sketch (For PLAN.md)

- **α gate:** Init succeeds with all audio-pure upstream registrations; tier
  flags default off; engine boots in ≤ previous boot time + 100ms.
- **β gate:** `s("piano")` plays a piano; `s("kick")` plays a kick. Settings
  toggles persist across reloads. Friendly errors mention the alias path on miss.
- **γ gate:** All vendored corpus examples eval to stable IR; vitest spec runs
  in CI; refresh script surfaces upstream diff without running on PRs.

## Open Items Carried Forward

- File a follow-up issue for the per-file `await tier(...)` directive (D-03
  part B) when α lands.
- File a follow-up issue for schedule-parity / audible-parity if drift
  surfaces structural can't catch (D-01 rungs B/C).
- Document the corpus-refresh cadence in CORPUS-SOURCE.md (proposed: every
  upstream minor version OR when a Stave user reports a parity gap).
