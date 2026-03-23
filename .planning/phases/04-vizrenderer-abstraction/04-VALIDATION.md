---
phase: 4
slug: vizrenderer-abstraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (already configured) |
| **Config file** | `packages/editor/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @strucode/editor test --run` |
| **Full suite command** | `pnpm --filter @strucode/editor test --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @strucode/editor test --run`
- **After every plan wave:** Run `pnpm --filter @strucode/editor test --run`
- **Before `/gsd:verify-work`:** Full suite must be green + `tsc --noEmit` clean
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | REND-01 | unit | `pnpm --filter @strucode/editor test --run -- useVizRenderer` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | REND-02 | unit | `pnpm --filter @strucode/editor test --run -- useVizRenderer` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | REND-03 | unit | `pnpm --filter @strucode/editor test --run -- P5VizRenderer` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | REND-04 | type-check | `pnpm --filter @strucode/editor tsc --noEmit` | N/A | ⬜ pending |
| 04-01-05 | 01 | 1 | REND-05 | unit | `pnpm --filter @strucode/editor test --run -- defaultDescriptors` | ❌ W0 | ⬜ pending |
| 04-01-06 | 01 | 1 | REND-06 | unit | `pnpm --filter @strucode/editor test --run -- useVizRenderer` | ❌ W0 | ⬜ pending |
| 04-01-07 | 01 | 1 | REND-07 | unit | `pnpm --filter @strucode/editor test --run -- VizPicker` | ✅ needs migration | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/useVizRenderer.test.ts` — rename + rewrite from useP5Sketch.test.ts (covers REND-01, REND-02, REND-06)
- [ ] `src/__tests__/P5VizRenderer.test.ts` — new test file (covers REND-03)
- [ ] `src/__tests__/defaultDescriptors.test.ts` — new test file (covers REND-05)
- [ ] `src/__tests__/VizPanel.test.tsx` — migrate prop from sketchFactory to source (exists, needs update)
- [ ] `src/__tests__/VizPicker.test.tsx` — migrate from VizMode to VizDescriptor props (exists, needs update)
- [ ] `src/__tests__/viewZones.test.ts` — update for mountVizRenderer usage (exists, needs update)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All 7 viz modes render correctly in browser | REND-03 | Requires browser canvas + audio | Play a pattern, switch through all 7 modes in VizPicker |
| VizPicker dropdown switches modes | REND-07 | Visual behavior | Click each mode, verify canvas changes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
