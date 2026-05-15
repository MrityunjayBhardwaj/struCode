// Phase 20-14 α-5 — tier flag schema for heavy / permissioned Strudel modules.
//
// Schema only — no conditional imports yet. β-3 introduces the settings-modal
// UI that writes these flags; β-4 threads the `midi` flag through engine
// init (calls `enableWebMidi()` when on). The other 7 (csound, tidal, osc,
// serial, gamepad, motion, mqtt) ship in β-3 as disabled-scaffolded toggles
// — one queued follow-up issue per module wiring (see 20-14-PLAN.md §7).
//
// Source of truth: localStorage. The flags persist via the same mechanism
// the rest of editorRegistry.ts uses (key/value, lazy safeLocalStorage()
// access for SSR safety). Keys default to `false` — a missing/malformed
// localStorage entry reads false, which is the schema invariant: an
// unset flag is OFF.
//
// Lifecycle: read ONCE at engine init. Mid-session toggle changes are NOT
// observed — toggle UI in β-3 surfaces the "Changes take effect on reload"
// caption. RESEARCH §4 + §8 documented this.
//
// Schema drift: adding a 9th tier later is safe — `getTierFlags()` returns
// the default (false) for any missing key. Removing a tier requires
// purging the stale localStorage entry; document at remove time.

const STORAGE_PREFIX = 'stave.strudel.tier.'

export type TierName =
  | 'csound'
  | 'tidal'
  | 'midi'
  | 'osc'
  | 'serial'
  | 'gamepad'
  | 'motion'
  | 'mqtt'

export type TierFlags = Record<TierName, boolean>

const ALL_TIERS: TierName[] = [
  'csound',
  'tidal',
  'midi',
  'osc',
  'serial',
  'gamepad',
  'motion',
  'mqtt',
]

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    const ls = window.localStorage
    // jsdom's vitest test env can install a partial-Storage stub where
    // `getItem` is absent — duck-type before returning to keep readers
    // total. Same defensive shape as `editorRegistry.ts:safeLocalStorage`.
    if (!ls || typeof ls.getItem !== 'function') return null
    return ls
  } catch {
    // SSR or hardened environments throw on storage access.
    return null
  }
}

function readTierFlag(name: TierName): boolean {
  const ls = safeLocalStorage()
  if (!ls) return false
  return ls.getItem(`${STORAGE_PREFIX}${name}`) === '1'
}

function writeTierFlag(name: TierName, on: boolean): void {
  safeLocalStorage()?.setItem(`${STORAGE_PREFIX}${name}`, on ? '1' : '0')
}

/**
 * Read all 8 tier flags. Returns a fresh object each call; never null.
 * Unset / malformed keys read as `false` (schema-drift safe).
 */
export function getTierFlags(): TierFlags {
  const out = {} as TierFlags
  for (const name of ALL_TIERS) {
    out[name] = readTierFlag(name)
  }
  return out
}

/**
 * Set a single tier flag. Persists immediately; engine reads at next init().
 * β-3 settings modal calls this from its toggle handler.
 */
export function setTierFlag(name: TierName, on: boolean): void {
  writeTierFlag(name, on)
}

/**
 * The canonical tier name list — exported so β-3's UI can enumerate
 * toggles without hard-coding the schema in two places.
 */
export function listTiers(): readonly TierName[] {
  return ALL_TIERS
}
