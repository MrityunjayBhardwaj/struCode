/**
 * vizCompiler — p5 compiler tests (editor-fixes Task 3).
 *
 * The new p5 compiler supports two modes:
 *
 *   1. Full-lifecycle: user writes `function preload/setup/draw`
 *      declarations at the top level. The compiler inlines the
 *      source inside `with(p) { ... }` so bare p5 identifiers
 *      (`createCanvas`, `background`, `width`, `HSB`, …) resolve to
 *      the p5 instance, and returns the declared functions for
 *      assignment onto the instance.
 *
 *   2. Legacy: bare draw-body statements (no `function draw`). The
 *      compiler auto-wraps them in a default `setup`/`draw` pair so
 *      pre-existing viz presets written for the old compiler keep
 *      working without modification.
 *
 * Stave-specific inputs are exposed via a single `stave` namespace
 * object with LIVE getters over the renderer refs:
 *
 *     stave.scheduler  // PatternScheduler | null
 *     stave.analyser   // AnalyserNode | null
 *     stave.hapStream  // HapStream | null
 *
 * Live getters mean that reading `stave.scheduler` inside `draw()`
 * always returns the current ref value, so a mid-mount refresh from
 * `P5VizRenderer.update(components)` is picked up automatically.
 *
 * These tests exercise the compiler as a pure function — we don't
 * spin up a real p5 instance; instead we construct a fake `p` object
 * that records the setup/draw/preload assignments and the calls made
 * through `with(p)` resolution, then invoke the lifecycle functions
 * and assert on the recorded state.
 */

import { describe, it, expect, vi } from 'vitest'
// Import from the pure `p5Compiler` module (not `vizCompiler`) so
// the test's module graph doesn't transitively pull in p5 → gifenc
// through P5VizRenderer, which breaks the vitest ESM loader.
import { compileP5Code, isFullLifecycleSketch } from '../p5Compiler'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'
import type { RefObject } from 'react'

// ---------------------------------------------------------------------------
// Test harness: a fake p5 instance that records calls
// ---------------------------------------------------------------------------

/**
 * Build a fake p5 instance whose methods are recording spies. The
 * fake captures `createCanvas`, `background`, `fill`, `rect`, and
 * `text` calls (the ones our tests actually exercise) plus exposes
 * stable `width` / `height` / `windowWidth` / `windowHeight` /
 * `HSB` / `RGB` values so bare-name lookups resolve.
 *
 * `installedLifecycle` is mutated when the compiled sketch function
 * runs — the compiler assigns `p.setup` / `p.draw` / `p.preload`.
 */
function makeFakeP5() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
    })

  const p: Record<string, unknown> = {
    // Size accessors — `width`/`height` are live p5 properties in
    // real usage; for these tests we pin them to constants.
    width: 400,
    height: 300,
    windowWidth: 1024,
    windowHeight: 768,
    // Color mode constants — the real p5 exposes these on the instance.
    RGB: 'RGB-const',
    HSB: 'HSB-const',
    PI: Math.PI,
    // Methods the tests call.
    createCanvas: record('createCanvas'),
    colorMode: record('colorMode'),
    background: record('background'),
    noStroke: record('noStroke'),
    fill: record('fill'),
    rect: record('rect'),
    ellipse: record('ellipse'),
    text: record('text'),
    textSize: record('textSize'),
    textFont: record('textFont'),
    noise: vi.fn(() => 0.5),
    map: vi.fn(
      (v: number, a: number, b: number, c: number, d: number) =>
        c + ((v - a) / (b - a)) * (d - c),
    ),
  }

  return { p, calls }
}

/**
 * Build a `{ current: ... }` ref pair (one for each of the three
 * inputs the sketch factory closes over). Tests mutate `.current`
 * directly to simulate the renderer updating the refs on source
 * changes / payload swaps.
 */
