/**
 * Golden-output tests for the curated `commonMistakes` shipped with each
 * runtime's DocsIndex. One assertion per seeded hint — protects against
 * regressions when the docs JSON regen scripts roll through (the JSON
 * regen wipes `globalMistakes` on the JSON side, but our `p5.ts` /
 * `hydra.ts` overlays splice them back in; this test catches the case
 * where someone deletes the overlay).
 */

import { describe, it, expect } from 'vitest'
import { formatFriendlyError } from '../friendlyErrors'
import { STRUDEL_DOCS_INDEX } from '../../monaco/strudelDocs'
import { P5_DOCS_INDEX } from '../../monaco/docs/p5'
import { HYDRA_DOCS_INDEX } from '../../monaco/docs/hydra'

describe('seeded commonMistakes — Strudel', () => {
  it('bare note name → "wrap in a string" hint', () => {
    const r = formatFriendlyError(
      new ReferenceError('c4 is not defined'),
      'strudel',
      { index: STRUDEL_DOCS_INDEX },
    )
    expect(r.message).toContain('Looks like a note name')
    expect(r.message).toContain('note("c4")')
  })

  it('note name with sharp → still matches', () => {
    const r = formatFriendlyError(
      new ReferenceError('eb3 is not defined'),
      'strudel',
      { index: STRUDEL_DOCS_INDEX },
    )
    expect(r.message).toContain('Looks like a note name')
  })

  it('bare drum shorthand → "wrap in s(...)" hint', () => {
    const r = formatFriendlyError(
      new ReferenceError('bd is not defined'),
      'strudel',
      { index: STRUDEL_DOCS_INDEX },
    )
    expect(r.message).toContain('Looks like a drum name')
    expect(r.message).toContain('s("bd")')
  })

  it('every-as-free-fn → chain-after-Pattern hint', () => {
    const r = formatFriendlyError(
      new TypeError('every is not a function'),
      'strudel',
      { index: STRUDEL_DOCS_INDEX },
    )
    expect(r.message).toContain('chain it after `note(...)`')
    expect(r.suggestion?.name).toBe('every')
  })

  it('non-curated reference still falls through to fuzzy', () => {
    // `nots` typo for `note` is a fuzzy neighbour — should land on the
    // "Did you mean note?" path, not on either curated hint.
    const r = formatFriendlyError(
      new ReferenceError('nots is not defined'),
      'strudel',
      { index: STRUDEL_DOCS_INDEX },
    )
    expect(r.message).toContain('Did you mean')
  })
})

describe('seeded commonMistakes — p5', () => {
  it('width-before-setup → "available once setup() runs" hint', () => {
    const r = formatFriendlyError(
      new ReferenceError('width is not defined'),
      'p5',
      { index: P5_DOCS_INDEX },
    )
    expect(r.message).toContain('only become available')
    expect(r.message).toContain('setup()')
  })
})

describe('seeded commonMistakes — Hydra', () => {
  it('bare out() → "render with .out()" hint', () => {
    const r = formatFriendlyError(
      new ReferenceError('out is not defined'),
      'hydra',
      { index: HYDRA_DOCS_INDEX },
    )
    expect(r.message).toContain('osc().out()')
  })
})
