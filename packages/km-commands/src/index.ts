// Types
export type {
  CommandDef,
  CommandCategory,
  CommandMode,
  CommandContext,
  CommandAction,
  TaskSetStatusAction,
  HistoryAction,
  HistoryUndoAction,
  HistoryRedoAction,
  UIAction,
  GoUpPathAction,
  OpenDetailPaneAction,
  CloseDetailPaneAction,
  ShowHelpAction,
  HideHelpAction,
  CycleViewModeAction,
  DeleteNodeAction,
  SelectAllProgressiveAction,
  // TUI-specific action types
  TUIAction,
  QuitAction,
  ShowNewItemDialogAction,
  ShowProjectPickerAction,
  JumpToFavoriteAction,
  JumpToColumnAction,
  CloseOrQuitAction,
  OutdentNodeAction,
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
  historyCommands,
  tuiCommands,
  allCommands,
  type TaskAction,
} from "./commands/index.ts";

// Ink Adapter (for TUI integration)
export {
  initCommandSystem,
  inkKeyToString,
  inkKeyToModifiers,
  processInkKey,
  buildKeybindingContext,
  wouldHandleKey,
  type InkKeyEvent,
  type InkCommandResult,
} from "./ink-adapter.ts";
