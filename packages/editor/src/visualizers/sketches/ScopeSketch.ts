/**
 * Scope visualizer with dual data paths:
 * 1. AnalyserNode available → classic oscilloscope (time-domain waveform)
 * 2. PatternScheduler only → event pulse display (per-track activity)
 *
 * The fallback makes scope work for ANY engine via BufferedScheduler,
 * even without per-track audio routing.
 */
import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'
import type { NormalizedHap } from '../../engine/NormalizedHap'

const BG = '#090912'
const LINE_COLOR = '#75baff'
const PULSE_COLOR = '#75baff'
const POS = 0.75   // waveform baseline as fraction of height
const SCALE = 0.25 // vertical amplitude scale

export function ScopeSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
      p.noFill()
    }

    p.draw = () => {
      const W = p.width
      const H = p.height
      p.background(BG)

      // Always draw flat baseline
      p.stroke(40, 50, 70)
      p.strokeWeight(0.5)
      p.line(0, POS * H, W, POS * H)

      const analyser = analyserRef.current
      if (analyser) {
        // Path 1: Real audio waveform from AnalyserNode
        const bufferSize = analyser.frequencyBinCount
        const data = new Float32Array(bufferSize)
        analyser.getFloatTimeDomainData(data)

        // Trigger alignment: find falling zero-crossing
        let triggerIndex = 0
        for (let i = 1; i < bufferSize; i++) {
          if (data[i - 1] > 0 && data[i] <= 0) {
            triggerIndex = i
            break
          }
        }

        const sliceWidth = W / (bufferSize - triggerIndex)

        p.stroke(LINE_COLOR)
        p.strokeWeight(2)
        p.strokeCap('round')
        p.beginShape()
        for (let i = triggerIndex; i < bufferSize; i++) {
          const x = (i - triggerIndex) * sliceWidth
          const y = (POS - SCALE * data[i]) * H
          p.vertex(x, y)
        }
        p.endShape()
        return
      }

      // Path 2: Event pulses from PatternScheduler (BufferedScheduler)
      const scheduler = schedulerRef.current
      if (!scheduler) return

      let now: number
      try { now = scheduler.now() } catch { return }

      const WINDOW = 4 // seconds visible
      const from = now - WINDOW
      let haps: NormalizedHap[]
      try { haps = scheduler.query(from, now + 0.1) } catch { return }

      p.noStroke()

      for (const hap of haps) {
        const age = now - hap.begin
        const decay = Math.max(0, 1 - age / WINDOW)
        const x = ((hap.begin - from) / WINDOW) * W
        const pulseW = Math.max(3, ((hap.end - hap.begin) / WINDOW) * W)
        const pulseH = H * 0.6 * decay * hap.gain

        const col = p.color(hap.color ?? PULSE_COLOR)
        ;(col as any).setAlpha(decay * 200)
        p.fill(col)
        p.rect(x, POS * H - pulseH / 2, pulseW, pulseH, 2)
      }

      // Playhead at right edge
      p.stroke(255, 255, 255, 80)
      p.strokeWeight(1)
      p.line(W - 2, 0, W - 2, H)
    }
  }
}
