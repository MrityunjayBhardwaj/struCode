import { describe, it, expect } from 'vitest'
import type { DocsIndex } from '../../monaco/docs/types'
import {
  levenshtein,
  fuzzyMatch,
  extractReferenceIdentifier,
  formatFriendlyError,
} from '../friendlyErrors'

const FAKE_INDEX: DocsIndex = {
  runtime: 'p5',
  docs: {
    save: {
      signature: 'save(filename?: string)',
      description: 'Save the current sketch canvas.',
      example: 'save("out.png")',
    },
    ellipse: {
      signature: 'ellipse(x, y, w, h)',
      description: 'Draws an ellipse.',
      example: 'ellipse(50, 50, 80, 80)',
    },
    background: {
      signature: 'background(color)',
      description: 'Sets the background color.',
      example: 'background(220)',
    },
    noise: {
      signature: 'noise(x, y?, z?)',
      description: 'Returns the Perlin noise value.',
      example: 'noise(0.1)',
    },
  },
}

describe('levenshtein', () => {
  it('zero for identical strings', () => {
    expect(levenshtein('cat', 'cat')).toBe(0)
  })
  it('length when one side is empty', () => {
    expect(levenshtein('', 'hello')).toBe(5)
    expect(levenshtein('world', '')).toBe(5)
  })
  it('one for a single substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1)
  })
  it('symmetric', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('sitting', 'kitten')).toBe(3)
  })
  it('handles unicode char-by-char', () => {
    expect(levenshtein('é', 'e')).toBe(1)
  })
})

describe('fuzzyMatch', () => {
  const corpus = Object.keys(FAKE_INDEX.docs)

  it('returns the exact match first', () => {
    const r = fuzzyMatch('ellipse', corpus)
    expect(r[0].name).toBe('ellipse')
    expect(r[0].distance).toBe(0)
  })

  it('returns close matches sorted by distance', () => {
    const r = fuzzyMatch('elipse', corpus)
    expect(r[0].name).toBe('ellipse')
    expect(r[0].distance).toBe(1)
  })

  it('respects the threshold default (tighter for long words)', () => {
    // word of length 3 → threshold = 2. "bkg" vs "background" is far.
    expect(fuzzyMatch('bkg', corpus)).toEqual([])
  })

  it('honors maxDistance override', () => {
    const r = fuzzyMatch('bkg', corpus, { maxDistance: 10 })
    expect(r.length).toBeGreaterThan(0)
  })

  it('caps by limit', () => {
    const r = fuzzyMatch('x', corpus, { maxDistance: 20, limit: 2 })
    expect(r.length).toBeLessThanOrEqual(2)
  })

  it('empty word → empty result', () => {
    expect(fuzzyMatch('', corpus)).toEqual([])
  })
})

describe('extractReferenceIdentifier', () => {
  it('Chrome format', () => {
    expect(
      extractReferenceIdentifier(new ReferenceError('stave is not defined')),
    ).toBe('stave')
  })
  it('Uncaught prefix stripped', () => {
    expect(
      extractReferenceIdentifier({ message: 'Uncaught foo is not defined' }),
    ).toBe('foo')
  })
  it('Safari format', () => {
    expect(
      extractReferenceIdentifier({ message: "Can't find variable: mystery" }),
    ).toBe('mystery')
  })
  it('string errors fall through', () => {
    expect(
      extractReferenceIdentifier('bar is not defined'),
    ).toBe('bar')
  })
  it('non-reference error returns null', () => {
    expect(
      extractReferenceIdentifier(new TypeError('x is not a function')),
    ).toBeNull()
  })
  it('empty input returns null', () => {
    expect(extractReferenceIdentifier(null)).toBeNull()
    expect(extractReferenceIdentifier('')).toBeNull()
  })
})

describe('formatFriendlyError', () => {
  it('produces a "Did you mean" message for a typo', () => {
    const err = new ReferenceError('stave is not defined')
    const r = formatFriendlyError(err, 'p5', { index: FAKE_INDEX })
    expect(r.message).toContain('`stave` is not defined')
    expect(r.message).toContain('Did you mean')
    expect(r.suggestion?.name).toBe('save')
    expect(r.suggestion?.docsUrl).toContain('/docs/reference/p5/')
    expect(r.suggestion?.example).toBe('save("out.png")')
  })

  it('handles ReferenceError without a close match', () => {
    const err = new ReferenceError('zzzqqqxxx is not defined')
    const r = formatFriendlyError(err, 'p5', { index: FAKE_INDEX })
    expect(r.message).toContain('`zzzqqqxxx` is not defined')
    expect(r.suggestion).toBeUndefined()
  })

  it('falls back to the raw message for non-reference errors', () => {
    const err = new TypeError('x is not a function')
    const r = formatFriendlyError(err, 'p5', { index: FAKE_INDEX })
    expect(r.message).toBe('x is not a function')
    expect(r.suggestion).toBeUndefined()
  })

  it('copies stack through when present', () => {
    const err = new ReferenceError('foo is not defined')
    const r = formatFriendlyError(err, 'p5', { index: FAKE_INDEX })
    expect(r.stack).toContain('ReferenceError')
  })

  it('honors docsUrlFor override', () => {
    const r = formatFriendlyError(
      new ReferenceError('stave is not defined'),
      'p5',
      {
        index: FAKE_INDEX,
        docsUrlFor: (runtime, name) => `https://example.test/${runtime}/${name}`,
      },
    )
    expect(r.suggestion?.docsUrl).toBe('https://example.test/p5/save')
  })

  it('works without an index — returns raw message', () => {
    const r = formatFriendlyError(
      new ReferenceError('foo is not defined'),
      'p5',
    )
    expect(r.message).toContain('foo is not defined')
    expect(r.suggestion).toBeUndefined()
  })

  it('handles thrown strings', () => {
    const r = formatFriendlyError('something blew up', 'p5')
    expect(r.message).toBe('something blew up')
  })
})
