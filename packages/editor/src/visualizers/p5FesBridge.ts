import { emitLog } from '../engine/engineLog'

/**
 * Bridge p5.js's Friendly Error System (FES) into the shared engine log.
 *
 * p5 emits curated diagnostics (typo hints, missing-parameter warnings,
 * creator-intent messages) through `p5._friendlyError` → `p5._report`,
 * which by default calls `console.log` prefixed with "🌸 p5.js says:".
 * The FES output is already more helpful than anything a generic
 * fuzzy-matcher could produce for p5, so we adopt it wholesale instead
 * of running `formatFriendlyError` on the raw message.
 *
 * p5 exposes `p5._fesLogger` as an injection point (intended for tests —
 * see `p5/lib/p5.js` `_report` definition). When set, FES routes through
 * it instead of `console.log`. We install our own logger that strips the
 * translation prefix and pipes the message into `emitLog` so the Console
 * panel, toast, and status-bar chip all pick it up.
 *
 * FES runs per-sketch but its signature is global — `_fesLogger` gets no
 * instance context, so we track the most-recently-mounted p5 source in a
 * module-level slot. Callers (`CompiledVizMount`) set this on mount and
 * clear it on unmount. When several p5 sketches are mounted at once the
 * attribution is best-effort; Live mode's runtime-wide fallback marker
 * still covers the "clear all p5 warnings on any successful p5 compile"
 * case.
 */

const P5_PREFIX_RE = /^\s*🌸\s*p5\.js\s*says:\s*/

/**
 * FES messages embed the wrapped-body line number in a bracketed
 * locator — e.g. "[packages_editor_dist_index_…_.js line 32182 >
 * Function, line 73]". We parse that `line N` tail and translate it
 * back to a user-file line by subtracting the wrapper offset captured
 * alongside the source (see `setCurrentP5Source`).
 */
const FES_LINE_RE = /,\s*line\s+(\d+)\s*\]/

interface P5Ctor {
  disableFriendlyErrors: boolean
  _fesLogger?: (msg: string) => void
}

let installed = false
let currentSource: string | null = null
let currentLineOffset = 0

function buildLogger(): (msg: string) => void {
  return (msg: string) => {
    const raw = String(msg)
    const clean = raw.replace(P5_PREFIX_RE, '').trim()
    if (!clean) return

    // Pull the wrapped-body line out of FES's bracketed locator and
    // translate it back to a user-file line. Rewrite the message
    // fragment so the Console row reads "line 69" instead of the
    // internal "line 73" — matches whatever the Monaco squiggle lands
    // on and stops the "off by 4" surprise.
    let line: number | undefined
    let message = clean
    const match = raw.match(FES_LINE_RE)
    if (match && currentLineOffset > 0) {
      const wrapped = parseInt(match[1], 10)
      const userLine = wrapped - currentLineOffset
      if (Number.isFinite(userLine) && userLine >= 1) {
        line = userLine
        // Replace only the `, line N]` tail of the locator and wipe
        // the leading `[bundle…]` framing — users don't need the
        // dist-file location to fix their sketch.
        message = clean.replace(/^\[.*?\]\s*/, '').trim()
      }
    }

    emitLog({
      runtime: 'p5',
      level: 'warn',
      source: currentSource ?? undefined,
      message,
      line,
    })
  }
}

/**
 * Install the FES hook on p5's constructor. Dynamically imports `p5`
 * so that merely importing this module doesn't pull the p5 bundle
 * (and its CJS `gifenc` dependency) into every downstream test graph
 * — consumers that mock `vizCompiler` to isolate UI paths stay
 * unaffected. In production, p5 is already resolved by
 * `P5VizRenderer`, so the dynamic import is a microtask-fast cache
 * hit.
 */
export function installP5FesBridge(): void {
  if (installed) return
  installed = true
  void import('p5')
    .then(({ default: p5 }) => {
      const ctor = p5 as unknown as P5Ctor
      ctor.disableFriendlyErrors = false
      ctor._fesLogger = buildLogger()
    })
    .catch(() => {
      // p5 may fail to resolve inside tests that stub out the viz
      // graph (vitest + CJS `gifenc` named-export mismatch). Swallow —
      // those tests don't exercise FES anyway, and production always
      // resolves because P5VizRenderer already loaded p5 eagerly.
      installed = false
    })
}

/**
 * Synchronous install for tests / callers that already hold the p5
 * constructor. Avoids the dynamic-import microtask wait so test
 * assertions can fire immediately.
 */
export function installP5FesBridgeWith(p5Ctor: unknown): void {
  if (installed) return
  installed = true
  const ctor = p5Ctor as P5Ctor
  ctor.disableFriendlyErrors = false
  ctor._fesLogger = buildLogger()
}

export function setCurrentP5Source(
  source: string | null,
  lineOffset = 0,
): void {
  currentSource = source
  currentLineOffset = source == null ? 0 : lineOffset
}

/** Current source's wrapped-body → user-file line offset. */
export function getCurrentP5LineOffset(): number {
  return currentLineOffset
}

/** TESTING ONLY — reset the bridge between suites. */
export function __resetP5FesBridgeForTests(p5Ctor?: unknown): void {
  installed = false
  currentSource = null
  currentLineOffset = 0
  if (p5Ctor) {
    const ctor = p5Ctor as P5Ctor
    delete ctor._fesLogger
  }
}
