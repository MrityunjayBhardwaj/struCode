"use client";

import React, { useEffect } from "react";
import type { ProjectMeta } from "@stave/editor";
import { showConfirm } from "../dialogs/host";

interface ProjectSwitcherModalProps {
  open: boolean;
  projects: ProjectMeta[];
  activeProjectId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectSwitcherModal({
  open, projects, activeProjectId, onClose, onSelect, onRename, onDelete,
}: ProjectSwitcherModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Open Project</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.list}>
          {projects.length === 0 && (
            <div style={styles.empty}>No projects yet.</div>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              style={{
                ...styles.row,
                ...(p.id === activeProjectId ? styles.rowActive : {}),
              }}
              onClick={() => {
                onSelect(p.id);
                onClose();
              }}
            >
              <div style={styles.rowLeft}>
                <div style={styles.rowName}>{p.name}</div>
                <div style={styles.rowMeta}>
                  Last opened {formatRelative(p.lastOpenedAt)}
                </div>
              </div>
              <div style={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                <button style={styles.actionBtn} onClick={() => onRename(p.id)} title="Rename">
                  ✏️
                </button>
                {projects.length > 1 && p.id !== activeProjectId && (
                  <button
                    style={styles.deleteBtn}
                    onClick={async () => {
                      const ok = await showConfirm({
                        title: "Delete project?",
                        description: `"${p.name}" and all its files will be permanently removed.`,
                        confirmLabel: "Delete",
                        danger: true,
                      });
                      if (ok) onDelete(p.id);
                    }}
                    title="Delete"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 520,
    maxWidth: "90vw",
    maxHeight: "80vh",
    background: "#1a1a2e",
    border: "1px solid #3a3a5a",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column" as const,
    color: "#c8c8d4",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #2a2a4a",
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: "#e8e8f0",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#8888aa",
    fontSize: 24,
    cursor: "pointer",
    padding: "0 4px",
    lineHeight: 1,
  },
  list: {
    overflow: "auto",
    padding: "8px 0",
    flex: 1,
  },
  empty: {
    padding: "24px",
    textAlign: "center" as const,
    color: "#6a6a88",
    fontSize: 13,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 20px",
    cursor: "pointer",
    borderLeft: "3px solid transparent",
  },
  rowActive: {
    background: "#22223a",
    borderLeftColor: "#6a6ac8",
  },
  rowLeft: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  rowName: {
    fontSize: 13,
    color: "#e8e8f0",
    fontWeight: 500,
  },
  rowMeta: {
    fontSize: 11,
    color: "#6a6a88",
  },
  rowActions: {
    display: "flex",
    gap: 4,
  },
  actionBtn: {
    background: "none",
    border: "none",
    color: "#8888aa",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 3,
    fontSize: 12,
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "#f87171",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 3,
    fontSize: 12,
  },
};
