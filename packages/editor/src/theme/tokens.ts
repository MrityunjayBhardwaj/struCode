export const DARK_THEME_TOKENS: Record<string, string> = {
  '--background':          '#090912',
  '--surface':             '#0f0f1a',
  '--surface-elevated':    '#14141f',
  '--border':              'rgba(255,255,255,0.08)',
  '--foreground':          '#e2e8f0',
  '--foreground-muted':    'rgba(255,255,255,0.4)',
  '--accent':              '#8b5cf6',
  '--accent-rgb':          '139, 92, 246',
  '--accent-dim':          'rgba(139,92,246,0.15)',
  '--stem-drums':          '#f97316',
  '--stem-bass':           '#06b6d4',
  '--stem-melody':         '#a78bfa',
  '--stem-pad':            '#10b981',
  '--code-bg':             '#090912',
  '--code-foreground':     '#c4b5fd',
  '--code-caret':          '#8b5cf6',
  '--code-selection':      'rgba(139,92,246,0.25)',
  '--code-line-highlight': 'rgba(139,92,246,0.05)',
  '--code-note':           '#86efac',
  '--code-function':       '#93c5fd',
  '--code-string':         '#fcd34d',
  '--code-number':         '#fb923c',
  '--code-comment':        'rgba(255,255,255,0.25)',
  '--code-active-hap':     'rgba(139,92,246,0.3)',
  '--font-mono':           '"JetBrains Mono", "Fira Code", "Cascadia Code", "Menlo", monospace',
}

export const LIGHT_THEME_TOKENS: Record<string, string> = {
  '--background':          '#f8f7ff',
  '--surface':             '#ffffff',
  '--surface-elevated':    '#f0eeff',
  '--border':              'rgba(0,0,0,0.10)',
  '--foreground':          '#1e1b4b',
  '--foreground-muted':    'rgba(0,0,0,0.4)',
  '--accent':              '#7c3aed',
  '--accent-rgb':          '124, 58, 237',
  '--accent-dim':          'rgba(124,58,237,0.12)',
  '--stem-drums':          '#ea580c',
  '--stem-bass':           '#0891b2',
  '--stem-melody':         '#7c3aed',
  '--stem-pad':            '#059669',
  '--code-bg':             '#f0eeff',
  '--code-foreground':     '#4c1d95',
  '--code-caret':          '#7c3aed',
  '--code-selection':      'rgba(124,58,237,0.2)',
  '--code-line-highlight': 'rgba(124,58,237,0.04)',
  '--code-note':           '#15803d',
  '--code-function':       '#1d4ed8',
  '--code-string':         '#92400e',
  '--code-number':         '#c2410c',
  '--code-comment':        'rgba(0,0,0,0.3)',
  '--code-active-hap':     'rgba(124,58,237,0.25)',
  '--font-mono':           '"JetBrains Mono", "Fira Code", "Cascadia Code", "Menlo", monospace',
}

export interface StrudelTheme {
  tokens: Record<string, string>
}

export function applyTheme(
  el: HTMLElement,
  theme: 'dark' | 'light' | StrudelTheme
): void {
  const tokens =
    theme === 'dark'
      ? DARK_THEME_TOKENS
      : theme === 'light'
      ? LIGHT_THEME_TOKENS
      : (theme as StrudelTheme).tokens

  for (const [key, value] of Object.entries(tokens)) {
    el.style.setProperty(key, value)
  }
}
