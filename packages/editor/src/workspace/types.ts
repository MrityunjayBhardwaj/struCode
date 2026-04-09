/**
 * Phase 10.2 — Workspace type vocabulary.
 *
 * This file is the single source of truth for workspace-level types. Each
 * task in Phase 10.2 appends its own type surface here:
 *
 * - Task 01 (this task): WorkspaceFile, WorkspaceLanguage.
 * - Task 02: AudioSourceRef, AudioPayload, WorkspaceAudioBus.
 * - Task 03: EditorViewProps, PreviewViewProps.
 * - Task 04: WorkspaceTab, WorkspaceGroup, WorkspaceLayout.
 * - Task 05: LiveCodingRuntime, LiveCodingRuntimeProvider, ChromeContext.
 * - Task 06: PreviewProvider, PreviewContext.
 *
 * Keep this file type-only. No runtime code, no imports that bring in React
 * or DOM APIs. The types must be consumable from unit tests that run in a
 * plain Node environment. Type-only imports (`import type ...`) are erased
 * at compile time and are safe to add when a downstream task needs to
 * reference engine-layer types from the workspace public surface.
 */

import type {
  AudioComponent,
  InlineVizComponent,
  QueryableComponent,
  StreamingComponent,
} from '../engine/LiveCodingEngine'

/**
 * The set of languages a WorkspaceFile may declare. This is an explicit
 * string-literal union rather than an open string so that the exhaustiveness
 * checker inside providers catches unhandled cases. New languages are added
 * here as new provider registries land (e.g., Phase 7+ may add `.tidal`).
 */
export type WorkspaceLanguage =
  | 'strudel'
  | 'sonicpi'
  | 'hydra'
  | 'p5js'
  | 'markdown'

/**
 * A single editable file owned by the workspace. Instances are **immutable
 * snapshots**: `setContent` replaces the record in the store instead of
 * mutating the object in place. This is load-bearing for
 * `useSyncExternalStore` snapshot identity — consumers compare by reference,
 * so a new object on content change is what triggers their re-render, and
 * an unchanged reference on unrelated content changes is what prevents
 * spurious re-renders.
 *
 * @remarks
 * The `meta` bag is an escape hatch for per-file data that does not belong
 * in the store's public API (e.g., provider-specific viz preset ids in
 * Phase 10.2, cursor position in Phase 10.3). Treat it as opaque — callers
 * should namespace their keys to avoid collisions.
 */
