---
id: "@km/tui/omnibox-migration-cleanup"
aliases:
  - km-tui.omnibox-migration-cleanup
  - km-tui-omnibox-migration-cleanup
created_by: Bjørn Stabell
created_at: 2026-04-14T23:36:49Z
---

# [ ] Migration cleanup — delete legacy dialogs, parity tests, close palette-arrow-keys (Phase 10) @km/tui #task #P1

blocks:: [[@km/tui/omnibox-dialog]], [[@km/tui/omnibox-local-find]], [[@km/tui/omnibox-unified]]

Delete legacy code after the omnibox ships: Omnibox.tsx, ItemPicker.tsx, FavoritesDialog.tsx, FindBar.tsx, CommandBox.tsx, the dialog:omnibox scope plumbing. Update docs/ref/commands.md with new routing. Parity test per legacy entrypoint: cmd-k, item_picker, manage_favorites, local_find, each asserts the new omnibox reaches the same end-state as the old dialog. Close @km/tui/palette-arrow-keys with regression test.

Acceptance: all 5 legacy dialog files deleted, dialog:omnibox scope plumbing removed, 5 parity journey tests added under apps/@km/tui/tests/ covering each old entrypoint, palette-arrow-keys closed with its repro test passing.