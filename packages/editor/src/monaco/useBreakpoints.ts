/**
 * useBreakpoints — Monaco gutter glyph + click handler for scheduler
 * breakpoints (PK13 step 9). Mirrors `useHighlighting`'s structure:
 * subscribes to BreakpointStore + IR snapshot, manages a single
 * `IEditorDecorationsCollection` for glyph rendering, registers an
 * onMouseDown handler keyed on `MouseTargetType.GUTTER_GLYPH_MARGIN`.
 *
 * Phase 20-07 (PV38, PV33, PV35, P50). Wave β.
 */
import { useCallback, useEffect, useRef } from 'react'
import type * as Monaco from 'monaco-editor'
import type { BreakpointStore } from '../engine/BreakpointStore'
import {
  getIRSnapshot,
  subscribeIRSnapshot,
  type IRSnapshot,
} from '../engine/irInspector'

// MouseTargetType.GUTTER_GLYPH_MARGIN === 2 per
// monaco-editor/esm/vs/editor/editor.api.d.ts (RESEARCH Q7). Hard-coded
// numeric to avoid coupling the hook to a runtime `monaco` instance —
// mirrors useHighlighting which only takes `editor` (no monaco).
const MOUSE_TARGET_GUTTER_GLYPH_MARGIN = 2 as const

let baseStyleInjected = false
function ensureBaseBreakpointStyle(): void {
  if (baseStyleInjected || typeof document === 'undefined') return
  baseStyleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .stave-bp-active {
      background: radial-gradient(circle, #ef4444 30%, transparent 30%);
      width: 14px !important;
      margin-left: 4px;
      cursor: pointer;
    }
    .stave-bp-orphaned {
      background: radial-gradient(circle, #6b7280 30%, transparent 30%);
      width: 14px !important;
      margin-left: 4px;
      opacity: 0.5;
      cursor: pointer;
    }
    .stave-bp-hovered {
      background: radial-gradient(circle, rgba(239, 68, 68, 0.4) 30%, transparent 30%);
      width: 14px !important;
      margin-left: 4px;
      cursor: pointer;
    }
  `
  document.head.appendChild(style)
}

export interface UseBreakpointsReturn {
  clearAll: () => void
}

/**
 * useBreakpoints — bridges BreakpointStore + IR snapshot to Monaco
 * gutter glyph decorations and a gutter click handler that toggles
 * breakpoint state for the line's leaf irNodeId set.
 *
 * Subscribes to:
 *  - `store.subscribe(...)` — re-renders glyphs on add/remove/toggle
 *  - `subscribeIRSnapshot(...)` — re-renders glyphs on snapshot change
 *    (handles orphan transitions when the user edits the s-string).
 *
 * Decoration semantics (R-3, RESEARCH Q5):
 *  - `stave-bp-active`: id resolves in `snap.irNodeIdLookup` — render
 *    a filled red dot at the loc-derived line.
 *  - `stave-bp-orphaned`: id is missing from `snap.irNodeIdLookup` AND
 *    `meta.lineHint != null` — render a grayed dot at the hinted line
 *    (Monaco-side orphans stay reachable for clear-via-gutter-click).
 *  - Orphan WITHOUT `lineHint`: silently skipped — Inspector-side
 *    orphan; cleared via Inspector right-click in 20-07-follow-up.
 *
 * Gutter click (RESEARCH Q7): bare click on
 * `MouseTargetType.GUTTER_GLYPH_MARGIN` (=== 2) — no modifier required.
 * Resolves `lineNumber` → `snap.irNodeIdsByLine.get(line)` →
 * `store.toggleSet(ids, { lineHint: line })`. Set semantics: one line
 * is one breakpoint (treats the leaf-set as atomic).
 */
export function useBreakpoints(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  store: BreakpointStore | null,
): UseBreakpointsReturn {
  const collectionRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)

  const clearAll = useCallback(() => {
    collectionRef.current?.clear()
    collectionRef.current = null
  }, [])

  useEffect(() => {
    if (!editor || !store) return

    ensureBaseBreakpointStyle()

    let currentSnapshot: IRSnapshot | null = getIRSnapshot()

    const render = (): void => {
      const model = editor.getModel()
      if (!model) return

      const entries = store.entries()
      if (entries.size === 0) {
        collectionRef.current?.clear()
        collectionRef.current = null
        return
      }

      // Phase 20-07 (R-3) — group breakpoint state per line. Active wins
      // over orphaned when the same line carries both classes (an active
      // hap re-binds an id whose lineHint pointed to that line).
      const lineState = new Map<number, 'active' | 'orphaned'>()
      const snap = currentSnapshot

      for (const [id, meta] of entries) {
        const event = snap?.irNodeIdLookup.get(id)
        if (event && event.loc && event.loc.length > 0) {
          // Active path — id is in snapshot. Compute line via the
          // pre-built reverse index `snap.irNodeIdsByLine` (PV38).
          let line: number | null = null
          for (const [lineKey, idsOnLine] of snap!.irNodeIdsByLine) {
            if (idsOnLine.includes(id)) {
              line = lineKey
              break
            }
          }
          if (line == null) continue
          lineState.set(line, 'active')
          continue
        }
        // Orphan path — id missing from snap.irNodeIdLookup. Render at
        // meta.lineHint if available; else silently skip (Inspector-side
        // orphan, cleared via Inspector right-click in 20-07-follow-up).
        const hint = meta.lineHint
        if (hint == null) continue
        const cur = lineState.get(hint)
        if (cur !== 'active') lineState.set(hint, 'orphaned')
      }

      const decorations: Monaco.editor.IModelDeltaDecoration[] = []
      for (const [line, state] of lineState) {
        decorations.push({
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: 1,
          },
          options: {
            isWholeLine: false,
            glyphMarginClassName:
              state === 'active' ? 'stave-bp-active' : 'stave-bp-orphaned',
            stickiness: 1 as const, // NeverGrowsWhenTypingAtEdges
          },
        })
      }
      if (collectionRef.current) {
        collectionRef.current.set(decorations)
      } else {
        collectionRef.current = editor.createDecorationsCollection(decorations)
      }
    }

    render()

    const unsubStore = store.subscribe(render)
    const unsubSnap = subscribeIRSnapshot((snap) => {
      currentSnapshot = snap
      render()
    })

    // RESEARCH Q7 — bare click on GUTTER_GLYPH_MARGIN, no modifier needed.
    const mouseDisposable = editor.onMouseDown((e) => {
      if (e.target.type !== MOUSE_TARGET_GUTTER_GLYPH_MARGIN) return
      const line = e.target.position?.lineNumber
      if (line == null) return
      const snap = getIRSnapshot()
      const ids = snap?.irNodeIdsByLine.get(line)
      if (!ids || ids.length === 0) return
      // R-3: capture clicked line as lineHint so the orphan path in
      // render() above can re-display the glyph if these ids later
      // orphan (user edits the s-string).
      store.toggleSet(ids, { lineHint: line })
    })

    return () => {
      unsubStore()
      unsubSnap()
      mouseDisposable.dispose()
      collectionRef.current?.clear()
      collectionRef.current = null
    }
  }, [editor, store])

  return { clearAll }
}
