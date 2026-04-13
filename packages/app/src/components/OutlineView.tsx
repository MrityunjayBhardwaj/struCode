"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  getFile,
  subscribeToWorkspaceFile,
  revealLineInFile,
  type WorkspaceFile,
} from "@stave/editor";

interface OutlineViewProps {
  activeFileId: string | null;
  onJump: (fileId: string, line: number) => void;
}

// Re-export so StaveApp can pass a single handler that both opens the
// file (if it's not already the active tab) and reveals the line.
export { revealLineInFile };

interface Symbol {
  name: string;
  kind: string;
  line: number;
}

/**
 * Parse top-level declarations from a file. Regex-based — no AST. Scans
 * line-by-line for language-appropriate patterns. Deliberately forgiving:
 * false positives are fine; missed entries are fine. The goal is a
 * navigation aid, not a correctness tool.
 */
function extractSymbols(file: WorkspaceFile): Symbol[] {
  const out: Symbol[] = [];
  const lines = file.content.split("\n");
  const lang = file.language;

  const push = (name: string, kind: string, line: number) => {
    if (!name.trim()) return;
    out.push({ name: name.trim(), kind, line });
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#"))
      continue;

    if (lang === "markdown") {
      const hmatch = /^(#{1,6})\s+(.+)$/.exec(raw);
      if (hmatch) {
        const level = hmatch[1].length;
        push(hmatch[2], `h${level}`, i + 1);
      }
      continue;
    }

    if (lang === "sonicpi") {
      let m: RegExpExecArray | null;
      m = /^\s*live_loop\s+:(\w+)/.exec(raw);
      if (m) { push(m[1], "loop", i + 1); continue; }
      m = /^\s*define\s+:(\w+)/.exec(raw);
      if (m) { push(m[1], "def", i + 1); continue; }
      m = /^\s*defonce\s+:(\w+)/.exec(raw);
      if (m) { push(m[1], "def", i + 1); continue; }
      continue;
    }

    // JS-ish: strudel / p5js / hydra
    let m: RegExpExecArray | null;
    m = /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/.exec(raw);
    if (m) { push(m[1], "var", i + 1); continue; }
    m = /^\s*(?:export\s+)?function\s+(\w+)\s*\(/.exec(raw);
    if (m) { push(m[1], "fn", i + 1); continue; }
    // Pattern.viz("name") or .viz("name") — capture the viz name itself.
    m = /\.viz\(["']([^"']+)["']\)/.exec(raw);
    if (m) { push(m[1], "viz", i + 1); continue; }
    // Strudel top-level pattern lines with $:name
    m = /^\s*\$:\s*(\w+)/.exec(raw);
    if (m) { push(m[1], "pat", i + 1); continue; }
  }

  return out;
}

export function OutlineView({ activeFileId, onJump }: OutlineViewProps) {
  const [tick, setTick] = useState(0);

  // Re-render on content changes to the active file.
  useEffect(() => {
    if (!activeFileId) return;
    return subscribeToWorkspaceFile(activeFileId, () => setTick((t) => t + 1));
  }, [activeFileId]);

  const file = activeFileId ? getFile(activeFileId) : undefined;
  const symbols = useMemo(() => (file ? extractSymbols(file) : []), [file, tick]);

  if (!activeFileId) {
    return <div style={styles.empty}>No file open</div>;
  }
  if (!file) {
    return <div style={styles.empty}>File not found</div>;
  }
  if (symbols.length === 0) {
    return <div style={styles.empty}>No symbols</div>;
  }

  return (
    <div style={styles.list}>
      {symbols.map((s, i) => (
        <div
          key={`${s.line}-${s.name}-${i}`}
          style={styles.row}
          onClick={() => onJump(activeFileId, s.line)}
          title={`${s.name} (line ${s.line})`}
        >
          <span style={{ ...styles.kind, ...kindStyle(s.kind) }}>{kindBadge(s.kind)}</span>
          <span style={styles.name}>{s.name}</span>
          <span style={styles.line}>:{s.line}</span>
        </div>
      ))}
    </div>
  );
}

function kindBadge(kind: string): string {
  if (kind.startsWith("h")) return "H";
  switch (kind) {
    case "fn": return "ƒ";
    case "var": return "V";
    case "loop": return "∞";
    case "def": return "D";
    case "viz": return "◎";
    case "pat": return "♪";
    default: return "·";
  }
}

function kindStyle(kind: string): React.CSSProperties {
  const colours: Record<string, string> = {
    fn: "#8bd9ff",
    var: "#c0a0ff",
    loop: "#ffc06a",
    def: "#6bff8c",
    viz: "#ffa0ff",
    pat: "#ffda4a",
  };
  const bg = colours[kind] ?? "var(--text-muted)";
  return { color: bg };
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    overflowY: "auto",
    padding: "2px 0",
    flex: 1,
    minHeight: 0,
  },
  empty: {
    padding: 18,
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 11,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 12px",
    cursor: "pointer",
    fontSize: 11,
    color: "var(--text-chrome)",
    fontFamily: '"JetBrains Mono", monospace',
  },
  kind: {
    fontSize: 11,
    fontWeight: 700,
    width: 14,
    textAlign: "center" as const,
    flexShrink: 0,
  },
  name: {
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  line: {
    color: "var(--text-muted)",
    fontSize: 10,
  },
};
