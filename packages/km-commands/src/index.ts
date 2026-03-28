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
  ShowItemPickerAction,
  VerbAction,
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
export type { Keybinding, KeybindingContext, KeybindingLayer, ParsedKey } from "./keybindings.ts"
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
  parseKeyString,
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
  allCommands,
  blockEditCommands,
  dialogCommands,
  filterDialogCommands,
  favoritesDialogCommands,
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
  itemPickerOpen,
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
  favoritesDialogOpen,
  favoritesKeySelected,
  hasKitty,
  // Input type predicates
  inputTypeField,
  inputTypeTextarea,
  // Mode stack predicates
  inCommandMode,
  inInsertMode,
  inDialog,
  inDialogSearch,
  inDialogRename,
  inDialogConfirm,
  inDialogNewItem,
  inDialogPicker,
  inDialogDatePrompt,
  inDialogFilter,
} from "./when.ts"

// Favorites
export {
  getFavorite,
  setFavorite,
  clearFavorite,
  getAllFavorites,
  RESERVED_KEYS,
  DIGIT_KEYS,
  getReservedKeyLabel,
} from "./favorites.ts"

// Locations (composable command targets)
export { REPO_LOCS, locationLabel } from "./locations.ts"

// Verb x Location composable vocabulary
export type { Execute, VerbDef } from "./verb-locations.ts"
export {
  // Verb constructors
  goTo,
  moveTo,
  addTo,
  createIn,
  // Registries
  SYSTEM_LOCS,
  PICKER_LOCS,
  VERBS,
  // Grid generators
  verbLocationGrid,
  ctrlVerbLocationGrid,
} from "./verb-locations.ts"

// Help data (auto-generated from registry)
export type { HelpItem, HelpSection, VerbGridRow } from "./help-data.ts"
export { getHelpScreenData, VERB_GRID } from "./help-data.ts"

// Key Adapter (for TUI integration)
export {
  initCommandSystem,
  keyToString,
  keyToModifiers,
  processKey,
  buildKeybindingContext,
  wouldHandleKey,
  getChordState,
  handleChordTimeout,
  type KeyEvent,
  type KeyCommandResult,
} from "./key-adapter.ts"
