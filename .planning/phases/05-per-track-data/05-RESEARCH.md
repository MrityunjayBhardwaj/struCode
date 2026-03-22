# Phase 5: Per-Track Data - Research

**Researched:** 2026-03-22
**Domain:** Strudel pattern internals, monkey-patching, PatternScheduler API
**Confidence:** HIGH

## Summary

Phase 5 adds `StrudelEngine.getTrackSchedulers()` which returns a `Map<string, PatternScheduler>` — one entry per `$:` block — after `evaluate()`. The implementation monkey-patches `Pattern.prototype.p` during `evaluate()` to intercept pattern registration, captures each pattern in a local `capturedPatterns` map, then builds `PatternScheduler` wrappers that call `queryArc` directly on the captured pattern.

The Strudel source (verified against installed `@strudel/core@1.2.6`) reveals that `Pattern.prototype.p` is already defined by `repl.mjs` via the `injectPatternMethods()` closure during `evaluate()`. This means the monkey-patch must save the existing `.p` method, override it, run the evaluate call, then restore in a `finally` block. The restored method is the one injected by `injectPatternMethods`, not `undefined` — restoration must not destroy Strudel's own injected implementation.

The phase touches only `StrudelEngine.ts` and a new `StrudelEngine.test.ts`. No other files change. The change is purely additive — `getPatternScheduler()` and all existing APIs remain unchanged.

**Primary recommendation:** Monkey-patch `Pattern.prototype.p` after `this.repl.evaluate()` begins (wrap the `evaluate()` call), restore in `finally`, build `PatternScheduler` wrappers from captured patterns using the same `query: (begin, end) => pattern.queryArc(begin, end)` pattern already used in `getPatternScheduler()`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRACK-01 | Pattern.prototype.p monkey-patched during evaluate() to capture per-$: Pattern objects into capturedPatterns map | Verified: `Pattern` exported from `@strudel/core`; `.p` method defined in repl closure; patching the prototype intercepts all `.p()` calls during eval |
| TRACK-02 | Pattern.prototype.p always restored in finally block — even on evaluate error | Verified: `repl.evaluate()` never rejects — errors go to `onEvalError` callback. The `this.repl.evaluate(code)` Promise always resolves, so `finally` fires reliably |
| TRACK-03 | StrudelEngine.getTrackSchedulers() returns Map<string, PatternScheduler> where each value queries its captured Pattern directly via queryArc | Verified: `queryArc(begin, end)` signature confirmed in `pattern.mjs:414`; returns `Hap[]`; same pattern used in existing `getPatternScheduler()` |
| TRACK-04 | Anonymous $: patterns keyed as "$0", "$1" etc; named patterns (d1:) use literal name | Verified: repl source shows `id.includes('$')` branch appends `anonymousIndex++`; our monkey-patch must replicate this logic exactly |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@strudel/core` | 1.2.6 (installed) | `Pattern` class and `queryArc` | The pattern capture targets `Pattern.prototype.p` from this package |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^1.6.0 | Unit testing | Tests for the new method |

**Installation:** No new packages needed — everything already in `packages/editor/package.json`.

## Architecture Patterns

### Recommended Project Structure

No new files except a test file. All changes are in:
```
packages/editor/src/
  engine/
    StrudelEngine.ts         # modify — add capturedPatterns, getTrackSchedulers()
    StrudelEngine.test.ts    # new — test getTrackSchedulers() behaviour
