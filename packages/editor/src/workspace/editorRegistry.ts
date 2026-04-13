/**
 * editorRegistry — tiny module-level map so callers outside the
 * editor package (shell, app, outline panel) can find the Monaco
 * editor instance that's currently rendering a given fileId. Used
 * for cross-file navigation features like "reveal at line".
 *
 * EditorView registers on mount and unregisters on unmount. Only the
 * ACTIVE editor for a fileId matters — if two groups show the same
 * file, the last mount wins, which matches the UX ("jump to this
 * symbol" lands wherever the editor is currently focused).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoEditor = any

const editors = new Map<string, MonacoEditor>()

export function registerEditor(fileId: string, editor: MonacoEditor): void {
  editors.set(fileId, editor)
}

export function unregisterEditor(fileId: string, editor: MonacoEditor): void {
  if (editors.get(fileId) === editor) editors.delete(fileId)
}

export function getEditorForFile(fileId: string): MonacoEditor | undefined {
  return editors.get(fileId)
}

/**
 * Reveal the given line in the editor for `fileId` and set the cursor
 * at column 1. Returns true if the editor was found. Line numbers are
 * 1-based.
 */
export function revealLineInFile(fileId: string, line: number): boolean {
  const editor = editors.get(fileId)
  if (!editor) return false
  try {
    editor.revealLineInCenter?.(line)
    editor.setPosition?.({ lineNumber: line, column: 1 })
    editor.focus?.()
    return true
  } catch {
    return false
  }
}
