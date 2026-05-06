/**
 * seedTabs — module-init side-effect that registers the placeholder
 * "Timeline" tab into the bottom-panel registry.
 *
 * Imported for side-effects from BottomPanel.tsx so the seed runs the
 * first time the drawer's bundle loads (rather than at @stave/editor
 * top-level barrel load — that would seed even in package consumers
 * that don't render the drawer). PR-B replaces the entry by
 * re-registering under the same id (`musical-timeline`); the registry's
 * idempotent semantics (DA-05) make this a no-fanfare swap.
 *
 * Vocabulary discipline (PV32 / D-06): the only strings here are
 * "Timeline" and "(empty — wired in PR-B)". No IR-jargon.
 *
 * Phase 20-01 PR-A.
 */

import * as React from 'react'

import { registerBottomPanelTab } from './bottomPanelRegistry'

function EmptyTimelineStub(): React.ReactElement {
  return React.createElement(
    'div',
    {
      'data-bottom-panel-tab': 'musical-timeline-empty',
      style: {
        padding: 24,
        color: 'var(--foreground-muted, #a0a0aa)',
        fontSize: 12,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", sans-serif',
      },
    },
    '(empty — wired in PR-B)',
  )
}

registerBottomPanelTab({
  id: 'musical-timeline',
  title: 'Timeline',
  content: React.createElement(EmptyTimelineStub),
})