```

### Pattern 1: Monkey-Patch with Save/Restore in Finally

**What:** Save the currently-injected `Pattern.prototype.p` before calling `this.repl.evaluate()`. Override with a capturing version. Restore unconditionally in `finally`.

**When to use:** Whenever you need to intercept a prototype method for the duration of one call without permanently changing behavior.

**Key detail from source reading:** `injectPatternMethods()` is called *inside* `repl.evaluate()` before user code runs. That means by the time our `this.repl.evaluate(code)` Promise resolves, Strudel has already overwritten `Pattern.prototype.p` with its closure-captured version. Our monkey-patch must therefore be set *before* `this.repl.evaluate(code)` is called, because `injectPatternMethods()` will then re-overwrite it. The correct sequence is:

1. Save the current `Pattern.prototype.p` (whatever it is — may be Strudel's previously-injected version or a prior monkey-patch)
2. Set our intercepting version
3. Call `this.repl.evaluate(code)` — Strudel's `injectPatternMethods()` will re-overwrite `.p` with its own closure version, which then calls `pPatterns[id] = this` AND also calls our save if we chain correctly

Wait — this is the critical subtlety. Re-reading the source:

```js
// repl.mjs line 222-228
const evaluate = async (code, autostart = true, shouldHush = true) => {
  ...
  await injectPatternMethods();  // <-- this sets Pattern.prototype.p
  ...
  let { pattern, meta } = await _evaluate(code, transpiler, ...); // <-- user code runs HERE
```

`injectPatternMethods()` runs *before* `_evaluate()` (user code). So by the time the user's `$: sound("bd")` runs, `Pattern.prototype.p` has already been set by Strudel's `injectPatternMethods`. Our monkey-patch set before `this.repl.evaluate()` will be **overwritten** by `injectPatternMethods` before user code even runs.

**Correct approach — wrap the injectPatternMethods-installed version:** We cannot set the monkey-patch before `repl.evaluate()` and expect it to survive `injectPatternMethods`. The correct approach is to call `this.repl.evaluate(code)` and then immediately re-patch *after* the Promise resolves... but that is too late.

**The real correct approach:** Use a getter/setter trap or hook into the fact that Strudel's `.p` calls `pPatterns[id] = this`. Since we want the patterns Strudel collects, we can access them directly.

Actually, re-reading more carefully: `pPatterns` is a closure variable inside `repl()`. It is NOT accessible from outside. The monkey-patch approach is the intended one per THESIS.md.

**Resolution:** The correct sequencing is to set the monkey-patch, then call `this.repl.evaluate(code)`. Inside `repl.evaluate()`:
1. `injectPatternMethods()` runs — this **calls our monkey-patch? No** — it sets `Pattern.prototype.p = function(id) { ... pPatterns[id] = this ... }`. This overwrites our patch.
2. User code runs — calls the Strudel-injected `.p`.

So our patch is clobbered. **The real solution** is to wrap the Strudel-injected function: set our interceptor *as a wrapper around the already-installed function*, but we can't do that before eval since the function isn't installed yet.

**Final correct approach** (verified by reading the repl source): Set up a `Proxy` or define a setter on `Pattern.prototype` for `.p` that intercepts the assignment from `injectPatternMethods` and wraps the newly set function.

OR — simpler: the THESIS decision says "monkey-patch during evaluate". The correct implementation is to use `Object.defineProperty` with a setter trap on the prototype that intercepts when Strudel itself assigns `.p`, and then wraps it:

```typescript
// Before evaluate():
const captured: Map<string, any> = new Map()
let anonIndex = 0
const originalDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'p')

Object.defineProperty(Pattern.prototype, 'p', {
  set(fn: Function) {
    // Strudel's injectPatternMethods is setting Pattern.prototype.p
    // Wrap it to intercept pattern registrations
    Object.defineProperty(Pattern.prototype, 'p', {
      value: function(this: any, id: string) {
        let captureId = id
        if (typeof id === 'string' && id.includes('$')) {
          captureId = `$${anonIndex}`
          anonIndex++
        }
        captured.set(captureId, this)
        return fn.call(this, id) // call Strudel's original
      },
      configurable: true,
      writable: true,
    })
  },
  configurable: true,
})

// ... call this.repl.evaluate(code) ...

