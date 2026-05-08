---
mentions:
  - km
id: "@km/tui/folder-note-model"
aliases:
  - km-tui.folder-note-model
  - km-tui-folder-note-model
created_by: Bjørn Stabell
created_at: 2026-04-14T17:35:52Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.folder-note-model
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T10:35:57Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [ ] Folder-note model: refine merge semantics (parked) @km/tui #task #P0 ^folder-note-model

blocks:: [[@km/tui]]

Parked design discussion — see docs/design/folder-note-model.md for full analysis.

User's refined position: keep folder-file as a subitem of the folder, but DO merge title + body + slot-referenced subitem ordering. If the folder-file has its OWN non-slot subitems, keep them in the file (don't hoist).

Cases:

- Pure dashboard (only slots) -> fully merged (current behavior)
- Dashboard + own content -> slots merge, own sections stay in file
- Plain content -> title/body promote, file visible as child

Current implementation (27db42fcf) fully merges — the refined model would revert part of computeColumnChildren and introduce a hasNonSlotSections branch.

Parked per user decision 2026-04-14.

@agent/3

