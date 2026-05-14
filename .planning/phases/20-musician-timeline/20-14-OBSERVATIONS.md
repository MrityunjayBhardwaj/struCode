---
phase: 20-14
title: α-wave runtime observations + settingPatterns audit
created: 2026-05-15
note: appended during α-wave execution; kept separate from RESEARCH.md to keep that pristine
---

# Phase 20-14 — α-wave Observations

This file holds notes generated during α-wave execution that need a stable
home but don't belong in the locked CONTEXT/RESEARCH/PLAN trio.

## α-6 — `settingPatterns` audit (RESEARCH §7 open question #5)

**Upstream source:** `website/src/settings.mjs` at the pinned SHA
`f73b395648645aabe699f91ba0989f35a6fd8a3c`.

**What `settingPatterns` is:** a single named export at upstream
`settings.mjs:154` of shape `{ theme, fontFamily, fontSize }`. The three
values are pattern-method `register()`s produced by the local
`patternSetting(key)` helper (`settings.mjs:139-148`):

```js
const patternSetting = (key) =>
  register(key, (value, pat) =>
    pat.onTrigger(() => {
      value = Array.isArray(value) ? value.join(' ') : value;
      if (value !== settingsMap.get()[key]) {
        settingsMap.setKey(key, value);
      }
      return pat;
    }, false),   // ← the `false` 2nd arg to onTrigger means "no audio"
  );
```

`settingsMap` is a `persistentMap(settings_key, defaultSettings)` of the
upstream React editor's preferences — theme, font, panel state, zen mode,
etc. It is **the strudel.cc website's settings store**, not a Strudel core
concept.

`settingPatterns` is passed as the FIRST positional arg to `evalScope` in
upstream `util.mjs:97`:
```js
return evalScope(settingPatterns, ...modules);
```

So user code on strudel.cc can write things like:
```js
$: theme("dracula")
$: fontSize("16")
```
and the editor mutates its own appearance on each hap fire.

**Classification:** **UI-only.** The `false` second arg to `onTrigger`
explicitly disables audio output for this register. The body's side
effect is `settingsMap.setKey(...)`, a write into the strudel.cc website's
state store. The transformation is purely cosmetic at the website layer.

**Verdict for Stave:** Nothing **audio-pure** is missing. Re-exposing
`theme` / `fontFamily` / `fontSize` on Stave would silently write to a
settings object that doesn't exist here (or worse, would need a
Stave-side equivalent that maps to its own theme/font store — which
duplicates work in `editorRegistry.ts` for no audio benefit).

**Action:** None for α. None for β. If γ surfaces a corpus tune that
relies on `theme(...)`/`fontSize(...)` chain-method calls (none of the
16 in RESEARCH §5 do), file a follow-up. Otherwise this is a closed loop.

**Follow-up issues to file:** none — settingPatterns surface is fully
UI-only.

---

## (Reserved for future α-wave observations)
