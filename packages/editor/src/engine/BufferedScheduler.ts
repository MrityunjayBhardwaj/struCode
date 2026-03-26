import type { HapEvent } from './HapStream'
import type { HapStream } from './HapStream'
import type { NormalizedHap } from './NormalizedHap'
import type { PatternScheduler } from '../visualizers/types'

/**
 * Engine-agnostic PatternScheduler built from a live HapStream.
 *
 * Accumulates HapEvents into a rolling buffer of NormalizedHap[].
 * Any engine that provides streaming (HapStream) automatically gets
 * a synchronous queryable — no engine-specific code needed.
 *
 * Usage:
 *   const sched = new BufferedScheduler(hapStream, audioCtx)
 *   sched.query(begin, end) // → NormalizedHap[] from the buffer
 *   sched.now()             // → current audioContext time
 *   sched.dispose()         // → unsubscribe + clear buffer
 */
export class BufferedScheduler implements PatternScheduler {
  private buffer: NormalizedHap[] = []
  private audioCtx: AudioContext
  private maxAge: number
  private hapStream: HapStream
  private handler: (event: HapEvent) => void

  constructor(hapStream: HapStream, audioCtx: AudioContext, maxAge = 10) {
    this.hapStream = hapStream
    this.audioCtx = audioCtx
    this.maxAge = maxAge

    this.handler = (event: HapEvent) => {
      const begin = event.audioTime
      const end = event.audioTime + event.audioDuration

      this.buffer.push({
        begin,
        end,
        endClipped: end,
        note: event.midiNote,
        freq: typeof event.midiNote === 'number'
          ? 440 * Math.pow(2, (event.midiNote - 69) / 12)
          : null,
        s: event.s,
        gain: 1,
        velocity: 1,
        color: event.color,
      })

      // Evict old events
      const cutoff = this.audioCtx.currentTime - this.maxAge
      while (this.buffer.length > 0 && this.buffer[0].end < cutoff) {
        this.buffer.shift()
      }
    }

    hapStream.on(this.handler)
  }

  now(): number {
    return this.audioCtx.currentTime
  }

  query(begin: number, end: number): NormalizedHap[] {
    return this.buffer.filter(h => h.begin < end && h.end > begin)
  }

  /** Clear the buffer (e.g. on re-evaluate). */
  clear(): void {
    this.buffer.length = 0
  }

  dispose(): void {
    this.hapStream.off(this.handler)
    this.buffer.length = 0
  }
}
