import type * as Monaco from 'monaco-editor'
import type { DocsIndex, RuntimeDoc } from './docs/types'
import { createHoverProvider } from './docs/providers'

// ---------------------------------------------------------------------------
// Strudel function documentation
// ---------------------------------------------------------------------------
//
// Hand-curated until upstream publishes a structured JSDoc dump. The
// Strudel repo generates `doc.json` at build time via
// `npm run jsdoc-json`, but doesn't commit or host it as a static asset —
// see `packages/editor/scripts/fetch-docs/strudel.mjs` for the path we'd
// need to automate. Until then these entries are maintained manually.
//
// Each entry is a RuntimeDoc with `example` required — the pattern for
// Strudel's hand-curated style. No per-function sourceUrl is set;
// STRUDEL_DOCS_INDEX.meta.docsBaseUrl covers the Reference→ link.

export const STRUDEL_DOCS: Record<string, RuntimeDoc> = {
  note: {
    signature: 'note(pattern: string)',
    description: 'Play notes from a mini-notation pattern. Accepts note names (c4, eb3) or MIDI numbers.',
    example: 'note("c4 e4 g4 b4")',
  },
  s: {
    signature: 's(pattern: string)',
    description: 'Select a sound or synth. Accepts sample names or synth identifiers.',
    example: 's("bd sd hh sd")',
  },
  stack: {
    signature: 'stack(...patterns)',
    description: 'Play multiple patterns simultaneously (vertical stack).',
    example: 'stack(note("c3 e3"), s("bd sd"))',
  },
  cat: {
    signature: 'cat(...patterns)',
    description: 'Concatenate patterns sequentially — each plays for one cycle then moves to the next.',
    example: 'cat(note("c4 e4"), note("g4 b4"))',
  },
  fast: {
    signature: '.fast(n)',
    description: 'Speed up the pattern by factor n.',
    example: 'note("c4 e4").fast(2)',
  },
  slow: {
    signature: '.slow(n)',
    description: 'Slow down the pattern by factor n.',
    example: 'note("c4 e4 g4").slow(2)',
  },
  rev: {
    signature: '.rev()',
    description: 'Reverse the pattern.',
    example: 'note("c4 d4 e4 f4").rev()',
  },
  every: {
    signature: '.every(n, fn)',
    description: 'Apply fn to the pattern every n cycles.',
    example: 'note("c4 e4 g4").every(4, x => x.rev())',
    commonMistakes: [
      {
        // Calling `every(...)` as a free function instead of chaining
        // it on a Pattern surfaces as `every is not a function` (when
        // shadowed) or `every is not defined`. Both end up confusing —
        // the curated hint points at the `.every()` shape directly.
        detect: { kind: 'message', match: /every is not (?:a function|defined)/ },
        hint: '`.every(n, fn)` is a method on a Pattern — chain it after `note(...)` or `s(...)`.',
        weight: 2,
      },
    ],
  },
  sometimes: {
    signature: '.sometimes(fn)',
    description: 'Apply fn to events 50% of the time at random.',
    example: 'note("c4 e4 g4").sometimes(x => x.fast(2))',
  },
  degradeBy: {
    signature: '.degradeBy(amount)',
    description: 'Randomly remove events. amount is 0–1 (0 = keep all, 1 = remove all).',
    example: 'note("c4 d4 e4 f4").degradeBy(0.3)',
  },
  gain: {
    signature: '.gain(amount)',
    description: 'Set the volume. 1 is unity gain; values above 1 amplify.',
    example: 'note("c4 e4").gain(0.7)',
  },
  pan: {
    signature: '.pan(value)',
    description: 'Set stereo panning. -1 is hard left, 0 is center, 1 is hard right.',
    example: 'note("c4 e4 g4").pan(sine)',
  },
  room: {
    signature: '.room(amount)',
    description: 'Add reverb. 0 is dry, 1 is fully wet.',
    example: 'note("c4 e4").room(0.4)',
  },
  delay: {
    signature: '.delay(amount)',
    description: 'Add delay/echo effect.',
    example: 'note("c4 e4").delay(0.3)',
  },
  jux: {
    signature: '.jux(fn)',
    description: 'Apply fn to a copy of the pattern playing in the right channel, original in left.',
    example: 'note("c4 e4 g4").jux(rev)',
  },
  off: {
    signature: '.off(timeOffset, fn)',
    description: 'Play an offset copy of the pattern with fn applied, layered over the original.',
    example: 'note("c4 e4 g4").off(0.25, x => x.gain(0.5))',
  },
  layer: {
    signature: '.layer(...fns)',
    description: 'Apply multiple functions to copies of the pattern and stack all results.',
    example: 'note("c4 e4 g4").layer(x => x.fast(2), rev)',
  },
  struct: {
    signature: '.struct(pattern)',
    description: 'Impose a rhythmic structure on the pattern from a boolean/euclid pattern.',
    example: 'note("c4").struct("t f t t f t t f")',
  },
  mask: {
    signature: '.mask(pattern)',
    description: 'Filter events by a boolean pattern — only play where the mask is true.',
    example: 'note("c4 d4 e4 f4").mask("t t f t")',
  },
  euclid: {
    signature: '.euclid(steps, total)',
    description: 'Euclidean rhythm: distribute steps evenly across total slots.',
    example: 's("bd").euclid(3, 8)',
  },
  iter: {
    signature: '.iter(n)',
    description: 'Iterate through n rotations of the pattern over n cycles.',
    example: 'note("c4 d4 e4 f4").iter(4)',
  },
  chunk: {
    signature: '.chunk(n, fn)',
    description: 'Divide pattern into n chunks, applying fn to one chunk per cycle in rotation.',
    example: 'note("c4 d4 e4 f4").chunk(4, x => x.fast(2))',
  },
  cutoff: {
    signature: '.cutoff(freq)',
    description: 'Low-pass filter cutoff frequency in Hz.',
    example: 'note("c4 e4").s("sawtooth").cutoff(800)',
  },
  resonance: {
    signature: '.resonance(amount)',
    description: 'Filter resonance (Q). Higher values create a more pronounced peak.',
    example: 'note("c4 e4").s("sawtooth").cutoff(sine.range(200,2000)).resonance(8)',
  },
  hpf: {
    signature: '.hpf(freq)',
    description: 'High-pass filter — removes frequencies below the cutoff.',
    example: 's("amen").hpf(400)',
  },
  lpf: {
    signature: '.lpf(freq)',
    description: 'Low-pass filter — alias for cutoff.',
    example: 'note("c4 e4").lpf(1200)',
  },
  release: {
    signature: '.release(seconds)',
    description: 'Envelope release time in seconds.',
    example: 'note("c4 e4 g4").release(0.5)',
  },
  sustain: {
    signature: '.sustain(seconds)',
    description: 'Envelope sustain duration in seconds.',
    example: 'note("c4").sustain(0.1).release(0.3)',
  },
  speed: {
    signature: '.speed(rate)',
    description: 'Sample playback rate. 1 is normal, 2 is double speed (up one octave), -1 is reversed.',
    example: 's("amen").speed(0.5)',
  },
  vowel: {
    signature: '.vowel(v)',
    description: 'Vowel formant filter. Accepts "a", "e", "i", "o", "u".',
    example: 'note("c4 d4 e4").vowel("<a e i o>")',
  },
  orbit: {
    signature: '.orbit(n)',
    description: 'Route to audio effect bus n. Patterns on the same orbit share effects.',
    example: 'note("c4 e4").room(0.5).orbit(1)',
  },
}

