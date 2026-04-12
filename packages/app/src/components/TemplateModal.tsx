"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { TEMPLATES, type ProjectTemplate } from "../templates";

interface TemplateModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, templateId: string) => void;
}

export function TemplateModal({ open, onClose, onCreate }: TemplateModalProps) {
  const [selectedId, setSelectedId] = useState<string>("starter");
  const [name, setName] = useState("Untitled");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input on open
  useEffect(() => {
    if (open && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleCreate = useCallback(() => {
    if (!name.trim()) return;
    onCreate(name.trim(), selectedId);
  }, [name, selectedId, onCreate]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>New Project</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.body}>
          <div style={styles.sectionLabel}>Choose a template</div>
          <div style={styles.grid}>
            {TEMPLATES.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={t.id === selectedId}
                onSelect={() => setSelectedId(t.id)}
              />
            ))}
          </div>
        </div>

        <div style={styles.footer}>
          <div style={styles.nameRow}>
            <label style={styles.nameLabel}>Project name</label>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              style={styles.nameInput}
              placeholder="Untitled"
            />
          </div>
          <div style={styles.actions}>
            <button style={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              style={{ ...styles.createBtn, ...(!name.trim() ? styles.createBtnDisabled : {}) }}
              onClick={handleCreate}
              disabled={!name.trim()}
            >
              Create Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template, selected, onSelect,
}: {
  template: ProjectTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        ...styles.card,
        ...(selected ? styles.cardSelected : {}),
      }}
    >
      <div style={styles.cardIcon}>{template.icon}</div>
      <div style={styles.cardName}>{template.name}</div>
      <div style={styles.cardDesc}>{template.description}</div>
    </button>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

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
    width: 720,
    maxWidth: "90vw",
    maxHeight: "85vh",
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
  body: {
    padding: "16px 20px",
    overflow: "auto",
    flex: 1,
  },
  sectionLabel: {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#8888aa",
    marginBottom: 10,
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 12,
  },
  card: {
    background: "#22223a",
    border: "1px solid #2a2a4a",
    borderRadius: 6,
    padding: 16,
    cursor: "pointer",
    textAlign: "left" as const,
    color: "#c8c8d4",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    transition: "all 0.1s",
    minHeight: 120,
  },
  cardSelected: {
    background: "#2a2a4a",
    borderColor: "#6a6ac8",
    boxShadow: "0 0 0 1px #6a6ac8",
  },
  cardIcon: {
    fontSize: 28,
  },
  cardName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#e8e8f0",
  },
  cardDesc: {
    fontSize: 12,
    color: "#8888aa",
    lineHeight: 1.4,
  },
  footer: {
    borderTop: "1px solid #2a2a4a",
    padding: "14px 20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  nameLabel: {
    fontSize: 12,
    color: "#8888aa",
    minWidth: 90,
  },
  nameInput: {
    flex: 1,
    background: "#0d0d1a",
    border: "1px solid #3a3a5a",
    borderRadius: 4,
    color: "#e8e8f0",
    fontSize: 13,
    padding: "6px 10px",
    outline: "none",
    fontFamily: "inherit",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  cancelBtn: {
    background: "none",
    border: "1px solid #3a3a5a",
    borderRadius: 4,
    color: "#c8c8d4",
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  createBtn: {
    background: "#4a4ac8",
    border: "1px solid #6a6ac8",
    borderRadius: 4,
    color: "#ffffff",
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 600,
    fontFamily: "inherit",
  },
  createBtnDisabled: {
    background: "#2a2a4a",
    borderColor: "#3a3a5a",
    color: "#6a6a88",
    cursor: "default",
  },
};
