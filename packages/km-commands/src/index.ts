// Error types for action handling
export type { ActionError, ActionResult } from "./errors.ts"
export { boundary, precondition, unimplemented, ok } from "./errors.ts"

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
  EditBlockNavigateAction,
  OutdentNodeAction,
  DialogNavUpAction,
  DialogNavDownAction,
  DialogConfirmAction,
  DialogCancelAction,
  BoardAction,
  TNode,
  ViewMode,
  TaskStatus,
  // Text editing action types
  TextEditAction,
  TextInsertAction,
  TextDeleteBackwardAction,
  TextDeleteForwardAction,
  TextCursorLeftAction,
  TextCursorRightAction,
  TextCursorStartAction,
  TextCursorEndAction,
  TextDeleteWordAction,
  TextDeleteToStartAction,
  TextDeleteToEndAction,
  TextConfirmAction,
  TextExitEditAction,
  // Detail pane action
  DetailPaneCloseAction,
} from "./types.ts"

// Registry
export type { CommandRegistry } from "./registry.ts"
export {
  createCommandRegistry,
  registerCommand,
  registerCommands,
  getCommand,
  getAllCommands,
  getCommandsByCategory,
  filterCommands,
  fuzzyMatch,
  clearRegistry,
} from "./registry.ts"

// Executor
export { executeCommand, buildContext } from "./executor.ts"

// Keybindings
export type { Keybinding, KeybindingContext } from "./keybindings.ts"
export {
  registerKeybinding,
  registerKeybindings,
  clearKeybindings,
  getAllKeybindings,
  resolveKeybinding,
  defaultKeybindings,
  initDefaultKeybindings,
} from "./keybindings.ts"

// Commands
export {
  navigationCommands,
  selectionCommands,
  viewCommands,
  editCommands,
  taskCommands,
  historyCommands,
  tuiCommands,
  textEditingCommands,
  detailPaneCommands,
  allCommands,
  blockEditCommands,
  dialogCommands,
  type TaskAction,
} from "./commands/index.ts"

// When predicates
export type { WhenPredicate } from "./when.ts"
export {
  when,
  not,
  and,
  textInputFocused,
  inMoveMode,
  isInDetailPane,
  isInOutlineMode,
  isInlineEditing,
  hasSelection,
  searchDialogOpen,
  projectPickerOpen,
  newItemDialogOpen,
  anyDialogOpen,
  helpOverlayOpen,
  deleteConfirmOpen,
  consoleOpen,
  hasActiveToast,
} from "./when.ts"

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
} from "./ink-adapter.ts"
