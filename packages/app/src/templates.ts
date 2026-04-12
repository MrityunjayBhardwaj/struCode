/**
 * Project templates — PM Phase 2.5
 *
 * Each template defines the starting set of files for a new project.
 * When a user creates a new project with a template, the template's
 * files are seeded into the Y.Doc via seedWorkspaceFile.
 */

import {
  seedWorkspaceFile,
  bundledPresetId,
  workspaceFileIdForPreset,
  type WorkspaceLanguage,
} from "@stave/editor";

// ── Default code snippets ────────────────────────────────────────────

export const STRUDEL_CODE = `// Strudel — Declarative pattern algebra
// Ctrl+Enter to play · Ctrl+. to stop

setcps(130/240)

$: stack(
  note("c4 e4 g4 b4 c5 b4 g4 e4")
    .s("sawtooth").gain(0.3).lpf(2400).release(0.12),
  note("e3 g3 b3 e4")
    .s("sine").gain(0.15).release(0.3)
).viz("pianoroll")

$: note("<c2 [g2 c2] f2 [g2 eb2]>")
  .s("square").gain(0.4).lpf(500).release(0.2)
  .viz("pitchwheel")

$: stack(
  s("hh*8").gain(0.3),
  s("bd [~ bd] ~ bd").gain(0.5),
  s("~ sd ~ [sd cp]").gain(0.4)
).viz("wordfall")`;

export const SONIC_PI_CODE = `# Sonic Pi — Imperative play/sleep/live_loop
# Ctrl+Enter to play · Ctrl+. to stop

use_bpm 120

live_loop :drums do
  viz :pianoroll
  sample :bd_haus
  sleep 0.5
  sample :sn_dub
  sleep 0.5
end

live_loop :bass do
  viz :scope
  use_synth :tb303
  play choose([36, 39, 43]), release: 0.3
  sleep 0.5
end

live_loop :melody do
  viz :pitchwheel
  use_synth :prophet
  play choose([60, 64, 67, 72]), release: 0.2
  sleep 0.25
end`;

export const PIANOROLL_P5_CODE = `// Stave p5 viz — Piano Roll
// stave.scheduler, stave.analyser, stave.hapStream are injected globals

function setup() {
  createCanvas(stave.width, stave.height)
  colorMode(HSB, 360, 100, 100, 1)
  noStroke()
}

function draw() {
  background(230, 30, 8, 0.25)
  if (stave.scheduler) {
    const now = stave.scheduler.now()
    const haps = stave.scheduler.query(now - 3, now + 1)
    for (const h of haps) {
      const x = ((h.begin - now + 3) / 4) * width
      const w = max(4, ((h.duration ?? h.end - h.begin) / 4) * width)
      const y = (1 - (h.note ?? 60) / 127) * height
      const playing = h.begin <= now && (h.begin + (h.duration ?? 0.25)) > now
      const hue = (((h.note ?? 60) * 7) % 12) * 30
      fill(hue, playing ? 80 : 55, playing ? 100 : 70, playing ? 1 : 0.85)
      rect(x, y - 3, w, 6, 2)
    }
  }
}`;

export const PIANOROLL_HYDRA_CODE = `// Hydra Piano Roll — shader-based frequency bands
s.osc(() => 10 + s.a.fft[0] * 50, -0.3, 0)
  .thresh(() => 0.3 + s.a.fft[0] * 0.5, 0.1)
  .color(0.46, 0.71, 1.0)
  .add(
    s.osc(() => 20 + s.a.fft[1] * 40, 0.2, 0)
      .rotate(Math.PI / 2)
      .thresh(() => 0.4 + s.a.fft[1] * 0.4, 0.08)
      .color(1.0, 0.79, 0.16),
    () => s.a.fft[1] * 0.8
  )
  .modulate(s.noise(2, () => s.a.fft[3] * 0.4), () => s.a.fft[0] * 0.015)
  .scrollX(() => s.a.fft[0] * 0.02)
  .out()`;

// ── Types ────────────────────────────────────────────────────────────

