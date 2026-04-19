import { describe, it, expect } from 'vitest'
import { P5_DOCS_INDEX } from '../p5'

describe('P5_DOCS_INDEX', () => {
  it('declares runtime id', () => {
    expect(P5_DOCS_INDEX.runtime).toBe('p5js')
  })

  it('has the core drawing primitives', () => {
    for (const name of [
      'ellipse',
      'rect',
      'line',
      'triangle',
      'background',
      'fill',
      'stroke',
    ]) {
      expect(P5_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('has the core math helpers', () => {
    for (const name of ['map', 'lerp', 'constrain', 'random', 'noise']) {
      expect(P5_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('has p5 constants', () => {
    for (const name of ['PI', 'HALF_PI', 'TWO_PI', 'TAU', 'RGB', 'HSB']) {
      expect(P5_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('entries carry signature + description + sourceUrl', () => {
    const sample = P5_DOCS_INDEX.docs['ellipse']
    expect(sample.signature).toMatch(/^ellipse\(/)
    expect(sample.description.length).toBeGreaterThan(0)
    expect(sample.sourceUrl).toMatch(/^https:\/\/p5js\.org\/reference/)
  })

  it('records provenance', () => {
    expect(P5_DOCS_INDEX.meta?.version).toBeDefined()
    expect(P5_DOCS_INDEX.meta?.source).toContain('p5js.org')
  })

  it('has more than 300 entries', () => {
    expect(Object.keys(P5_DOCS_INDEX.docs).length).toBeGreaterThan(300)
  })
})
