/**
 * WorkspaceAudioBus — Phase 10.2 Task 02.
 *
 * Multi-publisher, consumer-routed audio bus. Pattern runtimes (Strudel,
 * SonicPi, future engines) `publish` their `engine.components` bag under
 * their `WorkspaceFile.id`; viz consumers (HYDRA_VIZ, P5_VIZ, popout
 * windows) `subscribe` with an `AudioSourceRef` selector — `'default'`
 * (follow most recent), `{ kind: 'file', fileId }` (pin), or `'none'`
 * (demo mode). Per CONTEXT D-02 / D-04 / U1.
 *
 * @remarks
 * ## Why a singleton (per CONTEXT U1)
 *
 * The bus is a module-level constant export, mirroring the `VizPresetStore`
 * precedent in `visualizers/vizPreset.ts`. Every `import` resolves to the
 * same instance, no class-per-shell. Multi-shell support (one bus per
 * `WorkspaceShell` instance) is deferred to Phase 11 if it ever arrives —
 * the `WorkspaceAudioBus` interface in `types.ts` documents the contract
 * abstractly so a class-based variant can be slotted in without churning
 * consumers.
 *
 * ## Why a recency LIST, not a single "current default"
 *
 * The pre-mortem (PLAN.md §10.2-02 secondary failure) calls out the easy
 * mistake: tracking the default as a single slot. Then this happens —
 *
 * 1. A publishes → default = A.
 * 2. B publishes → default = B (more recent).
 * 3. B unpublishes → default = null. **Wrong.** A is still publishing.
 *
 * The fix is to keep the recency as an ORDERED ARRAY: push on publish,
 * splice on unpublish. The "current default" is always
 * `recency[recency.length - 1]`, and `null` only when the list is empty.
 * This file's `recency` and `defaultPayload()` implement that contract.
 *
 * ## Why identity equality, not deep equality
 *
 * D-01 specifies "subscribe + re-mount" — the bus delivers ONE callback per
 * publisher identity change, not per audio frame. If the runtime pushes a
 * new payload object every audio tick, deep-equal would walk a non-trivial
 * graph and re-fire spuriously when sub-objects change for unrelated
 * reasons. Instead, we shallow-compare the public component slots
 * (`hapStream`, `analyser`, `scheduler`, `inlineViz`, `audio`). If every
 * slot reference matches, the publish is a no-op — same engine, same
 * audio nodes, no observable change. This keeps the bus out of the
 * per-frame FFT read path; consumers reach into `payload.analyser`
 * directly for that.
 *
 * ## What the bus does NOT own
 *
 * The bus stores `AudioPayload` records that hold REFERENCES to live
 * `AnalyserNode` / `HapStream` / `PatternScheduler` instances created
 * inside engines. The bus never creates, copies, or routes audio. PV3
 * (orbits) and UV6 (observation without mutation) are respected by
 * reference-passing — no audio routing changes happen here.
 *
 * ## Test isolation
 *
 * `__resetWorkspaceAudioBusForTests()` clears every internal collection.
 * Same pattern as `__resetWorkspaceFilesForTests()` from Task 01. Tests
 * call this in `beforeEach`.
 */

import type {
  AudioPayload,
  AudioSourceListing,
  AudioSourceRef,
  WorkspaceAudioBus,
} from './types'

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * Map of `sourceId → current payload`. The bus owns this map exclusively;
 * no other module mutates it. Replaced (not mutated) on `publish` and
 * deleted on `unpublish`, mirroring the snapshot-identity discipline of the
 * Task 01 file store.
 */
const payloads = new Map<string, AudioPayload>()

/**
 * Ordered list of `sourceId`s in publish order. The LAST element is the
 * most-recent publisher (i.e., the current default). On `publish` for a
 * new id we `push`; on `unpublish` we `splice` out the entry but preserve
 * the relative order of everyone else. On `publish` for an EXISTING id
 * (payload replacement) we leave the recency position untouched — the
 * default-tracker semantics treat re-publish as "still the same publisher,"
 * not as "promoted to most-recent."
 *
 * Invariants:
 * - Every id in `recency` has a corresponding entry in `payloads`.
 * - Every id in `payloads` has exactly one corresponding entry in `recency`.
 * - No duplicate ids.
 */
const recency: string[] = []

/**
 * Pinned subscribers, keyed by source id. A subscriber pinned to file id
 * "X" only fires when that specific publisher (un)publishes — never on
 * any other publisher's events. Held as a Set for O(1) add/delete and
 * stable iteration order.
 */
const pinnedSubscribers = new Map<
  string,
  Set<(payload: AudioPayload | null) => void>
>()

/**
 * Default-tracker subscribers — the ones that follow whichever publisher
 * is currently most-recent. Fires whenever the most-recent slot changes:
 * a brand-new publisher arrives (recency.push), the current default
 * unpublishes (recency.splice + fall-through), or the most-recent
 * publisher swaps payloads with non-equivalent component refs.
 */
