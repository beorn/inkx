// Error types for op handling
export type { OpError, OpResult } from "./errors.ts"
export { boundary, precondition, unimplemented, ok } from "./errors.ts"

// Types
export type {
  CommandDef,
  CommandCategory,
  CommandMode,
  CommandContext,
  KmOp,
  ResolvedBinding,
  TaskSetStatusOp,
  HistoryOp,
  HistoryUndoOp,
  HistoryRedoOp,
  // Focused sub-unions (preferred)
  VerbOp,
  NavOp,
  EditOp,
  TextOp,
  BoardOp,
  DialogOp,
  PaneOp,
  ViewOp,
  // Individual op types (for specific consumers)
  CloseDetailPaneOp,
  ShowHelpOp,
  HideHelpOp,
  CycleViewModeOp,
  DeleteNodeOp,
  SelectAllProgressiveOp, // type: "SELECT_ALL" (progressive behavior)
  QuitOp,
  ShowNewItemDialogOp,
  ShowItemPickerOp,
  JumpToColumnOp,
  CloseOrQuitOp,
  EditBlockNavigateOp,
  OutdentNodeOp,
  DialogNavUpOp,
  DialogNavDownOp,
  DialogNavLeftOp,
  DialogNavRightOp,
  DialogConfirmOp,
  DialogCancelOp,
  FilterCategory,
  BoardReducerOp,
  TNode,
  ViewMode,
  TaskStatus,
  // Text editing op types
  TextEditOp,
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

// Availability (Phase 8 — when-predicate filter for offering commands)
export { isCommandAvailable } from "./availability.ts"

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
  type TaskOp,
} from "./commands/index.ts"

// When predicates
export type { WhenPredicate } from "./when.ts"
export {
  when,
  not,
  and,
  hasCursor,
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
  hasKitty,
  // Input type predicates
  inputTypeField,
  inputTypeTextarea,
  // Focus scope predicates
  inScope,
  // Mode predicates
  inCommandMode,
  inInsertMode,
  inDialog,
} from "./when.ts"

// Config (types, defaults, I/O, template expansion)
export type { KmConfig, ExpandedLocation } from "./config.ts"
export {
  DEFAULT_LOCATIONS,
  loadConfig,
  saveConfig,
  expandLocationTemplate,
  isDateTemplate,
  isPositionalTemplate,
} from "./config.ts"

// Favorites & Locations (unified store)
export {
  getFavorite,
  setFavorite,
  clearFavorite,
  getAllFavorites,
  getAllLocations,
  getSystemLocation,
  initLocations,
  onFavoritesChange,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- barrel re-export of deprecated alias preserved for backwards compat; callers should prefer DEFAULT_LOCATIONS
  DEFAULT_SYSTEM_LOCATIONS,
  SYSTEM_LOCATION_KEYS,
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
  getSystemLocs,
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
