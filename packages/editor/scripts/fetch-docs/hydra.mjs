/**
 * Fetch + transform the hydra-synth function list into our DocsIndex shape.
 *
 * Source:   https://raw.githubusercontent.com/hydra-synth/hydra-synth/main/src/glsl/glsl-functions.js
 * Output:   packages/editor/src/monaco/docs/data/hydra.json
 * Re-run:   node packages/editor/scripts/fetch-docs/hydra.mjs
 *
 * Hydra doesn't ship structured per-function prose docs — only the function
 * list with names, types, inputs, and GLSL bodies. We build signatures +
 * synthetic one-line descriptions from that, and link out to the official
 * API docs for the prose (https://hydra.ojack.xyz/api/).
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(
  __dirname,
  '../../src/monaco/docs/data/hydra.json',
)

const SOURCE =
  'https://raw.githubusercontent.com/hydra-synth/hydra-synth/main/src/glsl/glsl-functions.js'
const API_ROOT = 'https://hydra.ojack.xyz/api/'

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`fetch ${SOURCE}: ${res.status}`)
const sourceText = await res.text()

// Write to a temp file so Node ESM can import it.
const tmp = path.join(os.tmpdir(), `hydra-glsl-functions-${Date.now()}.mjs`)
await fs.writeFile(tmp, sourceText, 'utf8')
const mod = await import(tmp)
await fs.unlink(tmp).catch(() => {})
const listOrFn = mod.default
const list = typeof listOrFn === 'function' ? listOrFn() : listOrFn
if (!Array.isArray(list)) throw new Error('hydra glsl-functions.js did not export an array')

function renderSignature(entry) {
  const inputs = entry.inputs ?? []
  const parts = inputs.map((i) => {
    const t = i.type || 'float'
    const dflt =
      i.default !== undefined ? ` = ${JSON.stringify(i.default)}` : ''
    return `${i.name}: ${t}${dflt}`
  })
  const prefix = entry.type === 'src' ? '' : '.'
  return `${prefix}${entry.name}(${parts.join(', ')})`
}

function describe(entry) {
  const typeLabel = {
    src: 'Source — returns a 2D coordinate-sampled colour',
    color: 'Colour transform applied to the previous output',
    coord: 'Coordinate transform warping sampler input',
    combine: 'Combine two textures into one',
    combineCoord: 'Combine a texture with another texture used as a coordinate map',
  }[entry.type] ?? `Hydra ${entry.type} function`
  const inputSummary =
    (entry.inputs ?? []).length === 0
      ? ''
      : ' Inputs: ' +
        entry.inputs.map((i) => `${i.name} (${i.type}${i.default !== undefined ? `, default ${JSON.stringify(i.default)}` : ''})`).join(', ') + '.'
  return `${typeLabel}.${inputSummary}`
}

function exampleFor(entry) {
  // Pick a usage shape based on the category — cheap but right 90% of the
  // time for the chain idiom.
  switch (entry.type) {
    case 'src':
      return `${entry.name}().out()`
    case 'color':
      return `osc().${entry.name}().out()`
    case 'coord':
      return `osc().${entry.name}().out()`
    case 'combine':
      return `osc().${entry.name}(noise()).out()`
    case 'combineCoord':
      return `osc().${entry.name}(noise()).out()`
    default:
      return undefined
  }
}

const kindFor = (entry) =>
  entry.type === 'src' ? 'function' : 'method'

const docs = {}
for (const entry of list) {
  if (!entry?.name) continue
  // Multiple overloads share a name (e.g. three `osc` variants). Last one
  // wins — matches JS object assignment behaviour.
  docs[entry.name] = {
    signature: renderSignature(entry),
    description: describe(entry),
    example: exampleFor(entry),
    kind: kindFor(entry),
    category: entry.type,
    sourceUrl: API_ROOT,
  }
}

// Hand-curated entries for surface-area that isn't in glsl-functions.js —
// IO buffers, runtime control, math helpers exposed on the hydra instance.
const runtimeExtras = {
  out: {
    signature: '.out(buffer?: o0|o1|o2|o3)',
    description: 'Render the chain to an output buffer (default o0).',
    example: 'osc().out(o0)',
    kind: 'method',
    sourceUrl: API_ROOT,
  },
  render: {
    signature: 'render(buffer?: o0|o1|o2|o3)',
    description: 'Show a single buffer fullscreen (default: show all four).',
    example: 'render(o0)',
    kind: 'function',
    sourceUrl: API_ROOT,
  },
  hush: {
    signature: 'hush()',
    description: 'Stop all currently-playing Hydra chains.',
    example: 'hush()',
    kind: 'function',
    sourceUrl: API_ROOT,
  },
  solid: {
    // `solid` is in glsl-functions.js too; overwrite to keep the curated example.
    signature: 'solid(r: float = 0, g: float = 0, b: float = 0, a: float = 1)',
    description: 'Solid colour source — paints the whole frame one colour.',
    example: 'solid(1, 0, 0).out()',
    kind: 'function',
    sourceUrl: API_ROOT,
  },
  time: {
    signature: 'time',
    description: 'Seconds elapsed since the Hydra instance started.',
    kind: 'variable',
    sourceUrl: API_ROOT,
  },
  mouse: {
    signature: 'mouse',
    description: 'Object with `x` / `y` fields (pixel coordinates of the cursor).',
    kind: 'variable',
    sourceUrl: API_ROOT,
  },
  s0: {
    signature: 's0',
    description: 'External texture source 0. Bind with `s0.initCam()` / `s0.initImage()` / `s0.initVideo()`.',
    kind: 'variable',
    sourceUrl: API_ROOT,
  },
  s1: { signature: 's1', description: 'External texture source 1.', kind: 'variable', sourceUrl: API_ROOT },
  s2: { signature: 's2', description: 'External texture source 2.', kind: 'variable', sourceUrl: API_ROOT },
  s3: { signature: 's3', description: 'External texture source 3.', kind: 'variable', sourceUrl: API_ROOT },
  o0: { signature: 'o0', description: 'Output buffer 0 — the default display buffer.', kind: 'variable', sourceUrl: API_ROOT },
  o1: { signature: 'o1', description: 'Output buffer 1.', kind: 'variable', sourceUrl: API_ROOT },
  o2: { signature: 'o2', description: 'Output buffer 2.', kind: 'variable', sourceUrl: API_ROOT },
  o3: { signature: 'o3', description: 'Output buffer 3.', kind: 'variable', sourceUrl: API_ROOT },
}
Object.assign(docs, runtimeExtras)

const index = {
  runtime: 'hydra',
  docs,
  meta: {
    fetchedAt: new Date().toISOString().slice(0, 10),
    source: SOURCE,
  },
}

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, JSON.stringify(index, null, 2) + '\n', 'utf8')

const names = Object.keys(docs)
console.log(`wrote ${OUT}`)
console.log(`  entries: ${names.length}`)
console.log(`  samples: ${['osc','noise','rotate','kaleid','out','hush','s0','o0'].filter(n => docs[n]).join(', ')}`)
