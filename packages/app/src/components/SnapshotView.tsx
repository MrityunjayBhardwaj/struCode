"use client";

import React, { useCallback, useState } from "react";
import type { SnapshotMeta } from "@stave/editor";
import { showConfirm } from "../dialogs/host";

interface SnapshotViewProps {
  snapshots: SnapshotMeta[];
  onSaveNew: (label: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function SnapshotView({ snapshots, onSaveNew, onRestore, onDelete }: SnapshotViewProps) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const doSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSaveNew(label);
      setLabel("");
    } finally {
      setSaving(false);
    }
  }, [label, onSaveNew]);

  return (
    <div style={styles.root}>
      <div style={styles.saveRow}>
        <input
          style={styles.input}
          placeholder="Version label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") doSave(); }}
          disabled={saving}
        />
        <button style={styles.saveBtn} onClick={doSave} disabled={saving}>
          {saving ? "…" : "Save"}
        </button>
      </div>
      <div style={styles.list}>
        {snapshots.length === 0 && (
          <div style={styles.empty}>No versions yet</div>
        )}
        {snapshots.map((s) => {
          const isAuto = s.kind === "auto" || s.label.startsWith("Auto — ");
          return (
            <div key={s.id} style={styles.row}>
              <div style={styles.rowLeft}>
                <div style={{ ...styles.rowName, ...(isAuto ? styles.rowNameAuto : {}) }}>
                  {isAuto && <span style={styles.autoBadge}>AUTO</span>}
                  <span style={styles.rowLabel}>{s.label}</span>
                </div>
                <div style={styles.rowMeta}>{formatRelative(s.createdAt)}</div>
              </div>
              <div style={styles.rowActions}>
                <button
                  style={styles.actionBtn}
                  title="Restore this version"
                  onClick={async () => {
                    const ok = await showConfirm({
                      title: "Restore this version?",
                      description: `"${s.label}" will replace the current file contents. You can save a new version first if you want to keep them.`,
                      confirmLabel: "Restore",
                    });
                    if (!ok) return;
                    await onRestore(s.id);
                  }}
                >↻</button>
                <button
                  style={styles.deleteBtn}
                  title="Delete this version"
                  onClick={() => onDelete(s.id)}
                >×</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86400_000) return `${Math.floor(delta / 3600_000)}h ago`;
  return new Date(ts).toLocaleString();
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
  saveRow: {
    display: "flex",
    gap: 4,
    padding: "8px 10px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  input: {
    flex: 1,
    background: "var(--bg-input)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 3,
    color: "var(--text-primary)",
    padding: "4px 8px",
    fontSize: 11,
    fontFamily: "inherit",
    outline: "none",
    minWidth: 0,
  },
  saveBtn: {
    background: "var(--bg-active)",
    border: "1px solid var(--border-strong)",
    borderRadius: 3,
    color: "var(--text-primary)",
    padding: "4px 10px",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  list: { overflowY: "auto", padding: "2px 0", flex: 1 },
  empty: { padding: "18px", textAlign: "center" as const, color: "var(--text-muted)", fontSize: 11 },
  row: {
    display: "flex",
    alignItems: "center",
    padding: "5px 10px",
    gap: 6,
  },
  rowLeft: { flex: 1, minWidth: 0 },
  rowName: {
    fontSize: 12,
    color: "var(--text-primary)",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 5,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowLabel: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowNameAuto: { color: "var(--text-secondary)", fontWeight: 400 },
  autoBadge: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 0.5,
    padding: "1px 4px",
    borderRadius: 2,
    background: "var(--bg-active-strong)",
    color: "var(--text-chrome)",
    flexShrink: 0,
  },
  rowMeta: { fontSize: 10, color: "var(--text-muted)" },
  rowActions: { display: "flex", gap: 2, flexShrink: 0 },
  actionBtn: {
    background: "none",
    border: "none",
    color: "var(--text-icon)",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: 2,
    fontSize: 14,
    fontFamily: "inherit",
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "var(--danger-fg)",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: 2,
    fontSize: 14,
    fontFamily: "inherit",
  },
};
