import { describe, it, expect } from 'vitest'
import { parseStrudel, extractTracks } from '../parseStrudel'

describe('20-11 wave α — Track wrap shape', () => {
  it('non-`$:` single expression returns inner IR unchanged (synthetic-d1 wrap deferred to wave γ)', () => {
    // Wave α scope adjustment: ~100 existing tests assert on the unwrapped
    // tag for non-`$:` input (e.g. `parseStrudel('s("bd")').tag === 'Param'`).
    // Wrapping today without the unwrapD1 helper migration (γ-4) would red-
    // suite the wave-α gate. Wave γ ships the wrap WITH the migration in
    // the same commit. For now, the inner IR is returned as-is.
    const ir = parseStrudel('s("bd*4")')
    expect(ir.tag).not.toBe('Track')
  })

  it('single `$:` block wraps with d1 + loc covering $: line range', () => {
    const code = '$: s("bd*4")'
    const ir = parseStrudel(code)
    expect(ir.tag).toBe('Track')
    if (ir.tag !== 'Track') throw new Error('unreachable')
    expect(ir.trackId).toBe('d1')
    expect(ir.loc?.[0]?.start).toBe(0)            // $ position
    expect(ir.loc?.[0]?.end).toBe(code.length)    // through end of source
    expect(ir.userMethod).toBeUndefined()         // synthetic-from-$:
  })

  it('two `$:` blocks wrap as Stack of Track(d1, ...) + Track(d2, ...)', () => {
    const ir = parseStrudel('$: s("hh*8")\n$: s("hh*8")')
    expect(ir.tag).toBe('Stack')
    if (ir.tag !== 'Stack') throw new Error('unreachable')
    const tracks = ir.tracks
    expect(tracks.length).toBe(2)
    expect(tracks[0].tag).toBe('Track')
    expect(tracks[1].tag).toBe('Track')
    if (tracks[0].tag !== 'Track' || tracks[1].tag !== 'Track') {
      throw new Error('unreachable')
    }
    expect(tracks[0].trackId).toBe('d1')
    expect(tracks[1].trackId).toBe('d2')
    // First Track loc starts at 0 ($ of first line); second starts at 13
    // (\n + $ of second line). Each loc spans through the next $: line
    // start (or code.length for the last).
    expect(tracks[0].loc?.[0]?.start).toBe(0)
    expect(tracks[1].loc?.[0]?.start).toBe(13)
  })

  it('.p("name") on single `$:` expression: outer Track(d1) wraps inner Track("name") with userMethod=p', () => {
    // The outer extractTracks wrap (Track('d1', ...) for the single $:)
    // contains the inner `.p("lead")`-derived Track. collect's outer-
    // then-inner walk semantics will apply at β-1; γ-6 has the regression
    // test for the inner-wins precedence.
    const ir = parseStrudel('$: note("c").p("lead")')
    expect(ir.tag).toBe('Track')
    if (ir.tag !== 'Track') throw new Error('unreachable')
    expect(ir.trackId).toBe('d1')   // outer synthetic-from-$:
    const inner = ir.body
    expect(inner.tag).toBe('Track')
    if (inner.tag !== 'Track') throw new Error('unreachable')
    expect(inner.trackId).toBe('lead')
    expect(inner.userMethod).toBe('p')
  })

  it('.p() with empty string falls back to wrapAsOpaque (PV37 preserved)', () => {
    const ir = parseStrudel('$: note("c").p("")')
    // outer Track('d1', ...). Inner is the receiver wrapped as Code-with-via,
    // NOT Track — empty trackId is meaningless and would collide with the
    // synthetic `d1` numbering.
    expect(ir.tag).toBe('Track')
    if (ir.tag !== 'Track') throw new Error('unreachable')
    expect(ir.body.tag).toBe('Code')
  })

  it('.p() with mini-syntax falls back to wrapAsOpaque (P50 single-decision)', () => {
    const ir = parseStrudel('$: note("c").p("<a b>")')
    expect(ir.tag).toBe('Track')
    if (ir.tag !== 'Track') throw new Error('unreachable')
    expect(ir.body.tag).toBe('Code')   // angle brackets routed through wrapAsOpaque
    if (ir.body.tag !== 'Code') throw new Error('unreachable')
    expect(ir.body.via).toBeDefined()
    expect(ir.body.via?.method).toBe('p')
    expect(ir.body.via?.args).toBe('"<a b>"')
  })
})

// Light shape probe to keep the export surface honest — α-3 PART A widens
// extractTracks shape; α-2 already added dollarStart/end. Belongs here so
// the parser's public-shape regressions land in one suite.
describe('20-11 wave α — extractTracks return shape includes dollarStart + end', () => {
  it('two `$:` blocks expose dollarStart and end on each track', () => {
    const code = '$: s("bd")\n$: s("hh")'
    const tracks = extractTracks(code)
    expect(tracks).toHaveLength(2)
    expect(tracks[0].dollarStart).toBe(0)
    // First track's end is the second `$:` line start (after the newline).
    expect(tracks[0].end).toBeGreaterThan(0)
    expect(tracks[0].end).toBeLessThan(code.length)
    expect(tracks[1].dollarStart).toBe(tracks[0].end)
    expect(tracks[1].end).toBe(code.length)
  })

  it('single `$:` block ends at code.length', () => {
    const code = '$: s("bd")'
    const tracks = extractTracks(code)
    expect(tracks).toHaveLength(1)
    expect(tracks[0].dollarStart).toBe(0)
    expect(tracks[0].end).toBe(code.length)
  })
})
