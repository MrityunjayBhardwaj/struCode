// @vitest-environment jsdom
/**
 * Integration test: DemoEngine + package exports + VizPicker filtering.
 *
 * Verifies:
 * 1. DemoEngine is exported from the package
 * 2. DemoEngine components drive VizPicker filtering correctly
 * 3. Queryable-dependent viz (pianoroll, wordfall) are disabled for DemoEngine
 * 4. Audio/streaming-only viz (scope, spectrum, spiral) are enabled
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DemoEngine } from './DemoEngine'
import type { EngineComponents } from './LiveCodingEngine'
import type { VizDescriptor } from '../visualizers/types'

// ---------------------------------------------------------------------------
// AudioContext mock (same as conformance tests)
// ---------------------------------------------------------------------------

globalThis.AudioContext = class MockAudioContext {
  currentTime = 0
  sampleRate = 44100
  state = 'running'
  createAnalyser(): any {
    return { fftSize: 0, smoothingTimeConstant: 0, connect() {}, disconnect() {} }
  }
  createGain(): any {
    return { gain: { value: 1 }, connect() {}, disconnect() {} }
  }
  createOscillator(): any {
    return { frequency: { value: 440 }, type: 'sine', connect() {}, start() {}, stop() {}, disconnect() {} }
  }
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
  get destination(): any { return {} }
} as any

// ---------------------------------------------------------------------------
// VizPicker filtering logic (extracted from VizPicker.tsx for unit testing)
// ---------------------------------------------------------------------------

function isVizEnabled(
  descriptor: VizDescriptor,
  availableComponents: (keyof EngineComponents)[]
): boolean {
  if (!descriptor.requires?.length) return true
  return descriptor.requires.every(req => availableComponents.includes(req))
}

// Subset of DEFAULT_VIZ_DESCRIPTORS (no factory needed for filtering tests)
const TEST_DESCRIPTORS: Pick<VizDescriptor, 'id' | 'label' | 'requires'>[] = [
  { id: 'pianoroll',  label: 'Piano Roll', requires: ['streaming', 'queryable'] },
  { id: 'wordfall',   label: 'Wordfall',   requires: ['streaming', 'queryable'] },
  { id: 'scope',      label: 'Scope',      requires: ['audio'] },
  { id: 'fscope',     label: 'FScope',     requires: ['audio'] },
  { id: 'spectrum',   label: 'Spectrum',   requires: ['audio'] },
  { id: 'spiral',     label: 'Spiral',     requires: ['streaming'] },
  { id: 'pitchwheel', label: 'Pitchwheel', requires: ['streaming'] },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DemoEngine integration', () => {
  let engine: DemoEngine

  beforeEach(() => {
    engine = new DemoEngine()
  })

  afterEach(() => {
    engine.dispose()
  })

  describe('package export', () => {
    it('DemoEngine is importable', () => {
      expect(DemoEngine).toBeDefined()
      expect(typeof DemoEngine).toBe('function')
    })

    it('DemoEngine instances have the LiveCodingEngine interface', () => {
      expect(typeof engine.init).toBe('function')
      expect(typeof engine.evaluate).toBe('function')
      expect(typeof engine.play).toBe('function')
      expect(typeof engine.stop).toBe('function')
      expect(typeof engine.dispose).toBe('function')
      expect(typeof engine.setRuntimeErrorHandler).toBe('function')
      expect(engine.components).toBeDefined()
    })
  })

  describe('VizPicker filtering with DemoEngine components', () => {
    it('DemoEngine provides streaming + audio, NOT queryable', async () => {
      await engine.init()
      await engine.evaluate('note: c4 e4 g4')
      const comps = engine.components
      const available = Object.keys(comps) as (keyof EngineComponents)[]

      expect(available).toContain('streaming')
      expect(available).toContain('audio')
      expect(available).not.toContain('queryable')
    })

    it('pianoroll is DISABLED (requires queryable)', async () => {
      await engine.init()
      await engine.evaluate('note: c4 e4 g4')
      const available = Object.keys(engine.components) as (keyof EngineComponents)[]
      const pianoroll = TEST_DESCRIPTORS.find(d => d.id === 'pianoroll')!
      expect(isVizEnabled(pianoroll as VizDescriptor, available)).toBe(false)
    })

    it('wordfall is DISABLED (requires queryable)', async () => {
      await engine.init()
      await engine.evaluate('note: c4 e4 g4')
      const available = Object.keys(engine.components) as (keyof EngineComponents)[]
      const wordfall = TEST_DESCRIPTORS.find(d => d.id === 'wordfall')!
      expect(isVizEnabled(wordfall as VizDescriptor, available)).toBe(false)
    })

    it('scope is ENABLED (requires audio only)', async () => {
      await engine.init()
      await engine.evaluate('note: c4 e4 g4')
      const available = Object.keys(engine.components) as (keyof EngineComponents)[]
      const scope = TEST_DESCRIPTORS.find(d => d.id === 'scope')!
      expect(isVizEnabled(scope as VizDescriptor, available)).toBe(true)
    })

    it('spectrum is ENABLED (requires audio only)', async () => {
      await engine.init()
      await engine.evaluate('note: c4 e4 g4')
      const available = Object.keys(engine.components) as (keyof EngineComponents)[]
      const spectrum = TEST_DESCRIPTORS.find(d => d.id === 'spectrum')!
      expect(isVizEnabled(spectrum as VizDescriptor, available)).toBe(true)
    })

    it('spiral is ENABLED (requires streaming only)', async () => {
      await engine.init()
      await engine.evaluate('note: c4 e4 g4')
      const available = Object.keys(engine.components) as (keyof EngineComponents)[]
      const spiral = TEST_DESCRIPTORS.find(d => d.id === 'spiral')!
      expect(isVizEnabled(spiral as VizDescriptor, available)).toBe(true)
    })

    it('pitchwheel is ENABLED (requires streaming only)', async () => {
      await engine.init()
      await engine.evaluate('note: c4 e4 g4')
      const available = Object.keys(engine.components) as (keyof EngineComponents)[]
      const pitchwheel = TEST_DESCRIPTORS.find(d => d.id === 'pitchwheel')!
      expect(isVizEnabled(pitchwheel as VizDescriptor, available)).toBe(true)
    })
  })

  describe('inlineViz integration', () => {
    it('viz: scope directive creates inlineViz component with correct afterLine', async () => {
      await engine.init()
      const code = 'note: c4 e4 g4\nviz: scope'
      await engine.evaluate(code)
      const { inlineViz } = engine.components
      expect(inlineViz).toBeDefined()

      const req = inlineViz!.vizRequests.get('demo')
      expect(req).toBeDefined()
      expect(req!.vizId).toBe('scope')
      // "note:" is on line 0 (0-indexed), afterLine should be 1 (1-indexed)
      expect(req!.afterLine).toBe(1)
    })

    it('without viz directive, inlineViz is absent', async () => {
      await engine.init()
      await engine.evaluate('note: c4 e4 g4')
      expect(engine.components.inlineViz).toBeUndefined()
    })
  })
})
