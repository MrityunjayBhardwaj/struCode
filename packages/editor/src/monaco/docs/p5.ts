/**
 * p5.js hover + completion — sourced from the official p5.js reference
 * (YUIDoc build, vendored to `data/p5.json` via
 * `scripts/fetch-docs/p5.mjs`).
 *
 * Re-sync with upstream:
 *   node packages/editor/scripts/fetch-docs/p5.mjs
 *
 * The transform trims descriptions to one sentence and picks the shortest
 * real call-site line from each method's examples, so the vendored JSON
 * stays under 200 KB.
 */

import type * as Monaco from 'monaco-editor'
import type { CommonMistake, DocsIndex } from './types'
import { validateDocsIndex } from './types'
import { registerRuntimeProviders } from './providers'
import RAW from './data/p5.json'

validateDocsIndex('p5.json', RAW)

/**
 * Hand-curated overlay slot applied after JSON load. p5.js's own FES
 * already catches most p5-API mistakes inside the runtime, so v1 ships
 * the slot wired but unfilled — hints here target errors that escape
 * FES, and we'd rather seed those once we observe one in practice than
 * fabricate a hint upfront.
 *
 * To add a hint later: append a CommonMistake here. The TS-side overlay
 * survives `node scripts/fetch-docs/p5.mjs` regeneration; the JSON side
 * doesn't carry hints by design.
 */
const P5_GLOBAL_MISTAKES: CommonMistake[] = []

const RAW_INDEX = RAW as DocsIndex
export const P5_DOCS_INDEX: DocsIndex = {
  ...RAW_INDEX,
  globalMistakes: [...(RAW_INDEX.globalMistakes ?? []), ...P5_GLOBAL_MISTAKES],
}

export function registerP5Providers(
  monaco: typeof Monaco,
): Monaco.IDisposable[] {
  return registerRuntimeProviders(monaco, P5_DOCS_INDEX, {
    hover: true,
    dotCompletion: false,
    identifierCompletion: true,
  })
}
