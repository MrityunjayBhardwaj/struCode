/**
 * bottomPanelRegistry tests — Phase 20-01 PR-A T-02.
 *
 * Covers register/unregister/list/get/subscribe + idempotent replace +
 * fresh-array contract (PV34) + test-isolation reset (Trap 9).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerBottomPanelTab,
  unregisterBottomPanelTab,
  listBottomPanelTabs,
  getBottomPanelTab,
  subscribeToBottomPanelTabs,
  __resetBottomPanelRegistryForTest,
  type BottomPanelTab,
} from '../bottomPanelRegistry'

const stub = (id: string, title = id): BottomPanelTab => ({
  id,
  title,
  content: null,
})

describe('bottomPanelRegistry', () => {
  beforeEach(() => {
    __resetBottomPanelRegistryForTest()
  })

  it('register adds an entry visible to listBottomPanelTabs', () => {
    registerBottomPanelTab(stub('a', 'Alpha'))
    const all = listBottomPanelTabs()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ id: 'a', title: 'Alpha' })
  })

  it('register-replace overwrites by id; getBottomPanelTab returns new entry', () => {
    registerBottomPanelTab(stub('a', 'Alpha'))
    registerBottomPanelTab(stub('a', 'Alpha v2'))
    expect(listBottomPanelTabs()).toHaveLength(1)
    expect(getBottomPanelTab('a')?.title).toBe('Alpha v2')
  })

  it('unregister removes by id; subsequent get returns undefined', () => {
    registerBottomPanelTab(stub('a'))
    registerBottomPanelTab(stub('b'))
    unregisterBottomPanelTab('a')
    expect(getBottomPanelTab('a')).toBeUndefined()
    expect(listBottomPanelTabs()).toHaveLength(1)
  })

  it('register returns an unsubscribe function that removes the entry', () => {
    const unsub = registerBottomPanelTab(stub('a'))
    expect(getBottomPanelTab('a')).toBeDefined()
    unsub()
    expect(getBottomPanelTab('a')).toBeUndefined()
  })

  it('unsubscribe is safe when the entry was already replaced', () => {
    const unsub = registerBottomPanelTab(stub('a', 'first'))
    registerBottomPanelTab(stub('a', 'second'))
    // The unsubscribe from the first registration must NOT remove the
    // replacement.
    unsub()
    expect(getBottomPanelTab('a')?.title).toBe('second')
  })

  it('subscribeToBottomPanelTabs fires on register, unregister, and replace', () => {
    let n = 0
    const unsub = subscribeToBottomPanelTabs(() => {
      n++
    })
    registerBottomPanelTab(stub('a')) // +1
    registerBottomPanelTab(stub('a')) // +1 (replace still notifies)
    unregisterBottomPanelTab('a') // +1
    unsub()
    registerBottomPanelTab(stub('b')) // listener no longer registered
    expect(n).toBe(3)
  })

  it('listBottomPanelTabs returns a fresh array reference on each call (PV34)', () => {
    registerBottomPanelTab(stub('a'))
    const a1 = listBottomPanelTabs()
    const a2 = listBottomPanelTabs()
    expect(a1).not.toBe(a2)
    expect(a1).toEqual(a2)
  })

  it('__resetBottomPanelRegistryForTest clears tabs and listeners', () => {
    let n = 0
    subscribeToBottomPanelTabs(() => {
      n++
    })
    registerBottomPanelTab(stub('a'))
    __resetBottomPanelRegistryForTest()
    expect(listBottomPanelTabs()).toHaveLength(0)
    // Listener should also be cleared — register again, n must NOT change
    // beyond what it was before reset (it was 1 after first register).
    const before = n
    registerBottomPanelTab(stub('b'))
    expect(n).toBe(before)
  })

  it('two sequential register-then-list cycles with reset between prove no leakage', () => {
    registerBottomPanelTab(stub('a'))
    registerBottomPanelTab(stub('b'))
    expect(listBottomPanelTabs().map((t) => t.id)).toEqual(['a', 'b'])
    __resetBottomPanelRegistryForTest()
    expect(listBottomPanelTabs()).toHaveLength(0)
    registerBottomPanelTab(stub('c'))
    expect(listBottomPanelTabs().map((t) => t.id)).toEqual(['c'])
  })
})
