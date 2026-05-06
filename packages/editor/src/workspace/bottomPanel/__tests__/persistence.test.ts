/**
 * persistence tests — Phase 20-01 PR-A T-03.
 *
 * Covers clampHeight pure function (Trap 6 math fence), SSR-safe
 * readers (Trap 7 — no flash, must be callable from useState init),
 * and writer no-op behavior without window.
 */

import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest'
import {
  clampHeight,
  readPersistedHeight,
  readPersistedOpen,
  readPersistedActiveTabId,
  writePersistedHeight,
  writePersistedOpen,
  writePersistedActiveTabId,
  BOTTOM_PANEL_HEIGHT_KEY,
  BOTTOM_PANEL_OPEN_KEY,
  BOTTOM_PANEL_ACTIVE_TAB_KEY,
  BOTTOM_PANEL_HEIGHT_MIN,
  BOTTOM_PANEL_HEIGHT_MAX,
  BOTTOM_PANEL_HEIGHT_DEFAULT,
} from '../persistence'

// jsdom in this repo's vitest config provides a non-functional localStorage
// stub (no setItem / getItem / clear methods). Install a Map-backed mock on
// window.localStorage for the duration of this test file so the
// SSR-safe readers/writers can be exercised.
function installMockLocalStorage(): void {
  const store = new Map<string, string>()
  const mock: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k)
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: mock,
  })
}

describe('clampHeight', () => {
  it('returns value when within bounds', () => {
    expect(clampHeight(240)).toBe(240)
    expect(clampHeight(80)).toBe(80)
    expect(clampHeight(600)).toBe(600)
  })

  it('clamps below MIN to MIN', () => {
    expect(clampHeight(0)).toBe(BOTTOM_PANEL_HEIGHT_MIN)
    expect(clampHeight(-100)).toBe(BOTTOM_PANEL_HEIGHT_MIN)
    expect(clampHeight(50)).toBe(BOTTOM_PANEL_HEIGHT_MIN)
  })

  it('clamps above MAX to MAX', () => {
    expect(clampHeight(700)).toBe(BOTTOM_PANEL_HEIGHT_MAX)
    expect(clampHeight(99999)).toBe(BOTTOM_PANEL_HEIGHT_MAX)
  })

  it('falls back to DEFAULT for non-finite values', () => {
    expect(clampHeight(NaN)).toBe(BOTTOM_PANEL_HEIGHT_DEFAULT)
    expect(clampHeight(Infinity)).toBe(BOTTOM_PANEL_HEIGHT_DEFAULT)
    expect(clampHeight(-Infinity)).toBe(BOTTOM_PANEL_HEIGHT_DEFAULT)
  })

  it('falls back to DEFAULT for non-numbers (defensive)', () => {
    // @ts-expect-error — testing defensive guard against bad input
    expect(clampHeight('garbage')).toBe(BOTTOM_PANEL_HEIGHT_DEFAULT)
    // @ts-expect-error — testing defensive guard against bad input
    expect(clampHeight(null)).toBe(BOTTOM_PANEL_HEIGHT_DEFAULT)
  })
})

describe('readPersistedHeight (SSR-safe)', () => {
  beforeAll(installMockLocalStorage)
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns DEFAULT when localStorage is empty', () => {
    expect(readPersistedHeight()).toBe(BOTTOM_PANEL_HEIGHT_DEFAULT)
  })

  it('returns the stored value when present and valid', () => {
    window.localStorage.setItem(BOTTOM_PANEL_HEIGHT_KEY, '320')
    expect(readPersistedHeight()).toBe(320)
  })

  it('clamps stored value above MAX', () => {
    window.localStorage.setItem(BOTTOM_PANEL_HEIGHT_KEY, '5000')
    expect(readPersistedHeight()).toBe(BOTTOM_PANEL_HEIGHT_MAX)
  })

  it('clamps stored value below MIN', () => {
    window.localStorage.setItem(BOTTOM_PANEL_HEIGHT_KEY, '10')
    expect(readPersistedHeight()).toBe(BOTTOM_PANEL_HEIGHT_MIN)
  })

  it('falls back to DEFAULT on garbage', () => {
    window.localStorage.setItem(BOTTOM_PANEL_HEIGHT_KEY, 'garbage')
    expect(readPersistedHeight()).toBe(BOTTOM_PANEL_HEIGHT_DEFAULT)
  })

  it('falls back to DEFAULT when localStorage throws (Safari private mode)', () => {
    const spy = vi
      .spyOn(window.localStorage, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })
    expect(readPersistedHeight()).toBe(BOTTOM_PANEL_HEIGHT_DEFAULT)
    spy.mockRestore()
  })
})

