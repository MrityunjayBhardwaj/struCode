import type { VizDescriptor } from './types'
import type { VizPreset } from './vizPreset'
import { P5VizRenderer } from './renderers/P5VizRenderer'
import { HydraVizRenderer } from './renderers/HydraVizRenderer'
import type { HydraPatternFn } from './renderers/HydraVizRenderer'
import { compileP5Code, isFullLifecycleSketch } from './p5Compiler'

// Re-export the pure p5 compile functions so existing consumers that
// import from `./vizCompiler` keep working. The implementations live
// in `./p5Compiler` to keep the module graph of unit tests free of
// the transitive `p5` / `gifenc` dependency chain that comes in via
// `P5VizRenderer`.
export { compileP5Code, isFullLifecycleSketch }

/**
 * Compiles user-authored viz code into a VizDescriptor.
 *
 * Hydra code: evaluated in a function scope with the hydra synth
 *   object as the implicit `s` parameter. Uses `new Function()`.
 *
 * p5 code: evaluated as a full p5 sketch script. Users write real
 *   `function preload/setup/draw` declarations and access injected
 *   Stave-specific inputs via a single `stave` namespace global:
 *     - `stave.scheduler`  — PatternScheduler | null
 *     - `stave.analyser`   — AnalyserNode | null
 *     - `stave.hapStream`  — HapStream | null
 *   Legacy draw-body snippets (no `function draw` declaration) are
 *   auto-wrapped for backwards compatibility.
 */
export function compilePreset(preset: VizPreset): VizDescriptor {
  const { id, name, renderer, code, requires } = preset

  if (renderer === 'hydra') {
    return {
      id,
      label: name,
      renderer: 'hydra',
      requires,
      factory: () => new HydraVizRenderer(compileHydraCode(code)),
    }
  }

  if (renderer === 'p5') {
    return {
      id,
      label: name,
      renderer: 'p5',
      requires,
      factory: () => new P5VizRenderer(compileP5Code(code)),
    }
  }

  throw new Error(`Unknown renderer: ${renderer}`)
}

/**
 * Compile Hydra code string into a HydraPatternFn.
 * The code runs with `s` (the hydra synth) in scope.
 */
function compileHydraCode(code: string): HydraPatternFn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (s: any) => {
    const fn = new Function('s', code)
    fn(s)
  }
}
