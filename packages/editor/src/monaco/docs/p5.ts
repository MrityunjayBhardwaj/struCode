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
 * Hand-curated overlay applied after JSON load. p5.js's own FES
 * already covers most p5-API mistakes — the hints below target errors
 * that escape FES (typically thrown from user code that touches the
 * `stave` namespace or runs before `setup` resolves).
 *
 * Lives in TS rather than the JSON so a `node scripts/fetch-docs/p5.mjs`
 * regenerate doesn't clobber the curation. Same shape as a JSON
 * `commonMistakes` field.
 */
const P5_GLOBAL_MISTAKES: CommonMistake[] = [
  {
    // A common pattern from session-5 observation: `width` / `height`
    // referenced before `setup()` ran — the wrapper-time stack puts
    // these as `ReferenceError: width is not defined` because they're
    // sketch-instance properties, not real globals.
    detect: { kind: 'message', match: /^(width|height) is not defined$/ },
    hint:
      "`width` / `height` only become available once `setup()` runs. " +
      'Move the read inside `setup()` or `draw()`.',
  },
]

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
