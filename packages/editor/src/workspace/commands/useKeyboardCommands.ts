/**
 * useKeyboardCommands -- Phase 10.2 Task 08.
 *
 * React hook that attaches a window-level `keydown` listener implementing
 * Cmd+K chord detection (CONTEXT U2). The chord protocol:
 *
 *   1. User presses Cmd+K (or Ctrl+K on non-Mac) -- enters chord mode.
 *   2. A 1-second timeout starts. During this window:
 *      - V --> dispatches `workspace.openPreviewToSide`
 *      - B --> dispatches `workspace.toggleBackgroundPreview`
 *      - W --> dispatches `workspace.openPreviewInWindow`
 *      - Any other key --> exits chord mode, keystroke passes through.
 *   3. If the timeout expires before a second key, chord mode exits silently.
 *
 * Standalone V/B/W keystrokes (without a preceding Cmd+K) are NEVER
 * intercepted -- they pass through to Monaco or other focused elements.
 *
 * The listener uses `window.addEventListener` so shortcuts work regardless of
 * which element has focus (CONTEXT U2). Cleanup removes the listener and
 * clears any pending chord timeout on unmount.
 */

import { useEffect, useRef } from 'react'
import {
  executeCommand,
  type CommandContext,
  type WorkspaceShellActions,
} from './CommandRegistry'
import type { WorkspaceTab, WorkspaceGroupState } from '../types'
import type { PreviewProvider } from '../PreviewProvider'

export interface UseKeyboardCommandsOptions {
  getActiveTab: () => WorkspaceTab | null
  getActiveGroupId: () => string | null
  getActiveGroup: () => WorkspaceGroupState | null
  shellActions: WorkspaceShellActions
  getPreviewProvider: (language: string) => PreviewProvider | undefined
}

const CHORD_TIMEOUT_MS = 1000

const CHORD_MAP: Record<string, string> = {
  v: 'workspace.openPreviewToSide',
  b: 'workspace.toggleBackgroundPreview',
  w: 'workspace.openPreviewInWindow',
}

export function useKeyboardCommands(opts: UseKeyboardCommandsOptions): void {
  // Store opts in a ref so the keydown handler always reads the latest
  // callbacks without re-attaching the listener on every render.
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    let chordPending = false
    let chordTimer: ReturnType<typeof setTimeout> | null = null

    function clearChord(): void {
      chordPending = false
      if (chordTimer !== null) {
        clearTimeout(chordTimer)
        chordTimer = null
      }
    }

    function handler(e: KeyboardEvent): void {
      const isMeta = e.metaKey || e.ctrlKey

      // Step 1: detect Cmd+K / Ctrl+K to enter chord mode
      if (isMeta && e.key.toLowerCase() === 'k' && !chordPending) {
        e.preventDefault()
        chordPending = true
        chordTimer = setTimeout(() => {
          chordPending = false
          chordTimer = null
        }, CHORD_TIMEOUT_MS)
        return
      }

      // Step 2: if we're in chord mode, check for V/B/W
      if (chordPending) {
        const secondKey = e.key.toLowerCase()
        const commandId = CHORD_MAP[secondKey]

        clearChord()

        if (commandId) {
          e.preventDefault()
          const o = optsRef.current
          const ctx: CommandContext = {
            activeTab: o.getActiveTab(),
            activeGroupId: o.getActiveGroupId(),
            activeGroup: o.getActiveGroup(),
            shell: o.shellActions,
            getPreviewProvider: o.getPreviewProvider,
          }
          executeCommand(commandId, ctx)
        }
        // If not V/B/W, chord exits and the keystroke passes through naturally.
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      clearChord()
    }
  }, [])
}
