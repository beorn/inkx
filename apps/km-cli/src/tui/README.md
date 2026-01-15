# TUI Rendering Architecture

## Layered Rendering

```
Raw markdown → renderRich() → styled ANSI → constrainText() → <Text>
```

1. **Layer 1**: `renderRich(raw)` - convert markdown to styled ANSI string
2. **Layer 2**: `constrainText(styled, width, lines)` - wrap/truncate using display length
3. **Layer 3**: Render each line in `<Text>`

Key principle: **Render before truncate** - always convert to styled strings before any width calculations.

## View Hierarchy

```
Board.tsx (main container)
├── CardsView (inline) - kanban cards in columns
├── ColumnsView - tree within columns
├── ListView - full-width tree
└── TabsView - tabbed single column

All tree rendering uses TreeNode with variants:
- "compact": columns/cards (limited children, no info columns)
- "wide": list view (full info columns, unlimited children)
```

## Key Files

- `render-text.ts` - Core rendering utilities (renderRich, constrainText, displayLength)
- `views/TreeNode.tsx` - Unified tree node component
- `views/Board.tsx` - Main board container and view switching
- `tui.ts` - Entry point, sync manager lifecycle

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
