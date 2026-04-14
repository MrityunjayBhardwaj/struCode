import JSZip from "jszip";
import {
  createProject,
  touchProject,
  switchProject,
  resetFileStore,
  createWorkspaceFile,
  setFolderOrder,
  setSubfolderOrder,
  withStructBatch,
  type ProjectMeta,
  type WorkspaceLanguage,
} from "@stave/editor";

interface StaveManifest {
  schemaVersion: 1;
  project: { id: string; name: string; exportedAt: number };
  files: Array<{ id: string; path: string; language: string }>;
  fileOrder: Record<string, string[]>;
  subfolderOrder?: Record<string, string[]>;
}

/**
 * Import a stave.zip into a NEW project. Returns the created project
 * metadata. Throws on a malformed archive — caller surfaces the error
 * via a toast.
 */
export async function importProjectFromZip(file: File): Promise<ProjectMeta> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file("stave.json");
  if (!manifestEntry) {
    throw new Error("Not a Stave archive — stave.json missing");
  }
  const manifestText = await manifestEntry.async("string");
  const manifest = JSON.parse(manifestText) as StaveManifest;
  if (manifest.schemaVersion !== 1) {
    throw new Error(
      `Unsupported Stave archive schema (${manifest.schemaVersion})`,
    );
  }

  // Name disambiguation — append "(imported)" so it doesn't collide.
  const name = `${manifest.project.name} (imported)`;

  const meta = await createProject(name);
  // Switch to it so createWorkspaceFile / setFolderOrder write into the
  // right Y.Doc. switchProject re-inits doc + y-indexeddb on the new id.
  resetFileStore();
  await switchProject(meta.id);
  await touchProject(meta.id);

  // Seed files + orders in one structural batch so the import is a
  // single undo step (though undo right after import is an odd case
  // since the user just switched projects).
  const filesWithContent = await Promise.all(
    manifest.files.map(async (f) => {
      const entry = zip.file(f.path);
      const content = entry ? await entry.async("string") : "";
      return { ...f, content };
    }),
  );

  withStructBatch(() => {
    for (const f of filesWithContent) {
      createWorkspaceFile(f.id, f.path, f.content, f.language as WorkspaceLanguage);
    }
    for (const [folder, ids] of Object.entries(manifest.fileOrder)) {
      setFolderOrder(folder, ids);
    }
    if (manifest.subfolderOrder) {
      for (const [parent, names] of Object.entries(manifest.subfolderOrder)) {
        setSubfolderOrder(parent, names);
      }
    }
  });

  return meta;
}