export interface WorkspaceFile {
  readonly id: string
  readonly path: string
  readonly content: string
  readonly language: WorkspaceLanguage
  readonly meta?: Readonly<Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// Task 02 — WorkspaceAudioBus
// ---------------------------------------------------------------------------

/**
 * Selector that a preview consumer hands to `WorkspaceAudioBus.subscribe`
 * to declare which publisher's payload it wants to receive. Discriminated
 * union per CONTEXT D-02 / D-04 (preview tab source dropdown).
 *
 * - `{ kind: 'default' }` — follow whichever publisher is currently
 *   most-recent. Snaps to a new publisher when one starts; falls through
 *   to the next-most-recent when the current default unpublishes.
 * - `{ kind: 'file', fileId }` — pin to a specific publisher. Fires once
 *   on subscribe with the current payload (or `null` if that publisher is
 *   not currently registered), again when that publisher (un)publishes,
 *   and never for any other publisher's events.
 * - `{ kind: 'none' }` — explicit "no audio input." Subscribers fire once
 *   on subscribe with `null` and then never again. Used by viz tabs in
 *   demo mode (P7 fallback).
 */
export type AudioSourceRef =
  | { kind: 'default' }
  | { kind: 'file'; fileId: string }
  | { kind: 'none' }

/**
 * The component bag that a `LiveCodingRuntime` publishes to the bus when its
 * pattern starts playing, and that every viz consumer subscribes to in order
 * to drive its renderer.
 *
 * The shape mirrors `Partial<EngineComponents>` from `LiveCodingEngine.ts`
 * with the slots flattened (no nested `streaming.hapStream` indirection) so
 * that consumers can destructure `{ hapStream, analyser, scheduler }` in one
 * line. The slots themselves are the SAME references the engine holds —
 * the bus owns no audio nodes (PV3, UV6: observation, not mutation).
 *
 * @remarks
 * ## Identity contract (D-01 — subscribe + re-mount)
 *
 * The bus delivers ONE callback per publisher identity change, not per
 * audio frame. Identity is determined by shallow comparison across
 * `hapStream`, `analyser`, `scheduler`, `inlineViz`, and `audio` — if a
 * runtime calls `publish(sameId, newPayload)` and every slot reference
 * matches the previous payload, subscribers do NOT re-fire. This keeps the
 * bus out of the per-frame FFT read path; consumers reach into
 * `payload.analyser` directly for that.
 *
 * ## Optionality
 *
 * Every slot is optional because not every engine populates every slot
 * (e.g., the demo engine has streaming + audio but no scheduler). Consumers
 * MUST guard each slot before use.
 */
export interface AudioPayload {
  readonly hapStream?: StreamingComponent['hapStream']
  readonly analyser?: AudioComponent['analyser']
  readonly scheduler?: QueryableComponent['scheduler']
  readonly inlineViz?: InlineVizComponent
  readonly audio?: AudioComponent
}

/**
 * Description of a single registered publisher, returned from
 * `WorkspaceAudioBus.listSources()`. Always read on demand (e.g., on dropdown
 * open) — never cached in React state, since it can desync between renders
 * when publishers start/stop rapidly. The bus emits `onSourcesChanged` to
 * trigger re-renders, but the source data must be fetched fresh each time.
 *
 * - `sourceId` — the file id the publisher registered under.
 * - `label` — display label (currently equals `sourceId`; future Task 05 may
 *   pass through `WorkspaceFile.path` for prettier dropdown text).
 * - `playing` — `true` while the publisher has an active payload on the bus.
 *   Phase 10.2 only ever lists currently-publishing entries, so this is
 *   always `true`. Reserved for Phase 10.3+ when "stopped but recently
 *   active" entries may also be surfaced.
 */
export interface AudioSourceListing {
  readonly sourceId: string
  readonly label: string
  readonly playing: boolean
}

/**
 * The public surface of the workspace audio bus. The bus is implemented as a
 * module-level singleton in `WorkspaceAudioBus.ts` (per CONTEXT U1, matching
 * the `VizPresetStore` precedent); this interface exists for type-driven
 * consumers and for the eventual Phase 11 multi-shell refactor that may
 * introduce a class-per-shell variant.
 */
export interface WorkspaceAudioBus {
  /**
   * Register or replace the payload for a given source id.
   *
   * Calling `publish(id, payload)` for a brand-new id appends `id` to the
   * end of the recency list (making it the new "most recent" publisher) and
   * fires every default-tracker plus every pinned subscriber on `id`.
   *
   * Calling `publish(id, payload)` for an existing id and a payload whose
   * shallow component slots match the previous payload is a **no-op** —
   * subscribers do NOT re-fire and the recency list is unchanged. This is
   * the D-01 identity guarantee that keeps the bus out of the FFT read
   * path. Calling with an existing id and DIFFERENT slot references
   * replaces the entry, leaves the recency position alone, and fires the
   * affected subscribers.
   */
  publish(sourceId: string, payload: AudioPayload): void

  /**
   * Remove the payload for a given source id. Pinned subscribers on `id`
   * fire once with `null`; default-trackers fire once with whatever
   * publisher is now most-recent (or `null` if no publishers remain).
   * Calling on an unknown id is a no-op.
   */
  unpublish(sourceId: string): void

  /**
   * Subscribe to the bus with a consumer-side selector. Returns an
   * unsubscribe function.
   *
   * **Synchronous initial fire** (krama lifecycle step 2): the callback is
   * invoked SYNC, before `subscribe` returns, with the current payload for
   * `ref` (or `null` if no publisher matches). This handles the popout
   * window race where the consumer mounts before the publisher.
   *
   * The unsubscribe function is idempotent — calling it multiple times has
   * the same effect as calling it once.
   */
  subscribe(
    ref: AudioSourceRef,
    cb: (payload: AudioPayload | null) => void,
  ): () => void

  /**
   * Synchronously read the current payload for a ref without subscribing.
   * Returns `null` for `{ kind: 'none' }` or when no publisher matches.
   * Used by consumers that want to peek at the current state without
   * setting up a subscription (e.g., for one-shot rendering).
   */
  consume(ref: AudioSourceRef): AudioPayload | null

  /**
   * List every currently-registered publisher. Always returns a fresh array.
   *
   * **MUST be read on demand** — never cached in React state. The bus emits
   * `onSourcesChanged` whenever the publisher set changes; that event is
   * the signal to re-read `listSources()`, not a snapshot to memoize. See
   * the pre-mortem in PLAN.md §10.2-02.
   */
  listSources(): AudioSourceListing[]

  /**
   * Register a callback that fires whenever the set of currently-registered
   * publishers changes (i.e., a `publish` for a new id, or an `unpublish`).
   * Re-publishing an existing id with the same shallow payload does NOT
   * trigger this. Returns an unsubscribe function.
   */
  onSourcesChanged(cb: () => void): () => void
}
