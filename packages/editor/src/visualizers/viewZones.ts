import type * as Monaco from 'monaco-editor'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRenderer, VizDescriptor } from './types'
import { mountVizRenderer } from './mountVizRenderer'
import { resolveDescriptor } from './resolveDescriptor'
import { getVizConfig } from './vizConfig'
import { BufferedScheduler } from '../engine/BufferedScheduler'
import { VizPresetStore, type CropRegion } from './vizPreset'

export interface InlineZoneHandle {
  cleanup(): void
  pause(): void
  resume(): void
}

export interface VizZoneActions {
  onEdit?: (vizId: string) => void
  onCrop?: (vizId: string, presetId: string | null) => void
}

function applyCropRegion(
  container: HTMLElement,
  crop: CropRegion,
  zoneHeight: number,
  contentWidth: number,
): void {
  const wrapper = container.querySelector<HTMLElement>('[data-viz-crop-wrapper]')
  if (wrapper) {
    const scaleX = 1 / crop.w
    const scaleY = 1 / crop.h
    const tx = -crop.x * contentWidth * scaleX
    const ty = -crop.y * zoneHeight * scaleY
    wrapper.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`
    wrapper.style.transformOrigin = '0 0'
    return
  }
  const cropWrapper = document.createElement('div')
  cropWrapper.setAttribute('data-viz-crop-wrapper', '')
  cropWrapper.style.cssText = `position:absolute;inset:0;overflow:hidden;transform-origin:0 0;`
  const scaleX = 1 / crop.w
  const scaleY = 1 / crop.h
  const tx = -crop.x * contentWidth * scaleX
  const ty = -crop.y * zoneHeight * scaleY
  cropWrapper.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`
  while (container.firstChild) cropWrapper.appendChild(container.firstChild)
  container.style.position = 'relative'
  container.appendChild(cropWrapper)
}

function createActionBar(
  vizId: string,
  presetId: string | null,
  actions: VizZoneActions,
): HTMLElement {
  const bar = document.createElement('div')
  bar.setAttribute('data-viz-actions', '')
  bar.style.cssText = `
    position:absolute;top:4px;right:8px;z-index:10;
    display:flex;gap:4px;opacity:0;transition:opacity 0.15s;
    pointer-events:none;
  `
  const btnCss = `
    background:var(--bg-elevated,#1e1e38);
    border:1px solid var(--border-strong,#3a3a5a);
    border-radius:3px;padding:2px 6px;
    color:var(--text-primary,#e8e8f0);
    font-size:11px;cursor:pointer;
    font-family:system-ui,sans-serif;
    pointer-events:auto;
  `
  if (actions.onEdit) {
    const btn = document.createElement('button')
    btn.textContent = '\u270E'
    btn.title = 'Edit viz file'
    btn.style.cssText = btnCss
    btn.onclick = (e) => { e.stopPropagation(); actions.onEdit!(vizId) }
    bar.appendChild(btn)
  }
  if (actions.onCrop) {
    const btn = document.createElement('button')
    btn.textContent = '\u2702'
    btn.title = 'Crop inline region'
    btn.style.cssText = btnCss
    btn.onclick = (e) => { e.stopPropagation(); actions.onCrop!(vizId, presetId) }
    bar.appendChild(btn)
  }
  return bar
}

export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  components: Partial<EngineComponents>,
  vizDescriptors: VizDescriptor[],
  actions?: VizZoneActions,
): InlineZoneHandle {
  const vizRequests = components.inlineViz?.vizRequests
  if (!vizRequests || vizRequests.size === 0) {
    return { cleanup: () => {}, pause: () => {}, resume: () => {} }
  }

  const zoneIds: string[] = []
  const renderers: VizRenderer[] = []
  const disconnects: (() => void)[] = []
  const bufferedSchedulers: BufferedScheduler[] = []
  // Track zone containers + their line positions for mouse-hover detection.
  const zoneEntries: Array<{ afterLine: number; container: HTMLElement }> = []

  const contentWidth = editor.getLayoutInfo().contentWidth
  const audioCtx = components.audio?.audioCtx
  const zoneHeight = getVizConfig().inlineZoneHeight

  editor.changeViewZones((accessor) => {
    for (const [trackKey, { vizId, afterLine }] of vizRequests) {
      const descriptor = resolveDescriptor(vizId, vizDescriptors)
      if (!descriptor) {
        console.warn(`[stave] Unknown viz "${vizId}". Available: ${vizDescriptors.map(d => d.id).join(', ')}`)
        continue
      }

      let trackScheduler = components.queryable?.trackSchedulers.get(trackKey) ?? null
      const trackStream = components.inlineViz?.trackStreams?.get(trackKey)

      if (!trackScheduler && trackStream && audioCtx) {
        const buffered = new BufferedScheduler(trackStream, audioCtx)
        bufferedSchedulers.push(buffered)
        trackScheduler = buffered
      }

      const trackAnalyser = components.audio?.trackAnalysers?.get(trackKey)
      const zoneAudio = trackAnalyser && audioCtx
        ? { analyser: trackAnalyser, audioCtx, trackAnalysers: components.audio?.trackAnalysers }
        : (trackStream ? undefined : components.audio)

      const zoneComponents: Partial<EngineComponents> = {
        ...components,
        ...(trackStream ? { streaming: { hapStream: trackStream } } : {}),
        audio: zoneAudio,
        queryable: {
          scheduler: trackScheduler,
          trackSchedulers: components.queryable?.trackSchedulers ?? new Map(),
        },
      }

      const container = document.createElement('div')
      container.setAttribute('data-viz-zone', '')
      container.style.cssText = `overflow:hidden;height:${zoneHeight}px;position:relative;width:${contentWidth || 400}px;`

      const zoneId = accessor.addZone({
        afterLineNumber: afterLine,
        heightInPx: zoneHeight,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      const { renderer, disconnect } = mountVizRenderer(
        container,
        descriptor.factory,
        zoneComponents,
        { w: contentWidth || 400, h: zoneHeight },
        console.error
      )
      renderers.push(renderer)
      disconnects.push(disconnect)

      zoneEntries.push({ afterLine, container })

      // Async: load preset for crop + action icons
      void (async () => {
        try {
          const presets = await VizPresetStore.getAll()
          const preset = presets.find(p => p.name === vizId)
          if (preset?.cropRegion) {
            applyCropRegion(container, preset.cropRegion, zoneHeight, contentWidth || 400)
          }
          if (actions && (actions.onEdit || actions.onCrop)) {
            container.appendChild(createActionBar(vizId, preset?.id ?? null, actions))
          }
        } catch {
          if (actions && (actions.onEdit || actions.onCrop)) {
            container.appendChild(createActionBar(vizId, null, actions))
          }
        }
      })()
    }
  })

  // ── Mouse-move listener: show/hide action bars based on cursor Y ──
  // Monaco's text layer sits above view zones, so CSS :hover doesn't
  // fire on the zone container. Instead we listen to the editor's mouse
  // move event and check if the cursor is within a zone's screen region.
  let activeBar: HTMLElement | null = null
  const mouseMoveDisposable = editor.onMouseMove?.((e: Monaco.editor.IEditorMouseEvent) => {
    const mouseY = e.event.posy
    const mouseX = e.event.posx
    let found = false

    for (const { container } of zoneEntries) {
      const rect = container.getBoundingClientRect()
      if (
        mouseY >= rect.top && mouseY <= rect.bottom &&
        mouseX >= rect.left && mouseX <= rect.right
      ) {
        const bar = container.querySelector<HTMLElement>('[data-viz-actions]')
        if (bar && bar !== activeBar) {
          if (activeBar) { activeBar.style.opacity = '0'; activeBar.style.pointerEvents = 'none' }
          bar.style.opacity = '1'
          bar.style.pointerEvents = 'auto'
          activeBar = bar
        }
        found = true
        break
      }
    }

    if (!found && activeBar) {
      activeBar.style.opacity = '0'
      activeBar.style.pointerEvents = 'none'
      activeBar = null
    }
  })

  // Also hide when the mouse leaves the editor entirely
  const mouseLeaveHandler = () => {
    if (activeBar) {
      activeBar.style.opacity = '0'
      activeBar.style.pointerEvents = 'none'
      activeBar = null
    }
  }
  const editorDom = editor.getDomNode?.()
  editorDom?.addEventListener('mouseleave', mouseLeaveHandler)

  return {
    cleanup() {
      mouseMoveDisposable?.dispose?.()
      editorDom?.removeEventListener('mouseleave', mouseLeaveHandler)
      disconnects.forEach(fn => fn())
      renderers.forEach(r => r.destroy())
      bufferedSchedulers.forEach(s => s.dispose())
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
