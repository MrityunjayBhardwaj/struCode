"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { listWorkspaceFiles } from "@stave/editor";

interface WorkspaceSearchPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenFile: (fileId: string) => void;
}

interface Hit {
  fileId: string;
  path: string;
  line: number; // 1-based
  text: string;
}

const MAX_HITS = 200;

export function WorkspaceSearchPalette({
  open,
  onClose,
  onOpenFile,
}: WorkspaceSearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  const hits = useMemo(() => {
    if (!open) return [] as Hit[];
    const q = query.trim();
    if (q.length < 2) return []; // avoid grepping every keystroke
    const needle = caseSensitive ? q : q.toLowerCase();
    const out: Hit[] = [];
    const files = listWorkspaceFiles().filter((f) => !f.path.endsWith("/.keep"));
    for (const f of files) {
      if (out.length >= MAX_HITS) break;
      const lines = f.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (out.length >= MAX_HITS) break;
        const hay = caseSensitive ? lines[i] : lines[i].toLowerCase();
        if (hay.includes(needle)) {
          out.push({ fileId: f.id, path: f.path, line: i + 1, text: lines[i] });
        }
      }
    }
    return out;
  }, [open, query, caseSensitive]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-search-row="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const jumpTo = (hit: Hit) => {
    onClose();
    queueMicrotask(() => onOpenFile(hit.fileId));
    // Line navigation is a nice-to-have; current shell doesn't expose
    // a "reveal line" method. The file opens and the user can Cmd+F.
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) jumpTo(hit);
    }
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <input
            ref={inputRef}
            style={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search across all files..."
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
          <button
            style={{
              ...styles.caseBtn,
              ...(caseSensitive ? styles.caseBtnActive : {}),
            }}
            onClick={() => setCaseSensitive((c) => !c)}
            title="Match case"
          >
            Aa
          </button>
        </div>
        <div style={styles.meta}>
          {query.trim().length < 2
            ? "Type at least 2 characters"
            : hits.length >= MAX_HITS
            ? `${MAX_HITS}+ matches (showing first ${MAX_HITS})`
            : `${hits.length} match${hits.length === 1 ? "" : "es"}`}
        </div>
        <div style={styles.list} ref={listRef}>
          {hits.map((h, i) => (
            <div
              key={`${h.fileId}:${h.line}:${i}`}
              data-search-row={i}
              style={{ ...styles.row, ...(i === active ? styles.rowActive : {}) }}
              onMouseEnter={() => setActive(i)}
              onClick={() => jumpTo(h)}
            >
              <div style={styles.rowLeft}>
                <div style={styles.rowSnippet}>{highlight(h.text, query, caseSensitive)}</div>
                <div style={styles.rowLoc}>
                  {h.path} <span style={styles.rowLine}>:{h.line}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function highlight(line: string, query: string, caseSensitive: boolean): React.ReactNode {
  const q = query.trim();
  if (q.length < 2) return line;
  const hay = caseSensitive ? line : line.toLowerCase();
  const needle = caseSensitive ? q : q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < line.length) {
    const idx = hay.indexOf(needle, i);
    if (idx < 0) {
      parts.push(line.slice(i));
      break;
    }
    if (idx > i) parts.push(line.slice(i, idx));
    parts.push(
      <span key={idx} style={{ background: "#4a3a00", color: "#ffda4a" }}>
        {line.slice(idx, idx + q.length)}
      </span>,
    );
    i = idx + q.length;
  }
  return parts;
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "8vh",
    zIndex: 20000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 680,
    maxWidth: "92vw",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    background: "#1a1a2e",
    border: "1px solid #3a3a5a",
    borderRadius: 6,
    boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "stretch",
    borderBottom: "1px solid #2a2a4a",
  },
  input: {
    flex: 1,
    background: "#0f0f1e",
    border: "none",
    color: "#e8e8f0",
    padding: "10px 14px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  },
  caseBtn: {
    background: "#0f0f1e",
    border: "none",
    borderLeft: "1px solid #2a2a4a",
    color: "#8888aa",
    padding: "0 14px",
    fontSize: 12,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  caseBtnActive: {
    color: "#e8e8f0",
    background: "#2a2a55",
  },
  meta: {
    padding: "6px 14px",
    fontSize: 11,
    color: "#6a6a88",
    borderBottom: "1px solid #2a2a4a",
  },
  list: {
    overflowY: "auto",
    padding: "4px 0",
  },
  row: {
    display: "flex",
    padding: "6px 14px",
    cursor: "pointer",
  },
  rowActive: {
    background: "#2a2a55",
  },
  rowLeft: {
    minWidth: 0,
    flex: 1,
  },
  rowSnippet: {
    fontSize: 12,
    color: "#c8c8d4",
    fontFamily: '"JetBrains Mono", monospace',
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowLoc: {
    fontSize: 11,
    color: "#6a6a88",
    marginTop: 1,
  },
  rowLine: {
    color: "#8888aa",
  },
};
