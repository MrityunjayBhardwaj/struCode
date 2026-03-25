import type * as Monaco from 'monaco-editor'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRenderer, VizDescriptor } from './types'
import { mountVizRenderer } from './mountVizRenderer'

const VIEW_ZONE_HEIGHT = 150

/**
 * Handle returned by addInlineViewZones.
 *
 * - cleanup(): removes all zones and destroys renderer instances. Call before re-adding zones.
 * - pause(): freezes all inline renderers at their last frame (zones stay visible).
 * - resume(): resumes rendering in all inline zones.
 */
export interface InlineZoneHandle {
  cleanup(): void
  pause(): void
  resume(): void
}

/**
 * Imperatively adds inline visualization view zones using engine-provided placement info.
 *
 * Named `viewZones.ts` (not `useViewZones.ts`) because this exports a plain imperative
 * function, NOT a React hook.
 *
 * The engine's inlineViz component provides vizRequests: a map of track keys to
 * { vizId, afterLine }. Each entry produces a Monaco view zone placed after the
 * specified line. Unknown viz names are logged to console.warn.
 *
 * Returns an InlineZoneHandle with cleanup/pause/resume for lifecycle management.
 *
 * Note: Zone div is NOT in DOM when mount() fires — initial width uses
 * editor.getLayoutInfo().contentWidth, not container.clientWidth.
 */
export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  components: Partial<EngineComponents>,
  vizDescriptors: VizDescriptor[],
): InlineZoneHandle {
  const vizRequests = components.inlineViz?.vizRequests
  if (!vizRequests || vizRequests.size === 0) {
    return { cleanup: () => {}, pause: () => {}, resume: () => {} }
  }

  const zoneIds: string[] = []
  const renderers: VizRenderer[] = []
  const disconnects: (() => void)[] = []

  const contentWidth = editor.getLayoutInfo().contentWidth

  editor.changeViewZones((accessor) => {
    for (const [trackKey, { vizId, afterLine }] of vizRequests) {
      const descriptor = vizDescriptors.find(d => d.id === vizId)
      if (!descriptor) {
        console.warn(`[strucode] Unknown viz "${vizId}". Available: ${vizDescriptors.map(d => d.id).join(', ')}`)
        continue
      }

      const trackScheduler = components.queryable?.trackSchedulers.get(trackKey) ?? null
      const trackStream = components.inlineViz?.trackStreams?.get(trackKey)

      // Build per-zone component bag scoped to this track.
      // Per-track HapStream isolates event data (highlighting).
      // Audio component stays global — per-track audio requires engine-level bus routing.
      const zoneComponents: Partial<EngineComponents> = {
        ...components,
        ...(trackStream ? { streaming: { hapStream: trackStream } } : {}),
        queryable: {
          scheduler: trackScheduler,
          trackSchedulers: components.queryable?.trackSchedulers ?? new Map(),
        },
      }

      const container = document.createElement('div')
      container.style.cssText = `overflow:hidden;height:${VIEW_ZONE_HEIGHT}px;`

      const zoneId = accessor.addZone({
        afterLineNumber: afterLine,
        heightInPx: VIEW_ZONE_HEIGHT,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      const { renderer, disconnect } = mountVizRenderer(
        container,
        descriptor.factory,
        zoneComponents,
        { w: contentWidth || 400, h: VIEW_ZONE_HEIGHT },
        console.error
      )
      renderers.push(renderer)
      disconnects.push(disconnect)
    }
  })

  return {
    cleanup() {
      disconnects.forEach(fn => fn())
      renderers.forEach(r => r.destroy())
      editor.changeViewZones((accessor) => {
        zoneIds.forEach(id => accessor.removeZone(id))
      })
    },
    pause() {
      renderers.forEach(r => r.pause())
    },
    resume() {
      renderers.forEach(r => r.resume())
    },
  }
}