const defaultSubscribers = new Set<
  (payload: AudioPayload | null) => void
>()

/**
 * `onSourcesChanged` listeners. Fires whenever the SET of registered
 * publisher ids changes — i.e., a `publish` for a new id, or an
 * `unpublish`. Re-publishing an existing id with a different payload does
 * NOT trigger this listener (the source set is unchanged). The dropdown
 * UI uses this to know when to invalidate its rendered <option> list and
 * re-read `listSources()` on next open.
 */
const sourcesChangedListeners = new Set<() => void>()

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read the current default payload (most-recent publisher's payload, or
 * `null` if no publishers are registered). Used by both the synchronous
 * initial fire on `subscribe({ kind: 'default' }, ...)` and the fall-through
 * dispatch when `unpublish` removes the current most-recent.
 */
function defaultPayload(): AudioPayload | null {
  if (recency.length === 0) return null
  const id = recency[recency.length - 1]
  return payloads.get(id) ?? null
}

/**
 * Resolve a `ref` to the current payload synchronously. Shared by
 * `consume()` and the synchronous initial fire inside `subscribe()` so
 * that both paths agree on what "current" means.
 */
function payloadForRef(ref: AudioSourceRef): AudioPayload | null {
  switch (ref.kind) {
    case 'none':
      return null
    case 'default':
      return defaultPayload()
    case 'file':
      return payloads.get(ref.fileId) ?? null
  }
}

/**
 * Shallow comparison of the two payloads' public component slots. Returns
 * `true` if every slot reference matches — meaning the two payloads point
 * at the same engine state and a re-publish should be a no-op (D-01).
 *
 * This is intentionally NOT a generic shallow-equal — it lists the exact
 * five slots that `AudioPayload` defines. Adding a new slot to
 * `AudioPayload` REQUIRES adding it here too; otherwise the bus will treat
 * publishes that differ only on the new slot as no-ops and silently drop
 * the update. The narrow comparison is a forcing function: the type and
 * the comparator must evolve together.
 */
function payloadsEquivalent(
  prev: AudioPayload | undefined,
  next: AudioPayload,
): boolean {
  if (!prev) return false
  return (
    prev.hapStream === next.hapStream &&
    prev.analyser === next.analyser &&
    prev.scheduler === next.scheduler &&
    prev.inlineViz === next.inlineViz &&
    prev.audio === next.audio &&
    prev.breakpointStore === next.breakpointStore &&
    prev.onResume === next.onResume
  )
}

/**
 * Notify every `onSourcesChanged` listener. Called only on `publish` for a
 * new id and on `unpublish` — never on payload-replacement publishes.
 *
 * Iterates a copy of the listener set so that a listener that unsubscribes
 * itself during the callback does not break the loop (mirrors the
 * snapshot-then-iterate pattern in `WorkspaceFile.notify`).
 */
function notifySourcesChanged(): void {
  if (sourcesChangedListeners.size === 0) return
  const snapshot = Array.from(sourcesChangedListeners)
  for (const cb of snapshot) cb()
}

/**
 * Dispatch a payload (or `null`) to every pinned subscriber on the given
 * source id. No-op if no subscribers are pinned. Used by both `publish`
 * (with the new payload) and `unpublish` (with `null`).
 */
function notifyPinned(
  sourceId: string,
  payload: AudioPayload | null,
): void {
  const set = pinnedSubscribers.get(sourceId)
  if (!set || set.size === 0) return
  const snapshot = Array.from(set)
  for (const cb of snapshot) cb(payload)
}

/**
 * Dispatch the current default payload to every default-tracker. Called
 * whenever the most-recent slot may have changed (publish-of-new-id,
 * publish-replacement-on-current-default, unpublish-of-current-default,
 * unpublish-and-fall-through).
 */
function notifyDefault(): void {
  if (defaultSubscribers.size === 0) return
  const payload = defaultPayload()
  const snapshot = Array.from(defaultSubscribers)
  for (const cb of snapshot) cb(payload)
}

// ---------------------------------------------------------------------------
// Public API — implements the `WorkspaceAudioBus` interface from types.ts
// ---------------------------------------------------------------------------

function publish(sourceId: string, payload: AudioPayload): void {
  const prev = payloads.get(sourceId)
  // Identity guard (D-01): same publisher, equivalent component refs →
  // no-op. Subscribers are NOT re-fired and `onSourcesChanged` does NOT
  // fire (the source SET is unchanged regardless).
  if (payloadsEquivalent(prev, payload)) return

  payloads.set(sourceId, payload)

  const isNewSource = prev === undefined
  if (isNewSource) {
    // Brand-new publisher — append to recency, becoming the new most-recent
    // and therefore the new default.
    recency.push(sourceId)
  }
  // Note: payload-replacement on an EXISTING id leaves `recency`
  // untouched. Re-publish does not promote the source to most-recent.
  // This matches the user-visible semantic: "starting a pattern" is the
  // promotion event, not "the pattern's components changed."

  // Pinned subscribers always get the fresh payload regardless of whether
  // this was a new-source publish or a payload replacement.
  notifyPinned(sourceId, payload)

  // Default-trackers fire if either (a) this was a new most-recent
  // publisher, or (b) this replaced the payload of the existing
  // most-recent publisher. They do NOT fire on payload replacement of a
  // non-most-recent publisher (their view is unchanged).
  if (isNewSource || sourceId === recency[recency.length - 1]) {
    notifyDefault()
  }

  if (isNewSource) {
    notifySourcesChanged()
  }
}

