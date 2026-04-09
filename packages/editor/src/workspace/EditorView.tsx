/**
 * EditorView — Phase 10.2 Task 03.
 *
 * Pure Monaco editor view bound to a single workspace file. Owns nothing
 * except its own theme, its own chrome slot, and the Monaco instance it
 * created on mount. Does NOT own engine state, transport chrome,
 * highlighting, inline view zones, or bus subscriptions — those land in
 * Tasks 05 and 07 as layered additions.
 *
 * @remarks
 * ## Separation from the legacy monoliths
 *
 * `LiveCodingEditor.tsx` (506 lines) and `VizEditor.tsx` (600 lines)
 * currently bundle Monaco mount + theme + transport + hot reload +
 * preview rendering. This file is ~140 lines because it refuses to do any
 * of that. The plan (`PLAN.md §10.2-03`) lists every deferred concern
 * explicitly; every deferral is called out in a `Task XX wiring` comment
 * at the exact seam where the future wiring will land, so Task 05 / Task 07
 * know where to plug in without excavating git blame.
 *
 * ## Theme ownership (PV6 / PK6)
 *
 * The container ref receives `applyTheme(el, theme)` inside a
 * `useEffect` keyed on `[theme]`. Calling `applyTheme` during render (as
 * opposed to effect) is the `PK6` violation — it runs before the ref is
 * attached to the DOM and any reference to `ref.current` inside a render
 * body is `null` on first render anyway. The effect is the only safe slot.
 *
 * ## Loading state
 *
 * `useWorkspaceFile` returns `{ file: undefined }` when the id has not
 * been seeded yet. Task 01's hook tests verify this path; Task 03 renders
 * a small "Loading..." placeholder so the editor is still themed (to
 * satisfy PV6 assertions) but Monaco itself does not mount until the file
 * exists. Once the file is registered, the component re-renders and
 * Monaco mounts with the correct language set from `file.language`.
 *
 * ## Monaco mount callback
 *
 * Task 07 needs access to the Monaco editor instance and the Monaco
 * module reference to install view zones and highlighting. Task 03
 * surfaces both via the optional `onMount` prop. The props are typed as
 * `unknown` to avoid dragging a `monaco-editor` type-level import into
 * the workspace barrel (which would force every importer to have monaco
 * types in their tsconfig). Consumers cast at the call site, same as
 * `EditorGroup.tsx:207` currently does.
 *
 * ## What is intentionally NOT here
 *
 *   - No bus subscription. Task 07 adds it.
 *   - No inline view zones. Task 07 adds them.
 *   - No highlighting. Task 07 adds it.
 *   - No runtime chrome. Task 05 injects it via `chromeSlot`.
 *   - No Monaco model management across file swaps. Task 04 handles
 *     fileId changes by triggering a fresh `EditorView` mount via its
 *     React `key`, so each instance only sees one `fileId`.
 */

import React, { useEffect, useRef } from 'react'
import MonacoEditorRaw from '@monaco-editor/react'
import { applyTheme } from '../theme/tokens'
import { useWorkspaceFile } from './useWorkspaceFile'
import { ensureWorkspaceLanguages, toMonacoLanguage } from './languages'
import type { EditorViewProps } from './types'

// `@monaco-editor/react`'s default export is typed loosely; we cast once
// and reuse. Mirrors the approach taken in the legacy `EditorGroup.tsx:5`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MonacoEditor = MonacoEditorRaw as any

/**
 * Fixed Monaco editor options shared across every `EditorView` instance.
 * Matches the legacy `EditorGroup.tsx:210-227` option set so the visual
 * experience is identical during the refactor cutover. Opening these up
 * to embedder customization is explicitly out of scope for Phase 10.2.
 */
const MONACO_OPTIONS = {
  fontSize: 13,
  lineHeight: 22,
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  automaticLayout: true,
  padding: { top: 8, bottom: 8 },
  scrollbar: {
    vertical: 'auto' as const,
    horizontal: 'auto' as const,
    useShadows: false,
  },
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  renderLineHighlight: 'line' as const,
  cursorBlinking: 'smooth' as const,
  cursorSmoothCaretAnimation: 'on' as const,
}

export function EditorView({
  fileId,
  theme = 'dark',
  chromeSlot,
  onMount,
}: EditorViewProps): React.ReactElement {
  const { file, setContent } = useWorkspaceFile(fileId)
  const containerRef = useRef<HTMLDivElement>(null)

  // Theme application — PV6 / PK6. Effect, not render. Runs on mount
  // (after the ref is attached) and on every theme prop change.
  useEffect(() => {
    if (!containerRef.current) return
    applyTheme(containerRef.current, theme)
  }, [theme])

  // --------------------------------------------------------------
  // Runtime/bus wiring added in Task 07:
  //   - `EditorView` will subscribe to `workspaceAudioBus` with
  //     `{ kind: 'file', fileId }` (D-08), read `payload.inlineViz` to
  //     drive `addInlineViewZones(editorRef.current, payload, ...)`,
  //     and read `payload.hapStream` to drive `useHighlighting`. The
  //     editor ref captured in `onMount` is the plug point.
  //   - The legacy `LiveCodingEditor.tsx:211-231` BufferedScheduler
  //     elevation moves INTO the runtime provider (Task 05 / S8) so
  //     `EditorView` does not see streaming-only payloads.
  // Task 03 leaves this seam empty on purpose.
  // --------------------------------------------------------------

  // Monaco mount handler. Registers workspace languages the first time
  // any EditorView mounts inside a given Monaco instance, then forwards
  // to the caller's mount callback if one was provided.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMonacoMount = (editor: any, monaco: any): void => {
    ensureWorkspaceLanguages(monaco)
    onMount?.(editor, monaco)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (value: string | undefined): void => {
    if (value === undefined) return
    setContent(value)
  }

  return (
    <div
      ref={containerRef}
      data-workspace-view="editor"
      data-file-id={fileId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      {chromeSlot ? (
        <div
          data-workspace-view-slot="chrome"
          style={{ flexShrink: 0 }}
        >
          {chromeSlot}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {file ? (
          <MonacoEditor
            height="100%"
            language={toMonacoLanguage(file.language)}
            value={file.content}
            onChange={handleChange}
            onMount={handleMonacoMount}
            options={MONACO_OPTIONS}
          />
        ) : (
          <div
            data-workspace-view-state="loading"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--foreground-muted)',
              fontSize: 12,
            }}
          >
            Loading…
          </div>
        )}
      </div>
    </div>
  )
}
