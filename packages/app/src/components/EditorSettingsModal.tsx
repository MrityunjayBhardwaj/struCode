"use client";

import React, { useEffect, useState } from "react";
import {
  getEditorFontSize,
  setEditorFontSize,
  getEditorMinimap,
  toggleEditorMinimap,
  getEditorTheme,
  toggleEditorTheme,
} from "@stave/editor";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function EditorSettingsModal({ open, onClose }: Props) {
  const [fontSize, setFontSize] = useState(14);
  const [minimap, setMinimap] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    if (!open) return;
    setFontSize(getEditorFontSize());
    setMinimap(getEditorMinimap());
    setTheme(getEditorTheme());
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>Editor Settings</div>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={s.body}>
          <Row label="Font size">
            <input
              type="range"
              min={8}
              max={32}
              value={fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                setFontSize(v);
                setEditorFontSize(v);
              }}
              style={s.range}
            />
            <span style={s.value}>{fontSize}px</span>
          </Row>
          <Row label="Minimap">
            <label style={s.switchLabel}>
              <input
                type="checkbox"
                checked={minimap}
                onChange={() => { toggleEditorMinimap(); setMinimap((v) => !v); }}
              />
              <span>{minimap ? "Enabled" : "Disabled"}</span>
            </label>
          </Row>
          <Row label="Theme">
            <button
              style={s.themeBtn}
              onClick={() => { toggleEditorTheme(); setTheme((t) => t === "dark" ? "light" : "dark"); }}
            >
              {theme === "dark" ? "Dark" : "Light"} — switch
            </button>
          </Row>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.row}>
      <div style={s.rowLabel}>{label}</div>
      <div style={s.rowControl}>{children}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    paddingTop: "14vh", zIndex: 20000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 460, maxWidth: "92vw", background: "#1a1a2e",
    border: "1px solid #3a3a5a", borderRadius: 6,
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
  body: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 },
  row: {
    display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "center", gap: 12,
  },
  rowLabel: { fontSize: 12, color: "#9a9ac0" },
  rowControl: { display: "flex", alignItems: "center", gap: 10, color: "#e8e8f0" },
  range: { flex: 1, accentColor: "#7c7cff" },
  value: { fontSize: 11, color: "#8888aa", minWidth: 36, textAlign: "right" as const },
  switchLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" },
  themeBtn: {
    background: "#2a2a55", border: "1px solid #3a3a5a", borderRadius: 4,
    color: "#e8e8f0", padding: "4px 10px", fontSize: 12,
    cursor: "pointer", fontFamily: "inherit",
  },
};
