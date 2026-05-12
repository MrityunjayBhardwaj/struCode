// Multi-cycle collect helper — loops per-cycle calls and concatenates events.
// Extracted from parity.test.ts so test files can import without dragging
// the entire parity test suite's `describe` blocks in as a side effect
// (which causes vitest to register every parity test inside the importing
// file, doubling the test surface).
//
// Promotion target: ir/collect.ts when a production caller needs it
// (originally noted in parity.test.ts comment for Task 19-03-08).

import type { PatternIR } from '../../PatternIR'
import { type CollectContext, collect } from '../../collect'
import type { IREvent } from '../../IREvent'

export function collectCycles(
  ir: PatternIR,
  startCycle: number,
  endCycle: number,
): IREvent[] {
  const events: IREvent[] = []
  for (let c = startCycle; c < endCycle; c++) {
    const ctx: Partial<CollectContext> = {
      cycle: c,
      time: c,
      begin: c,
      end: c + 1,
      duration: 1,
    }
    events.push(...collect(ir, ctx))
  }
  return events
}
