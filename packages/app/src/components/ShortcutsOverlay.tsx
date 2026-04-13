"use client";

import React, { useEffect, useMemo, useState } from "react";
import { listCommands, subscribeToCommands, type Command } from "../commands/registry";
import { formatKeybinding, getKeybindingFor } from "../commands/keybindings";

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => subscribeToCommands(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rows = useMemo(() => {
    const cmds = listCommands();
    const withBindings = cmds
      .map((c) => ({ cmd: c, binding: getKeybindingFor(c) }))
      .filter((r) => r.binding);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? withBindings.filter((r) =>
          `${r.cmd.category ?? ""} ${r.cmd.title}`.toLowerCase().includes(q),
        )
      : withBindings;
    // Group by category for display.
    const byCat = new Map<string, Array<{ cmd: Command; binding: string }>>();
    for (const r of filtered) {
      const cat = r.cmd.category ?? "Misc";
      let list = byCat.get(cat);
      if (!list) { list = []; byCat.set(cat, list); }
      list.push(r as { cmd: Command; binding: string });
    }
    return Array.from(byCat.entries()).sort(([a], [b]) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, query, open]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>Keyboard Shortcuts</div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>
        <input
          autoFocus
          style={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by command or category..."
        />
        <div style={styles.list}>
          {rows.length === 0 && (
            <div style={styles.empty}>No shortcuts match.</div>
          )}
          {rows.map(([category, items]) => (
            <div key={category} style={styles.section}>
              <div style={styles.sectionTitle}>{category}</div>
              {items.map(({ cmd, binding }) => (
                <div key={cmd.id} style={styles.row}>
                  <div style={styles.rowTitle}>{cmd.title}</div>
                  <div style={styles.rowKey}>{formatKeybinding(binding)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    paddingTop: "8vh", zIndex: 20000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 620, maxWidth: "92vw", maxHeight: "80vh",
    background: "#1a1a2e", border: "1px solid #3a3a5a", borderRadius: 6,
    display: "flex", flexDirection: "column",
    boxShadow: "0 10px 40px rgba(0,0,0,0.6)", overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", borderBottom: "1px solid #2a2a4a",
  },
  title: { color: "#e8e8f0", fontSize: 14, fontWeight: 600 },
  closeBtn: {
    background: "none", border: "none", color: "#8888aa",
    fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1,
  },
  input: {
    background: "#0f0f1e", border: "none",
    borderBottom: "1px solid #2a2a4a",
    color: "#e8e8f0", padding: "8px 14px", fontSize: 12,
    fontFamily: "inherit", outline: "none",
  },
  list: { overflowY: "auto", padding: "6px 0", flex: 1 },
  section: { padding: "6px 16px" },
  sectionTitle: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: 600,
    color: "#8888aa", textTransform: "uppercase" as const, marginBottom: 4,
  },
  row: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "4px 0", fontSize: 12, color: "#c8c8d4",
  },
  rowTitle: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowKey: { fontFamily: '"JetBrains Mono", monospace', color: "#9a9ac0", letterSpacing: 0.5 },
  empty: { padding: 20, textAlign: "center" as const, color: "#6a6a88", fontSize: 12 },
};
