"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  touchProject,
  switchProject,
  resetFileStore,
  type ProjectMeta,
} from "@stave/editor";
import { seedProjectFromTemplate } from "../templates";
import { MenuBar } from "./MenuBar";
import { FileTree } from "./FileTree";
import { TemplateModal } from "./TemplateModal";
import { ProjectSwitcherModal } from "./ProjectSwitcherModal";
import StrudelEditorClient from "./StrudelEditorClient";

interface StaveAppProps {
  initialProject: ProjectMeta;
}

/**
 * StaveApp — top-level layout.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │ MenuBar (File, Edit, View, Help)               │
 *   ├──────────┬─────────────────────────────────────┤
 *   │          │                                     │
 *   │ FileTree │ StrudelEditorClient (WorkspaceShell)│
 *   │          │                                     │
 *   └──────────┴─────────────────────────────────────┘
 *
 * Project actions (new/open/rename/export) are in the File menu.
 * The sidebar is a file tree for the CURRENT project only.
 * Switching projects remounts StrudelEditorClient via key={activeProject.id}.
 */
export function StaveApp({ initialProject }: StaveAppProps) {
  const [activeProject, setActiveProject] = useState<ProjectMeta>(initialProject);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [switching, setSwitching] = useState(false);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [switcherModalOpen, setSwitcherModalOpen] = useState(false);

  // Open-file tracking passed to FileTree for visual highlight.
  // In PM Phase 2.5 the shell opens tabs for ALL files on mount, so we
  // seed this as the full file list. A future phase (controlled tabs or
  // imperative API) will make this dynamic.
  const [openFileIds] = useState<Set<string>>(new Set());

  const refreshProjects = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  // ── Project operations ──────────────────────────────────────────────

  const doSwitchProject = useCallback(async (id: string) => {
    if (id === activeProject.id || switching) return;
    setSwitching(true);
    try {
      resetFileStore();
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
  }, [activeProject.id, switching]);

  const handleCreateProject = useCallback(async (name: string, templateId: string) => {
    setTemplateModalOpen(false);
    setSwitching(true);
    try {
      const meta = await createProject(name);
      resetFileStore();
      await switchProject(meta.id);
      await touchProject(meta.id);
      // Seed template files into the new Y.Doc
      seedProjectFromTemplate(templateId);
      setActiveProject(meta);
      await refreshProjects();
    } finally {
      setSwitching(false);
    }
  }, [refreshProjects]);

  const handleRenameActiveProject = useCallback(async () => {
    const newName = prompt("Rename project:", activeProject.name);
    if (!newName || !newName.trim() || newName === activeProject.name) return;
    await renameProject(activeProject.id, newName.trim());
    const list = await listProjects();
    const updated = list.find((p) => p.id === activeProject.id);
    if (updated) setActiveProject(updated);
    setProjects(list);
  }, [activeProject]);

  const handleRenameProjectFromSwitcher = useCallback(async (id: string) => {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    const newName = prompt("Rename project:", proj.name);
    if (!newName || !newName.trim() || newName === proj.name) return;
    await renameProject(id, newName.trim());
    const list = await listProjects();
    if (id === activeProject.id) {
      const updated = list.find((p) => p.id === id);
      if (updated) setActiveProject(updated);
    }
    setProjects(list);
  }, [projects, activeProject.id]);

  const handleDeleteProjectFromSwitcher = useCallback(async (id: string) => {
    if (projects.length <= 1) return;
    await deleteProject(id);
    if (id === activeProject.id) {
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
  }, [activeProject.id, projects, refreshProjects]);

  // ── Tab tracking ────────────────────────────────────────────────────

  const handleOpenFile = useCallback((_fileId: string) => {
    // PM 2.5: all files are already open as tabs on mount, so clicking
    // a file in the tree is a no-op for tab opening. A future phase
    // will add controlled tabs or an imperative shell API for
    // click-to-focus and re-open-closed-tab.
  }, []);

  return (
    <div style={styles.root}>
      <MenuBar
        projectName={activeProject.name}
        onNewProject={() => setTemplateModalOpen(true)}
        onOpenProject={() => setSwitcherModalOpen(true)}
        onRenameProject={handleRenameActiveProject}
        onExportProject={() => alert("Export as .zip — coming in PM-5")}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        sidebarCollapsed={sidebarCollapsed}
      />

      <div style={styles.main}>
        {!sidebarCollapsed && (
          <FileTree
            projectName={activeProject.name}
            onOpenFile={handleOpenFile}
            openFileIds={openFileIds}
            onToggleCollapse={() => setSidebarCollapsed(true)}
          />
        )}

        <div style={styles.editorArea}>
          {switching ? (
            <div style={styles.switchingOverlay}>Loading project...</div>
          ) : (
            <StrudelEditorClient key={activeProject.id} />
          )}
        </div>
      </div>

      <TemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onCreate={handleCreateProject}
      />

      <ProjectSwitcherModal
        open={switcherModalOpen}
        projects={projects}
        activeProjectId={activeProject.id}
        onClose={() => setSwitcherModalOpen(false)}
        onSelect={doSwitchProject}
        onRename={handleRenameProjectFromSwitcher}
        onDelete={handleDeleteProjectFromSwitcher}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
    height: "100%",
  },
  main: {
    flex: 1,
    display: "flex",
    minHeight: 0,
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
