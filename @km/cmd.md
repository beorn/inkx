---
mentions:
  - km
id: "@km/cmd"
aliases:
  - km-cmd
  - "@km/_orphan/cmd"
created_at: 2026-01-17T23:23:12Z
closed_at: 2026-01-19T11:33:28Z
---

# [x] Unified Command System Epic @km/cmd #epic #P2

## Unified Command System Epic

A unified command system that works across:

- **TUI** (keyboard/mouse actions in Board.tsx)
- **@km/_orphan/repl/sh** (scripted commands)
- **Future**: command palette, CLI

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Input Sources                           │
├──────────────┬──────────────┬──────────────┬──────────────┤
│  Keyboard    │   km-sh      │  CLI args    │  Palette     │
│  (useInput)  │  (stdin)     │  (process)   │  (future)    │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
       │              │              │              │
       v              v              v              v
┌────────────────────────────────────────────────────────────┐
│              Keybinding Resolution Layer                    │
│  - Maps key combos to command IDs                          │
│  - Handles modifiers (ctrl, meta, shift)                   │
│  - Mode-aware (normal, move-mode, search-mode)             │
└─────────────────────────┬──────────────────────────────────┘
                          │ command ID
                          v
┌────────────────────────────────────────────────────────────┐
│              Command Registry (packages/km-commands)        │
│                                                            │
│  CommandDef {                                              │
│    id: string              // "move_card_up"               │
│    name: string            // "Move Card Up"               │
│    description: string     // "Move card up in column"     │
│    category: Category      // "Edit" | "Navigate" | ...    │
│    modes?: Mode[]          // Which modes this applies to  │
│    execute: (ctx) => Action | Action[]                     │
│  }                                                         │
└─────────────────────────┬──────────────────────────────────┘
                          │ execute(context)
                          v
┌────────────────────────────────────────────────────────────┐
│              Command Context                                │
│                                                            │
│  CommandContext {                                          │
│    // Current selection                                    │
│    currentNode: TNode | null                               │
│    selectedNodes: string[]                                 │
│    cursor: TPath                                           │
│                                                            │
│    // Board state (read-only)                              │
│    boardState: BoardState                                  │
│    viewMode: ViewMode                                      │
│                                                            │
│    // Storage access (for mutations)                       │
│    storage: StorageAdapter                                 │
│  }                                                         │
└─────────────────────────┬──────────────────────────────────┘
                          │ Action | Action[]
                          v
┌────────────────────────────────────────────────────────────┐
│              Action Dispatcher                              │
│  - Routes to appropriate reducer (Board, UI, Tree)         │
│  - Handles side effects (storage mutations)                │
│  - Supports undo/redo (wraps actions in history)           │
└────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **In-code registry** (not dynamic): Commands defined in TypeScript with full type safety
2. **Keybindings separate from commands**: A command can have multiple bindings; bindings are mode-aware
3. **Commands return Actions**: Pure functions that compute what to do (not how)
4. **Context provides everything**: Commands dont reach into global state
5. **Storage adapter abstraction**: Commands work with both TUI (live storage) and sh (mock/test)

### Categories

- **Navigation**: cursor movement, zoom, history
- **Selection**: single, multi, range, all
- **Edit**: create, delete, move, indent/outdent
- **Task**: status changes, scheduling
- **Fold**: expand/collapse
- **View**: depth, content lines, view mode
- **Modal**: help, search, palette, dialogs

### Benefits

- **Single source of truth** for all commands
- **Testable in isolation** - commands are pure functions
- **Scriptable** - same commands work in TUI and sh
- **Discoverable** - command palette, help overlay
- **Extensible** - plugins can add commands
- **Type-safe** - full TypeScript coverage

