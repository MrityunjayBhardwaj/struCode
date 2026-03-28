# Summary F-02: Strudel Parser + ECS Propagation + Integration

## Status: COMPLETE

## What Was Built

### parseMini (`src/ir/parseMini.ts`)
- Recursive descent parser for Strudel mini-notation strings
- Supports: sequences, rests (~), cycles (<>), sub-sequences ([]), repeat (*n), sometimes (?)
- `isSample` flag: sample mode sets `params.s` on Play nodes
- Never throws — graceful Code fallback on tokenizer/parser error
- Phase 19 deferred: polymetric {}, Euclidean a(3,8), slice a:2, elongation @

### parseStrudel (`src/ir/parseStrudel.ts`)
- Structural pattern matcher (not a full JS parser) for Strudel code strings
- Handles: `note("...")`, `s("...")`, `stack(...)`, multi-track `$:` syntax
- Method chain walker: `.fast`, `.slow`, `.every`, `.sometimes`, `.sometimesBy`, `.mask`, `.room`, `.delay`, `.gain`, `.pan`, and 10+ other FX
- `splitRootAndChain` / `extractNextMethod` with balanced-paren tracking
- **Key invariant**: receives user's original code string (pre-Strudel-transpilation), not reified output
- Code fallback: if root can't be parsed (e.g. variable expressions), returns `Code(expr)` with full expression preserved

### propagation engine (`src/ir/propagation.ts`)
- `ComponentBag`: strudelCode, sonicPiCode (future), patternIR, irEvents
- `System` interface: name, stratum (int), inputs[], outputs[], run(bag) → bag
- `propagate(bag, systems)`: sort by stratum, skip systems with missing inputs, run in order
- `StrudelParseSystem` (stratum 1): strudelCode → patternIR
- `IREventCollectSystem` (stratum 2): patternIR → irEvents

### LiveCodingEngine.ts
- Added `IRComponent` interface: `patternIR: PatternIR | null`, `irEvents: IREvent[]`
- Extended `EngineComponents` with optional `ir: IRComponent` slot

### StrudelEngine.ts
- Added `lastPatternIR` and `lastIREvents` private fields
- `evaluate()` runs `propagate({ strudelCode: code }, [...])` AFTER Strudel eval succeeds
- Failed evaluate clears stale IR (patternIR = null, irEvents = [])
- `components` getter exposes `bag.ir` when `lastPatternIR` is non-null

## Tests
- 33 integration tests in `src/ir/__tests__/integration.test.ts`
- Covers: parseMini, parseStrudel, 7 full pipeline cases, propagation engine
- No mocks — all tests work on strings/pure functions, no Strudel runtime required

## Key Implementation Decisions

- **Parser receives user code, not transpiled code**: Strudel transpiles `note("c4")` to `reify("c4")`. The parser runs on the pre-transpilation string, so it always sees idiomatic patterns.
- **Code node fallback preserves full expression**: when `parseRoot` returns Code (can't parse identifier), `parseExpression` returns `IR.code(originalExpr)` — not just the first token.
- **propagate() skips systems with ANY missing input**: defensive — if patternIR is null, IREventCollectSystem silently skips.
- **Strata are integers, within-stratum order is deterministic** (array insertion order preserved by stable sort).

## What parseStrudel Does NOT Handle (Code fallback)

- Variable references: `note(x)` where x is a variable
- Complex expressions: `const x = 42; note(x)`
- Chained complex every transforms: `.every(4, x => x.fast(2).gain(0.5))` (multi-chain transforms)
- These all return `{ tag: 'Code', code: originalExpr }` — never null, never throws.

## Total Test Count

- 281 tests passing (159 existing + 110 new)
- 17 test files