function unpublish(sourceId: string): void {
  const prev = payloads.get(sourceId)
  if (!prev) return // unknown id — silent no-op per the contract

  const wasMostRecent = recency[recency.length - 1] === sourceId

  payloads.delete(sourceId)
  const idx = recency.indexOf(sourceId)
  if (idx !== -1) recency.splice(idx, 1)

  // Pinned subscribers see `null` — their publisher is gone.
  notifyPinned(sourceId, null)

  // Default-trackers see the next-most-recent (which may itself be `null`
  // if no publishers remain) ONLY if the unpublished source was the one
  // they were currently following. If a non-default source unpublishes,
  // the default-trackers' view is unchanged.
  if (wasMostRecent) {
    notifyDefault()
  }

  notifySourcesChanged()
}

function subscribe(
  ref: AudioSourceRef,
  cb: (payload: AudioPayload | null) => void,
): () => void {
  // Synchronous initial fire (krama lifecycle step 2 — PLAN.md §10.2-02).
  // The popout window race depends on this happening BEFORE we register
  // the subscriber: the consumer must see the current state immediately,
  // even if no publisher will ever (un)publish during its lifetime.
  cb(payloadForRef(ref))

  // `'none'` consumers never receive further events. There's no slot to
  // subscribe to. Return a no-op unsubscribe so the call site's cleanup
  // function still works.
  if (ref.kind === 'none') {
    return () => {}
  }

  if (ref.kind === 'default') {
    defaultSubscribers.add(cb)
    let unsubscribed = false
    return () => {
      if (unsubscribed) return // idempotent unsubscribe
      unsubscribed = true
      defaultSubscribers.delete(cb)
    }
  }

  // ref.kind === 'file'
  const fileId = ref.fileId
  let set = pinnedSubscribers.get(fileId)
  if (!set) {
    set = new Set()
    pinnedSubscribers.set(fileId, set)
  }
  set.add(cb)

  let unsubscribed = false
  return () => {
    if (unsubscribed) return // idempotent unsubscribe
    unsubscribed = true
    const current = pinnedSubscribers.get(fileId)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) {
      pinnedSubscribers.delete(fileId)
    }
  }
}

function consume(ref: AudioSourceRef): AudioPayload | null {
  return payloadForRef(ref)
}

function listSources(): AudioSourceListing[] {
  // Iterate `recency` (not `payloads.keys()`) because the recency order
  // is the more meaningful default for UI (newest at the bottom, like a
  // chat log). Callers that want a different order can re-sort the
  // returned array — it's a fresh allocation per call.
  const result: AudioSourceListing[] = []
  for (const sourceId of recency) {
    if (!payloads.has(sourceId)) continue // defensive: should never trip
    result.push({
      sourceId,
      label: sourceId,
      // Phase 10.2 only lists active publishers, so `playing` is always
      // true. The field exists in the surface for forward-compat with
      // Phase 10.3+ "stopped but recently active" entries.
      playing: true,
    })
  }
  return result
}

function onSourcesChanged(cb: () => void): () => void {
  sourcesChangedListeners.add(cb)
  let unsubscribed = false
  return () => {
    if (unsubscribed) return // idempotent unsubscribe
    unsubscribed = true
    sourcesChangedListeners.delete(cb)
  }
}

// ---------------------------------------------------------------------------
// Exported singleton instance
// ---------------------------------------------------------------------------

/**
 * The workspace audio bus singleton. Imported as a const, never
 * instantiated. Mirrors the `VizPresetStore` const-export precedent in
 * `visualizers/vizPreset.ts`. Multi-shell support is deferred to Phase 11
 * (per CONTEXT U1) and would replace this with a class-per-shell behind
 * the same `WorkspaceAudioBus` interface.
 */
export const workspaceAudioBus: WorkspaceAudioBus = {
  publish,
  unpublish,
  subscribe,
  consume,
  listSources,
  onSourcesChanged,
}

/**
 * TESTING ONLY — reset every internal collection. Used by unit tests to
 * ensure isolation between cases. Mirrors `__resetWorkspaceFilesForTests`
 * from Task 01. Not exported from the package barrel; tests import it
 * directly from this module.
 */
export function __resetWorkspaceAudioBusForTests(): void {
  payloads.clear()
  recency.length = 0
  pinnedSubscribers.clear()
  defaultSubscribers.clear()
  sourcesChangedListeners.clear()
}