export interface TemplateFile {
  id: string;
  path: string;
  content: string;
  language: WorkspaceLanguage;
  meta?: Record<string, unknown>;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  files: TemplateFile[];
}

// Helper — the bundled viz preset IDs
const p5PresetId = () => bundledPresetId("Piano Roll", "p5");
const hydraPresetId = () => bundledPresetId("Piano Roll Hydra", "hydra");

// ── Templates ─────────────────────────────────────────────────────────

/**
 * Starter — the full workspace with Strudel, Sonic Pi, p5.js, and Hydra.
 * Matches the previous hardcoded default. Best for exploring all engines.
 */
function makeStarterFiles(): TemplateFile[] {
  const p5Id = p5PresetId();
  const hydraId = hydraPresetId();
  return [
    {
      id: "pattern.strudel",
      path: "pattern.strudel",
      content: STRUDEL_CODE,
      language: "strudel",
    },
    {
      id: "pattern.sonicpi",
      path: "pattern.sonicpi",
      content: SONIC_PI_CODE,
      language: "sonicpi",
    },
    {
      id: workspaceFileIdForPreset(p5Id),
      path: "Piano Roll.p5",
      content: PIANOROLL_P5_CODE,
      language: "p5js",
      meta: { presetId: p5Id },
    },
    {
      id: workspaceFileIdForPreset(hydraId),
      path: "Piano Roll (Hydra).hydra",
      content: PIANOROLL_HYDRA_CODE,
      language: "hydra",
      meta: { presetId: hydraId },
    },
  ];
}

function makeStrudelOnlyFiles(): TemplateFile[] {
  return [
    {
      id: "pattern.strudel",
      path: "pattern.strudel",
      content: STRUDEL_CODE,
      language: "strudel",
    },
  ];
}

function makeHydraOnlyFiles(): TemplateFile[] {
  const hydraId = hydraPresetId();
  return [
    {
      id: workspaceFileIdForPreset(hydraId),
      path: "sketch.hydra",
      content: PIANOROLL_HYDRA_CODE,
      language: "hydra",
      meta: { presetId: hydraId },
    },
  ];
}

function makeSonicPiOnlyFiles(): TemplateFile[] {
  return [
    {
      id: "pattern.sonicpi",
      path: "pattern.sonicpi",
      content: SONIC_PI_CODE,
      language: "sonicpi",
    },
  ];
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "starter",
    name: "Starter",
    description:
      "The full workspace — Strudel, Sonic Pi, p5.js, and Hydra files. Best for exploring.",
    icon: "✨",
    files: [], // filled lazily via getTemplateFiles
  },
  {
    id: "strudel",
    name: "Strudel Sketch",
    description: "Just a Strudel pattern file. Pure declarative music.",
    icon: "🎵",
    files: [],
  },
  {
    id: "sonicpi",
    name: "Sonic Pi Sketch",
    description: "Just a Sonic Pi live-loop file. Imperative play/sleep.",
    icon: "🥁",
    files: [],
  },
  {
    id: "hydra",
    name: "Hydra Visual",
    description: "Just a Hydra shader sketch. Audio-reactive visuals.",
    icon: "✴️",
    files: [],
  },
  {
    id: "blank",
    name: "Blank",
    description: "Empty project. Add your own files from the sidebar.",
    icon: "📄",
    files: [],
  },
];

export function getTemplateFiles(templateId: string): TemplateFile[] {
  switch (templateId) {
    case "starter":
      return makeStarterFiles();
    case "strudel":
      return makeStrudelOnlyFiles();
    case "sonicpi":
      return makeSonicPiOnlyFiles();
    case "hydra":
      return makeHydraOnlyFiles();
    case "blank":
      return [];
    default:
      return makeStarterFiles();
  }
}

/**
 * Seed all files from a template into the current Y.Doc via seedWorkspaceFile.
 * If files already exist (persisted project), they are returned unchanged —
 * this is idempotent for a given project.
 */
export function seedProjectFromTemplate(templateId: string): void {
  const files = getTemplateFiles(templateId);
  for (const f of files) {
    seedWorkspaceFile(f.id, f.path, f.content, f.language, f.meta);
  }
}
