import React from 'react'

interface ToolbarProps {
  isPlaying: boolean
  bpm?: number
  error?: string | null
  isExporting?: boolean
  onPlay: () => void
  onStop: () => void
  onExport: () => void
}

export function Toolbar({
  isPlaying,
  bpm,
  error,
  isExporting,
  onPlay,
  onStop,
  onExport,
}: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        padding: '0 12px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}
    >
      {/* Play button */}
      <button
        onClick={isPlaying ? onStop : onPlay}
        title={isPlaying ? 'Stop (Ctrl+.)' : 'Play (Ctrl+Enter)'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 4,
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          background: isPlaying ? 'rgba(139,92,246,0.15)' : 'var(--accent)',
          color: isPlaying ? 'var(--accent)' : '#fff',
          outline: isPlaying ? '1px solid var(--accent)' : 'none',
        }}
      >
        {isPlaying ? (
          <>
            <StopIcon /> Stop
          </>
        ) : (
          <>
            <PlayIcon /> Play
          </>
        )}
      </button>

      {/* BPM display */}
      {bpm != null && (
        <span style={{ color: 'var(--foreground-muted)', fontSize: 11 }}>
          {bpm} BPM
        </span>
      )}

      <div style={{ flex: 1 }} />

      {/* Error badge */}
      {error && (
        <span
          title={error}
          style={{
            maxWidth: 240,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#f87171',
            fontSize: 11,
            padding: '2px 8px',
            background: 'rgba(248,113,113,0.1)',
            borderRadius: 4,
            border: '1px solid rgba(248,113,113,0.3)',
          }}
        >
          {error}
        </span>
      )}

      {/* Export button */}
      <button
        onClick={onExport}
        disabled={isExporting}
        title="Export as WAV"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 4,
          border: '1px solid var(--border)',
          cursor: isExporting ? 'wait' : 'pointer',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          background: 'transparent',
          color: 'var(--foreground-muted)',
          opacity: isExporting ? 0.5 : 1,
        }}
      >
        <ExportIcon />
        {isExporting ? 'Exporting…' : 'Export WAV'}
      </button>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <polygon points="1,1 9,5 1,9" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect x="1" y="1" width="8" height="8" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5.5 1v6M2.5 5l3 3 3-3M1 9h9" />
    </svg>
  )
}
