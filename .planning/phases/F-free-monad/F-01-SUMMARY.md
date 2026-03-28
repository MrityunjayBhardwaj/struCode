# Summary F-01: PatternIR Type System + Core Interpreters

## Status: COMPLETE

## What Was Built

### PatternIR ADT (`src/ir/PatternIR.ts`)
- 15 node types: Pure, Seq, Stack, Play, Sleep, Choice, Every, Cycle, When, FX, Ramp, Fast, Slow, Loop, Code
- `PlayParams` interface with extensible index signature
- `IR.*` smart constructors for all node types
- `Code` node added beyond original 9 effects — opaque fallback for unparseable fragments

### collect interpreter (`src/ir/collect.ts`)
- `CollectContext` with begin/end/time/cycle/duration/speed/params
- Full tree walk covering all 15 node types
- Time accumulation in Seq: each slot advances cursor by `duration / speed / children.length`
- Speed is multiplicative: `fast(2, fast(3, play))` → speed = 6
- FX/Ramp override Play's own params (ctx.params wins over play.params in makeEvent)
- Ramp interpolates from/to over cycles via `cycle/cycles` progress

### toStrudel interpreter (`src/ir/toStrudel.ts`)
- Idiomatic Strudel output: Seq of simple Play nodes → mini-notation collapse
- Stack → `stack(...)` with indented tracks
- Cycle → `note("<c4 e4>")` or `s("<bd sd>")`
- Fast/Slow/FX → method chains
- Code node → identity (original string returned)

### JSON serialization (`src/ir/serialize.ts`)
- `patternToJSON(ir, pretty?)` → JSON string with `$schema: "patternir/1.0"` envelope
- `patternFromJSON(json)` → validates every node type, throws with field path on error
- Round-trip lossless for all 15 node types
- `PATTERN_IR_SCHEMA_VERSION = '1.0'`

### Exports
- `ir/index.ts` exports all new types and functions
- `src/index.ts` exports public API for `@stave/editor`

## Tests
- 77 unit tests in `src/ir/__tests__/PatternIR.test.ts`
- All pass

## Key Implementation Decisions

- `ctx.params` (from FX/Ramp) override Play's own params in `makeEvent` — Ramp-set gain=0 must win over Play's default gain=1
- Smart constructors are `as const` — TypeScript narrows return types precisely
- `noteToFreq` handles note names (c4, e4, etc.) but is non-exhaustive — unknown formats return null