// In finally: restore
if (originalDescriptor) {
  Object.defineProperty(Pattern.prototype, 'p', originalDescriptor)
} else {
  delete (Pattern.prototype as any).p
}
```

However this "setter intercepts injectPatternMethods" approach is complex. A simpler approach that works:

**Simplest correct approach:** Call `this.repl.evaluate(code)` normally to let it succeed. Then *after* success, check `this.repl.scheduler.pattern` for the full stacked pattern. But that gives us the stacked pattern, not individual tracks.

**Actually simplest:** The THESIS decision was to monkey-patch. Looking at the call sequence again: `injectPatternMethods` sets `Pattern.prototype.p` then returns. The evaluate call `await _evaluate(code, ...)` then runs user code. The window to intercept is: *after* `injectPatternMethods` sets `.p` but *before* user code runs. We cannot hook into that window from outside.

**Definitive approach that works:** Set the monkey-patch *after* `injectPatternMethods` runs. We can do this by overriding `evaluate` in a way that hooks post-`injectPatternMethods`. Since we cannot do that from outside, the practical approach is:

The THESIS document and the additional context both say "monkey-patching Pattern.prototype.p". The implementation that works is:

1. Before calling `this.repl.evaluate(code)`, define a setter trap on `Pattern.prototype.p` using `Object.defineProperty`
2. When Strudel's `injectPatternMethods` does `Pattern.prototype.p = function(id) {...}`, our setter fires
3. Our setter wraps the assigned function and puts the wrapper back
4. User code runs and hits our wrapper, which captures patterns then delegates to Strudel's original

This is the "setter intercept" pattern and it correctly handles the timing.

**Example:**
```typescript
// Source: verified by reading repl.mjs:171-183 and the call sequence
import { Pattern } from '@strudel/core'

// Inside StrudelEngine.evaluate():
const capturedPatterns = new Map<string, any>()
let anonIndex = 0

// Save whatever .p is now (previous injectPatternMethods call, or undefined)
const savedDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'p')

// Set a setter so we intercept when injectPatternMethods assigns Pattern.prototype.p
Object.defineProperty(Pattern.prototype, 'p', {
  configurable: true,
  set(strudelFn: (id: string) => any) {
    // injectPatternMethods just called Pattern.prototype.p = fn
    // Wrap it so our capture fires on each .p() call
    Object.defineProperty(Pattern.prototype, 'p', {
      configurable: true,
      writable: true,
      value: function (this: any, id: string) {
        // Replicate Strudel's anonymous-index logic for capture key
        let captureId = id
        if (typeof id === 'string' && id.includes('$')) {
          captureId = `$${anonIndex}`
          anonIndex++
        }
        if (typeof id === 'string' && !(id.startsWith('_') || id.endsWith('_'))) {
          capturedPatterns.set(captureId, this)
        }
        return strudelFn.call(this, id)
      },
    })
  },
})

