---
status: partial
phase: 06-inline-zones-via-abstraction
source: [06-VERIFICATION.md]
started: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Per-pattern zone opt-in
expected: Only patterns with .viz() get inline zones. Write 3 $: blocks, only 2 with .viz() — verify only 2 zones appear.
result: [pending]

### 2. Multi-line block placement
expected: A multi-line pattern block (e.g. $: note("c4")\n  .s("sine")\n  .viz("pianoroll")) should show the zone after the last continuation line, not after the $: line.
result: [pending]

### 3. Pause/resume lifecycle
expected: Play → zones animate. Stop → zones freeze (visible but static). Play again → zones resume without flash.
result: [pending]

### 4. Legacy ._pianoroll() alias
expected: Code using ._pianoroll() instead of .viz("pianoroll") should produce the same inline zone.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
