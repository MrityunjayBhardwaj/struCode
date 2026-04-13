"use client";

import React from "react";

export interface StatusBarRuntimeState {
  readonly isPlaying: boolean;
  readonly bpm?: number;
  readonly error?: string | null;
}

interface StatusBarProps {
  projectName: string;
  activeFilePath: string | null;
  runtime: StatusBarRuntimeState | null;
  canUndo: boolean;
  canRedo: boolean;
}

export function StatusBar({
  projectName,
  activeFilePath,
  runtime,
  canUndo,
  canRedo,
}: StatusBarProps) {
  const playDot = runtime?.isPlaying ? "var(--success-fg)" : "var(--text-muted)";
  return (
    <div style={styles.bar} data-stave-statusbar>
      <div style={styles.section}>
        <span style={styles.project}>{projectName}</span>
        {activeFilePath && (
          <>
            <span style={styles.sep}>•</span>
            <span style={styles.path} title={activeFilePath}>
              {activeFilePath}
            </span>
          </>
        )}
      </div>

      <div style={styles.section}>
        {runtime && (
          <>
            <span style={{ ...styles.dot, background: playDot }} />
            <span>{runtime.isPlaying ? "Playing" : "Stopped"}</span>
            {runtime.bpm !== undefined && (
              <span style={styles.sep}>•&nbsp;{runtime.bpm.toFixed(0)} bpm</span>
            )}
            {runtime.error && (
              <>
                <span style={styles.sep}>•</span>
                <span style={styles.err}>error</span>
              </>
            )}
          </>
        )}
      </div>

      <div style={styles.sectionRight}>
        <span
          style={{ ...styles.hint, opacity: canUndo ? 1 : 0.4 }}
          title="Undo (⌘Z)"
        >
          ↶
        </span>
        <span
          style={{ ...styles.hint, opacity: canRedo ? 1 : 0.4 }}
          title="Redo (⌘⇧Z)"
        >
          ↷
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 22,
    minHeight: 22,
    background: "var(--bg-chrome-2)",
    borderTop: "1px solid var(--border-subtle)",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: 14,
    fontSize: 11,
    color: "var(--text-tertiary)",
    fontFamily: '"JetBrains Mono", monospace',
    userSelect: "none",
  },
  section: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  sectionRight: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  project: {
    color: "var(--text-chrome)",
  },
  path: {
    color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 400,
  },
  sep: {
    color: "var(--border-separator)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
  },
  err: {
    color: "var(--danger-fg)",
  },
  hint: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    cursor: "default",
  },
};
