/**
 * Turns a raw runtime error into a user-friendly `LogEntry` body.
 *
 * Inspired by p5.js's Friendly Error System (FES). We have a structural
 * advantage — every runtime ships its `DocsIndex` (the same one hover /
 * completion consume), so fuzzy-matching a misspelled identifier back
 * to a real symbol with its docs URL is a lookup, not a hard-coded
 * dictionary.
 *
 * Scope today:
 *   - Extract the offending identifier from a ReferenceError.
 *   - Fuzzy-match it (Levenshtein) against DocsIndex keys.
 *   - Format a friendly message + suggestion record.
 *
 * Not in scope yet:
 *   - Parsing TypeError arg-type mismatches (needs real signature parsing).
 *   - Parsing Sonic Pi's Ruby error format (different error surface).
 *   - Cross-runtime suggestions (*"stack is a Strudel fn; you're in Hydra"*).
 */

import type { DocsIndex } from '../monaco/docs/types'
import type { LogSuggestion, RuntimeId } from './engineLog'

export interface FriendlyErrorParts {
  /** Short sentence surfacing in toast + console row + Monaco marker. */
  message: string
  /** Populated when we found a confident fuzzy match in DocsIndex. */
  suggestion?: LogSuggestion
  /** Underlying stack, copied through so the Console panel can fold it. */
  stack?: string
  /**
   * 1-based source line parsed from a V8 / Firefox / Safari stack
   * trace when one was present. Feeds the engineLog → Monaco marker
   * bridge — entries without a line get no inline squiggle.
   */
  line?: number
  /** 1-based column, paired with `line`. */
  column?: number
}

/**
 * Parse the first eval-frame line/column out of an error's stack. Same
 * patterns `setEvalError` uses internally — exported here so emit sites
 * can enrich `LogEntry` without duplicating the regex.
 */
export function parseStackLocation(
  err: unknown,
): { line: number; column: number } | null {
  const stack =
    typeof err === 'object' && err !== null && 'stack' in err
      ? String((err as { stack: unknown }).stack ?? '')
      : ''
  if (!stack) return null
  // V8: "at eval (<anonymous>:LINE:COL)" or "at eval (eval at ...)"
  const v8 = stack.match(/at eval[^(]*\(.*?:(\d+):(\d+)\)/)
  if (v8) return { line: parseInt(v8[1], 10), column: parseInt(v8[2], 10) }
  // Firefox: "@<anonymous>:LINE:COL" or similar suffix
  const ff = stack.match(/@[^\n]*?:(\d+):(\d+)/)
  if (ff) return { line: parseInt(ff[1], 10), column: parseInt(ff[2], 10) }
  return null
}

/**
 * Levenshtein edit distance. Small implementation — fine for runs of up
 * to a few thousand words, which is the order of magnitude of the
 * combined DocsIndex keys (~935).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la

  let prev = new Array<number>(lb + 1)
  let curr = new Array<number>(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j

  for (let i = 1; i <= la; i++) {
    curr[0] = i
    const ac = a.charCodeAt(i - 1)
    for (let j = 1; j <= lb; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1, // insert
        prev[j] + 1, // delete
        prev[j - 1] + cost, // substitute
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[lb]
}

export interface FuzzyMatch {
  name: string
  distance: number
}

/**
 * Return the closest identifiers to `word` from a corpus, sorted by
 * distance. `maxDistance` filters out anything beyond the threshold;
 * defaults to `Math.max(2, ceil(word.length / 3))` — generous for short
 * words, stricter for long ones. `limit` caps the returned list.
 */
export function fuzzyMatch(
  word: string,
  corpus: readonly string[],
  options: { maxDistance?: number; limit?: number } = {},
): FuzzyMatch[] {
  if (!word) return []
  const lower = word.toLowerCase()
  const threshold =
    options.maxDistance ??
    Math.max(2, Math.ceil(word.length / 3))
  const limit = options.limit ?? 5
  const hits: FuzzyMatch[] = []
  for (const candidate of corpus) {
    const d = levenshtein(lower, candidate.toLowerCase())
    if (d <= threshold) hits.push({ name: candidate, distance: d })
  }
  hits.sort(
    (a, b) =>
      a.distance - b.distance ||
      // Prefer case-matching names on ties (e.g. PI over Pi).
      (a.name === word ? -1 : b.name === word ? 1 : 0) ||
      a.name.localeCompare(b.name),
  )
  return hits.slice(0, limit)
}

const REFERENCE_ERROR_PATTERNS = [
  // Chrome / Edge / Node: "foo is not defined"
  /^(\w+) is not defined$/,
  // Firefox: "foo is not defined"
  /^ReferenceError: (\w+) is not defined$/,
  // Safari: "Can't find variable: foo"
  /^Can't find variable: (\w+)$/,
]

/**
 * Extract the undefined identifier from a ReferenceError's message.
 * Returns `null` when the error isn't a reference-miss we recognise.
 */
export function extractReferenceIdentifier(err: unknown): string | null {
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)
  if (!message) return null
  // Some engines prefix with "Uncaught " — strip for matching.
  const trimmed = message.replace(/^Uncaught\s+/, '').trim()
  for (const re of REFERENCE_ERROR_PATTERNS) {
    const m = re.exec(trimmed)
    if (m && m[1]) return m[1]
  }
  return null
}

export interface FormatOptions {
  /** DocsIndex for the runtime the code was running in. */
  index?: DocsIndex
  /** Override the base URL pattern used for suggestion.docsUrl. */
  docsUrlFor?: (runtime: RuntimeId, name: string) => string
}

function defaultDocsUrl(runtime: RuntimeId, name: string): string {
  return `/docs/reference/${runtime}/#${name.toLowerCase()}`
}

/**
 * Build a FriendlyErrorParts from a raw thrown value. When `index` is
 * provided and the error is a ReferenceError, attempts a fuzzy-match
 * against the index and attaches the best suggestion.
 */
export function formatFriendlyError(
  err: unknown,
  runtime: RuntimeId,
  options: FormatOptions = {},
): FriendlyErrorParts {
  const rawMessage =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)
  const stack =
    typeof err === 'object' &&
    err !== null &&
    'stack' in err &&
    typeof (err as { stack: unknown }).stack === 'string'
      ? ((err as { stack: string }).stack)
      : undefined

  const loc = parseStackLocation(err)

  const identifier = extractReferenceIdentifier(err)
  if (identifier && options.index) {
    const matches = fuzzyMatch(
      identifier,
      Object.keys(options.index.docs),
    )
    if (matches.length > 0) {
      const hit = options.index.docs[matches[0].name]
      const docsUrl = (options.docsUrlFor ?? defaultDocsUrl)(
        runtime,
        matches[0].name,
      )
      const suggestion: LogSuggestion = {
        name: matches[0].name,
        docsUrl,
        example: hit?.example,
        description: hit?.description,
      }
      return {
        message: `\`${identifier}\` is not defined. Did you mean \`${matches[0].name}\`?`,
        suggestion,
        stack,
        line: loc?.line,
        column: loc?.column,
      }
    }
    // No fuzzy hit — still friendlier than a bare "is not defined".
    return {
      message: `\`${identifier}\` is not defined.`,
      stack,
      line: loc?.line,
      column: loc?.column,
    }
  }

  // Non-reference errors — fall back to the raw message + stack.
  return {
    message: rawMessage || 'Unknown error',
    stack,
    line: loc?.line,
    column: loc?.column,
  }
}
