---
phase: 20-14
wave: γ
title: Parity corpus + CI gate
created: 2026-05-15
closes: "#110"
gate: γ-verification-passed
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
---

# Phase 20-14 — γ-wave SUMMARY

**Closes #110.** This wave closes the user-visible `s("piano")` parity gap
opened by 20-12's manual gate. α loaded the upstream manifests, β lit up
the bare-name path, and γ now gates regression with a 16-tune structural
parity corpus that runs as part of `pnpm --filter @stave/app test`.

The γ PR body carries the actual `closes #110` keyword to GitHub.

## γ-1 — Vendored 16-tune corpus + CORPUS-SOURCE.md

Lokayata observation: `pnpm parity:refresh --sha
f73b395648645aabe699f91ba0989f35a6fd8a3c` reports `unchanged: 16,
changed: 0, missing: 0` against the same pin used to fetch — confirming
byte-faithful extraction across all 16 curated exports (no
hand-edits, no quote conversion, P62 trap explicitly avoided per PLAN
§2). The 16 tunes fan out across the parity surface table in
RESEARCH §5 (sample chop, FX, orbit, alias-required bare-names,
soundfonts, `.bank()`, `.piano()`, polyphony + voicing, polyrhythm,
metadata, arp/chord — see CORPUS-SOURCE.md for the per-tune line range +
surface column). `csoundDemo` deliberately omitted (heavy tier — PLAN §7
follow-up). No tune was missing from upstream at the pinned SHA; no
fabrication required.

## γ-2 — Vitest spec + IR-shape normalizer + seeded snapshots

Lokayata observation: `pnpm --filter @stave/app test` reports `Test
Files 15 passed (15), Tests 314 passed (314)` — a clean delta of
**+17 tests, +1 file** from the pre-γ baseline of 297/14 (1 sanity
gate + 16 per-tune tests). The spec lives at
`packages/app/tests/parity-corpus/parity.test.ts` next to its
fixtures; `vitest.config.ts` widens the `include` glob to pick up
`tests/parity-corpus/**/*.test.{ts,tsx}` so it runs under the existing
test invocation with no separate CI step (D-04 — live network forbidden
on PR CI).

**Parser-IR vs runtime-IR choice — and reasoning.** The spec asserts the
**parser-level `PatternIR`** from `parseStrudel(code)`, NOT the runtime
event stream. Reasoning, copied into CORPUS-SOURCE.md for posterity:
1. **Determinism.** `parseStrudel` is a pure structural matcher with no
   audio context dependency, no RNG, no scheduler. Same code → same IR.
   Runtime collection threads the scheduler whose seeding
   (`useRNG('legacy')`, `seededRandsAtTime`) is per-cycle and would
   require pinning a synthetic clock.
2. **Environment.** Vitest runs under jsdom. The runtime audio path
   needs `AudioContext` + `AudioWorklet` + `@strudel/webaudio`
   superdough — none of which boot in jsdom without heavy stubbing
   beyond the existing editor-side kabelsalat stub.
3. **What parity surfaces.** D-01 locks the rung at IR-shape level. The
   parser IR is the artifact every downstream consumer (collect,
   toStrudel, IR Inspector, irProjection) reads first. Parser-IR
   parity ⇒ all downstream surfaces inherit structural parity for
   free. Runtime drift on modeled-Tier-4 surfaces remains the
   responsibility of the editor's existing
   `packages/editor/src/ir/__tests__/parity.test.ts` (which runs the
   Strudel evaluator under jsdom via vite-node).

**Tunes that did NOT cleanly snapshot to a structured IR.** All 16
tunes currently snapshot to `Track(d1, Code(<verbatim source>))`. This
is NOT a γ failure — it is the truth about Stave's structural parser
surface vs the upstream corpus today. The parser's pattern matchers
require a recognized root (bare `note(...)`, `s(...)`, `mini(...)`, or
`stack(...)`) at the top of the source after trimming. All 16 corpus
tunes lead with `// "Title"` / `// @license` / `// @by` comment blocks,
which the structural matcher does not strip before pattern-matching,
so the entire body falls through to the `Code` fallback. Additional
top-level forms not in the matcher today (`samples({...})`,
`useRNG('legacy')`) compound this. This was verified by probing
`parseStrudel('// hello\ns("bd cp")')` → `Track(Code(...))` vs
`parseStrudel('s("bd cp")')` → `Track(Seq(Play, Play))`.

The snapshot still gates structural drift:
- Parser GAINS capability (e.g. learns to skip leading comments, or
  parses `samples()` as a Param-like setup node) → snapshots shift from
  `Code` body to a typed body → diff exposes the regression in
  coverage as growth.
- Parser REGRESSES and throws on a tune that previously matched →
  test errors (not a silent diff).
- A tune's source changes upstream → `Code.code` body differs in the
  snapshot → caught alongside γ-3's refresh diff.

This is documented in CORPUS-SOURCE.md so future maintainers don't read
the `Code` fallback as a γ bug.

**Manual mutation gate — Lokayata.** Per PLAN γ-2 verify: inserted
`.fast(2)` into `chop.strudel` after `.sustain(.6)`, re-ran `pnpm exec
vitest run tests/parity-corpus`, observed `Tests 1 failed | 16 passed
(17)` with a snapshot diff naming exactly the added line. Reverted
the file via `git checkout`; re-run cleanly green. Drift detection
works at single-tune granularity, not just whole-suite.

