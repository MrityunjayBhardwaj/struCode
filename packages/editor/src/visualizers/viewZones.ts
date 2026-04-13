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
    wrapper.style.transform = `translate(${-crop.x * contentWidth * scaleX}px, ${-crop.y * zoneHeight * scaleY}px) scale(${scaleX}, ${scaleY})`
    wrapper.style.transformOrigin = '0 0'
    return
  }
  const cropWrapper = document.createElement('div')
  cropWrapper.setAttribute('data-viz-crop-wrapper', '')
  cropWrapper.style.cssText = `position:absolute;inset:0;overflow:hidden;transform-origin:0 0;`
  const scaleX = 1 / crop.w
  const scaleY = 1 / crop.h
  cropWrapper.style.transform = `translate(${-crop.x * contentWidth * scaleX}px, ${-crop.y * zoneHeight * scaleY}px) scale(${scaleX}, ${scaleY})`
  while (container.firstChild) cropWrapper.appendChild(container.firstChild)
  container.style.position = 'relative'
  container.appendChild(cropWrapper)
}

/**
 * Create a floating action bar that lives in the editor's overflow-guard
 * (above all Monaco layers including text). Positioned absolutely; the
 * caller moves it to the right zone on hover.
 */
function createFloatingActionBar(editorDom: HTMLElement): HTMLElement {
  const bar = document.createElement('div')
  bar.setAttribute('data-viz-actions', '')
  bar.style.cssText = `
    position:absolute;z-index:100;
    display:flex;gap:4px;
    opacity:0;transition:opacity 0.15s;
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

  // Prevent Monaco from capturing mouse events on the buttons.
  const blockMonaco = (el: HTMLElement) => {
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); e.stopImmediatePropagation() }, true)
    el.addEventListener('mouseup', (e) => { e.stopPropagation(); e.stopImmediatePropagation() }, true)
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.stopImmediatePropagation() }, true)
    el.addEventListener('pointerup', (e) => { e.stopPropagation(); e.stopImmediatePropagation() }, true)
  }

  const editBtn = document.createElement('button')
  editBtn.textContent = '\u270E'
  editBtn.title = 'Edit viz file'
  editBtn.style.cssText = btnCss
  blockMonaco(editBtn)
  bar.appendChild(editBtn)

  const cropBtn = document.createElement('button')
  cropBtn.textContent = '\u2702'
  cropBtn.title = 'Crop inline region'
  cropBtn.style.cssText = btnCss
  blockMonaco(cropBtn)
  bar.appendChild(cropBtn)

  // Append to the overflow-guard (topmost Monaco wrapper)
  const guard = editorDom.querySelector('.overflow-guard') || editorDom
  guard.appendChild(bar)

  return bar
}

interface ZoneEntry {
  afterLine: number
  container: HTMLElement
  vizId: string
  presetId: string | null
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
  const zoneEntries: ZoneEntry[] = []

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
        console.error,
      )
      renderers.push(renderer)
      disconnects.push(disconnect)

      zoneEntries.push({ afterLine, container, vizId, presetId: null })
    }
  })

  // ── Async: load presets for crop regions + resolve preset IDs ──
  // Match viz names fuzzy: strip spaces, lowercase, ignore hyphens.
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '')
  void (async () => {
    try {
      const presets = await VizPresetStore.getAll()
      for (const entry of zoneEntries) {
        const normViz = normalize(entry.vizId)
        const preset = presets.find(p => normalize(p.name) === normViz)
        if (preset) {
          entry.presetId = preset.id
          if (preset.cropRegion) {
            applyCropRegion(entry.container, preset.cropRegion, zoneHeight, contentWidth || 400)
          }
        }
      }
    } catch { /* ignore */ }
  })()

  // ── Floating action bar (lives above text layer) ──
  const editorDom = editor.getDomNode?.()
  let floatingBar: HTMLElement | null = null
  let activeEntry: ZoneEntry | null = null
  let mouseMoveDisposable: { dispose(): void } | null = null

  if (editorDom && actions && (actions.onEdit || actions.onCrop)) {
    floatingBar = createFloatingActionBar(editorDom)

    // Wire click handlers — update targets on hover
    const editBtn = floatingBar.children[0] as HTMLElement
    const cropBtn = floatingBar.children[1] as HTMLElement

    editBtn.onclick = (e) => {
      e.stopPropagation()
      const vizId = floatingBar?.getAttribute('data-viz-id')
      if (vizId && actions.onEdit) actions.onEdit(vizId)
    }
    cropBtn.onclick = (e) => {
      e.stopPropagation()
      const vizId = floatingBar?.getAttribute('data-viz-id')
      const presetId = floatingBar?.getAttribute('data-preset-id') || null
      if (vizId && actions.onCrop) actions.onCrop(vizId, presetId)
    }

    mouseMoveDisposable = editor.onMouseMove?.((ev: Monaco.editor.IEditorMouseEvent) => {
      const mouseY = ev.event.posy
      const mouseX = ev.event.posx
      let found: ZoneEntry | null = null

      for (const entry of zoneEntries) {
        const rect = entry.container.getBoundingClientRect()
        if (mouseY >= rect.top && mouseY <= rect.bottom && mouseX >= rect.left && mouseX <= rect.right) {
          found = entry
          break
        }
      }

      if (found && floatingBar) {
        const rect = found.container.getBoundingClientRect()
        const guardRect = (editorDom.querySelector('.overflow-guard') || editorDom).getBoundingClientRect()
        floatingBar.style.top = `${rect.top - guardRect.top + 4}px`
        floatingBar.style.left = `${rect.right - guardRect.left - 68}px`
        floatingBar.style.opacity = '1'
        floatingBar.style.pointerEvents = 'auto'
        floatingBar.setAttribute('data-viz-id', found.vizId)
        floatingBar.setAttribute('data-preset-id', found.presetId || '')
        activeEntry = found
      } else if (floatingBar) {
        floatingBar.style.opacity = '0'
        floatingBar.style.pointerEvents = 'none'
        activeEntry = null
      }
    }) ?? null
  }

  const mouseLeaveHandler = () => {
    if (floatingBar) {
      floatingBar.style.opacity = '0'
      floatingBar.style.pointerEvents = 'none'
      activeEntry = null
    }
  }
  editorDom?.addEventListener('mouseleave', mouseLeaveHandler)

  return {
    cleanup() {
      mouseMoveDisposable?.dispose?.()
      editorDom?.removeEventListener('mouseleave', mouseLeaveHandler)
      floatingBar?.remove()
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
