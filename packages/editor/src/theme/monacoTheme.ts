import type * as Monaco from 'monaco-editor'

export function defineStrudelMonacoTheme(monaco: typeof Monaco): void {
  monaco.editor.defineTheme('stave-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'strudel.pattern-start', foreground: '7c7cff', fontStyle: 'bold' },
      { token: 'strudel.tempo',         foreground: 'a78bfa' },
      { token: 'strudel.function',      foreground: '93c5fd' },
      { token: 'strudel.note',          foreground: '86efac' },
      { token: 'strudel.mini.note',     foreground: '86efac' },
      { token: 'strudel.mini.operator', foreground: 'f472b6' },
      { token: 'strudel.mini.number',   foreground: 'fb923c' },
      { token: 'string',                foreground: 'fcd34d' },
      { token: 'number',                foreground: 'fb923c' },
      { token: 'comment',               foreground: '6b7280', fontStyle: 'italic' },
      { token: 'keyword',               foreground: 'c4b5fd' },
      // Sonic Pi tokens
      { token: 'sonicpi.function',      foreground: '93c5fd', fontStyle: 'bold' },
      { token: 'sonicpi.music',         foreground: 'a78bfa' },
      { token: 'sonicpi.symbol',        foreground: 'f472b6' },
      { token: 'sonicpi.note',          foreground: '86efac' },
      { token: 'sonicpi.kwarg',         foreground: '6ee7b7' },
    ],
    colors: {
      'editor.background':              '#090912',
      'editor.foreground':              '#c4b5fd',
      'editorLineNumber.foreground':    '#3d3d5c',
      'editorCursor.foreground':        '#7c7cff',
      'editor.selectionBackground':     '#6a6ac840',
      'editor.lineHighlightBackground': '#6a6ac80d',
      'editorIndentGuide.background':   '#ffffff10',
      'editorWidget.background':        '#0f0f1e',
      'editorSuggestWidget.background': '#0f0f1e',
      'editorSuggestWidget.border':     '#6a6ac840',
    },
  })

  monaco.editor.defineTheme('stave-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'strudel.pattern-start', foreground: '4a4ae0', fontStyle: 'bold' },
      { token: 'strudel.tempo',         foreground: '5555b8' },
      { token: 'strudel.function',      foreground: '1d4ed8' },
      { token: 'strudel.note',          foreground: '15803d' },
      { token: 'strudel.mini.note',     foreground: '15803d' },
      { token: 'strudel.mini.operator', foreground: 'be185d' },
      { token: 'strudel.mini.number',   foreground: 'c2410c' },
      { token: 'string',                foreground: '92400e' },
      { token: 'number',                foreground: 'c2410c' },
      { token: 'comment',               foreground: '9ca3af', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background':              '#f0f0f6',
      'editor.foreground':              '#1e1b4b',
      'editorLineNumber.foreground':    '#a0a0b4',
      'editorCursor.foreground':        '#4a4ae0',
      'editor.selectionBackground':     '#5555b830',
      'editor.lineHighlightBackground': '#5555b808',
    },
  })
}
