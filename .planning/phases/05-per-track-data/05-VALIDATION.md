---
phase: 5
slug: per-track-data
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | packages/editor/vitest.config.ts |
| **Quick run command** | `pnpm --filter @strucode/editor test -- --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @strucode/editor test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | TRACK-01 | unit | `pnpm --filter @strucode/editor test -- --run StrudelEngine` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | TRACK-02 | unit | `pnpm --filter @strucode/editor test -- --run StrudelEngine` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | TRACK-03 | unit | `pnpm --filter @strucode/editor test -- --run StrudelEngine` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | TRACK-04 | unit | `pnpm --filter @strucode/editor test -- --run StrudelEngine` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/editor/src/__tests__/StrudelEngine.test.ts` — stubs for TRACK-01 through TRACK-04
- [ ] Mock setup for `@strudel/core` Pattern class and `queryArc`

*Existing vitest infrastructure covers framework needs. Only test file stubs required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Per-track viz renders correctly with isolated data | TRACK-02 | Visual verification of separate track rendering | Play multi-track pattern, verify each inline zone shows only its track's notes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
