/**
 * BreakpointStore — engine-attached registry of irNodeIds that should
 * pause the scheduler when a hap with that id fires (PK13 step 9).
 *
 * Single source of truth for both registration UIs:
 *  - Monaco gutter click → toggleSet([leaf-ids on that line])
 *  - Inspector chain-row click → toggleSet([leaf-ids in that subtree])
 *
 * Hit-check at StrudelEngine.wrappedOutput reads `has(irNodeId)` on every
 * fired hap; HOT PATH — keep API to O(1) Set ops only (P50 — D-03 forbids
 * predicate evaluation here).
 *
 * Per-engine scope (CONTEXT T9): one instance per StrudelEngine, disposed
 * with the engine. File-switch resets breakpoints — documented v1
 * behaviour. Future 20-07-follow-up adds localStorage hydrate via
 * `serialize()` / `hydrate()` methods. Do NOT add them now (Q6 — premature
 * solidification).
 *
 * Phase 20-07 (PV38, PK13 step 9, P50).
 */

type Listener = () => void

/**
 * Phase 20-07 (R-3) — per-id metadata held alongside the irNodeId.
 *
 * `lineHint` is the 1-based Monaco line number captured at registration
 * time. It exists so an orphaned breakpoint (id no longer in
 * snap.irNodeIdLookup, e.g. user edited the s-string) can still render a
 * muted glyph on its original line — letting the user clear it via
 * gutter-click. Without `lineHint`, an orphaned id registered via the
 * Inspector chain-row (no Monaco line context) is unreachable from the
 * gutter and persists silently in the store.
 *
 * Set when add/addSet is called from the gutter handler (β):
 *   lineHint = clicked line.
 * Set when add/addSet is called from the Inspector chain-row (γ):
 *   lineHint = matched IREvent's loc[0] resolved to a 1-based line via
 *   snap.irNodeIdsByLine reverse-lookup, OR undefined if unavailable.
 *
 * `undefined` is allowed: an orphan with no lineHint is documented as
 * "Inspector-side orphan; cleared via Inspector right-click in
 * 20-07-follow-up."
 */
export interface BreakpointMeta {
  readonly lineHint?: number
}

export class BreakpointStore {
  private ids: Map<string, BreakpointMeta> = new Map()
  private listeners: Set<Listener> = new Set()

  has(id: string): boolean {
    return this.ids.has(id)
  }

  size(): number {
    return this.ids.size
  }

  /** Phase 20-07 (R-3) — read the optional lineHint for orphan rendering. */
  getMeta(id: string): BreakpointMeta | undefined {
    return this.ids.get(id)
  }

  add(id: string, meta: BreakpointMeta = {}): void {
    if (this.ids.has(id)) return
    this.ids.set(id, meta)
    this.fireChanged()
  }

  remove(id: string): void {
    if (!this.ids.delete(id)) return
    this.fireChanged()
  }

  toggle(id: string, meta: BreakpointMeta = {}): void {
    if (this.ids.has(id)) this.ids.delete(id)
    else this.ids.set(id, meta)
    this.fireChanged()
  }

  /**
   * Add every id in `ids` to the store. Existing ids keep their meta —
   * `meta` is applied to NEWLY added ids only. This is the discipline that
   * lets a gutter-click set lineHint without clobbering a hint set by an
   * earlier Inspector registration (CONTEXT T5 / R-3).
   */
  addSet(ids: readonly string[], meta: BreakpointMeta = {}): void {
    let changed = false
    for (const id of ids) {
      if (!this.ids.has(id)) {
        this.ids.set(id, meta)
        changed = true
      }
    }
    if (changed) this.fireChanged()
  }

  removeSet(ids: readonly string[]): void {
    let changed = false
    for (const id of ids) {
      if (this.ids.delete(id)) changed = true
    }
    if (changed) this.fireChanged()
  }

  /**
   * Toggle a SET semantically: if every id is already present, remove all;
   * else add all (treating the set as one breakpoint). The "any missing →
   * add all" rule resolves the gutter-vs-Inspector desync case (CONTEXT
   * T5) — gutter click on a line where Inspector removed individual ids
   * re-adds the full set.
   *
   * `meta` is applied to ids being ADDED in this call only; ids already
   * present keep their existing meta (don't clobber a lineHint set by an
   * earlier registration path).
   */
  toggleSet(ids: readonly string[], meta: BreakpointMeta = {}): void {
    if (ids.length === 0) return
    const allPresent = ids.every((id) => this.ids.has(id))
    if (allPresent) {
      for (const id of ids) this.ids.delete(id)
    } else {
      for (const id of ids) {
        if (!this.ids.has(id)) this.ids.set(id, meta)
      }
    }
    this.fireChanged()
  }

  /** Read-only iteration — for orphan detection + UI rendering. */
  entries(): ReadonlyMap<string, BreakpointMeta> {
    return this.ids
  }

  /** Convenience: just the ids without metadata. */
  idSet(): ReadonlySet<string> {
    return new Set(this.ids.keys())
  }

  /**
   * Subscribe to mutate events. Returns a disposer mirroring
   * `LiveCodingRuntime.onPlayingChanged` (RESEARCH Q3 / S3).
   */
  subscribe(cb: Listener): () => void {
    this.listeners.add(cb)
    let unsubscribed = false
    return () => {
      if (unsubscribed) return
      unsubscribed = true
      this.listeners.delete(cb)
    }
  }

  dispose(): void {
    this.ids.clear()
    this.listeners.clear()
  }

  private fireChanged(): void {
    if (this.listeners.size === 0) return
    const snapshot = Array.from(this.listeners)
    for (const cb of snapshot) {
      try {
        cb()
      } catch {
        /* listener errors don't break dispatch */
      }
    }
  }
}

// TODO(20-07-follow-up): localStorage persistence under
// `stave:debugger.breakpoints` (RESEARCH Q6 seam). Add serialize() and
// hydrate() methods then. Do NOT add now — premature solidification.
