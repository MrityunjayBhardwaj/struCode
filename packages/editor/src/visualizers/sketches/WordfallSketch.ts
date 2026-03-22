/**
 * Port of Strudel's wordfall to p5.js.
 * Vertical pianoroll with note labels — time flows downward (future at top, past at bottom).
 * Active notes are white-filled; inactive notes are dim blue. Labels drawn inside each block.
 * Mirrors Strudel: vertical=1, labels=1, stroke=0, fillActive=1, active='white'.
 */
import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'

const BG = '#090912'
const INACTIVE_COLOR = '#75baff'
const ACTIVE_COLOR = '#ffffff'
const PLAYHEAD_COLOR = 'rgba(255,255,255,0.5)'
const CYCLES = 4
const PLAYHEAD = 0.5

function getValue(hap: any): number | string {
  const { note, n, freq, s } = hap.value ?? {}
  if (typeof freq === 'number') return freq
  const noteVal = note ?? n
  if (noteVal !== undefined && noteVal !== null) return noteVal
  if (s) return '_' + s
  return hap.value ?? 0
}

function getLabel(hap: any): string {
  const { note, n, s } = hap.value ?? {}
  if (note !== undefined) return String(note)
  if (s !== undefined) return n !== undefined ? `${s}:${n}` : String(s)
  if (n !== undefined) return String(n)
  return ''
}

export function WordfallSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  _analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
    }

    p.draw = () => {
      const W = p.width
      const H = p.height
      p.background(BG)

      const scheduler = schedulerRef.current
      if (!scheduler) return

      let now: number
      try { now = scheduler.now() } catch { return }

      let haps: any[]
      try { haps = scheduler.query(now - CYCLES * PLAYHEAD, now + CYCLES * (1 - PLAYHEAD)) } catch { return }

      // Fold layout — unique sorted values, same as pianoroll
      const allValues = haps.map(h => getValue(h))
      const foldValues = [...new Set(allValues)].sort((a, b) =>
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : typeof a === 'number' ? 1 : String(a).localeCompare(String(b))
      )
      if (foldValues.length === 0) return

      const barW = W / foldValues.length

      for (const hap of haps) {
        const hapBegin = Number(hap.whole?.begin ?? 0)
        const hapEnd = Number(hap.endClipped ?? hap.whole?.end ?? hapBegin + 0.25)
        const hapDuration = hapEnd - hapBegin
        const isActive = hapBegin <= now && hapEnd > now

        // Vertical: y=0 is future (+CYCLES*(1-PLAYHEAD) ahead), y=H is past
        // timeToHap < 0 = past → y > playheadY; timeToHap > 0 = future → y < playheadY
        const timeToHap = hapBegin - now
        const playheadY = H * PLAYHEAD
        const y = playheadY - (timeToHap / CYCLES) * H
        const durationH = (hapDuration / CYCLES) * H

        const value = getValue(hap)
        const foldIdx = foldValues.indexOf(value)
        const x = foldIdx * barW

        const color = hap.value?.color ?? INACTIVE_COLOR
        p.noStroke()
        if (isActive) {
          p.fill(ACTIVE_COLOR)
        } else {
          // parse hex color with dim alpha
          try {
            const c = p.color(color)
            ;(c as any).setAlpha(160)
            p.fill(c)
          } catch {
            p.fill(INACTIVE_COLOR)
          }
        }
        p.rect(x + 1, y + 1, barW - 2, durationH - 2)

        // Label inside block
        if (durationH > 10 && barW > 16) {
          const label = getLabel(hap)
          if (label) {
            const fontSize = Math.min(barW * 0.55, durationH * 0.7, 11)
            p.textSize(fontSize)
            p.textAlign(p.LEFT, p.TOP)
            p.fill(isActive ? 0 : 255)
            p.noStroke()
            p.text(label, x + 3, y + 3)
          }
        }
      }

      // Playhead — horizontal line at PLAYHEAD * H
      p.stroke(PLAYHEAD_COLOR)
      p.strokeWeight(1)
      p.line(0, H * PLAYHEAD, W, H * PLAYHEAD)
    }
  }
}
