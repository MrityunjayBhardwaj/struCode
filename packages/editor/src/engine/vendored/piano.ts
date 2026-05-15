// Vendored from upstream Strudel.
//
// Source: https://codeberg.org/uzu/strudel/src/branch/main/website/src/repl/prebake.mjs
// Pinned SHA: f73b395648645aabe699f91ba0989f35a6fd8a3c
// License: AGPL-3.0-or-later — see /LICENSE
//
// Phase 20-14 α-4. Upstream injects `Pattern.prototype.piano` as a side
// effect of importing `./piano.mjs` from `prebake.mjs:4`. The method:
//   - sets `clip = 1` on each hap value if unset (sustains to next note)
//   - applies `.s('piano')` to route to the Salamander sample bank
//     (which α-2 loads via the b-cdn `piano.json` manifest)
//   - applies `.release(0.1)` so the tail isn't abrupt on hap end
//   - pans each note by pitch — left for low notes, right for high notes,
//     width 0.5 centered around the cutoff at C8 (MIDI 108)
//
// Why vendored (not re-exported from @strudel/something): the upstream
// definition lives in the strudel.cc website's prebake.mjs, not in a
// published @strudel/* package. Reimplementing in-place is the
// minimum-risk parity move and is license-compatible (AGPL-3.0 ↔
// AGPL-3.0). When upstream eventually publishes piano.mjs as part of a
// package, this file becomes a re-export.
//
// Lifecycle: this module attaches Pattern.prototype.piano ONCE, on first
// import. StrudelEngine.init() imports it AFTER evalScope has populated
// `Pattern` on globalThis (otherwise `Pattern` would be undefined here).
// Re-importing the module does not re-attach — ES module evaluation is
// idempotent (the import side-effect runs once per module instance).
//
// Setter-trap interaction (P2 / UV2): `injectPatternMethods` overwrites
// prototypes during evaluate() for `.p`, `.viz`, and the legacy viz names
// (`pianoroll`, `scope`, `spectrum`, etc.). `.piano` is NOT in that list,
// so the boot-time install survives across evaluate() cycles. α-4's
// verify gate confirms this empirically — re-check Pattern.prototype.piano
// after one evaluate() cycle.

import { Pattern, noteToMidi, valueToMidi } from '@strudel/core'

// Mirrors upstream prebake.mjs:161-173. `maxPan` is the MIDI number for
// C8 — the topmost piano note. Anything higher pans full right.
const maxPan = noteToMidi('C8')
const panwidth = (pan: number, width: number) => pan * width + (1 - width) / 2

// Attach `.piano()` to Pattern.prototype. Done at module-import time so
// it's a one-shot side effect — no per-eval reinstall.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Pattern.prototype as any).piano = function (this: any) {
  return this.fmap((v: any) => ({ ...v, clip: v.clip ?? 1 }))
    .s('piano')
    .release(0.1)
    .fmap((value: any) => {
      const midi = valueToMidi(value)
      const pan = panwidth(Math.min(Math.round(midi) / maxPan, 1), 0.5)
      return { ...value, pan: (value.pan || 1) * pan }
    })
}
