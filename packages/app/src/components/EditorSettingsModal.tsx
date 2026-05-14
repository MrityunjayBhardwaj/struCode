"use client";

import React, { useEffect, useState } from "react";
import {
  getEditorFontSize,
  setEditorFontSize,
  getEditorMinimap,
  toggleEditorMinimap,
  getEditorUiIconSize,
  setEditorUiIconSize,
  getInlineVizActionSize,
  setInlineVizActionSize,
  getMusicalTimelineSubRowHeight,
  setMusicalTimelineSubRowHeight,
  getEditorTheme,
  setEditorTheme,
  getTierFlags,
  setTierFlag,
  listTiers,
  type EditorTheme,
  type TierFlags,
  type TierName,
} from "@stave/editor";

interface Props {
  open: boolean;
  onClose: () => void;
}

const THEME_OPTIONS: { value: EditorTheme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

// Phase 20-14 β-3 — Strudel modules tier UI. Only MIDI is wired today
// (β-4 calls `enableWebMidi()` based on `tierFlags.midi`). The other 7
// ship as disabled-scaffolded toggles. Each row carries:
//   - a one-sentence description for what the module DOES
//   - the follow-up issue number for the wiring work (rendered into the
//     "Module wiring planned" tooltip)
//   - an optional size hint (csound + tidal — large dynamic imports)
//
// Rationale for ship-disabled-not-hidden (per 20-14-PLAN.md §2 "tier-flag
// UI honesty"): the schema IS the contract. Showing the disabled toggles
// signals "Stave knows about csound, just not wired yet" to musicians
// coming from strudel.cc, which prevents the worse failure mode of users
// assuming Stave silently dropped a tier.
interface TierRow {
  name: TierName;
  label: string;
  description: string;
  /** GitHub issue number for the wiring follow-up. */
  issueNumber: number | null;
  /** Only true for MIDI in β-3. The other 7 render disabled. */
  interactive: boolean;
  /** Extra caption for heavy modules (csound, tidal). */
  sizeHint?: string;
}

const TIER_ROWS: TierRow[] = [
  {
    name: "midi",
    label: "MIDI",
    description: "Send notes to external MIDI devices.",
    issueNumber: null,
    interactive: true,
  },
  {
    name: "csound",
    label: "Csound",
    description: "Csound synthesis (loadCsound template).",
    issueNumber: 124,
    interactive: false,
    sizeHint: "Will load ~6 MB when enabled.",
  },
  {
    name: "tidal",
    label: "TidalCycles",
    description: "Haskell-via-WASM TidalCycles interop.",
    issueNumber: 125,
    interactive: false,
    sizeHint: "Will load ~6 MB when enabled.",
  },
  {
    name: "osc",
    label: "OSC",
    description: "Send OSC messages (needs SuperCollider backend).",
    issueNumber: 126,
    interactive: false,
  },
  {
    name: "serial",
    label: "Serial",
    description: "WebSerial output to microcontrollers / Eurorack.",
    issueNumber: 127,
    interactive: false,
  },
  {
    name: "gamepad",
    label: "Gamepad",
    description: "Read gamepad input as pattern values.",
    issueNumber: 128,
    interactive: false,
  },
  {
    name: "motion",
    label: "Motion",
    description: "DeviceMotion (accelerometer / gyro) input.",
    issueNumber: 129,
    interactive: false,
  },
  {
    name: "mqtt",
    label: "MQTT",
    description: "MQTT broker pub/sub.",
    issueNumber: 130,
    interactive: false,
  },
];

// Schema-vs-UI safety: if listTiers() ever drifts from TIER_ROWS, the
// app warns at dev time. Mismatched contract surface is a class of bug
// we want to catch immediately, not on a reload that drops a row.
function assertTierSchemaCoverage(): void {
  if (typeof window === "undefined") return;
  const declared = new Set(listTiers());
  const wired = new Set(TIER_ROWS.map((r) => r.name));
  for (const n of declared) {
    if (!wired.has(n)) {
      console.warn(`[EditorSettingsModal] tier "${n}" missing from TIER_ROWS — UI will not surface it.`);
    }
  }
  for (const n of wired) {
    if (!declared.has(n)) {
      console.warn(`[EditorSettingsModal] tier "${n}" is in TIER_ROWS but not in listTiers() schema.`);
    }
  }
}

export function EditorSettingsModal({ open, onClose }: Props) {
  const [fontSize, setFontSize] = useState(14);
  const [minimap, setMinimap] = useState(false);
  const [iconSize, setIconSize] = useState(25);
  const [vizActionSize, setVizActionSize] = useState(11);
  const [subRowHeight, setSubRowHeight] = useState(18);
  const [theme, setTheme] = useState<EditorTheme>("dark");
  // Phase 20-14 β-3 — Strudel tier flags. Mid-session toggle changes are
  // NOT observed by the engine until reload (the engine reads tierFlags
  // ONCE at init per α-5); the caption below the section makes that
  // contract visible.
  const [tierFlags, setTierFlagsState] = useState<TierFlags | null>(null);

  useEffect(() => {
    if (!open) return;
    setFontSize(getEditorFontSize());
    setMinimap(getEditorMinimap());
    setIconSize(getEditorUiIconSize());
    setVizActionSize(getInlineVizActionSize());
    setSubRowHeight(getMusicalTimelineSubRowHeight());
    setTheme(getEditorTheme());
    setTierFlagsState(getTierFlags());
    assertTierSchemaCoverage();
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
          <Row label="Icon size">
            <input
              type="range"
              min={10}
              max={32}
              value={iconSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                setIconSize(v);
                setEditorUiIconSize(v);
              }}
              style={s.range}
            />
            <span style={s.value}>{iconSize}px</span>
          </Row>
          <Row label="Inline viz buttons">
            <input
              type="range"
              min={8}
              max={28}
              value={vizActionSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVizActionSize(v);
                setInlineVizActionSize(v);
              }}
              style={s.range}
            />
            <span style={s.value}>{vizActionSize}px</span>
          </Row>
          <Row label="Timeline sub-row">
            <input
              type="range"
              min={12}
              max={48}
              value={subRowHeight}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSubRowHeight(v);
                setMusicalTimelineSubRowHeight(v);
              }}
              style={s.range}
            />
            <span style={s.value}>{subRowHeight}px</span>
          </Row>
          {/* Backdrop blur / opacity / quality moved to the
              backdrop popover (click the bg indicator in the
              menubar). Settings stays for editor-level prefs only. */}
          <Row label="Theme">
            <select
              style={s.select}
              value={theme}
              onChange={(e) => {
                const v = e.target.value as EditorTheme;
                setTheme(v);
                setEditorTheme(v);
              }}
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Row>
          {/* Phase 20-14 β-3 — Strudel modules tier UI. MIDI is the only
              wired row in β-3; the other 7 are disabled scaffolds, one
              follow-up issue per row (see TIER_ROWS at top of file). */}
          <div style={s.sectionDivider} />
          <div style={s.sectionTitle}>Strudel modules</div>
          {TIER_ROWS.map((row) => {
            const checked = tierFlags?.[row.name] ?? false;
            const disabledTooltip = row.issueNumber
              ? `Module wiring planned — see issue #${row.issueNumber}.`
              : "Module wiring planned.";
            return (
              <Row key={row.name} label={row.label}>
                <label
                  style={{
                    ...s.switchLabel,
                    cursor: row.interactive ? "pointer" : "not-allowed",
                    opacity: row.interactive ? 1 : 0.55,
                  }}
                  title={row.interactive ? undefined : disabledTooltip}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!row.interactive}
                    onChange={() => {
                      if (!row.interactive) return;
                      const next = !checked;
                      setTierFlag(row.name, next);
                      setTierFlagsState((prev) =>
                        prev ? { ...prev, [row.name]: next } : prev,
                      );
                    }}
                  />
                  <span style={s.tierDesc}>
                    {row.description}
                    {row.sizeHint ? (
                      <span style={s.tierSizeHint}> {row.sizeHint}</span>
                    ) : null}
                  </span>
                </label>
              </Row>
            );
          })}
          <div style={s.tierFootnote}>
            Changes take effect when you reload the page.
          </div>
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
    position: "fixed", inset: 0, background: "var(--bg-overlay)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    paddingTop: "14vh", zIndex: 20000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 460, maxWidth: "92vw", background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)", borderRadius: 6,
    boxShadow: "0 10px 40px rgba(0,0,0,0.5)", overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)",
  },
  title: { color: "var(--text-primary)", fontSize: 14, fontWeight: 600 },
  closeBtn: {
    background: "none", border: "none", color: "var(--text-icon)",
    fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1,
  },
  body: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 },
  row: {
    display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "center", gap: 12,
  },
  rowLabel: { fontSize: 12, color: "var(--text-secondary)" },
  rowControl: { display: "flex", alignItems: "center", gap: 10, color: "var(--text-primary)" },
  range: { flex: 1, accentColor: "var(--accent-strong)" },
  value: { fontSize: 11, color: "var(--text-tertiary)", minWidth: 36, textAlign: "right" as const },
  switchLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" },
  select: {
    background: "var(--bg-active)", border: "1px solid var(--border-strong)", borderRadius: 4,
    color: "var(--text-primary)", padding: "4px 10px", fontSize: 12,
    cursor: "pointer", fontFamily: "inherit", minWidth: 140,
  },
  // β-3 — tier UI styling.
  sectionDivider: {
    height: 1, background: "var(--border-subtle)", margin: "8px 0 4px 0",
  },
  sectionTitle: {
    fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
    marginBottom: 4,
  },
  tierDesc: { fontSize: 11, color: "var(--text-secondary)" },
  tierSizeHint: { color: "var(--text-tertiary)" },
  tierFootnote: {
    fontSize: 11, color: "var(--text-tertiary)", marginTop: 4,
    fontStyle: "italic",
  },
};
