# Render-Neutral TUI: Terminal + Canvas from Shared Components

## Problem

km-canvas.tsx reimplements ~250 LOC of simplified versions of things the TUI already does (navigation, card rendering, editing, keybindings). Meanwhile the TUI has 8,000+ LOC of battle-tested interactive logic. Adding features (search, help, hover tooltips, full keybindings) means either reimplementing them in canvas or making the TUI components render-neutral.

## Current State

| Layer | Terminal | Canvas | Shared? |
|-------|----------|--------|---------|
| Data (core, storage, tree) | via Repo | via RemoteRepo (WebSocket) | ✅ same interfaces |
| Column derivation (useColumns) | ✅ | ✅ | ✅ shared hook |
| Card rendering | CardColumn+TreeNode (1,943 LOC) | CardRow (60 LOC simplified) | ❌ reimplemented |
| Navigation | board-actions (2,672 LOC) | inline if/else (60 LOC) | ❌ reimplemented |
| Editing | board-actions-edit (1,061 LOC) | inline (40 LOC) | ❌ reimplemented |
| Dialogs (search, help) | SearchDialog+HelpOverlay (660 LOC) | not implemented | ❌ missing |
| Commands (@km/commands) | full command system | not used | ❌ unused |

## Approach: Make silvery Render-Neutral

### Level 1: silvery API Gaps (framework level)

These are gaps in silvery's canvas module that prevent TUI components from working.

| # | Gap | Terminal API | Canvas Status | Work Required |
|---|-----|-------------|---------------|---------------|
| 1 | **Component re-exports** | 40 components via `silvery/ui` | Only Box, Text, useApp | Re-export all from canvas module |
| 2 | **useTerm()** | Full Term access | ❌ Not provided | Provide canvas Term stub (dims, no stdout) |
| 3 | **useStdout/useStderr** | Stream access | ❌ Not provided | Provide no-op stubs (or omit — few consumers) |
| 4 | **useWindowSize()** | Reactive resize | Static only | Add resize observer → update dims |
| 5 | **RuntimeContext.emit()** | View→runtime events | ❌ Not supported | Add event emission to canvas runtime |
| 6 | **useScrollback()** | Scrollback buffer | ❌ Not available | Not needed for canvas (CSS scroll works) |
| 7 | **InputLayerProvider** | Stacked input layers | ❌ Not available | Evaluate if needed (modal dialogs use it) |
| 8 | **pause/resume** | Screen switching | ❌ Not available | No-op (canvas doesn't switch screens) |

### Level 2: km-tui Component Audit

| # | Component | Canvas-Ready? | Blocker | Fix |
|---|-----------|---------------|---------|-----|
| 1 | CardColumn.tsx | ⚠️ | useApp (store), useScreenRectCallback | Provide canvas store + rect registration |
| 2 | TreeNode.tsx | ⚠️ | useScreenRectCallback, Link | Provide canvas rect + link handler |
| 3 | Board.tsx | ⚠️ | useApp, setWindowTitle, useContentRect | Provide canvas store, no-op title |
| 4 | SearchDialog.tsx | ✅ | ModalDialog, InputBox | Should work if InputBox works |
| 5 | HelpOverlay.tsx | ✅ | Fill, KeyBinding | Should work |
| 6 | tree-node-edit.tsx | ✅ | InlineEditField | Should work if edit context provided |
| 7 | board-top-bar.ts | ⚠️ | createTerm (styling) | Refactor to use theme tokens instead |
| 8 | board-actions.ts | ⚠️ | spawn(), node:fs | Feature-gate filesystem ops |
| 9 | board-actions-edit.ts | ✅ | None | Pure repo mutations |
| 10 | position-resolver.ts | ✅ | None | Pure logic |
| 11 | config-persist.ts | ❌ | node:fs | Inject persistence interface |
| 12 | workspace-persist.ts | ❌ | node:fs | Inject persistence interface |

### Level 3: App Composition (createApp)

The biggest architectural gap. The TUI uses `createApp()` from `@silvery/create` which wires:
- Zustand store (board state, cursor, view mode, dialogs)
- Event handlers (term:key, term:mouse)
- Input layer stacking (modals steal focus)

Canvas needs an equivalent composition that wires the same store/handlers but uses canvas events instead of terminal events. This is essentially the era2b vision.

**Options:**
- (a) **Thin adapter**: Make createApp() accept a `Backend` interface (terminal vs canvas). Both wire the same store but different event sources. ~200 LOC.
- (b) **Command-driven**: Use @km/commands directly. Commands are backend-agnostic. Canvas dispatches commands from keyboard/mouse events. ~300 LOC but cleaner.
- (c) **Full era2b**: Signals + commands + keymaps. The clean long-term solution but larger scope.

Recommend **(a)** now, **(b)** as the follow-up.

## Work Items (ordered by dependency)

### Phase 1: silvery Canvas Parity (~200 LOC)
1. Re-export all UI components from canvas module barrel
2. Add canvas Term stub (dimensions, no-op stdout)  
3. Add resize observer for reactive useWindowSize()
4. Stub useStdout/useStderr (no-op or throw-with-message)

### Phase 2: km-tui Component Portability (~150 LOC)
5. Refactor board-top-bar.ts to use theme tokens (not createTerm)
6. Feature-gate filesystem ops in board-actions.ts (check `typeof Bun !== "undefined"`)
7. Inject persistence interface for config/workspace (localStorage in browser)
8. Make Link component canvas-aware (onClick → window.open)

### Phase 3: Canvas App Composition (~300 LOC)
9. Create `createCanvasApp()` that mirrors `createApp()` store wiring
10. Wire canvas keyboard/mouse events to the same event handler system
11. Provide same useApp/useAppShallow to components

### Phase 4: Wire Real Components (~100 LOC)
12. Replace km-canvas.tsx CardRow with real CardColumn+TreeNode
13. Replace inline navigation with board-actions
14. Wire SearchDialog, HelpOverlay via the store
15. km-canvas.tsx shrinks to ~200 LOC (mount + remote-repo wiring)

## What Stays Different

- **Entry point**: tui.tsx (terminal) vs km-canvas.tsx (browser)
- **Repo**: createRepo (local SQLite) vs createRemoteRepo (WebSocket)
- **Persistence**: filesystem vs localStorage/none
- **External actions**: spawn/open vs window.open/no-op
- **Scrollback**: terminal scrollback vs CSS overflow

Everything else should be shared.
