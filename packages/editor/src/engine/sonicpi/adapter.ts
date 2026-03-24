/**
 * Adapter that wraps sonicPiWeb's SonicPiEngine to conform to
 * Motif's LiveCodingEngine interface.
 *
 * Key adaptations:
 * 1. PatternScheduler.query() is SYNC in Motif but sonicPiWeb's
 *    capture scheduler is async. Solution: pre-capture during
 *    evaluate() and serve from cache.
 * 2. Uses Motif's HapStream (same emit signature).
 * 3. Passes through all ECS components unchanged.
 *
 * NOTE: This imports from sonicPiWeb via relative path.
 * In production, sonicPiWeb would be published as an npm package.
 * For development, the relative path avoids npm link issues with pnpm.
 */

// sonicPiWeb engine — relative path to sibling project
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — path resolved at build time, not by tsc directly
import { SonicPiEngine as RawSonicPiEngine } from '../../../../../../sonicPiWeb/src/engine/SonicPiEngine'
// @ts-ignore
import type { CapturedEvent } from '../../../../../../sonicPiWeb/src/engine/CaptureScheduler'

// Motif types
import type { LiveCodingEngine, EngineComponents } from '../LiveCodingEngine'
import type { PatternScheduler } from '../../visualizers/types'
import { HapStream } from '../HapStream'

export class SonicPiEngine implements LiveCodingEngine {
  private raw: RawSonicPiEngine
  private motifHapStream = new HapStream()
  private cachedEvents: CapturedEvent[] = []
  private schedulerStartTime = 0
  private runtimeErrorHandler: ((err: Error) => void) | null = null

  constructor(options?: { schedAheadTime?: number }) {
    this.raw = new RawSonicPiEngine(options)
  }

  async init(): Promise<void> {
    await this.raw.init()

    // Bridge: sonicPiWeb's HapStream events → Motif's HapStream
    const rawStreaming = this.raw.components.streaming
    if (rawStreaming) {
      rawStreaming.hapStream.on((event: { hap: unknown; audioTime: number; audioDuration: number; scheduledAheadMs: number }) => {
        this.motifHapStream.emit(
          event.hap,
          event.audioTime,
          2,
          event.audioTime + event.audioDuration,
          event.audioTime - (event.scheduledAheadMs / 1000)
        )
      })
    }
  }

  async evaluate(code: string): Promise<{ error?: Error }> {
    const result = await this.raw.evaluate(code)
    if (result.error) return result

    // Pre-capture events for sync query (Stratum 1-2 only)
    const rawQueryable = this.raw.components.queryable
    if (rawQueryable?.scheduler) {
      try {
        const events = await rawQueryable.scheduler.queryArc(0, 16)
        this.cachedEvents = events as CapturedEvent[]
      } catch {
        this.cachedEvents = []
      }
    }

    this.schedulerStartTime = Date.now() / 1000
    return {}
  }

  play(): void { this.raw.play() }
  stop(): void { this.raw.stop() }

  dispose(): void {
    this.motifHapStream.dispose()
    this.raw.dispose()
  }

  setRuntimeErrorHandler(handler: (err: Error) => void): void {
    this.runtimeErrorHandler = handler
    this.raw.setRuntimeErrorHandler(handler)
  }

  get components(): Partial<EngineComponents> {
    const bag: Partial<EngineComponents> = {
      streaming: { hapStream: this.motifHapStream },
    }

    const rawAudio = this.raw.components.audio
    if (rawAudio) {
      bag.audio = rawAudio
    }

    if (this.cachedEvents.length > 0) {
      const cached = this.cachedEvents
      const startTime = this.schedulerStartTime

      const scheduler: PatternScheduler = {
        now: () => (Date.now() / 1000) - startTime,
        query: (begin: number, end: number) => {
          return cached
            .filter((e: CapturedEvent) => e.time >= begin && e.time < end)
            .map((e: CapturedEvent) => ({
              whole: { begin: e.time, end: e.time + 0.25 },
              part: { begin: e.time, end: e.time + 0.25 },
              value: e.params,
              context: {},
            }))
        },
      }

      bag.queryable = {
        scheduler,
        trackSchedulers: new Map(),
      }
    }

    const rawInlineViz = this.raw.components.inlineViz
    if (rawInlineViz) {
      bag.inlineViz = rawInlineViz
    }

    return bag
  }
}
