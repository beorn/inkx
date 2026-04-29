---
id: "@km/tui/repo-search"
aliases:
  - km-tui.repo-search
  - km-tui-repo-search
created_by: Bjørn Stabell
created_at: 2026-04-02T21:39:16Z
closed_at: 2026-04-03T00:05:15Z
close_reason: Implemented. SearchDialog registers as repo Searchable on mount.
  Ctrl+F=local find, /=repo search. Commit 9139ff5a.
owner: bjorn@stabell.org
---

# [x] withRepoSearch() — / repo-wide FTS search with SearchDialog @km/tui #feature #P2

Repo-wide search plugin using createSearchMachine<NodeMatch>.

## Match Type
```typescript
interface NodeMatch { nodeId: string; title: string; snippet: string; parentContext: string | null; tags: string[] }
```

## Behavior
- / opens repo search dialog
- Searches across all nodes via repo.search() (SQLite FTS5)
- Results shown in modal dialog with title + context + tags
- Enter navigates to selected result
- Tab narrows/widens scope
- Escape closes

## Integration
- Board/App registers repo.search as Searchable<NodeMatch>
- Uses same createSearchMachine<M> building block as local-find
- Both can be active simultaneously (Ctrl+F highlighting persists while / dialog is open)

## UI
- SearchDialog: modal with InputBox + results list (existing km SearchDialog pattern)
- Scope switching: All vs Selected (existing Tab behavior)
- Match highlighting in results via computeSearchDecorationsFromSource

## Commands (era2)
- search.open, search.close, search.next, search.prev
- Keybindings: / (open), Escape (close), Enter (select), j/k or arrows (navigate results)

## Replaces
- Current apps/@km/tui/src/views/SearchDialog.tsx (rewrite on top of search machine)

## Headless test
```typescript
const app = pipe(create(), withApp(), withRepoSearch(mockRepo))
await app.command(app.commands.search.open)
await app.command(app.commands.search.input, { char: "t" })
await app.command(app.commands.search.input, { char: "o" })
expect(app.models.search.state().matches).toHaveLength(5)
```