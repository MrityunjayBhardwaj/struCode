---
phase: 2
slug: pianoroll-visualizers
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (workspace root) |
| **Quick run command** | `pnpm test --filter @strucode/editor run` |
| **Full suite command** | `pnpm test run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --filter @strucode/editor run`
- **After every plan wave:** Run `pnpm test run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | PIANO-01 | unit | `pnpm test run -- useP5Sketch` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | PIANO-01 | unit | `pnpm test run -- VizPanel` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | PIANO-02 | unit | `pnpm test run -- PianorollSketch` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | PIANO-03 | unit | `pnpm test run -- PianorollSketch` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | PIANO-04 | manual | — | — | ⬜ pending |
| 2-03-01 | 03 | 3 | PIANO-05,PIANO-06 | unit | `pnpm test run -- ViewZoneManager` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 3 | UI-01,UI-02,UI-03 | unit | `pnpm test run -- VizPicker` | ❌ W0 | ⬜ pending |
| 2-04-02 | 04 | 4 | UI-04,PIANO-07 | manual | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/editor/src/__tests__/useP5Sketch.test.ts` — stubs for PIANO-01 (hook creates/destroys p5 instance)
- [ ] `packages/editor/src/__tests__/VizPanel.test.tsx` — stubs for PIANO-01 (mounts canvas container)
- [ ] `packages/editor/src/__tests__/PianorollSketch.test.ts` — stubs for PIANO-02, PIANO-03 (note X/Y positioning math)
- [ ] `packages/editor/src/__tests__/ViewZoneManager.test.ts` — stubs for PIANO-05, PIANO-06 (view zone add/remove)
- [ ] `packages/editor/src/__tests__/VizPicker.test.tsx` — stubs for UI-01..UI-03 (renders 5 buttons, active state)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pianoroll renders at 60fps visually smooth | PIANO-02 | Requires visual browser observation | Load demo, play pattern, inspect DevTools Performance tab for consistent 16ms frames |
| Percussion sounds appear at bottom lane | PIANO-03 | Visual placement requires human judgment | Play `s("bd sd")` — confirm bd/sd blocks appear below pitch grid |
| Inline view zone re-appears after evaluate() | PIANO-06 | Requires Monaco + evaluate() integration | Edit and re-eval a pattern — confirm inline pianoroll reattaches below `$:` line |
| VizPanel layout: 40px toolbar + 32px VizPicker | UI-04 | Visual pixel-precise measurement | Inspect computed heights in DevTools; toolbar=40px, VizPicker=32px |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
