import type { VizDescriptor } from './types'
import { getVizConfig } from './vizConfig'
import { getNamedViz } from './namedVizRegistry'

/**
 * Resolves a viz ID to a VizDescriptor using the "mode:renderer" convention.
 *
 * Resolution order:
 *   1. User-named viz registry — exact name match in the runtime
 *      `namedVizRegistry` (populated by saved viz presets). User intent
 *      wins over built-ins, so a user-saved preset named `"pianoroll"`
 *      shadows the built-in `"pianoroll:hydra"` for their inline usage.
 *   2. Exact match on `descriptor.id`
 *      e.g. "pianoroll:hydra" → "pianoroll:hydra"
 *   3. Default renderer — append `":${defaultRenderer}"` from config and retry
 *      e.g. "pianoroll" + defaultRenderer="hydra" → "pianoroll:hydra"
 *   4. Prefix fallback — bare mode matches first descriptor whose id starts
 *      with `vizId + ":"` (catches renderer variants not matching the default)
 *
 * Returns undefined if no match is found.
 */
export function resolveDescriptor(
  vizId: string,
  descriptors: VizDescriptor[],
): VizDescriptor | undefined {
  // 1. Named viz registry — user-chosen preset names take priority.
  //    Populated by `vizPresetBridge` on seed/save; empty until the
  //    user opens their first viz file in this session.
  const named = getNamedViz(vizId)
  if (named) return named

  // 2. Exact match (handles both "pianoroll" and "pianoroll:hydra")
  const exact = descriptors.find(d => d.id === vizId)
  if (exact) return exact

  // 3. Default renderer — "pianoroll" → "pianoroll:${defaultRenderer}"
  const { defaultRenderer } = getVizConfig()
  const withDefault = `${vizId}:${defaultRenderer}`
  const defaultMatch = descriptors.find(d => d.id === withDefault)
  if (defaultMatch) return defaultMatch

  // 4. Prefix fallback — first descriptor whose id starts with "vizId:"
  const prefix = vizId + ':'
  return descriptors.find(d => d.id.startsWith(prefix))
}