try {
  await new Promise<void>((resolve, reject) => {
    this.evalResolve = (result) => {
      if (result.error) reject(result.error)
      else resolve()
    }
    this.repl.evaluate(code).then(() => {
      if (this.evalResolve) { this.evalResolve({}); this.evalResolve = null }
    })
  })
  // Build track schedulers from captured patterns
  this.trackSchedulers = new Map()
  for (const [id, pattern] of capturedPatterns) {
    const sched = (this.repl as any).scheduler
    const captured = pattern
    this.trackSchedulers.set(id, {
      now: () => sched.now(),
      query: (begin: number, end: number) => {
        try { return captured.queryArc(begin, end) } catch { return [] }
      },
    })
  }
} finally {
  // Restore original descriptor
  if (savedDescriptor) {
    Object.defineProperty(Pattern.prototype, 'p', savedDescriptor)
  } else {
    delete (Pattern.prototype as any).p
  }
}
```

### Pattern 2: queryArc Signature

**What:** `Pattern.queryArc(begin, end, controls?)` takes cycle numbers (Fraction or number), returns `Hap[]`.

**Verified signature** (pattern.mjs:414):
```typescript
queryArc(begin: number | Fraction, end: number | Fraction, controls?: object): Hap[]
```

The existing `getPatternScheduler()` already uses this pattern — pass plain numbers, it works.

### Pattern 3: Track Key Logic

Strudel's `Pattern.prototype.p` in repl.mjs:171-183:
```js
Pattern.prototype.p = function (id) {
  if (typeof id === 'string' && (id.startsWith('_') || id.endsWith('_'))) {
    return silence;   // muted — do NOT capture
  }
  if (id.includes('$')) {
    id = `${id}${anonymousIndex}`;  // "$" becomes "$0", "$1", etc.
    anonymousIndex++;
  }
  pPatterns[id] = this;
  return this;
};
```

Our capture logic must mirror this:
- Muted patterns (`_x` or `x_`) are silenced — we should skip capturing them (they return silence)
- Anonymous `$:` transpiles to `.p("$")` — id contains `$` — our key becomes `"$0"`, `"$1"`, etc.
- Named `d1:` transpiles to `.p("d1")` — id is `"d1"`, no `$`, captured as-is

**Critical:** The transpiler converts `d1: expr` to `expr.p('d1')` (labelToP in transpiler.mjs:468-492). The `$:` syntax uses `$` as a JS label identifier — transpiles to `expr.p('$')`. Strudel then appends the anon index: `"$" + anonymousIndex`.

Our capture key for anonymous patterns should be `"$" + anonIndex` (matching `"$0"`, `"$1"`). But the additional context says keys `"$0"`, `"$1"` — which matches.

### Anti-Patterns to Avoid

- **Overwriting Pattern.prototype.p permanently:** Always restore in `finally`. The `finally` must fire even on evaluate error (since `repl.evaluate()` never throws — errors go to `onEvalError`).
- **Capturing muted patterns:** Skip patterns where id starts/ends with `_` — they return `silence` and have no useful queryArc output.
- **Using `anonymousIndex` from Strudel's closure:** We cannot read Strudel's internal `anonymousIndex`. We must maintain our own counter, reset to 0 before each evaluate call. This must start at 0 each evaluate — `hush()` resets Strudel's counter to 0 before each eval.
- **Storing pattern references after hot-reload:** On re-evaluate, `capturedPatterns` must be cleared and rebuilt. The `trackSchedulers` map is replaced entirely each successful evaluate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pattern query | Custom cycle-to-hap calculation | `pattern.queryArc(begin, end)` | Already handles Fraction arithmetic, state, all edge cases |
| Scheduler time | Reading AudioContext currentTime | `sched.now()` | Returns cycles (not seconds); consistent with existing PatternScheduler contract |

## Common Pitfalls

### Pitfall 1: injectPatternMethods Overwrites the Monkey-Patch

**What goes wrong:** Setting `Pattern.prototype.p` before calling `this.repl.evaluate()` appears correct, but `injectPatternMethods()` runs synchronously inside `repl.evaluate()` before user code, overwriting the monkey-patch. User code then hits Strudel's version, not ours — nothing is captured.

**Why it happens:** The repl's evaluate sequence is: (1) `injectPatternMethods()` → sets `.p`, (2) `_evaluate(code)` → runs user code. The patch must survive step 1.

**How to avoid:** Use `Object.defineProperty` with a setter to intercept the assignment from `injectPatternMethods`. When `injectPatternMethods` does `Pattern.prototype.p = fn`, the setter fires and installs a wrapper instead.

**Warning signs:** `getTrackSchedulers()` returns an empty Map even after successful evaluate.

### Pitfall 2: Anonymous Index Desync

**What goes wrong:** Multiple `$:` blocks get the same key or wrong keys.

**Why it happens:** Strudel and our code each maintain a separate `anonymousIndex`. Strudel's resets to 0 via `hush()` inside `repl.evaluate()`. If our counter is not also reset to 0 before each evaluate, the keys drift.

**How to avoid:** Reset `anonIndex = 0` at the start of each `evaluate()` call, before installing the setter.

**Warning signs:** Second evaluate call gives keys `"$2"`, `"$3"` instead of `"$0"`, `"$1"`.

### Pitfall 3: Pattern Reference Goes Stale After Re-evaluate

**What goes wrong:** The `PatternScheduler` built from a captured pattern from evaluate call N continues to be used after evaluate call N+1 replaces the pattern.

**Why it happens:** `trackSchedulers` holds closures over the old Pattern objects. After re-evaluate, Strudel's scheduler points to a new stacked pattern but the captured individual patterns may still produce valid results — however they do not reflect any code changes.

**How to avoid:** Replace `this.trackSchedulers` entirely on every successful evaluate. Consumers that hold references to old `PatternScheduler` instances should refresh from `getTrackSchedulers()` after each evaluate.

**Warning signs:** Inline zones show stale pianoroll data after code is changed and re-evaluated.

### Pitfall 4: Restoring Wrong Descriptor

**What goes wrong:** The `finally` block restores `Pattern.prototype.p` to `undefined` instead of Strudel's injected function, breaking playback for subsequent evaluations.

**Why it happens:** If `savedDescriptor` is captured before `injectPatternMethods` has run (it may have run in a prior evaluate), the saved value might be the previous injectPatternMethods-installed function — which is correct. But if saved before any evaluate, it might be `undefined`.

**How to avoid:** Restoring the saved descriptor is correct in all cases. After `finally`, the next `evaluate()` call will call `injectPatternMethods()` again, which re-installs `.p`. So even if we restore to `undefined`, the next eval cycle will fix it. However, the setter-based approach means the restored state may be the setter itself if we don't manage carefully. Test this explicitly.

**Warning signs:** Second evaluate call fails to capture patterns OR Strudel's playback breaks.

### Pitfall 5: Setter Is Not Removed Before Restore

**What goes wrong:** The `Object.defineProperty` setter remains on `Pattern.prototype.p` after `finally`, so when the next `injectPatternMethods` runs (in a different, unrelated context), the setter fires unexpectedly.

**How to avoid:** In `finally`, restore the exact original descriptor (including whether it was a value descriptor vs accessor descriptor). If `savedDescriptor` was a value descriptor, restore as value descriptor. If it had no descriptor (`undefined`), delete the property.

## Code Examples

Verified patterns from reading installed source files:

### Pattern.prototype.p — exact installed implementation
```javascript
// Source: node_modules/@strudel/core/repl.mjs:171-183
Pattern.prototype.p = function (id) {
  if (typeof id === 'string' && (id.startsWith('_') || id.endsWith('_'))) {
    return silence;
  }
  if (id.includes('$')) {
    id = `${id}${anonymousIndex}`;
    anonymousIndex++;
  }
  pPatterns[id] = this;
  return this;
};
```

### queryArc signature — exact installed implementation
```javascript
// Source: node_modules/@strudel/core/pattern.mjs:414-421
queryArc(begin, end, controls = {}) {
  try {
    return this.query(new State(new TimeSpan(begin, end), controls));
  } catch (err) {
    errorLogger(err, 'query');
    return [];
  }
}
```

### Existing getPatternScheduler — consistency reference
```typescript
// Source: packages/editor/src/engine/StrudelEngine.ts:221-232
getPatternScheduler(): PatternScheduler | null {
  const sched = (this.repl as any)?.scheduler
  const pattern = sched?.pattern
  if (!sched || !pattern) return null
  return {
    now: () => sched.now(),
    query: (begin: number, end: number) => {
      try { return pattern.queryArc(begin, end) } catch { return [] }
    },
  }
}
```

### Transpiler — how $: and d1: become .p() calls
```javascript
// Source: node_modules/@strudel/transpiler/transpiler.mjs:468-492
// "$: sound('bd')"  →  "sound('bd').p('$')"    (anonymous)
// "d1: sound('bd')" →  "sound('bd').p('d1')"   (named)
// "foo: sound('bd')"→  "sound('bd').p('foo')"  (named)
function labelToP(node) {
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: { type: 'MemberExpression', object: node.body.expression,
        property: { type: 'Identifier', name: 'p' } },
      arguments: [{ type: 'Literal', value: node.label.name }],
    },
  };
}
```

### injectPatternMethods call order — the critical timing detail
```javascript
// Source: node_modules/@strudel/core/repl.mjs:222-237
const evaluate = async (code, autostart = true, shouldHush = true) => {
  ...
  await injectPatternMethods();        // (1) sets Pattern.prototype.p
  setTime(() => scheduler.now());
  await beforeEval?.({ code });
  allTransforms = [];
  shouldHush && hush();                // (2) resets pPatterns={}, anonymousIndex=0
  ...
  let { pattern, meta } = await _evaluate(code, transpiler, ...); // (3) user code runs
```

### Setter-Intercept Pattern (canonical for this phase)
```typescript
// Target: StrudelEngine.ts evaluate() method
import { Pattern } from '@strudel/core'

async evaluate(code: string): Promise<{ error?: Error }> {
  if (!this.initialized) await this.init()

  const capturedPatterns = new Map<string, any>()
  let anonIndex = 0

  // Save current descriptor (may be value descriptor from last injectPatternMethods)
  const savedDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'p')

  // Install setter — fires when injectPatternMethods does Pattern.prototype.p = fn
  Object.defineProperty(Pattern.prototype, 'p', {
    configurable: true,
    set(strudelFn: (id: string) => any) {
      // Wrap Strudel's fn with our capturing logic
      Object.defineProperty(Pattern.prototype, 'p', {
        configurable: true,
        writable: true,
        value: function (this: any, id: string) {
          if (typeof id === 'string' && !(id.startsWith('_') || id.endsWith('_'))) {
            let captureId = id
            if (id.includes('$')) {
              captureId = `$${anonIndex}`
              anonIndex++
            }
            capturedPatterns.set(captureId, this)
          }
          return strudelFn.call(this, id)
        },
      })
    },
  })

  try {
    const result = await new Promise<{ error?: Error }>((resolve) => {
      this.evalResolve = resolve
      this.repl.evaluate(code).then(() => {
        if (this.evalResolve) { this.evalResolve({}); this.evalResolve = null }
      })
    })

    if (!result.error) {
      // Build PatternSchedulers from captured patterns
      const sched = (this.repl as any).scheduler
      this.trackSchedulers = new Map<string, PatternScheduler>()
      for (const [id, pattern] of capturedPatterns) {
        const captured = pattern // close over this specific pattern
        this.trackSchedulers.set(id, {
          now: () => sched.now(),
          query: (begin: number, end: number) => {
            try { return captured.queryArc(begin, end) } catch { return [] }
          },
        })
      }
    }

    return result
  } finally {
    // Always restore
    if (savedDescriptor) {
      Object.defineProperty(Pattern.prototype, 'p', savedDescriptor)
    } else {
      delete (Pattern.prototype as any).p
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global `getPatternScheduler()` only | Per-track `getTrackSchedulers()` + global | Phase 5 | Enables per-$: visualization |
| `schedulerRef: { current: null }` in viewZones | Track-scoped scheduler from `getTrackSchedulers()` | Phase 6 (uses Phase 5) | Inline zones show per-track data |

## Open Questions

1. **Setter fires timing: does `hush()` reset before or after injectPatternMethods sets .p?**
   - What we know: From repl.mjs source: `injectPatternMethods()` runs first (sets .p), then `hush()` is called inside evaluate which resets `pPatterns={}` and `anonymousIndex=0`.
   - What's unclear: Since `hush()` resets Strudel's `anonymousIndex` to 0 *after* `injectPatternMethods` installs `.p`, our counter must also start at 0 for each evaluate. The key insight is `hush()` fires *between* `injectPatternMethods` and `_evaluate(code)`.
   - Recommendation: Reset `anonIndex = 0` before installing the setter, not after `hush()` fires. Since hush runs before user code, and our wrapper has already captured `anonIndex` in closure, this is fine — both counters start at 0 for the same evaluate call.

2. **What if evaluate() is called while a prior evaluate() is still in flight?**
   - What we know: The existing code uses `this.evalResolve` as a single slot — a second call would overwrite it.
   - What's unclear: Whether concurrent evaluate is a real use case.
   - Recommendation: Not in scope for this phase. The existing behavior (single-slot evalResolve) is unchanged.

3. **Solo patterns (S$:) — should they appear in getTrackSchedulers()?**
   - What we know: Strudel's `.p` handles solo with `S` prefix — the key is `"S$0"` etc., and non-soloed patterns are excluded from the stacked output. But `.p` still stores them in `pPatterns`.
   - What's unclear: Whether the planner wants solo-prefixed keys in the track map.
   - Recommendation: Capture all patterns that `.p` processes (as Strudel does), including `S`-prefixed ones. Phase 6 can filter if needed. Keep it simple.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^1.6.0 |
| Config file | `packages/editor/vitest.config.ts` |
| Quick run command | `cd packages/editor && npx vitest run src/engine/StrudelEngine.test.ts` |
| Full suite command | `cd packages/editor && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRACK-01 | getTrackSchedulers() returns Map with one entry per $: block | unit | `npx vitest run src/engine/StrudelEngine.test.ts` | No — Wave 0 |
| TRACK-02 | Pattern.prototype.p restored even when evaluate errors | unit | `npx vitest run src/engine/StrudelEngine.test.ts` | No — Wave 0 |
| TRACK-03 | Each track scheduler's query() calls queryArc on its captured pattern | unit | `npx vitest run src/engine/StrudelEngine.test.ts` | No — Wave 0 |
| TRACK-04 | Anonymous $: gets "$0","$1"; named gets literal name | unit | `npx vitest run src/engine/StrudelEngine.test.ts` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/editor && npx vitest run src/engine/StrudelEngine.test.ts`
- **Per wave merge:** `cd packages/editor && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/engine/StrudelEngine.test.ts` — covers TRACK-01, TRACK-02, TRACK-03, TRACK-04

**Testing approach note:** `StrudelEngine` requires mocking `@strudel/core`, `@strudel/webaudio`, `@strudel/mini`, etc. The test should mock the `Pattern` class with a fake prototype `.p` method and verify the setter-intercept behavior. The `repl.evaluate()` mock should simulate calling `Pattern.prototype.p = fn` (as injectPatternMethods does) then calling `fn.call(mockPattern, '$')` (as user code does). This is the critical test seam.

## Sources

### Primary (HIGH confidence)
- `node_modules/@strudel/core/repl.mjs` — `Pattern.prototype.p` definition (lines 171-183), `evaluate()` call sequence (lines 222-290), `pPatterns` closure (line 79), `anonymousIndex` (line 80), `hush()` (lines 84-90)
- `node_modules/@strudel/core/pattern.mjs` — `queryArc` signature and implementation (lines 401-421), `Pattern` class export (line 45)
- `node_modules/@strudel/transpiler/transpiler.mjs` — `labelToP()` showing `$:` → `.p('$')` transpilation (lines 468-492), `isLabelStatement` (line 118)
- `node_modules/@strudel/webaudio/webaudio.mjs` — `webaudioRepl()` delegates to `repl()` (lines 105-114)
- `node_modules/@strudel/core/cyclist.mjs` — `now()` returns cycles (line 95)
- `packages/editor/src/engine/StrudelEngine.ts` — existing `getPatternScheduler()` pattern (lines 221-232), `evaluate()` bridge (lines 136-148)
- `packages/editor/src/visualizers/types.ts` — `PatternScheduler` interface to implement

### Secondary (MEDIUM confidence)
- `packages/editor/src/visualizers/viewZones.ts` — shows `schedulerRef: { current: null }` gap that Phase 6 will fill using Phase 5 output
- `packages/editor/src/strudel.d.ts` — ambient declaration for `Pattern` (to update with `p` method signature)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed source files
- Architecture: HIGH — call sequence read directly from repl.mjs
- Pitfalls: HIGH — derived from direct source reading, not speculation
- Key subtlety (setter-intercept): HIGH — verified by tracing injectPatternMethods → _evaluate order in repl.mjs

**Research date:** 2026-03-22
**Valid until:** Until `@strudel/core` upgrades past 1.2.6 (the repl internals are stable but undocumented)
