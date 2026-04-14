/**
 * useVizRefWatcher — watch all .viz("name") references in a music-lang
 * file and auto-reload inline viz when a referenced viz file is saved.
 *
 * Scans the file content for `.viz("...")` calls, resolves each name to
 * a workspace file (`.p5` / `.hydra`), and subscribes to Y.Text changes
 * on those files. When a referenced viz file changes, the hook
 * recompiles the preset and re-registers it in the named viz registry —
 * which triggers EditorView's `onNamedVizChanged` listener to remount
 * the inline viz zones.
 *
 * Usage:
 *   useVizRefWatcher(fileId)
 */

"use client";

import { useEffect, useState } from "react";
import {
  getFile,
  listWorkspaceFiles,
  subscribeToWorkspaceFile,
  flushToPreset,
  getPresetIdForFile,
  registerPresetAsNamedViz,
  VizPresetStore,
  createWorkspaceFile,
} from "@stave/editor";

const VIZ_REF_RE = /\.viz\(\s*["']([^"']+)["']\s*\)/g;

/** Viz names that resolve to a bundled VizDescriptor (not a workspace file).
 *  Do NOT auto-create stub files for these — they're handled by the engine's
 *  default descriptors. Matching logic mirrors `resolveDescriptor`'s
 *  normalisation (case/space/dash/underscore insensitive). */
const BUNDLED_VIZ_NAMES = new Set([
  "pianoroll", "wordfall", "scope", "fscope", "spectrum", "spiral",
  "pitchwheel", "hydra", "pianorollhydra", "scopehydra", "kaleidoscopehydra",
  // Legacy + fuzzy aliases users commonly type
  "punchcard", "markcss",
]);

function normName(s: string): string {
  return s.toLowerCase().replace(/[\s\-_:]/g, "");
}

/** Minimal p5 viz stub — same shape as the default Piano Roll.p5 so users
 *  can immediately edit it in the viz editor. */
const STUB_P5_CODE = `// New viz — edit freely.
// stave.scheduler, stave.analyser, stave.hapStream are injected globals.

function setup() {
  createCanvas(stave.width, stave.height)
  colorMode(HSB, 360, 100, 100, 1)
  noStroke()
}

function draw() {
  background(230, 20, 10, 0.2)
  if (stave.analyser) {
    const data = new Uint8Array(stave.analyser.frequencyBinCount)
    stave.analyser.getByteFrequencyData(data)
    const step = width / data.length
    for (let i = 0; i < data.length; i++) {
      const h = (data[i] / 255) * height
      fill((i * 2) % 360, 70, 90, 0.85)
      rect(i * step, height - h, step - 1, h)
    }
  }
}
`;

function extractVizRefs(content: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  VIZ_REF_RE.lastIndex = 0;
  while ((m = VIZ_REF_RE.exec(content)) !== null) {
    const name = m[1];
    if (!seen.has(name)) { seen.add(name); names.push(name); }
  }
  return names;
}

function resolveVizFile(vizName: string): { fileId: string; presetId: string } | null {
  const target = normName(vizName);
  const allFiles = listWorkspaceFiles();
  for (const f of allFiles) {
    const baseName = f.path.replace(/\.[^.]+$/, "");
    const lastSeg = baseName.split("/").pop() ?? "";
    if (normName(lastSeg) === target || normName(baseName) === target) {
      let presetId = getPresetIdForFile(f);
      // Auto-generate presetId for manually created viz files
      if (!presetId) {
        presetId = `user_${baseName.replace(/[^a-zA-Z0-9]/g, "_")}`;
      }
      return { fileId: f.id, presetId };
    }
  }
  return null;
}

/**
 * Ensure a viz file exists for `.viz("name")`. If no file resolves to the
 * name AND the name isn't a bundled descriptor, create a stub .p5 file.
 * Returns the resolved file info, or null if nothing can be done (e.g. the
 * name matches a bundled viz — no file needed).
 */
function ensureVizFile(vizName: string): { fileId: string; presetId: string } | null {
  const existing = resolveVizFile(vizName);
  if (existing) return existing;
  if (BUNDLED_VIZ_NAMES.has(normName(vizName))) return null;

  // Sanitise the user's viz name into a reasonable filename.
  const safePath = `${vizName.replace(/[/\\:*?"<>|]/g, "_").trim()}.p5`;
  const newId = `viz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    createWorkspaceFile(newId, safePath, STUB_P5_CODE, "p5js");
    const presetId = `user_${vizName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    // Flush synchronously-ish: next tick compile + register so the inline
    // zone sees the stub on next remount.
    queueMicrotask(() => {
      flushToPreset(newId, presetId)
        .then(() => VizPresetStore.get(presetId))
        .then((p) => { if (p) registerPresetAsNamedViz(p); })
        .catch(() => { /* ignore — user will see the default zone */ });
    });
    return { fileId: newId, presetId };
  } catch {
    return null;
  }
}

function recompileAndRegister(vizFileId: string, presetId: string): void {
  flushToPreset(vizFileId, presetId)
    .then(() => VizPresetStore.get(presetId))
    .then((preset) => { if (preset) registerPresetAsNamedViz(preset); })
    .catch(() => { /* compile error — stale descriptor stays */ });
}

export function useVizRefWatcher(fileId: string | null): void {
  const [tick, setTick] = useState(0);

  // Subscribe to the music file's content changes to detect new .viz() refs.
  useEffect(() => {
    if (!fileId) return;
    return subscribeToWorkspaceFile(fileId, () => setTick((t) => t + 1));
  }, [fileId]);

  // Subscribe to every referenced viz file. Re-runs when the music
  // file content changes (tick) or when the fileId changes.
  useEffect(() => {
    if (!fileId) return;
    const file = getFile(fileId);
    if (!file) return;

    if (file.language !== "strudel" && file.language !== "sonicpi") return;

    const vizNames = extractVizRefs(file.content);
    if (vizNames.length === 0) return;

    const unsubs: Array<() => void> = [];

    for (const name of vizNames) {
      // ensureVizFile auto-creates a stub .p5 if the name doesn't resolve
      // AND isn't a bundled descriptor — so `.viz("myviz")` with no matching
      // file gets a usable editable stub rather than a silently-broken zone.
      const resolved = ensureVizFile(name);
      if (!resolved) continue;

      const unsub = subscribeToWorkspaceFile(resolved.fileId, () => {
        recompileAndRegister(resolved.fileId, resolved.presetId);
      });
      unsubs.push(unsub);
    }

    return () => { for (const u of unsubs) u(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, tick]);
}
