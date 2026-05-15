# Strudel.cc Parity Corpus — Source Pin

This corpus is the structural-parity gate for Phase 20-14 (D-04).
Each `*.strudel` file in this directory is a **byte-faithful extraction** of
a named `export const` from upstream strudel's `tunes.mjs`. The vitest spec at
`parity.test.ts` evals each file through Stave's parser and asserts the
resulting `PatternIR` shape (post-normalization) against a committed snapshot.

## Upstream pin

| Field | Value |
| --- | --- |
| Repository | [`uzu/strudel`](https://codeberg.org/uzu/strudel) (Codeberg) |
| Branch | `main` |
| Commit SHA | `f73b395648645aabe699f91ba0989f35a6fd8a3c` |
| Source file | `website/src/repl/tunes.mjs` |
| Snapshot date | 2026-05-15 |
| Raw URL | https://codeberg.org/uzu/strudel/raw/commit/f73b395648645aabe699f91ba0989f35a6fd8a3c/website/src/repl/tunes.mjs |

## License

Both upstream Strudel and Stave editor are licensed under
**AGPL-3.0-or-later**. Vendoring is license-compatible — no porting or
rewrite required. See the per-file `@license` headers (CC BY-NC-SA 4.0 in
most cases; that license applies to the tune CONTENT — the AGPL-3.0 frame
applies to inclusion as test fixtures in this repo).

## Parity rung

Per PLAN §3 D-01: **structural parity only**. The spec asserts:

- IR tag tree shape after `parseStrudel(code)`
- Source-loc offsets, dollar positions, and any timestamp / uuid-like
  identifiers are stripped by `normalize.ts:normalizeIRShape` before
  comparison — see that file's inline comments for the rationale per
  field.

The spec does NOT assert audible output, scheduler timing, or rendered
visual output. Those rungs are queued (PLAN §7).

### Parser-IR vs runtime-IR choice

The spec asserts the **parser-level `PatternIR`** produced by
`parseStrudel(code)` from `@stave/editor`, NOT the runtime event stream
collected from the audio scheduler.

Reasoning:

1. **Determinism.** `parseStrudel` is a pure structural matcher with no
   audio context dependency and no random-number sources. The same code
   produces the same IR every run. Runtime collection threads through the
   Strudel scheduler whose RNG seeding (`useRNG('legacy')`, `seededRandsAtTime`)
   is per-cycle and would require pinning a synthetic clock.
2. **Environment.** Vitest runs in jsdom. The runtime audio path requires
   `AudioContext` + `AudioWorklet` + `@strudel/webaudio` superdough — none
   of which boot in jsdom without heavy stubbing. The kabelsalat stub the
   editor's existing parity harness uses is sufficient for parser-level
   work but not for full eval.
3. **What parity surfaces.** D-01 explicitly locks the parity rung at
   IR-shape level. The parser IR is the artifact downstream consumers
   (collect, toStrudel, IR Inspector, irProjection) read first. If the
   parser IR matches structurally, downstream surfaces inherit
   structural parity for free; if it diverges, the spec catches it before
   any other layer is consulted.

The cost of this choice: tunes whose meaning depends on runtime
expansion that the parser cannot see at parse time (random-seed-bound
permutations, late-binding scale lookups inside `.struct()`, etc.) snapshot
their **literal parsed structure**, not their expanded denotation. Drift
in the runtime expansion logic would NOT be caught by this gate alone —
it remains the responsibility of the editor-side `parity.test.ts` (which
runs the Strudel evaluator under jsdom-via-vite-node) to catch
runtime drift on the modeled-Tier-4 surface.

## Curated 16 tunes

| # | File | Upstream lines | Parity surface |
| --- | --- | --- | --- |
| 1 | `chop.strudel` | 562-575 | `.chop()`, `.jux(rev)`, sample chop |
| 2 | `delay.strudel` | 577-586 | simple FX chain, param keys |
| 3 | `orbit.strudel` | 588-602 | `.orbit()` routing across tracks |
| 4 | `belldub.strudel` | 604-642 | `.s("bell")` bare name — alias layer |
| 5 | `sampleDrums.strudel` | 169-181 | inline `samples()` + bare `bd/sd/hh` |
| 6 | `randomBells.strudel` | 387-410 | `.note().scale()` tonal IR |
| 7 | `barryHarris.strudel` | 183-191 | jazz harmony + xen edge |
| 8 | `echoPiano.strudel` | 339-350 | `.piano()` chain method (α-4) |
| 9 | `holyflute.strudel` | 694-709 | soundfont (`gm_*`) IR |
| 10 | `flatrave.strudel` | 711-737 | `.bank("RolandTR909")` (α-2 + α-3) |
| 11 | `amensister.strudel` | 739-777 | sample chop + stutter sequencing |
| 12 | `juxUndTollerei.strudel` | 779-792 | `.jux()` higher-order combinator |
| 13 | `bassFuge.strudel` | 532-560 | polyphony + `.voicing()` |
| 14 | `dinofunk.strudel` | 644-672 | drum-machines + polyrhythm mini |
| 15 | `meltingsubmarine.strudel` | 455-496 | `.color()` + viz hints metadata |
| 16 | `arpoon.strudel` | 850-878 | arp + chord ops |

## Known parser-coverage gaps

After the γ-wave parser-gap fix (commits `1d6a314`, `322d912`), 15 of 16
tunes produce **structured PatternIR** in their snapshots. One tune still
falls back to opaque `Track(d1, Code(<verbatim>))`:

- **`arpoon.strudel`** — body shape `n("…".fast(3).lastOf(4, fast(2))).clip(2).offset(…)`.
  The OUTER chain walks correctly (cluster B fix), but the ROOT `n(…)` arm
  requires its argument to be a bare `"…"` quoted string. When the inner arg
  is itself a mini-string with its own method chain, the regex fails and the
  whole expression becomes opaque. Tracked at **#132** — recursive
  expression parsing inside `note`/`n`/`s` args.

The Code-fallback still gates structural drift (any upstream text change to
arpoon trips a snapshot diff), but the assertion is weaker than full IR
parity for that one tune. Audible behavior is unaffected — the transpiler
reifies and chains through the runtime correctly.

## Deliberately omitted (queued)

Per RESEARCH §5:

- `csoundDemo` — requires `@strudel/csound` tier (PLAN §7 follow-up).
- Surface duplicates: `swimming`, `giantSteps`, `caverave`, `zeldasRescue`,
  `goodTimes`, `festivalOfFingers`, `festivalOfFingers3`, `sml1`, `waa2`,
  `outroMusic`, `undergroundPlumber`, `wavyKalimba`, `blippyRhodes`,
  `loungeSponge`, `sampleDemo` — exercise surfaces already covered. Add if
  a parity gap surfaces.

## P62 — quote-style policy

**Do NOT mass-convert quotes in this directory.** Per PLAN §2 + hetvabhasa
P62: the upstream tunes use double-quoted strings inside `.s("bd")`,
`.bank("tr909")`, etc., because Strudel's transpiler reifies them as
Patterns intentionally — that IS upstream behavior. Both Stave and
upstream pipe through the same transpiler, so structural parity holds.
P62 only bites string-id chain methods (`.p('name')`, `.viz('name')`)
that are NOT in this corpus.

The corpus must remain a byte-faithful extraction. Any quote change has to
land via the refresh script (with the diff visible in the refresh PR), not
as a hand-edit here.

## Refresh procedure

Run `pnpm parity:refresh` from the repo root (or `pnpm --filter @stave/app
parity:refresh`). The script:

1. Reads this file to discover the current SHA pin.
2. Fetches `tunes.mjs` from upstream at `main`'s current tip (or `--sha
   <NEW_SHA>` if supplied).
3. Re-extracts the 16 curated tunes by name.
4. Prints a unified `diff` for each tune whose body differs from the
   currently-vendored copy.
5. **Never writes files automatically.** The maintainer applies any
   accepted diff by hand and commits it in a PR titled
   `corpus: refresh from upstream SHA <x>`.

The script does NOT run on CI. PR CI only runs the parity spec
(`pnpm --filter @stave/app test`) — see PLAN §2 D-04.

## What changed since snapshot

_None yet — corpus was vendored at the pinned SHA on 2026-05-15._

When refreshing, append a dated entry summarizing which tune bodies moved
and why (upstream renamed a method, added a chain, etc.). This section is
the audit trail for the structural parity surface over time.
