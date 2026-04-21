# TUI Rendering Architecture

> **Development Guide**: km migrated off Ink to silvery. Read [The Silvery Way](../../../vendor/silvery/docs/guide/the-silvery-way.md) and [Styling](../../../vendor/silvery/docs/guide/styling.md) for current patterns. Historical Ink-era notes: [docs/archive/ink-patterns-pre-silvery.md](../../../docs/archive/ink-patterns-pre-silvery.md).

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
│   ├── Detail view mode (right panel, viewMode "detail")
│   ├── ItemPicker (modal, project/tag/assignee)
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
│ term:key / term:mouse event handlers in board-app.ts                │
│   → @km/commands (keybinding resolution + context predicates)       │
│   → BoardAppStore.dispatchBoard(op) (zustand-flavored reducer)      │
│ React components never call useInput or app.dispatch directly —     │
│ see docs/lessons/input-architecture.md.                             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     ▼                     │
   ┌────────│───────┐  ┌─────────────────────┐  ┌───────│──────┐
   │ Local S│ate    │  │ Storage (@km/storage││  │ SyncM│nager  │
   │ - curso│ pos   │  │ - CRUD operations   │  │ - FS w│ites  │
   │ - view │ode    │  │ - SQLite queries    │  │ - FS w│tch   │
   │ - selec│ion    │  └─────────────────────┘  └───────│──────┘
   │ - folde│ nodes │            │                      │
   └────────│───────┘            │                      │
            │                    ▼                     ▼│
            └───────────────────────────────────────────┘) (cache bust + version bump)
```

## State Management

### Local State (React useState)

These are managed inside `Board.tsx`:

| State           | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `state`         | BoardState (columns, cursor, etc.)               |
| `foldDepths`    | Map of node IDs to fold depth budget             |
| `sel`           | @silvery/selection store (node + text selection) |
| `viewMode`      | "cards" / "columns" / "list" / "tabs" / "detail" |
| `showHelp`      | Help overlay visibility                          |
| `inOutlineMode` | Whether navigating within card                   |
| `subIndex`      | Position within card outline                     |

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

| File                         | Purpose                                   |
| ---------------------------- | ----------------------------------------- |
| `tui.ts`                     | Entry point, sync manager lifecycle       |
| `views/Board.tsx`            | Main container, state, keyboard handling  |
| `views/TreeNode.tsx`         | Unified tree node rendering               |
| `views/detail-pane-items.ts` | Detail metadata key computation           |
| `text/inline-parser.ts`      | Markdown → InlineNode[] AST parser        |
| `text/InlineComponents.tsx`  | InlineNode[] → React JSX rendering        |
| `text/rich.ts`               | ANSI utilities (displayLength, stripAnsi) |
| `state.ts`                   | BoardState building and manipulation      |
| `types.ts`                   | Type definitions for all TUI components   |

## Automatic Sync

The TUI automatically syncs with the filesystem:

```
TUI edits → repo.apply(event) → withSync saves to .md files
External .md edits → withSync reconciles → repo.apply → TUI refreshes
```

**How it works:**

1. `tui.ts` wraps the repo with `withSync(config)(repo)` — adds file watching + FS sync
2. `repo.apply(event)` automatically saves changes to disk (withSync wraps apply)
3. `repo.start()` watches for external filesystem changes
4. On external change: reconcile → apply ops to DB → `repo.touch()`
5. `repo.touch()` busts cache + bumps version → `useColumns` re-derives via `useCommitVersion`

**Debounce timings:**

- External FS changes: 2 seconds debounce before reconciliation
- TUI changes to FS: 100ms debounce for batching rapid edits
