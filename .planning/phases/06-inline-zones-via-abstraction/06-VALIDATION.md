---
phase: 6
slug: inline-zones-via-abstraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 6 — Validation Strategy

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
| 06-01-01 | 01 | 1 | ZONE-01 | unit | `pnpm --filter @strucode/editor test -- --run viewZones` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | ZONE-02 | unit | `pnpm --filter @strucode/editor test -- --run viewZones` | ✅ | ⬜ pending |
| 06-01-03 | 01 | 1 | ZONE-03 | unit | `pnpm --filter @strucode/editor test -- --run viewZones` | ✅ | ⬜ pending |
| 06-01-04 | 01 | 1 | ZONE-04 | unit | `pnpm --filter @strucode/editor test -- --run StrudelEditor` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing test infrastructure covers all phase requirements. `viewZones.test.ts` and `StrudelEditor.test.tsx` already exist with working mocks.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inline zones render correct per-track visualizations | ZONE-02 | Visual verification of separate track rendering | Play multi-track pattern, verify each inline zone shows only its track's notes |
| Zones freeze on stop, resume on play | ZONE-04 | Visual lifecycle verification | Play → verify animation → Stop → verify frozen → Play → verify resumed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
