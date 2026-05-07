/**
 * IR Inspector chrome — pure helpers for summarize() / children().
 *
 * Extracted from IRInspectorPanel.tsx so unit tests can import them
 * without pulling in the full panel + transitive `gifenc` (CommonJS)
 * dependency chain. The panel re-exports both for back-compat.
 *
 * Phase 20-04 (PV37 / D-05): wrapper-aware summarize + children honour
 * Code-with-via in the developer audience (PV35).
 */

import type { PatternIR } from '../../../editor/src/ir/PatternIR'

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3)
}

export function summarize(node: PatternIR): string {
  switch (node.tag) {
    case 'Pure':   return '()'
    case 'Play':   return `${JSON.stringify(node.note)} dur=${round(node.duration)}`
    case 'Sleep':  return `dur=${round(node.duration)}`
    case 'Seq':    return `${node.children.length} children`
    case 'Stack':  return `${node.tracks.length} tracks`
    case 'Cycle':  return `${node.items.length} items`
    case 'Choice': return `p=${node.p}`
    case 'Every':  return `n=${node.n}`
    case 'When':   return `gate=${node.gate}`
    case 'FX':     return `${node.name}(${Object.keys(node.params).join(', ')})`
    case 'Ramp':   return `${node.param} ${node.from}→${node.to} over ${node.cycles}c`
    case 'Fast':
    case 'Slow':
    case 'Elongate':
      return `factor=${node.factor}`
    case 'Late':    return `offset=${node.offset}`
    case 'Degrade': return `p=${node.p}`
    case 'Chunk':   return `n=${node.n}`
    case 'Ply':     return `n=${node.n}`
    case 'Struct':   return `mask="${node.mask}"`
    case 'Swing':    return `n=${node.n}`
    case 'Pick':     return `${node.lookup.length} entries`
    case 'Shuffle':  return `n=${node.n}`
    case 'Scramble': return `n=${node.n}`
    case 'Chop':     return `n=${node.n}`
    case 'Loop':   return ''
    case 'Code':
      // Phase 20-04 T-12 / D-05 / PV35 (developer chrome).
      // Wrapper case: render full call-site detail — "[opaque: .release(0.3)]".
      // Parse-failure case (no via): render the source code as before.
      if (node.via) return `[opaque: .${node.via.method}(${node.via.args})]`
      return JSON.stringify(node.code).slice(0, 60)
  }
}

export function children(node: PatternIR): readonly PatternIR[] {
  switch (node.tag) {
    case 'Seq':   return node.children
    case 'Stack': return node.tracks
    case 'Cycle': return node.items
    case 'Choice': return [node.then, node.else_]
    case 'Every': return node.default_ ? [node.body, node.default_] : [node.body]
    case 'When':  return [node.body]
    case 'FX':
    case 'Ramp':
    case 'Fast':
    case 'Slow':
    case 'Elongate':
    case 'Late':
    case 'Degrade':
    case 'Ply':
    case 'Struct':
    case 'Swing':
    case 'Shuffle':
    case 'Scramble':
    case 'Chop':
    case 'Loop':  return [node.body]
    case 'Chunk': return [node.body, node.transform]
    // Pick is the first IR shape with a list-of-sub-IRs alongside a
    // distinguished selector child — render selector first, then the
    // lookup entries as siblings.
    case 'Pick':  return [node.selector, ...node.lookup]
    // Phase 20-04 T-12 / D-05 (developer tree expansion).
    // Wrapper case: expose via.inner as a child so the inspector tree can
    // drill into the wrapped receiver. Parse-failure case (no via): leaf.
    case 'Code':  return node.via ? [node.via.inner] : []
    default:      return []
  }
}
