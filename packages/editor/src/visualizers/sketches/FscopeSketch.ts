/**
 * Port of Strudel's drawFrequencyScope to p5.js.
 * Live frequency-domain bars: each FFT bin → a vertical bar symmetric around pos=0.75.
 * linear X axis (bin 0..N = low→high freq), bar height = normalized dB amplitude.
 * Mirrors Strudel defaults: scale=0.25, pos=0.75, lean=0.5, min=-100, max=0.
 */
import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'

const BG = '#090912'
const COLOR = '#75baff'
const SCALE = 0.25
const POS = 0.75
const LEAN = 0.5
const MIN_DB = -100
const MAX_DB = 0

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function FscopeSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  _schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
      p.noStroke()
    }

    p.draw = () => {
      const W = p.width
      const H = p.height
      p.background(BG)

      // Baseline at pos * H
      p.stroke(40, 50, 70)
      p.strokeWeight(0.5)
      p.noFill()
      p.line(0, POS * H, W, POS * H)
      p.noStroke()

      const analyser = analyserRef.current
      if (!analyser) return

      const bufferSize = analyser.frequencyBinCount
      const data = new Float32Array(bufferSize)
      analyser.getFloatFrequencyData(data)

      const sliceWidth = W / bufferSize
      p.fill(COLOR)

      for (let i = 0; i < bufferSize; i++) {
        const normalized = clamp((data[i] - MIN_DB) / (MAX_DB - MIN_DB), 0, 1)
        const v = normalized * SCALE
        const barH = v * H
        const barY = (POS - v * LEAN) * H
        p.rect(i * sliceWidth, barY, Math.max(sliceWidth, 1), barH)
      }
    }
  }
}
