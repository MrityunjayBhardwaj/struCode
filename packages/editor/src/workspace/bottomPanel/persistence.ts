/**
 * persistence — SSR-safe localStorage helpers for BottomPanel state +
 * the `clampHeight` pure function shared with `useDragResize`.
 *
 * All readers MUST be safe to call from a `useState` initializer
 * (DA-06 + Trap 7). That means: no DOM access without the
 * `typeof window !== 'undefined'` guard, no throws on Safari private
 * mode (where `localStorage.getItem` raises), and a sensible default
 * return on every error path.
 *
 * Constants are exported so Playwright assertions (T-10) and component
 * tests (T-07) can reference the canonical key names.
 *
 * Phase 20-01 PR-A.
 */

export const BOTTOM_PANEL_HEIGHT_KEY = 'stave:bottomPanel.height'
export const BOTTOM_PANEL_OPEN_KEY = 'stave:bottomPanel.open'
export const BOTTOM_PANEL_ACTIVE_TAB_KEY = 'stave:bottomPanel.activeTabId'

export const BOTTOM_PANEL_HEIGHT_MIN = 80
export const BOTTOM_PANEL_HEIGHT_MAX = 600
export const BOTTOM_PANEL_HEIGHT_DEFAULT = 240

/**
 * Clamp a numeric height to [MIN, MAX]. Non-finite (NaN, Infinity) and
 * non-numbers fall back to BOTTOM_PANEL_HEIGHT_DEFAULT — the shared
 * "math fence" for both drag math and persistence read.
 */
export function clampHeight(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return BOTTOM_PANEL_HEIGHT_DEFAULT
  }
  if (value < BOTTOM_PANEL_HEIGHT_MIN) return BOTTOM_PANEL_HEIGHT_MIN
  if (value > BOTTOM_PANEL_HEIGHT_MAX) return BOTTOM_PANEL_HEIGHT_MAX
  return value
}

/**
 * Returns a real Storage interface or null. Mirrors the
 * `safeLocalStorage` guard in editorRegistry.ts: jsdom in the editor
 * package's vitest config provides a non-functional `localStorage`
 * stub (no methods); the `typeof getItem !== 'function'` check filters
 * those out alongside SSR (no window) and Safari private mode (throws).
 */
function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    if (typeof window.localStorage?.getItem !== 'function') return null
    return window.localStorage
  } catch {
    return null
  }
}

function safeGetItem(key: string): string | null {
  const ls = safeLocalStorage()
  if (!ls) return null
  try {
    return ls.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(key, value)
  } catch {
    /* quota / private mode — silently ignore */
  }
}

function safeRemoveItem(key: string): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * Read the persisted drawer height. Returns the default if the window
 * is unavailable, the entry is missing, parses to NaN, or fails the
 * clamp. Safe to call from a useState initializer.
 */
export function readPersistedHeight(): number {
  const raw = safeGetItem(BOTTOM_PANEL_HEIGHT_KEY)
  if (raw == null) return BOTTOM_PANEL_HEIGHT_DEFAULT
  const parsed = Number.parseFloat(raw)
  return clampHeight(parsed)
}

/**
 * Read the persisted open state. Default is `false` (closed) — the
 * drawer is opt-in for existing users (Trap 2 — closed-state pixel
 * cost is documented and bounded).
 */
export function readPersistedOpen(): boolean {
  const raw = safeGetItem(BOTTOM_PANEL_OPEN_KEY)
  return raw === 'true'
}

/**
 * Read the persisted active tab id. Returns `null` when missing — the
 * caller decides the fallback (typically the first registered tab).
 * Empty string is treated as null.
 */
export function readPersistedActiveTabId(): string | null {
  const raw = safeGetItem(BOTTOM_PANEL_ACTIVE_TAB_KEY)
  if (raw == null || raw === '') return null
  return raw
}

export function writePersistedHeight(value: number): void {
  safeSetItem(BOTTOM_PANEL_HEIGHT_KEY, String(clampHeight(value)))
}

export function writePersistedOpen(value: boolean): void {
  safeSetItem(BOTTOM_PANEL_OPEN_KEY, value ? 'true' : 'false')
}

export function writePersistedActiveTabId(value: string | null): void {
  if (value == null) {
    safeRemoveItem(BOTTOM_PANEL_ACTIVE_TAB_KEY)
    return
  }
  safeSetItem(BOTTOM_PANEL_ACTIVE_TAB_KEY, value)
}
