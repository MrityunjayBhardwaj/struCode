/**
 * useTrackMeta hook — unit tests (Phase 20-12 α-3).
 *
 * Mirrors useWorkspaceFile.test.tsx structure (Phase 10.2 Task 01) — the
 * hook follows the same useSyncExternalStore pattern with ref-stable
 * snapshot + memoised setter.
 *
 * Covers:
 * - empty default when fileId is undefined; setter no-ops
 * - reads persisted record when fileId+trackId have one
 * - re-renders subscribed component on .set
 * - setter ref stable when fileId+trackId unchanged
 * - switching fileId switches the observed record (no stale subscription)
 * - two hooks for the same fileId+trackId observe the same updates
 */

import { describe, it, expect, beforeEach } from 'vitest'
import React, { useRef } from 'react'
import { render, act } from '@testing-library/react'
import { useTrackMeta } from '../useTrackMeta'
import {
  createWorkspaceFile,
  setTrackMeta,
  __resetWorkspaceFilesForTests,
} from '../WorkspaceFile'

function Probe({
  fileId,
  trackId,
  counter,
  setterRefs,
}: {
  fileId: string | undefined
  trackId: string
  counter?: { count: number }
  setterRefs?: Array<unknown>
}) {
  const { meta, set } = useTrackMeta(fileId, trackId)
  if (counter) counter.count++
  if (setterRefs) setterRefs.push(set)
  return (
    <div
      data-testid={`probe-${fileId ?? 'none'}-${trackId}`}
      data-color={meta.color ?? ''}
      data-collapsed={meta.collapsed === true ? '1' : '0'}
    />
  )
}

describe('20-12 α-3 — useTrackMeta', () => {
  beforeEach(() => {
    __resetWorkspaceFilesForTests()
  })

  it('returns empty meta when fileId is undefined; setter is no-op', () => {
    let writeHandle: ((p: { color?: string }) => void) | null = null
    function Reader() {
      const { meta, set } = useTrackMeta(undefined, 'd1')
      writeHandle = set
      return (
        <div
          data-testid="reader"
          data-color={meta.color ?? ''}
          data-collapsed={meta.collapsed === true ? '1' : '0'}
        />
      )
    }
    const { getByTestId } = render(<Reader />)
    expect(getByTestId('reader').getAttribute('data-color')).toBe('')
    expect(getByTestId('reader').getAttribute('data-collapsed')).toBe('0')
    // Setter must be safe to call when fileId is undefined — no throw, no write.
    expect(() => writeHandle?.({ color: '#abcdef' })).not.toThrow()
    expect(getByTestId('reader').getAttribute('data-color')).toBe('')
  })

  it('reads persisted color when fileId+trackId have a record', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'd1', { color: '#ff0000' })
    const { getByTestId } = render(<Probe fileId="f1" trackId="d1" />)
    expect(getByTestId('probe-f1-d1').getAttribute('data-color')).toBe('#ff0000')
  })

  it('re-renders subscribed component on set', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    const counter = { count: 0 }
    const { getByTestId } = render(
      <Probe fileId="f1" trackId="d1" counter={counter} />,
    )
    const before = counter.count
    act(() => {
      setTrackMeta('f1', 'd1', { color: '#00ff00' })
    })
    expect(getByTestId('probe-f1-d1').getAttribute('data-color')).toBe('#00ff00')
    expect(counter.count).toBeGreaterThan(before)
  })

  it('setter ref is stable across renders when fileId+trackId unchanged', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    const setterRefs: Array<unknown> = []
    const { rerender } = render(
      <Probe fileId="f1" trackId="d1" setterRefs={setterRefs} />,
    )
    rerender(<Probe fileId="f1" trackId="d1" setterRefs={setterRefs} />)
    rerender(<Probe fileId="f1" trackId="d1" setterRefs={setterRefs} />)
    // All captured setter refs share identity.
    expect(new Set(setterRefs).size).toBe(1)
  })

  it('switching fileId switches the observed record', () => {
    createWorkspaceFile('a', 'a.strudel', 'x', 'strudel')
    createWorkspaceFile('b', 'b.strudel', 'y', 'strudel')
    setTrackMeta('a', 'd1', { color: '#ff0000' })
    setTrackMeta('b', 'd1', { color: '#0000ff' })
    const { rerender, getByTestId } = render(
      <Probe fileId="a" trackId="d1" />,
    )
    expect(getByTestId('probe-a-d1').getAttribute('data-color')).toBe('#ff0000')
    rerender(<Probe fileId="b" trackId="d1" />)
    expect(getByTestId('probe-b-d1').getAttribute('data-color')).toBe('#0000ff')
  })

  it('two hooks for the same (fileId, trackId) observe the same updates', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    function TwoProbes() {
      const a = useTrackMeta('f1', 'd1')
      const b = useTrackMeta('f1', 'd1')
      return (
        <div>
          <span data-testid="a" data-color={a.meta.color ?? ''} />
          <span data-testid="b" data-color={b.meta.color ?? ''} />
        </div>
      )
    }
    const { getByTestId } = render(<TwoProbes />)
    act(() => {
      setTrackMeta('f1', 'd1', { color: '#abcdef' })
    })
    expect(getByTestId('a').getAttribute('data-color')).toBe('#abcdef')
    expect(getByTestId('b').getAttribute('data-color')).toBe('#abcdef')
  })

  it('snapshot reference is stable across unrelated notifications (no tearing)', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    const seenRefs: Array<unknown> = []
    function RefProbe() {
      const { meta } = useTrackMeta('f1', 'd1')
      const ref = useRef(meta)
      if (ref.current !== meta) ref.current = meta
      seenRefs.push(meta)
      return null
    }
    render(<RefProbe />)
    const initialRef = seenRefs[seenRefs.length - 1]
    // Mutating a DIFFERENT trackId should NOT change the snapshot ref of d1.
    // (Y.Map fires observeDeep for any nested mutation; the hook re-reads
    //  but getTrackMeta('f1', 'd1') returns the same stored value identity.)
    act(() => {
      setTrackMeta('f1', 'd2', { color: '#abcdef' })
    })
    const finalRef = seenRefs[seenRefs.length - 1]
    expect(finalRef).toBe(initialRef)
  })
})
