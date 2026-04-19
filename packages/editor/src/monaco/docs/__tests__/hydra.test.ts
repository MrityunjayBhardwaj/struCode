import { describe, it, expect } from 'vitest'
import { HYDRA_DOCS_INDEX } from '../hydra'

describe('HYDRA_DOCS_INDEX', () => {
  it('declares runtime id', () => {
    expect(HYDRA_DOCS_INDEX.runtime).toBe('hydra')
  })

  it('has core source functions', () => {
    for (const name of ['osc', 'noise', 'shape', 'gradient', 'voronoi', 'solid']) {
      expect(HYDRA_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('has core coordinate transforms', () => {
    for (const name of ['rotate', 'scale', 'kaleid', 'pixelate', 'repeat']) {
      expect(HYDRA_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('has core combinators', () => {
    for (const name of ['blend', 'add', 'diff', 'layer', 'mask', 'modulate']) {
      expect(HYDRA_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('has runtime IO buffers', () => {
    for (const name of ['s0', 's1', 's2', 's3', 'o0', 'o1', 'o2', 'o3']) {
      expect(HYDRA_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('has runtime control functions', () => {
    for (const name of ['out', 'render', 'hush']) {
      expect(HYDRA_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('signatures include defaults', () => {
    expect(HYDRA_DOCS_INDEX.docs.osc.signature).toMatch(/frequency/)
    expect(HYDRA_DOCS_INDEX.docs.osc.signature).toMatch(/=/)
  })

  it('records provenance', () => {
    expect(HYDRA_DOCS_INDEX.meta?.source).toContain('hydra-synth')
  })
})