**Normalizer.** `tests/parity-corpus/normalize.ts` strips three field
shapes with inline-comment rationales: `loc` (byte offsets — drift
with file framing, not IR shape), `chainOffset` (stage-transition
annotation — same byte-offset hazard), and `Code.via.callSiteRange`
(opaque-fragment wrapper byte range). The
"add a new stripped field" rule is documented in the file header:
state the class of drift it would otherwise mask, or do not strip it.

## γ-3 — `pnpm parity:refresh` script + CI wiring

Lokayata observation: three end-to-end runs verified the maintainer
workflow:
- `pnpm parity:refresh --sha f73b3956...` → `no drift — corpus is in
  sync with the targeted upstream SHA` (pinned SHA = vendored SHA, by
  construction).
- `pnpm parity:refresh` (default — fetches upstream `main` tip) →
  same `no drift` output. Upstream main hasn't moved since the pin
  (2026-05-07 → 2026-05-15).
- Local mutation: replaced `// "Chop"` with `// "Chop-LOCAL-MUTATION"`,
  re-ran `pnpm parity:refresh --sha <pinned>`, observed
  `changed: 1 (chop)` with a 2-line diff naming the exact change,
  followed by the next-step copy. Reverted.

**Maintainer workflow for refresh:**
1. Run `pnpm parity:refresh` (or `pnpm parity:refresh --sha <new>` to
   target a specific upstream SHA).
2. Review the per-tune diffs in stdout. Decide whether to accept
   upstream's drift.
3. Open a PR titled `corpus: refresh from upstream SHA <new-sha>`.
4. In that PR: apply the diffs by hand to each affected `.strudel` file,
   update the SHA pin + "What changed since snapshot" log in
   CORPUS-SOURCE.md, and regenerate the parity snapshot with
   `pnpm --filter @stave/app exec vitest run tests/parity-corpus -u`.
5. Reviewer reads the snapshot diff alongside the source diff — that's
   the structural-parity gate moment for the new SHA.

**Non-corpus snapshot drift policy (PLAN §2, restated for γ-PR
reviewers):** any PR that touches `packages/editor/src/engine/` or
`packages/editor/src/ir/` AND incidentally causes a γ-2 snapshot diff
**MUST call out the diff in the PR body**. The diff itself is the news
— explicit acknowledgement gates merge. The γ-3 refresh script handles
corpus-side drift; this policy handles engine-side drift. The two paths
are orthogonal: snapshot regen via `vitest -u` is appropriate in the
corpus-refresh PR; it is **never** appropriate to silently regen
snapshots inside an engine PR to "make CI green" — that would mask
the very regression class γ-2 exists to catch.

**CI wiring posture:** the parity spec is picked up by the existing
`pnpm --filter @stave/app test` invocation (via the vitest.config.ts
include-glob widening landed in γ-2). No new CI job is added. The
refresh script is **maintainer-only** and never invoked on PRs — D-04
prohibits live network at CI time, and the script's whole purpose is
to fetch from upstream.

## γ verification gate — status

| Gate | Status | Evidence |
| --- | --- | --- |
| All 16 corpus tunes pass parity spec locally | PASS | `Tests 17 passed (17)` per run above |
| Snapshot file committed, regen-stable | PASS | `vitest -u` ran once; subsequent runs without `-u` are byte-identical |
| `pnpm parity:refresh` runs without error and surfaces diff or no-drift | PASS | 3 verified runs (pinned, main, mutated-local) |
| Parity spec runs under existing app `pnpm test` (no separate CI step) | PASS | `Test Files 15 passed (15), Tests 314 passed (314)` includes parity-corpus |
| Parity job runtime under 60s | PASS | Parity-only run: `Duration 275ms`. Full app suite: `Duration 1.45s`. |

All gates green. γ wave is ready for PR.

## Catalogue candidates (deferred per task rules)

Two patterns surfaced during γ-2 worth promoting if they recur:

- **Editor barrel transitive imports break vite-node:** importing runtime
  values (not just types) from `@stave/editor` pulls in the full dist
  bundle including gifenc, which crashes the ESM loader. Existing app
  tests work around this with deep-path imports (`from
  "../../../../editor/src/engine/HapStream"`). γ-2's parity test follows
  the same pattern. Single occurrence here — record in session memory
  per dharana promotion rule, watch for recurrence.

- **`vitest.config.ts include` glob silently excludes corpora that live
  outside `src/`:** an empty test file ran for `tests/parity-corpus/`
  with the original include glob, producing no error and no test
  coverage. Generic vitest gotcha but worth a note. Single occurrence;
  not promoted.

## Cognitive notes (internal)

- **Krama:** γ-1 → γ-2 → γ-3 → γ-4 ordering was load-bearing as PLAN
  §3 stated: the spec needed corpus files to read; the refresh script
  needed the spec wired so the maintainer copy could reference
  `vitest -u`; this SUMMARY needed all three landed for the verification
  table to cite concrete numbers.
- **Lokayata:** every claim in the per-task paragraphs above traces to a
  command output or observed snapshot diff. The "all 16 fall through to
  Code" finding was the most useful Lokayata moment — easy to mistake
  for a γ failure without the probe.
- **Chesterton:** read existing app test conventions before writing
  parity.test.ts. The deep-path import pattern, the vitest config
  include glob, the snapshot directory layout — all matched precedent
  (IRInspectorPanel.test.tsx's HapStream/BreakpointStore convention)
  rather than introducing a new style.