function makeRefs() {
  const hapStreamRef: { current: HapStream | null } = { current: null }
  const analyserRef: { current: AnalyserNode | null } = { current: null }
  const schedulerRef: { current: PatternScheduler | null } = { current: null }
  return {
    hapStreamRef: hapStreamRef as unknown as RefObject<HapStream | null>,
    analyserRef: analyserRef as unknown as RefObject<AnalyserNode | null>,
    schedulerRef: schedulerRef as unknown as RefObject<PatternScheduler | null>,
  }
}

/**
 * Compile a user source, invoke the returned factory with fresh
 * refs + a fake p5 instance, and return everything the tests want
 * to inspect: the fake p, the call log, the raw refs, and the
 * post-install `p.setup` / `p.draw` / `p.preload`.
 */
function compileAndMount(userCode: string) {
  const factory = compileP5Code(userCode)
  const refs = makeRefs()
  const sketchFn = factory(
    refs.hapStreamRef,
    refs.analyserRef,
    refs.schedulerRef,
  )
  const { p, calls } = makeFakeP5()
  sketchFn(p)
  return { p, calls, refs }
}

// ---------------------------------------------------------------------------
// isFullLifecycleSketch — detection helper
// ---------------------------------------------------------------------------

describe('isFullLifecycleSketch', () => {
  it('returns true when the source declares function draw', () => {
    expect(isFullLifecycleSketch('function draw() { background(0) }')).toBe(true)
  })

  it('returns true even when draw is preceded by other declarations', () => {
    expect(
      isFullLifecycleSketch(
        'let x = 0\nfunction setup() {}\nfunction draw() { x++ }',
      ),
    ).toBe(true)
  })

  it('tolerates extra whitespace in the function declaration', () => {
    expect(isFullLifecycleSketch('function  draw  ( )  { }')).toBe(true)
  })

  it('returns false for bare draw-body snippets (legacy)', () => {
    expect(isFullLifecycleSketch('background(0); ellipse(50, 50, 20)')).toBe(false)
  })

  it('returns false for the empty string', () => {
    expect(isFullLifecycleSketch('')).toBe(false)
  })

  it('does NOT match `const draw = ...` (that is not a declaration)', () => {
    expect(isFullLifecycleSketch('const draw = () => background(0)')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Full-lifecycle mode
// ---------------------------------------------------------------------------

describe('compileP5Code — full-lifecycle mode', () => {
  it('installs user-declared setup and draw on the p5 instance', () => {
    const source = `
      function setup() {
        createCanvas(windowWidth, windowHeight)
      }
      function draw() {
        background(0)
      }
    `
    const { p, calls } = compileAndMount(source)

    // Both lifecycle slots should be populated with functions.
    expect(typeof p.setup).toBe('function')
    expect(typeof p.draw).toBe('function')

    // Invoke setup — createCanvas should be called with the p5
    // instance's windowWidth/windowHeight (accessed via with(p)).
    ;(p.setup as () => void)()
    expect(
      calls.find((c) => c.method === 'createCanvas')?.args,
    ).toEqual([1024, 768])

    // Invoke draw — background(0) should reach p.background(0)
    // through the captured `with(p)` binding.
    ;(p.draw as () => void)()
    expect(calls.find((c) => c.method === 'background')?.args).toEqual([0])
  })

  it('installs a user-declared preload when present', () => {
    const source = `
      function preload() { background(42) }
      function draw() { background(0) }
    `
    const { p, calls } = compileAndMount(source)
    expect(typeof p.preload).toBe('function')
    ;(p.preload as () => void)()
    // preload invoked background(42)
    expect(
      calls.some((c) => c.method === 'background' && c.args[0] === 42),
    ).toBe(true)
  })

  it('falls back to a default setup when user only declared draw', () => {
    const source = 'function draw() { background(0) }'
    const { p, calls } = compileAndMount(source)
    expect(typeof p.setup).toBe('function')
    ;(p.setup as () => void)()
    // The default setup creates a canvas from windowWidth/windowHeight.
    expect(
      calls.find((c) => c.method === 'createCanvas')?.args,
    ).toEqual([1024, 768])
  })

  it('lets setup and draw share state via a top-level let', () => {
    // Shared state is a common p5 idiom: declare variables at the
    // top level, initialize them in setup, read/mutate them in draw.
    // With the compiler's `with(p) { ${code} }` wrapping, the `let`
    // declaration lives in the with-block scope and is captured by
    // both setup and draw's closures.
    const source = `
      let counter
      function setup() {
        counter = 10
        createCanvas(windowWidth, windowHeight)
      }
      function draw() {
        counter = counter + 1
        text(counter, 10, 10)
      }
    `
    const { p, calls } = compileAndMount(source)
    ;(p.setup as () => void)()
    ;(p.draw as () => void)()
    ;(p.draw as () => void)()
    ;(p.draw as () => void)()

    // After three draws, the last text call should be '13' (seeded
    // at 10 in setup, incremented three times).
    const textCalls = calls.filter((c) => c.method === 'text')
    expect(textCalls.length).toBe(3)
    expect(textCalls[textCalls.length - 1].args[0]).toBe(13)
  })

  it('resolves bare p5 constants like HSB through with(p)', () => {
    const source = `
      function setup() {
        colorMode(HSB, 360, 100, 100)
      }
      function draw() {}
    `
    const { p, calls } = compileAndMount(source)
    ;(p.setup as () => void)()
    const colorModeCall = calls.find((c) => c.method === 'colorMode')
    // `HSB` should have resolved to `p.HSB` (our fake value 'HSB-const').
    expect(colorModeCall?.args).toEqual(['HSB-const', 360, 100, 100])
  })
})

// ---------------------------------------------------------------------------
// stave namespace — live getter behavior
// ---------------------------------------------------------------------------

describe('compileP5Code — stave namespace', () => {
  it('exposes scheduler / analyser / hapStream via stave.*', () => {
    // The sketch writes observed stave.* values directly onto the
    // p5 instance (which we control via the test fake), since the
    // compiler's lifecycle object only exposes setup/draw/preload.
    // This is a test-harness trick, not a user-facing pattern.
    const source = `
      function draw() {
        p.seenScheduler = stave.scheduler
        p.seenAnalyser = stave.analyser
        p.seenHapStream = stave.hapStream
      }
    `
    const factory = compileP5Code(source)
    const refs = makeRefs()
    const fakeScheduler = { id: 'sched-a' } as unknown as PatternScheduler
    const fakeAnalyser = { frequencyBinCount: 1024 } as unknown as AnalyserNode
    const fakeHapStream = { id: 'hs-a' } as unknown as HapStream
    ;(refs.schedulerRef as unknown as { current: PatternScheduler | null })
      .current = fakeScheduler
    ;(refs.analyserRef as unknown as { current: AnalyserNode | null })
      .current = fakeAnalyser
    ;(refs.hapStreamRef as unknown as { current: HapStream | null })
      .current = fakeHapStream

    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
    )
    const { p } = makeFakeP5()
    sketchFn(p)

    ;(p.draw as () => void)()
    expect(p.seenScheduler).toBe(fakeScheduler)
    expect(p.seenAnalyser).toBe(fakeAnalyser)
    expect(p.seenHapStream).toBe(fakeHapStream)
  })

  it('stave fields are LIVE — mid-mount ref swaps are visible on next read', () => {
    // This is the safety net for `P5VizRenderer.update(components)`:
    // when the audio source payload changes within a mount (same
    // sourceRef), the renderer mutates its refs in place. The sketch
    // must see the new values on its next `stave.*` read without
    // having to re-compile.
    const source = `
      function draw() { p.seenAnalyser = stave.analyser }
    `
    const factory = compileP5Code(source)
    const refs = makeRefs()
    const analyserA = { tag: 'A' } as unknown as AnalyserNode
    const analyserB = { tag: 'B' } as unknown as AnalyserNode
    ;(refs.analyserRef as unknown as { current: AnalyserNode | null })
      .current = analyserA

    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
    )
    const { p } = makeFakeP5()
    sketchFn(p)

    ;(p.draw as () => void)()
    expect(p.seenAnalyser).toBe(analyserA)

    // Simulate P5VizRenderer.update() — swap the analyser in place.
    ;(refs.analyserRef as unknown as { current: AnalyserNode | null })
      .current = analyserB

    // Next draw should see the NEW analyser, not a cached A.
    ;(p.draw as () => void)()
    expect(p.seenAnalyser).toBe(analyserB)
  })
})

// ---------------------------------------------------------------------------
// Legacy mode — bare draw-body auto-wrap
// ---------------------------------------------------------------------------

describe('compileP5Code — legacy mode (backwards compat)', () => {
  it('auto-wraps bare draw-body statements in a default setup + draw', () => {
    // Pre-existing viz presets for the old compiler were written as
    // bare statements that were historically evaluated directly
    // inside `p.draw`. They must keep working without modification.
    const source = 'background(0); rect(10, 20, 30, 40)'
    const { p, calls } = compileAndMount(source)

    // Default setup should be installed.
    expect(typeof p.setup).toBe('function')
    ;(p.setup as () => void)()
    expect(
      calls.find((c) => c.method === 'createCanvas')?.args,
    ).toEqual([1024, 768])
    // Default setup also sets colorMode to RGB.
    expect(
      calls.find((c) => c.method === 'colorMode')?.args,
    ).toEqual(['RGB-const'])

    // The draw body should contain the user's statements.
    ;(p.draw as () => void)()
    expect(
      calls.some((c) => c.method === 'background' && c.args[0] === 0),
    ).toBe(true)
    expect(
      calls.find((c) => c.method === 'rect')?.args,
    ).toEqual([10, 20, 30, 40])
  })

  it('legacy snippets can access scheduler/analyser/hapStream as bare names', () => {
    // The old compiler exposed scheduler/analyser/hapStream as
    // function-scope locals. The new legacy-mode wrapper preserves
    // that contract by aliasing `stave.*` to bare identifiers inside
    // the synthetic draw body.
    const source = `
      if (scheduler) {
        rect(1, 2, 3, 4)
      }
    `
    const factory = compileP5Code(source)
    const refs = makeRefs()
    ;(refs.schedulerRef as unknown as { current: PatternScheduler | null })
      .current = { id: 's' } as unknown as PatternScheduler

    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
    )
    const { p, calls } = makeFakeP5()
    sketchFn(p)
    ;(p.draw as () => void)()

    // Scheduler was non-null, so rect should have fired.
    expect(
      calls.find((c) => c.method === 'rect')?.args,
    ).toEqual([1, 2, 3, 4])
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('compileP5Code — compile errors', () => {
  it('installs an error sketch when new Function throws a syntax error', () => {
    // An unbalanced brace surfaces as a SyntaxError inside new Function.
    const source = `
      function draw() {
        background(
      }
    `
    const { p, calls } = compileAndMount(source)

    // Both setup and draw should exist (the error sketch).
    expect(typeof p.setup).toBe('function')
    expect(typeof p.draw).toBe('function')

    // The error sketch's draw paints the error message via text().
    ;(p.setup as () => void)()
    ;(p.draw as () => void)()

    // At least one text call should contain a substring of the
    // parser error (e.g., `Unexpected`, `SyntaxError`, `}` etc.).
    const textCalls = calls.filter((c) => c.method === 'text')
    expect(textCalls.length).toBeGreaterThan(0)
    const messageCall = textCalls.find((c) =>
      /p5 viz compile error/i.test(String(c.args[0])),
    )
    expect(messageCall).toBeDefined()
  })
})
