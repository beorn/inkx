---
id: "@km/storage/rename-refs"
aliases:
  - km-storage.rename-refs
  - km-storage-rename-refs
created_by: claude:e7ea0892
created_at: 2026-02-11T19:20:45Z
closed_at: 2026-02-12T14:21:40Z
owner: bjorn@stabell.org
assignee: claude:586bad48
---

# [x] Rename: update all reference types (rules, properties, paths) @km/storage #feature #P2 @claude:586bad48

renameNode currently only updates [[wikilink]] and ![[embed]] references.
It should also find and update (or offer to update):

1. Path references in section rules: add="./inbox/**", sync="./projects/**"
2. blocked-by property targets (data.props.blocked-by.target)
3. Sigil references in content (@name, +project, #tag) — if the name matches
4. fs_path fields (already handled by filesystem rename, but verify)

## Prior Art

- **Obsidian**: Auto-updates [[wikilinks]] on in-app rename. No prompt. Does NOT update heading links, aliases, or FS-level renames.
- **Logseq**: Auto-updates [[page refs]] but historically buggy with tags, aliases, and queries.
- Neither tool handles structured rule references (our add=, sync=, blocked-by).

## Design Considerations

- For wikilinks (existing): auto-update is correct, no prompt needed
- For rules/properties: auto-update is probably correct too (the intent is clear)
- For content text matches: might want a preview/confirmation step — "Found 'inbox' in 3 task descriptions, update?"
- The jobRunner countdown (5s for backlinks) already provides an undo window

## Implementation

Extend renameNode (or a new layer on top) to:
1. Scan rules fields (add, sync) in all section nodes for path patterns containing the old name
2. Scan blocked-by property targets
3. Optionally scan content for sigil/text matches
4. Group changes by type and present impact summary
5. Execute all updates in a single withDeferredFs batch

The TUI already shows "N backlinks will be updated" — extend this to show rule/property counts too.