---
id: "@km/silvery/local-find"
aliases:
  - km-silvery.local-find
  - km-silvery-local-find
created_by: Bjørn Stabell
created_at: 2026-04-02T21:39:02Z
closed_at: 2026-04-02T23:50:20Z
close_reason: Implemented. Readline keybindings in SearchBar, 8 tests. ListView
  search end-to-end working.
---

# [x] withLocalFind() — Ctrl+F / vim-/ text search in ListView @km/silvery #feature #P1

Local find plugin using createSearchMachine<TextMatch>.

## Match Type
```typescript
interface TextMatch { row: number; startCol: number; endCol: number }
```

## Behavior
- Ctrl+F or / opens search (configurable keybinding)
- n/N or Enter/Shift+Enter navigate matches (configurable)
- Escape closes
- Searches across cached + live items in the focused ListView
- Highlights matches in rendered content
- Scrolls to reveal current match (including into cached history)

## Integration
- ListView auto-registers as Searchable<TextMatch> when `search` prop is set
- `search: true` → auto-extract getText from rendered ag-node tree
- `search: { getText }` → user-provided text extraction
- SearchBar component reads search state, renders query + match count

## UI
- SearchBar: inline bar at bottom (or configurable position)
- Match highlighting: post-process buffer (invert/color matched cells)
- Match count: "3 of 17" with next/prev indicators

## Commands (era2)
- find.open, find.close, find.next, find.prev, find.input
- Keybindings: Ctrl+F (open), Escape (close), Enter/n (next), Shift+Enter/N (prev)

## Supersedes
- Current SearchProvider + SurfaceRegistry + SearchBar wiring
- @km/silvery/content-search (/ with n/N navigation)

## Headless test
```typescript
const app = pipe(create(), withApp(), withLocalFind())
app.registerSearchable("list", mockTextSearchable)
await app.command(app.commands.find.open)
// type query, assert matches, test next/prev
```