/**
 * collectLeafIrNodeIds — Inspector chain-row → leaf-id resolver.
 *
 * Phase 20-07 / DEC-AMENDED-2 / R-A.
 */
import { describe, it, expect } from "vitest";
import type { PatternIR, IRSnapshot, IREvent } from "@stave/editor";
import { collectLeafIrNodeIds } from "../collectLeafIrNodeIds";

function evt(partial: Partial<IREvent> & { loc?: IREvent["loc"]; irNodeId?: string }): IREvent {
  return {
    begin: 0,
    end: 0.1,
    endClipped: 0.1,
    note: null,
    freq: null,
    s: null,
    gain: 1,
    velocity: 1,
    color: null,
    ...partial,
  } as IREvent;
}

function makeSnapshot(events: IREvent[]): IRSnapshot {
  // Build the loc-keyed lookup the same way enrichWithLookups does.
  const irNodeLocLookup = new Map<string, IREvent[]>();
  const irNodeIdLookup = new Map<string, IREvent>();
  for (const e of events) {
    if (e.irNodeId) irNodeIdLookup.set(e.irNodeId, e);
    if (e.loc && e.loc.length > 0) {
      const key = `${e.loc[0].start}:${e.loc[0].end}`;
      const arr = irNodeLocLookup.get(key);
      if (arr) arr.push(e);
      else irNodeLocLookup.set(key, [e]);
    }
  }
  const stubIR: PatternIR = { tag: "Pure" } as PatternIR;
  return {
    ts: 0,
    runtime: "strudel" as IRSnapshot["runtime"],
    code: "",
    passes: [{ name: "final", ir: stubIR }],
    ir: stubIR,
    events,
    irNodeIdLookup,
    irNodeLocLookup,
    irNodeIdsByLine: new Map(),
  };
}

describe("collectLeafIrNodeIds", () => {
  it("Play leaf returns its own singleton irNodeId", () => {
    const playLeaf: PatternIR = {
      tag: "Play",
      note: "bd",
      duration: 0.5,
      loc: [{ start: 10, end: 12 }],
    } as PatternIR;
    const snap = makeSnapshot([
      evt({ loc: [{ start: 10, end: 12 }], irNodeId: "id-bd", s: "bd" }),
    ]);

    const ids = collectLeafIrNodeIds(playLeaf, snap);
    expect(ids).toEqual(["id-bd"]);
  });

  it("Stack with two Play leaves returns both leaves' irNodeIds", () => {
    const playA: PatternIR = {
      tag: "Play",
      note: "bd",
      duration: 0.5,
      loc: [{ start: 10, end: 12 }],
    } as PatternIR;
    const playB: PatternIR = {
      tag: "Play",
      note: "hh",
      duration: 0.5,
      loc: [{ start: 13, end: 15 }],
    } as PatternIR;
    const stack: PatternIR = {
      tag: "Stack",
      tracks: [playA, playB],
      loc: [{ start: 10, end: 15 }],
    } as PatternIR;
    const snap = makeSnapshot([
      evt({ loc: [{ start: 10, end: 12 }], irNodeId: "id-bd", s: "bd" }),
      evt({ loc: [{ start: 13, end: 15 }], irNodeId: "id-hh", s: "hh" }),
    ]);

    const ids = collectLeafIrNodeIds(stack, snap);
    expect(ids).toContain("id-bd");
    expect(ids).toContain("id-hh");
    expect(ids).toHaveLength(2);
  });

  it("Subtree without resolvable irNodeIds returns empty array", () => {
    const playOrphan: PatternIR = {
      tag: "Play",
      note: "bd",
      duration: 0.5,
      loc: [{ start: 99, end: 101 }],
    } as PatternIR;
    const snap = makeSnapshot([]); // empty events → no loc lookup matches
    const ids = collectLeafIrNodeIds(playOrphan, snap);
    expect(ids).toEqual([]);
  });
});
