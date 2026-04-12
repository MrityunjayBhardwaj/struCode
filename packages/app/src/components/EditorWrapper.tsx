"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { ProjectMeta } from "@stave/editor";

function HidePreloader() {
  useEffect(() => {
    const el = document.getElementById("stave-preloader");
    if (el) {
      el.classList.add("hidden");
      setTimeout(() => el.remove(), 300);
    }
  }, []);
  return null;
}

/**
 * Bootstrap sequence (runs inside the dynamic import, before any React):
 * 1. Load @stave/editor + StaveApp module
 * 2. Init ProjectRegistry — get last-opened project or create "Untitled"
 * 3. Init the Y.Doc for that project (loads persisted files from IDB)
 * 4. Return StaveApp with the initial project as a prop
 */
export const StrudelEditorDynamic = dynamic(
  () =>
    Promise.all([
      import("./StaveApp"),
      import("@stave/editor"),
    ]).then(async ([staveAppMod, editor]) => {
      const { getLastOpenedProject, createProject, initProjectDoc, touchProject } = editor;
      const { StaveApp } = staveAppMod;

      // First-run bootstrap: create "Untitled" if no projects exist
      let project: ProjectMeta | undefined = await getLastOpenedProject();
      if (!project) {
        project = await createProject("Untitled");
      }

      // Load the Y.Doc for this project from IDB
      await initProjectDoc(project.id);
      await touchProject(project.id);

      const initialProject = project;

      return function StaveAppWithPreloaderDismiss(props: Record<string, unknown>) {
        return (
          <>
            <HidePreloader />
            <StaveApp {...props} initialProject={initialProject} />
          </>
        );
      };
    }),
  {
    ssr: false,
    loading: () => null, // preloader in layout handles this
  }
);
