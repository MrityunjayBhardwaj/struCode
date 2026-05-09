/**
 * pitch — Phase 20-12 α-6.
 *
 * Coverage:
 *   - noteStringToMidi: canonical pitches + accidentals + negative octave
 *   - freqToMidi: A4 / A3 / A5 sanity
 *   - extractPitch: priority order across evt.note + evt.params.{note,n,freq}
 */

import { describe, it, expect } from 'vitest'
import type { IREvent } from '@stave/editor'
import { noteStringToMidi, freqToMidi, extractPitch } from '../pitch'

function baseEvent(partial: Partial<IREvent> = {}): IREvent {
  return {
    begin: 0,
    end: 0.1,
    endClipped: 0.1,
    note: null,
    freq: null,
    s: null,
    gain: 1,
    velocity: 1,
    color: null,
    ...partial,
  }
}

describe('20-12 α-6 — noteStringToMidi', () => {
  it('c4 → 60 (canonical middle C)', () => {
    expect(noteStringToMidi('c4')).toBe(60)
  })
  it('C4 → 60 (case-insensitive letter)', () => {
    expect(noteStringToMidi('C4')).toBe(60)
  })
  it('a4 → 69 (canonical A4)', () => {
    expect(noteStringToMidi('a4')).toBe(69)
  })
  it('C#5 → 73 (sharp accidental)', () => {
    expect(noteStringToMidi('C#5')).toBe(73)
  })
  it('Bb3 → 58 (flat accidental)', () => {
    expect(noteStringToMidi('Bb3')).toBe(58)
  })
  it('Bb-1 → 10 (negative octave)', () => {
    expect(noteStringToMidi('Bb-1')).toBe(10)
  })
  it('garbage → null', () => {
    expect(noteStringToMidi('xyz')).toBeNull()
  })
  it('empty → null', () => {
    expect(noteStringToMidi('')).toBeNull()
  })
})

describe('20-12 α-6 — freqToMidi', () => {
  it('440 → 69 (A4)', () => {
    expect(freqToMidi(440)).toBeCloseTo(69, 5)
  })
  it('220 → 57 (A3)', () => {
    expect(freqToMidi(220)).toBeCloseTo(57, 5)
  })
  it('880 → 81 (A5)', () => {
    expect(freqToMidi(880)).toBeCloseTo(81, 5)
  })
  it('non-positive freq → NaN (defensive)', () => {
    expect(freqToMidi(0)).toBeNaN()
    expect(freqToMidi(-440)).toBeNaN()
  })
})

describe('20-12 α-6 — extractPitch', () => {
  it('reads top-level evt.note (numeric)', () => {
    const evt = baseEvent({ note: 60 })
    expect(extractPitch(evt)).toEqual({ source: 'note', midi: 60 })
  })

  it('reads top-level evt.note (string)', () => {
    const evt = baseEvent({ note: 'c4' })
    expect(extractPitch(evt)).toEqual({ source: 'note', midi: 60 })
  })

  it('reads evt.params.note when top-level is null', () => {
    const evt = baseEvent({ note: null, params: { note: 'c4' } })
    expect(extractPitch(evt)).toEqual({ source: 'params.note', midi: 60 })
  })

  it('reads evt.params.n (numeric MIDI)', () => {
    const evt = baseEvent({ note: null, params: { n: 7 } })
    expect(extractPitch(evt)).toEqual({ source: 'params.n', midi: 7 })
  })

  it('preserves n: 0 (valid MIDI 0 = C-1) — not skipped by truthy guard', () => {
    const evt = baseEvent({ note: null, params: { n: 0 } })
    expect(extractPitch(evt)).toEqual({ source: 'params.n', midi: 0 })
  })

  it('reads evt.params.freq via freqToMidi', () => {
    const evt = baseEvent({ note: null, params: { freq: 440 } })
    const p = extractPitch(evt)
    expect(p?.source).toBe('params.freq')
    expect(p?.midi).toBeCloseTo(69, 5)
  })

  it('returns null when no pitch source present (percussive event)', () => {
    const evt = baseEvent({ note: null, params: {} })
    expect(extractPitch(evt)).toBeNull()
  })

  it('returns null when params is undefined and note is null', () => {
    const evt = baseEvent({ note: null })
    expect(extractPitch(evt)).toBeNull()
  })

  it('top-level evt.note wins over evt.params.note (priority order)', () => {
    const evt = baseEvent({ note: 'a4', params: { note: 'c4' } })
    expect(extractPitch(evt)).toEqual({ source: 'note', midi: 69 })
  })

  it('params.note wins over params.n (priority order)', () => {
    const evt = baseEvent({ note: null, params: { note: 'c4', n: 99 } })
    expect(extractPitch(evt)).toEqual({ source: 'params.note', midi: 60 })
  })

  it('params.n wins over params.freq (priority order)', () => {
    const evt = baseEvent({ note: null, params: { n: 7, freq: 440 } })
    expect(extractPitch(evt)).toEqual({ source: 'params.n', midi: 7 })
  })

  it('falls through to next source when string is unparseable', () => {
    const evt = baseEvent({ note: null, params: { note: 'xyz', n: 7 } })
    // params.note 'xyz' fails noteStringToMidi → fall through to params.n.
    expect(extractPitch(evt)).toEqual({ source: 'params.n', midi: 7 })
  })

  it('non-numeric, non-string param value → fall through', () => {
    const evt = baseEvent({ note: null, params: { note: { foo: 'bar' }, n: 7 } as Record<string, unknown> })
    expect(extractPitch(evt)).toEqual({ source: 'params.n', midi: 7 })
  })
})
