# TUI Rendering Architecture

> **Development Guide**: See [docs/dev/ink-patterns.md](../../../../../../../docs/dev/ink-patterns.md) for Ink workarounds and patterns (fullscreen race condition, manual width management, ANSI-aware text length).

## Component Hierarchy

```
Board.tsx (main container)
├── Header
│   └── Path segments (clickable breadcrumbs)
│
├── Views (one active at a time based on viewMode)
│   ├── CardsView (inline in Board) - kanban cards in columns
│   │   ├── Column (header + cards)
│   │   └── Card (bordered TreeNode)
│   ├── ColumnsView - tree structure within columns
│   │   └── ColumnTree
│   ├── ListView - full-width hierarchical tree
│   └── TabsView - tabbed single column
│
├── Overlays (conditionally rendered)
│   ├── DetailPane (right panel)
│   ├── ProjectPicker (modal)
│   ├── HelpOverlay (modal)
│   └── NewItemDialog (modal)
│
└── StatusBar (bottom info line)

All tree rendering uses TreeNode with variants:
- "compact": columns/cards (limited children, no info columns)
- "wide": list view (full info columns, unlimited children)
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ User Input (keyboard/mouse)                                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ useInput() handler in Board.tsx                                     │
│ - Navigation commands → setState (local state)                      │
│ - Data mutations → Storage API → emit events                        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
   ┌────────────────┐  ┌─────────────────────┐  ┌──────────────┐
   │ Local State    │  │ Storage (@km/storage)│  │ SyncManager  │
   │ - cursor pos   │  │ - CRUD operations   │  │ - FS writes  │
   │ - view mode    │  │ - SQLite queries    │  │ - FS watch   │
   │ - selection    │  └─────────────────────┘  └──────────────┘
   │ - folded nodes │            │                     │
   └────────────────┘            │                     │
            │                    ▼                     ▼
            └──────────► Re-render ◄───────── tuiEvents.emit("refresh")
```

## State Management

### Local State (React useState)

These are managed inside `Board.tsx`:

| State            | Purpose                               |
| ---------------- | ------------------------------------- |
| `state`          | BoardState (columns, cursor, etc.)    |
| `foldedNodes`    | Set of folded node IDs                |
| `multiSelected`  | Set of selected item keys             |
| `viewMode`       | "cards" / "columns" / "list" / "tabs" |
| `showDetailPane` | Detail pane visibility                |
| `showHelp`       | Help overlay visibility               |
| `inOutlineMode`  | Whether navigating within card        |
| `subIndex`       | Position within card outline          |

### Persistent State (Storage Layer)

| Data           | Storage                           |
| -------------- | --------------------------------- |
| Node content   | SQLite → Markdown files           |
| Task status    | SQLite → Markdown checkboxes      |
| Node hierarchy | SQLite parent_id → File structure |

## Inline Text Rendering

```
Raw markdown → parseInlineText() → InlineNode[] AST → <InlineText> → React JSX
```

1. **Parser**: `parseInlineText(raw)` — converts markdown text to an `InlineNode[]` AST using mdast
2. **Component**: `<InlineText text={raw} context={...} />` — parses and renders inline AST as React JSX
3. **Plain text**: `parseToPlainText(raw)` — parses markdown and returns plain text (no ANSI)

Key principle: **AST before rendering** — parse to structured nodes, then render through React components. No regex-to-ANSI pipeline.

## Key Files

| File                          | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `tui.ts`                      | Entry point, sync manager lifecycle            |
| `views/Board.tsx`             | Main container, state, keyboard handling       |
| `views/TreeNode.tsx`          | Unified tree node rendering                    |
| `views/DetailPane.tsx`        | Task detail view with fields                   |
| `text/inline-parser.ts`       | Markdown → InlineNode[] AST parser             |
| `text/InlineComponents.tsx`   | InlineNode[] → React JSX rendering             |
| `text/rich.ts`                | ANSI utilities (stripFgColor, displayLength)   |
| `state.ts`                    | BoardState building and manipulation           |
| `types.ts`                    | Type definitions for all TUI components        |

## Automatic Sync

The TUI automatically syncs with the filesystem:

```
TUI edits → emit events → SyncManager → write to .md files
External .md edits → SyncManager → emit events → TUI refreshes
```

**How it works:**

1. `tui.ts` creates a `SyncManager` with file watching enabled
2. `setFsSync(syncManager)` wires TUI changes → filesystem writes
3. `syncManager.start()` watches for external filesystem changes
4. On external change: reconcile → emit events → `tuiEvents.emit("refresh")`
5. `Board.tsx` subscribes to `tuiEvents` and rebuilds state on refresh

**Debounce timings:**

- External FS changes: 2 seconds debounce before reconciliation
- TUI changes to FS: 100ms debounce for batching rapid edits
