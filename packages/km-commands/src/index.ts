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
  ResolvedBinding,
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
  SelectAllProgressiveAction, // now type: "SELECT_ALL" (progressive behavior)
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
  DialogNavLeftAction,
  DialogNavRightAction,
  DialogConfirmAction,
  DialogCancelAction,
  FilterCategory,
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
export type { Keybinding, KeybindingContext, KeybindingLayer } from "./keybindings.ts"
export {
  registerKeybinding,
  registerKeybindings,
  clearKeybindings,
  getAllKeybindings,
  resolveKeybinding,
  isChordPrefix,
  resolveChord,
  getChordSuffixes,
  formatKeybinding,
  getBindingsForCommand,
  defaultKeybindings,
  defaultKeybindingLayers,
  initDefaultKeybindings,
} from "./keybindings.ts"

// Chord state
export type { ChordState, ChordResult, ChordCallbacks } from "./chord-state.ts"
export { createChordState } from "./chord-state.ts"

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
  filterDialogCommands,
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
  hasMultiSelection,
  searchDialogOpen,
  projectPickerOpen,
  newItemDialogOpen,
  anyDialogOpen,
  filterDialogOpen,
  anyOverlayOpen,
  helpOverlayOpen,
  deleteConfirmOpen,
  consoleOpen,
  hasActiveToast,
  inVisualMode,
  localFindActive,
  omniboxOpen,
  searchReplaceOpen,
  hasKitty,
  // Mode stack predicates
  inCommandMode,
  inInsertMode,
  inDialog,
  inDialogSearch,
  inDialogRename,
  inDialogConfirm,
  inDialogNewItem,
  inDialogProjectPicker,
  inDialogDatePrompt,
  inDialogFilter,
} from "./when.ts"

// Locations (composable command targets)
export { REPO_LOCS, locationLabel } from "./locations.ts"

// Verb x Location composable vocabulary
export type { TargetResolver, Execute, VerbDef } from "./verb-locations.ts"
export {
  // Target resolvers
  inbox, journal, home, archive, parent, first, last, fav, pick,
  // Verb constructors
  goTo, moveTo, addTo, createIn,
  // Registries
  SYSTEM_LOCS, PICKER_LOCS, VERBS,
  // Grid generators
  verbLocationGrid, ctrlVerbLocationGrid,
} from "./verb-locations.ts"

// Help data (auto-generated from registry)
export type { HelpItem, HelpSection, VerbGridRow } from "./help-data.ts"
export { getHelpScreenData, VERB_GRID } from "./help-data.ts"

// Ink Adapter (for TUI integration)
export {
  initCommandSystem,
  inkKeyToString,
  inkKeyToModifiers,
  processInkKey,
  buildKeybindingContext,
  wouldHandleKey,
  getChordState,
  handleChordTimeout,
  type InkKeyEvent,
  type InkCommandResult,
} from "./ink-adapter.ts"
