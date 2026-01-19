// Types
export type {
  CommandDef,
  CommandCategory,
  CommandMode,
  CommandContext,
  CommandAction,
  TaskSetStatusAction,
  BoardAction,
  BoardState,
  TNode,
  TPath,
  ViewMode,
  TaskStatus,
} from "./types.ts";

// Registry
export {
  registerCommand,
  registerCommands,
  getCommand,
  getAllCommands,
  getCommandsByCategory,
  filterCommands,
  fuzzyMatch,
  clearRegistry,
} from "./registry.ts";

// Executor
export { executeCommand, buildContext } from "./executor.ts";

// Keybindings
export type { Keybinding, KeybindingContext } from "./keybindings.ts";
export {
  registerKeybinding,
  registerKeybindings,
  clearKeybindings,
  getAllKeybindings,
  resolveKeybinding,
  defaultKeybindings,
  initDefaultKeybindings,
} from "./keybindings.ts";

// Commands
export {
  navigationCommands,
  selectionCommands,
  viewCommands,
  editCommands,
  taskCommands,
  allCommands,
  type TaskAction,
} from "./commands/index.ts";
