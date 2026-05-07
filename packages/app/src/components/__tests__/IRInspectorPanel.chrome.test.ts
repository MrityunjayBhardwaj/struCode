/**
 * Phase 20-04 wave δ — IR Inspector developer chrome tests (D-05 / PV35).
 *
 * Covers summarize() and children() for Code-with-via wrappers.
 * Developer chrome shows the FULL call site (`[opaque: .release(0.3)]`);
 * musician-view chrome (irProjection.ts) shows label-only `unmodelled`
 * — see irProjection.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../../../../editor/src/ir/parseStrudel'
import { IR, type PatternIR } from '../../../../editor/src/ir/PatternIR'
import { summarize, children } from '../IRInspectorChrome'

describe('20-04 — IR Inspector developer chrome (PV35 / D-05)', () => {
  it('summarize for Code-with-via returns "[opaque: .method(args)]"', () => {
    const ir = parseStrudel('note("c").release(0.3)')
    expect(ir.tag).toBe('Code')
    expect(summarize(ir)).toBe('[opaque: .release(0.3)]')
  })

  it('summarize preserves raw whitespace in args (D-02 byte-fidelity)', () => {
    const ir = parseStrudel('note("c").release( 0.5 )')
    expect(summarize(ir)).toBe('[opaque: .release( 0.5 )]')
  })

  it('summarize for typed-arm parse-failure wrapper shows method + raw arg', () => {
    const ir = parseStrudel('note("c").fast("<2 3>")')
    expect(summarize(ir)).toBe('[opaque: .fast("<2 3>")]')
  })

  it('summarize for Code WITHOUT via falls back to source-code preview', () => {
    // Pre-20-04 path — parse-fallback Code (parser couldn't handle root).
    const code: PatternIR = IR.code('foo bar')
    expect(summarize(code)).toBe('"foo bar"')
  })

  it('children for Code-with-via exposes via.inner (tree expansion)', () => {
    const ir = parseStrudel('note("c").release(0.3)')
    const kids = children(ir)
    expect(kids.length).toBe(1)
    expect(kids[0].tag).toBe('Play')
  })

  it('children for Code WITHOUT via is empty (DV-08 unchanged)', () => {
    const code: PatternIR = IR.code('foo bar')
    expect(children(code)).toEqual([])
  })

  it('double-wrap: developer chrome shows nested [opaque] chips (D-06)', () => {
    const outer = parseStrudel('note("c").foo(1).bar(2)')
    expect(summarize(outer)).toBe('[opaque: .bar(2)]')
    const inner = children(outer)[0]
    expect(inner.tag).toBe('Code')
    expect(summarize(inner)).toBe('[opaque: .foo(1)]')
    const innermost = children(inner)[0]
    expect(innermost.tag).toBe('Play')
  })
})
