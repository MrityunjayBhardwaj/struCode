/**
 * namedVizRegistry — runtime map of user-chosen viz names → descriptors.
 *
 * Lets users reference their own viz files from inline patterns by the
 * `VizPreset.name` they chose, alongside the built-in descriptors:
 *
 *     $: note("c e g").viz("Piano Roll")   // user-named preset
 *     $: note("c e g").viz("pianoroll")    // built-in descriptor
 *
 * @remarks
 * ## How it plugs into the resolver
 *
 * `resolveDescriptor` checks this registry first (exact-name match),
 * then falls through to the passed-in descriptor list (`DEFAULT_VIZ_
 * DESCRIPTORS` or any embedder override) and runs its existing
 * "append default renderer" / "prefix" fallbacks. Names registered
 * here shadow built-ins — if a user saves a preset literally called
 * `"pianoroll"`, their version wins inside `.viz("pianoroll")`.
 * That's the right default: user intent is closer to what the user
 * controls than what ships in the library.
 *
 * ## Who writes to the registry
 *
 * `vizPresetBridge.seedFromPreset` and `flushToPreset` compile the
 * preset via `compilePreset()` and call `registerNamedViz(preset.name,
 * descriptor)` — so every viz file the user opens or saves is
 * automatically available to inline `.viz("name")` without any manual
 * registration step.
 *
 * If the user renames a preset (future save-as UI), the old name is
 * unregistered and the new name is registered in the same transaction.
 * Until that UI lands, a preset rename is a no-op at the registry
 * level; the stale name keeps working until page reload. Acceptable
 * for Phase 10.2 MVP — there's no rename UI yet.
 *
 * ## Change notifications
 *
 * `onNamedVizChanged` lets consumers subscribe to register/unregister
 * events. Phase 10.2 doesn't wire this to anything, but it's in place
 * so a future Monaco completion provider can invalidate its suggestion
 * cache when the registry mutates.
 */

import type { VizDescriptor } from './types'

type Listener = () => void

const registry = new Map<string, VizDescriptor>()
const listeners = new Set<Listener>()

/**
 * Register a descriptor under a user-chosen name. Idempotent — calling
 * twice with the same name + descriptor is a no-op and does not fire
 * listeners. Calling with a new descriptor for an existing name
 * replaces the entry (and fires listeners) so saves can update a
 * previously-registered viz in place.
 */
export function registerNamedViz(
  name: string,
  descriptor: VizDescriptor,
): void {
  const existing = registry.get(name)
  if (existing === descriptor) return
  registry.set(name, descriptor)
  notifyListeners()
}

/**
 * Unregister a name. Idempotent — unknown names are silent no-ops.
 * Fires listeners only when an entry is actually removed.
 */
export function unregisterNamedViz(name: string): void {
  if (!registry.has(name)) return
  registry.delete(name)
  notifyListeners()
}

/**
 * Look up a descriptor by name. Returns `undefined` if the name is not
 * registered. The resolver falls through to the built-in descriptor
 * list in that case.
 */
export function getNamedViz(name: string): VizDescriptor | undefined {
  return registry.get(name)
}

/**
 * List every registered name in insertion order. Used by tests and by
 * a future Monaco completion provider that wants to surface every
 * user-defined viz name inside `.viz("...")` autocomplete.
 */
export function listNamedVizNames(): string[] {
  return Array.from(registry.keys())
}

/**
 * List every (name, descriptor) pair. Mostly useful for debugging and
 * for tests that want to assert the full registry contents.
 */
export function listNamedVizEntries(): Array<[string, VizDescriptor]> {
  return Array.from(registry.entries())
}

/**
 * Subscribe to registry changes. Fires on any register/unregister
 * transition. Returns an idempotent unsubscribe function. Does not
 * fire synchronously on subscription — subscribers receive only
 * future changes.
 */
export function onNamedVizChanged(cb: Listener): () => void {
  listeners.add(cb)
  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    listeners.delete(cb)
  }
}

/**
 * TESTING ONLY — clear the registry and all subscribers. Used by unit
 * tests to ensure isolation between cases.
 */
export function __resetNamedVizRegistryForTests(): void {
  registry.clear()
  listeners.clear()
}

function notifyListeners(): void {
  if (listeners.size === 0) return
  const snapshot = Array.from(listeners)
  for (const cb of snapshot) {
    try {
      cb()
    } catch {
      // Listener exceptions never break the dispatch loop.
    }
  }
}
