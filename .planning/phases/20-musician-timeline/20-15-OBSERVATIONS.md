# Phase 20-15 — Wave γ Observations

## γ-1: G5 false-positive matrix (Lokāyata probe, #138 acceptance artifact)

Prototype: generalized regex `/^[ \t]*(\/\/[ \t]*)?([A-Za-z_$][\w$]*)\s*:/gm`
PLUS a depth+string+keyword guard reusing the `stripParserPrelude`
pS:151-212 walker discipline (paren/brace/bracket depth + string/template/
comment state scanned `code[0..m.index)`). Probe scripts:
`/tmp/gamma1-probe.mjs`, `/tmp/gamma1-probe2.mjs`. **Observed, not inferred.**

### Matrix (each row's ACTUAL rejector — empirically observed)

| Construct | Rejected by | Observation |
|---|---|---|
| single-line `{ a: 1 }` | regex anchor (`{ ` precedes ident, not `^[ \t]*ident`) | raw regex did NOT match (0 hits in row) |
| multi-line `stack({\n a:1,\n b:2\n})` | **depth guard** (depth 2) | `a`,`b` → REJECT depth 2; `p1` ACCEPT |
| ternary `x ? y : z` | regex `\s*:` fails (next char `?`) | raw regex did NOT match |
| single-line `"https://foo.bar"` | regex anchor (`"` precedes ident) | raw regex did NOT match |
| multi-line `` s(`bd:3\nhh:2`) `` | **string guard** (inString) | `hh` → REJECT inside string |
| `s("bd:3")` | regex `\s*:` fails (`s` ident → `(`) | raw regex did NOT match |
| `const t: number = 3` | regex `\s*:` fails on `const` ident; `const` ∈ RESERVED; G1 consumes binding line | raw regex did NOT match `t:` |
| bare `bd:3` (top-level) | NOT rejected — documented low-risk | ACCEPT (acknowledged below) |
| `p1: s("bd")` | ACCEPTED — the only true track label | correct |

### Load-bearing finding

The single-line false-positives (`{a:1}`, ternary, string URL, `s("bd:3")`,
`const x:`) are rejected by the **regex shape itself** (anchor + `\s*:`
adjacency) — the raw regex matched only 2 of 7 corpus rows. The depth/string
guard is the load-bearing rejector for the **multi-line** forms
(`stack({\n a:1 })` → depth 2; `` s(`…\nhh:2`) `` → inString) where the
inner colon-bearing token DOES sit at a physical line start. Both proven.

Mixed `$:` + `name:` (both physical orders) → both captured, source-order
preserved (`$` ∈ `[A-Za-z_$]` so `$:` keeps exact current behavior).

### Residual (documented low-risk, accepted)

A bare `bd:3` at top-level statement position is ACCEPTED by the guard set.
This is **not valid standalone Strudel** — sample indices only appear inside
`s("…")` strings (which the string guard rejects). A program whose top-level
statement is literally `bd:3` would already be Code-fallback today; treating
`bd` as a (degenerate) track label is no worse than the status quo and not a
real-world Bakery shape. Accepted per the research matrix row
("low risk, document").

### Guard set (proven sufficient on the corpus)

1. match at statement depth 0 (not inside `{}`/`()`/`[]`)
2. not inside a string/template/comment
3. identifier not a reserved non-track keyword (`default`/`case`/`const`/
   `let`/`var`)

γ-2 proceeds with this validated guard.

## γ-2: G5 generalized extractTracks + full label→trackId→slot wiring (#138, D-01)

Observed via vitest probe importing parseStrudel/collect from editor SOURCE
(parity.test.ts style — avoids the `@strudel/core` raw-node ESM issue).

### Full wiring trace (OBSERVED, not inferred)

`parseStrudel('p1: s("bd")\np2: s("hh")')` →
`Stack[Track(trackId='p1', loc=[{0,12}], body=Play),
       Track(trackId='p2', loc=[{12,23}], body=Play)]`
→ `collect` events: `p1`→`dollarPos:0`, `p2`→`dollarPos:12` (DISTINCT,
equal to label-line start offsets) → MusicalTimeline slotKey `$${pos}`
distinct `["$0","$11"]`. The label IS the trackId AND the slot is
source-anchored — exactly D-01. Same `dollarStart`→`collect.ts:447`
OUTER-WINS→`event.dollarPos`→`$${pos}` mechanism `$:` uses, NOT parallel.

### FLAG-3 interleave (BOTH physical orders)

- b-i `$: s("bd")\np2: s("hh")` → `Track(d1)` (label `$`→`d1`,
  byte-identical legacy) + `Track(p2)`; `$.dollarStart(0) < p2(11)` ✓
- b-ii REVERSED `p2: s("hh")\n$: s("bd")` → `Track(p2)` + `Track(d2)`;
  `p2.dollarStart(0) < $(12)` ✓ — source order preserved either way.

### False-positive guard live

- single-line `{ a: 1 }\np1: s("bd")` → ONLY `p1` Track (`a:` rejected by
  regex anchor)
- multi-line `stack({\n a:1\n})\np1: s("bd")` → ONLY `p1` dollarStart 18
  (`a:` rejected by **depth guard** — the load-bearing case)

### #138 repro before/after

- BEFORE (HEAD parent 9e2a384): `dollarRe = /^[ \t]*(\/\/[ \t]*)?\$:/gm`
  literal `$:` only → `drum:`/`bass:` never match → `extractTracks` `[]` →
  `splitRootAndChain` reads `drum` as root → Code-fallback.
- AFTER: `parseStrudel('drum: s("bd sd")\nbass: note("c2 e2")')` →
  `Stack[Track('drum', body=Seq), Track('bass', body=Seq)]` structured.

### P67 both directions

- SUCCESS `p1: s("bd sd")` → `Track(p1, body=Seq, via=undefined)` —
  structured, NOT unparsed blob.
- BARE-FALLBACK `p1: someUnparseableThing(@@@)` →
  `Track(p1, body=Code, via=undefined)` — canonical bare-Code shape, NOT
  half-wrapped, AND still a Track (topology-preserving). Chokepoint
  honoured in the failure direction.

### RAW consumer (parseStrudelStages) tuple intact

`extractTracks('p1: s("bd")')` →
`[{expr:'s("bd")', offset:4, dollarStart:0, end:11, commented:false,
   label:'p1'}]` — `label` APPENDED; `dollarStart`/`end` unshifted (RAW
consumer reads by field, additive contract held).

### Regression oracle (γ-2)

parity-corpus 34/34 (no churn, zero `-u`) · editor 1564/1564 · timeline
specs 178/178 (MusicalTimeline.test.tsx 51/51, no flake). Deferred
trackMeta-by-slotKey re-keying NOT reopened (D-01 scope guard held).
