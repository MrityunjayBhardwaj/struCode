"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  duplicateProject,
  touchProject,
  switchProject,
  resetFileStore,
  type ProjectMeta,
} from "@stave/editor";
import { ProjectSidebar } from "./ProjectSidebar";
import StrudelEditorClient from "./StrudelEditorClient";

interface StaveAppProps {
  initialProject: ProjectMeta;
}

/**
 * StaveApp — the outer wrapper that renders ProjectSidebar + the editor.
 *
 * The editor (StrudelEditorClient) is keyed by the active project id.
 * When the project changes, React unmounts the old editor and mounts a
 * fresh one — all shell state (tabs, layout, pause, runtimes) resets
 * naturally. The new editor's seedWorkspaceFile calls find the new
 * project's persisted files (or seed with defaults for empty projects).
 */
export function StaveApp({ initialProject }: StaveAppProps) {
  const [activeProject, setActiveProject] = useState<ProjectMeta>(initialProject);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Load project list on mount and whenever it changes
  const refreshProjects = useCallback(async () => {
    const list = await listProjects();
    setProjects(list);
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // ── Project operations ──────────────────────────────────────────────

  const handleSelectProject = useCallback(
    async (id: string) => {
      if (id === activeProject.id || switching) return;
      setSwitching(true);
      try {
        // Reset the file store caches (old project's snapshots)
        resetFileStore();
        // Switch to the new Y.Doc (loads from IDB)
        await switchProject(id);
        await touchProject(id);
        const list = await listProjects();
        const selected = list.find((p) => p.id === id);
        if (selected) {
          setActiveProject(selected);
          setProjects(list);
        }
      } finally {
        setSwitching(false);
      }
    },
    [activeProject.id, switching],
  );

  const handleNewProject = useCallback(async () => {
    const meta = await createProject("Untitled");
    // Switch to the new (empty) project
    resetFileStore();
    await switchProject(meta.id);
    await touchProject(meta.id);
    setActiveProject(meta);
    await refreshProjects();
  }, [refreshProjects]);

  const handleRenameProject = useCallback(
    async (id: string, name: string) => {
      await renameProject(id, name);
      const list = await listProjects();
      setProjects(list);
      if (id === activeProject.id) {
        const updated = list.find((p) => p.id === id);
        if (updated) setActiveProject(updated);
      }
    },
    [activeProject.id],
  );

  const handleDuplicateProject = useCallback(async (id: string) => {
    await duplicateProject(id);
    await refreshProjects();
  }, [refreshProjects]);

  const handleDeleteProject = useCallback(
    async (id: string) => {
      // Don't allow deleting the last project
      if (projects.length <= 1) return;

      await deleteProject(id);

      if (id === activeProject.id) {
        // Switch to another project
        const remaining = projects.filter((p) => p.id !== id);
        const next = remaining[0];
        if (next) {
          resetFileStore();
          await switchProject(next.id);
          await touchProject(next.id);
          setActiveProject(next);
        }
      }
      await refreshProjects();
    },
    [activeProject.id, projects, refreshProjects],
  );

  return (
    <div style={styles.root}>
      <ProjectSidebar
        projects={projects}
        activeProjectId={activeProject.id}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onRenameProject={handleRenameProject}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={handleDeleteProject}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />
      <div style={styles.editorArea}>
        {switching ? (
          <div style={styles.switchingOverlay}>Loading project...</div>
        ) : (
          <StrudelEditorClient key={activeProject.id} />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    width: "100%",
    height: "100%",
  },
  editorArea: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    position: "relative",
  },
  switchingOverlay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#8888aa",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 14,
  },
};
