/**
 * VizEditorChrome — shared action bar for viz file editor tabs.
 *
 * Rendered into EditorView's chromeSlot for .hydra / .p5 files. Shows:
 * - File type badge
 * - Preview to Side button (discoverable Cmd+K V)
 * - Background toggle (discoverable Cmd+K B)
 * - Save button (Ctrl+S / Cmd+S)
 * - Hot-reload toggle
 */

import React from 'react'
import type { PreviewEditorChromeContext } from '../PreviewProvider'

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--foreground-muted)',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 10,
  fontFamily: 'inherit',
}

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'rgba(117,186,255,0.15)',
  color: '#75baff',
  borderColor: 'rgba(117,186,255,0.3)',
}

export function VizEditorChrome({
  file,
  onOpenPreview,
  onToggleBackground,
  onSave,
  hotReload,
  onToggleHotReload,
}: PreviewEditorChromeContext): React.ReactElement {
  const ext = file.language === 'p5js' ? 'p5' : file.language

  return (
    <div
      data-workspace-chrome="viz"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        flexShrink: 0,
      }}
    >
      {/* File type badge */}
      <span
        style={{
          background: 'rgba(117,186,255,0.1)',
          color: '#75baff',
          padding: '1px 6px',
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {ext}
      </span>

      <div style={{ width: 1, height: 14, background: 'var(--border)' }} />

      {/* Preview to Side (Cmd+K V equivalent) */}
      <button
        onClick={onOpenPreview}
        title="Open Preview to Side (Cmd+K V)"
        style={btnStyle}
      >
        {'\u2B1A'} Preview
      </button>

      {/* Background toggle (Cmd+K B equivalent) */}
      <button
        onClick={onToggleBackground}
        title="Toggle Background Preview (Cmd+K B)"
        style={btnStyle}
      >
        {'\u25A2'} Background
      </button>

      <div style={{ flex: 1 }} />

      {/* Hot-reload toggle */}
      <button
        onClick={onToggleHotReload}
        title={hotReload ? 'Hot reload ON — click to disable' : 'Hot reload OFF — click to enable'}
        style={hotReload ? activeBtnStyle : btnStyle}
      >
        {hotReload ? '\u27F3 live' : '\u27F3'}
      </button>

      {/* Save (Cmd+S equivalent) */}
      <button
        onClick={onSave}
        title="Save (Cmd+S)"
        style={btnStyle}
      >
        {'\u2318'}S
      </button>
    </div>
  )
}