describe('readPersistedOpen', () => {
  beforeAll(installMockLocalStorage)
  beforeEach(() => window.localStorage.clear())

  it('defaults to false (drawer is closed for first-time users)', () => {
    expect(readPersistedOpen()).toBe(false)
  })

  it('returns true when stored "true"', () => {
    window.localStorage.setItem(BOTTOM_PANEL_OPEN_KEY, 'true')
    expect(readPersistedOpen()).toBe(true)
  })

  it('returns false when stored "false"', () => {
    window.localStorage.setItem(BOTTOM_PANEL_OPEN_KEY, 'false')
    expect(readPersistedOpen()).toBe(false)
  })

  it('returns false on garbage (defensive)', () => {
    window.localStorage.setItem(BOTTOM_PANEL_OPEN_KEY, 'maybe')
    expect(readPersistedOpen()).toBe(false)
  })
})

describe('readPersistedActiveTabId', () => {
  beforeAll(installMockLocalStorage)
  beforeEach(() => window.localStorage.clear())

  it('returns null when missing', () => {
    expect(readPersistedActiveTabId()).toBeNull()
  })

  it('returns the stored id', () => {
    window.localStorage.setItem(BOTTOM_PANEL_ACTIVE_TAB_KEY, 'musical-timeline')
    expect(readPersistedActiveTabId()).toBe('musical-timeline')
  })

  it('treats empty string as null', () => {
    window.localStorage.setItem(BOTTOM_PANEL_ACTIVE_TAB_KEY, '')
    expect(readPersistedActiveTabId()).toBeNull()
  })
})

describe('writePersistedHeight', () => {
  beforeAll(installMockLocalStorage)
  beforeEach(() => window.localStorage.clear())

  it('writes a clamped numeric value', () => {
    writePersistedHeight(320)
    expect(window.localStorage.getItem(BOTTOM_PANEL_HEIGHT_KEY)).toBe('320')
  })

  it('clamps before writing', () => {
    writePersistedHeight(5000)
    expect(window.localStorage.getItem(BOTTOM_PANEL_HEIGHT_KEY)).toBe(
      String(BOTTOM_PANEL_HEIGHT_MAX),
    )
  })

  it('does not throw when localStorage.setItem throws', () => {
    const spy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded')
      })
    expect(() => writePersistedHeight(240)).not.toThrow()
    spy.mockRestore()
  })
})

describe('writePersistedOpen + writePersistedActiveTabId', () => {
  beforeAll(installMockLocalStorage)
  beforeEach(() => window.localStorage.clear())

  it('writes boolean as "true"/"false"', () => {
    writePersistedOpen(true)
    expect(window.localStorage.getItem(BOTTOM_PANEL_OPEN_KEY)).toBe('true')
    writePersistedOpen(false)
    expect(window.localStorage.getItem(BOTTOM_PANEL_OPEN_KEY)).toBe('false')
  })

  it('writes a non-null string id', () => {
    writePersistedActiveTabId('musical-timeline')
    expect(window.localStorage.getItem(BOTTOM_PANEL_ACTIVE_TAB_KEY)).toBe(
      'musical-timeline',
    )
  })

  it('removes the key when writing null', () => {
    window.localStorage.setItem(BOTTOM_PANEL_ACTIVE_TAB_KEY, 'foo')
    writePersistedActiveTabId(null)
    expect(window.localStorage.getItem(BOTTOM_PANEL_ACTIVE_TAB_KEY)).toBeNull()
  })
})

describe('SSR safety (no window)', () => {
  let originalWindow: typeof window | undefined
  beforeEach(() => {
    originalWindow = globalThis.window
    // Simulate SSR: drop the window entirely.
    delete (globalThis as { window?: unknown }).window
  })
  afterEach(() => {
    if (originalWindow) {
      ;(globalThis as { window?: typeof window }).window = originalWindow
    }
  })

  it('readPersistedHeight returns DEFAULT', () => {
    expect(readPersistedHeight()).toBe(BOTTOM_PANEL_HEIGHT_DEFAULT)
  })

  it('readPersistedOpen returns false', () => {
    expect(readPersistedOpen()).toBe(false)
  })

  it('readPersistedActiveTabId returns null', () => {
    expect(readPersistedActiveTabId()).toBeNull()
  })

  it('writers no-op without window', () => {
    expect(() => writePersistedHeight(240)).not.toThrow()
    expect(() => writePersistedOpen(true)).not.toThrow()
    expect(() => writePersistedActiveTabId('foo')).not.toThrow()
    expect(() => writePersistedActiveTabId(null)).not.toThrow()
  })
})
