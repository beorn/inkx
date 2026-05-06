---
mentions:
  - km
id: "@km/tui/itempicker-unify"
aliases:
  - km-tui.itempicker-unify
  - km-tui-itempicker-unify
created_by: Bjørn Stabell
created_at: 2026-04-17T19:04:11Z
closed_at: 2026-04-17T21:20:10Z
close_reason: Shipped 2026-04-17 via agent-a6187715 (5 commits merged). 3 new
  CommandDefs (omnibox.append_tag_to_subject, omnibox.set_assignee_on_subject,
  omnibox.split_and_reparent) + APPEND_TAG + SET_ASSIGNEE_VALUE ops.
  SET_LABEL/SET_ASSIGNEE/PANE_SPLIT_AND_PICK route through openOmnibox. Deleted
  ItemPicker.tsx + picker-loaders.ts + activePicker state + 5 legacy handlers.
  735/735 tests pass; tsc=0.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.itempicker-unify
    depends_on_id: km-tui.omnibox-dialog
    type: parent-child
    created_at: 2026-04-17T12:04:25Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui.omnibox-dialog
---

# [x] Unify ItemPicker into omnibox — migrate SET_LABEL/SET_ASSIGNEE/PANE_SPLIT_AND_PICK @km/tui #feature #P2

blocks:: [[@km/tui/omnibox-dialog]]

Phase 5 acceptance (e) partial completion. After the W3 omnibox v1 ship:

- FavoritesDialog: deleted ✅
- ItemPicker: KEPT because 3 live flows still need it:
  1. SET_LABEL (tag picker) — sets a tag on the cursor node
  1. SET_ASSIGNEE (assignee picker) — sets an assignee
  1. PANE_SPLIT_AND_PICK (project picker in split pane) — opens node in split

These dispatch via ui.activePicker: { type: "tag" | "assignee" | "project" }
and are consumed by ItemPicker in WorkspaceChrome.tsx (lines 580-615).

## Why deferred

Migrating these to openOmnibox is not mechanical — each picker has a
type-specific confirm handler (handleTagSelect, handleAssigneeSelect,
handlePickerSelect) that sets a domain-specific property. The unified
omnibox's commandId-based dispatch needs 3 new commands:

- set_tag_on_cursor / commandId: 'set_tag' — applies selected node's tag
  to the cursor node
- set_assignee_on_cursor / commandId: 'set_assignee' — applies assignee
- split_pane_with_node / commandId: 'split_pick' — opens selected node
  in a new split

Each command needs its own acceptance test + journey test.

## Scope

1. Define 3 new CommandDefs in @km/commands
2. Reroute SET_LABEL/SET_ASSIGNEE/PANE_SPLIT_AND_PICK → openOmnibox with
   the corresponding initialDefaultCommand
3. Delete the ui.activePicker state + WorkspaceChrome ItemPicker render
4. Delete ItemPicker.tsx (259 LOC)
5. Delete picker-loaders.ts usages (loadProjectOptions / loadTagOptions /
   loadAssigneeOptions remain — but the PickerLoadOptions type/adapters
   can be rethought once the consumers are all openOmnibox candidate
   providers)

## Acceptance

- grep 'activePicker' apps/@km/tui/src/ → 0 hits
- grep 'ItemPicker' apps/@km/tui/src/ → 0 hits (only omnibox-related)
- rm apps/@km/tui/src/views/ItemPicker.tsx
- All 3 flows covered by journey tests in
  apps/@km/tui/tests/omnibox-chord-routing.test.ts

## Parent

@km/tui/omnibox-dialog (Phase 5 v1 ship)

