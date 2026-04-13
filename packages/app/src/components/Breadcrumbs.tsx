"use client";

import React from "react";

interface BreadcrumbsProps {
  path: string | null;
  /** Called when a folder segment is clicked — jumps to that folder
   *  (currently a no-op unless StaveApp wires a focus target). */
  onJumpToFolder?: (folderPath: string) => void;
}

export function Breadcrumbs({ path, onJumpToFolder }: BreadcrumbsProps) {
  if (!path) {
    return <div style={styles.bar} aria-hidden />;
  }
  const segments = path.split("/");
  const leaf = segments[segments.length - 1];
  const folders = segments.slice(0, -1);
  return (
    <div style={styles.bar} data-stave-breadcrumbs>
      {folders.map((seg, i) => {
        const folderPath = folders.slice(0, i + 1).join("/");
        return (
          <React.Fragment key={`${i}-${seg}`}>
            <button
              style={styles.segBtn}
              onClick={() => onJumpToFolder?.(folderPath)}
              title={folderPath}
            >
              {seg}
            </button>
            <span style={styles.sep}>/</span>
          </React.Fragment>
        );
      })}
      <span style={styles.leaf}>{leaf}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 22,
    minHeight: 22,
    background: "#14142a",
    borderBottom: "1px solid #2a2a4a",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: 4,
    fontSize: 11,
    color: "#8888aa",
    fontFamily: '"JetBrains Mono", monospace',
    userSelect: "none",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  segBtn: {
    background: "none",
    border: "none",
    color: "#8888aa",
    cursor: "pointer",
    padding: 0,
    fontSize: 11,
    fontFamily: "inherit",
  },
  sep: { color: "#4a4a66" },
  leaf: { color: "#c8c8d4" },
};
