/**
 * collectLeafIrNodeIds — walker for Inspector chain-row breakpoint registration.
 *
 * Phase 20-07 / DEC-AMENDED-2 / R-A. Resolves any PatternIR row click to
 * the SET of leaf irNodeIds reachable under that subtree. Mirrors Monaco
 * gutter's multi-id-per-line semantics (a single line can host multiple
 * atoms; a single Inspector chain row can host multiple leaves).
 *
 * RESEARCH §0 S2 / collect.ts:361 — irNodeId is assigned ONLY at Play
 * leaves. PatternIR inner nodes (Stack, FX, Fast, …) carry `loc?: SourceLocation[]`
 * but never an `irNodeId`. The join is therefore via loc[0] match against
 * `IRSnapshot.irNodeLocLookup`.
 *
 * Used by:
 *  - Inspector chain-row click → BreakpointStore.toggleSet
 *  - Inspector breakpoint-marker render → "this row's subtree contains a
 *    registered breakpoint"
 *
 * Returns a deduplicated, insertion-ordered array. Empty when the subtree
 * has no leaves with resolvable irNodeIds (e.g. before the first eval, or
 * a subtree composed entirely of synthetic events without loc).
 */
import type { PatternIR, IRSnapshot } from "@stave/editor";
import { children } from "./IRInspectorChrome";

export function collectLeafIrNodeIds(
  node: PatternIR,
  snap: IRSnapshot,
): readonly string[] {
  const out: string[] = [];
  walk(node, snap, out);
  return out;
}

function walk(node: PatternIR, snap: IRSnapshot, out: string[]): void {
  if (node.tag === "Play") {
    if (!node.loc || node.loc.length === 0) return;
    const key = `${node.loc[0].start}:${node.loc[0].end}`;
    const events = snap.irNodeLocLookup.get(key);
    if (!events) return;
    for (const e of events) {
      if (e.irNodeId && !out.includes(e.irNodeId)) {
        out.push(e.irNodeId);
      }
    }
    return;
  }
  // Inner node — recurse on structural children. Uses the panel's existing
  // `children` walker (IRInspectorChrome.ts:55) so the projection-aware
  // tree shape stays consistent across pulse + click + render paths.
  for (const child of children(node)) walk(child, snap, out);
}
