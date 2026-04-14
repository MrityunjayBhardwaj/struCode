/**
 * @stave/editor -- workspace/commands barrel.
 *
 * Phase 10.2 Task 08 surface.
 */

export type {
  WorkspaceCommand,
  CommandContext,
  WorkspaceShellActions,
} from './CommandRegistry'

export {
  registerCommand,
  getCommand,
  executeCommand,
  resetCommandRegistryForTests,
} from './CommandRegistry'

export {
  useKeyboardCommands,
  type UseKeyboardCommandsOptions,
} from './useKeyboardCommands'
