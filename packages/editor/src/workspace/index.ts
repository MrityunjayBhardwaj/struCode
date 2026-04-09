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
 */

export type { WorkspaceFile, WorkspaceLanguage } from './types'
export type {
  AudioSourceRef,
  AudioPayload,
  AudioSourceListing,
  WorkspaceAudioBus,
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
