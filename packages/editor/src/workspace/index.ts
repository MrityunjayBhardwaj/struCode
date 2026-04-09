/**
 * @stave/editor — workspace module barrel.
 *
 * Phase 10.2 public surface. Grows task by task.
 *
 * Task 01:
 * - Types: WorkspaceFile, WorkspaceLanguage
 * - Store:  createWorkspaceFile, getFile, setContent, subscribe
 * - Hook:   useWorkspaceFile
 *
 * Task 02:
 * - Types: AudioSourceRef, AudioPayload, AudioSourceListing,
 *          WorkspaceAudioBus
 * - Bus:   workspaceAudioBus (singleton)
 *
 * Task 03:
 * - Types: EditorViewProps, PreviewViewProps, WorkspaceTheme,
 *          PreviewProvider, PreviewContext, PreviewReloadPolicy
 * - Views: EditorView, PreviewView
 * - Util:  ensureWorkspaceLanguages, toMonacoLanguage
 *
 * Task 04:
 * - Types: WorkspaceTab, WorkspaceGroupState, WorkspaceShellProps,
 *          ChromeForTab, LiveCodingRuntimeProviderStub
 * - Shell: WorkspaceShell
 */

export type { WorkspaceFile, WorkspaceLanguage } from './types'
export type {
  AudioSourceRef,
  AudioPayload,
  AudioSourceListing,
  WorkspaceAudioBus,
} from './types'
export type {
  EditorViewProps,
  PreviewViewProps,
  WorkspaceTheme,
} from './types'
export type {
  WorkspaceTab,
  WorkspaceGroupState,
  WorkspaceShellProps,
  ChromeForTab,
  LiveCodingRuntimeProviderStub,
} from './types'
export {
  createWorkspaceFile,
  getFile,
  setContent,
  subscribe,
} from './WorkspaceFile'
export { useWorkspaceFile } from './useWorkspaceFile'
export type { UseWorkspaceFileResult } from './useWorkspaceFile'
export { workspaceAudioBus } from './WorkspaceAudioBus'
export { EditorView } from './EditorView'
export { PreviewView } from './PreviewView'
export { WorkspaceShell } from './WorkspaceShell'
export type {
  PreviewProvider,
  PreviewContext,
  PreviewReloadPolicy,
} from './PreviewProvider'
export {
  ensureWorkspaceLanguages,
  toMonacoLanguage,
} from './languages'