// ---------------------------------------------------------------------------
// Index + hover provider — uses the shared factory so the markdown layout
// matches p5js / hydra / sonicpi hovers exactly.
// ---------------------------------------------------------------------------

export const STRUDEL_DOCS_INDEX: DocsIndex = {
  runtime: 'strudel',
  docs: STRUDEL_DOCS,
  // Catch-all friendly-error hints that aren't tied to a single symbol.
  // The two cases below are the highest-frequency Strudel papercut:
  // bare note / drum names outside a string. JS evaluates them as
  // identifiers and throws ReferenceError — without these hints the
  // user sees "c4 is not defined" with a Levenshtein neighbour
  // ("cat"?) that doesn't help.
  globalMistakes: [
    {
      detect: {
        kind: 'message',
        // Note names: c, d, e, f, g, a, b — optional sharp/flat,
        // optional octave digit. Anchored to start so we don't match
        // mid-message references.
        match: /^[a-g][s#b]?\d? is not defined$/i,
      },
      hint: 'Looks like a note name — wrap it in a string: `note("c4")`.',
      example: 'note("c4 e4 g4")',
    },
    {
      detect: {
        kind: 'message',
        // Drum / sample shorthands. Curated list; expand as we
        // observe new ones in the wild.
        match:
          /^(bd|sd|hh|oh|cp|cb|rim|tom|cy|kick|snare|hat|clap|crash|ride) is not defined$/i,
      },
      hint: 'Looks like a drum name — wrap it in a string: `s("bd")`.',
      example: 's("bd sd hh sd")',
    },
  ],
  meta: {
    source: 'hand-curated',
    // Strudel's jsdoc isn't published with per-function permalinks, so
    // hovers fall back to the main function reference page — the user
    // lands inside the searchable function browser.
    docsBaseUrl: 'https://strudel.cc/functions/',
  },
}

export function registerStrudelHover(
  monaco: typeof Monaco,
): Monaco.IDisposable {
  return createHoverProvider(monaco, STRUDEL_DOCS_INDEX)
}
