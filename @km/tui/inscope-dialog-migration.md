---
id: "@km/tui/inscope-dialog-migration"
aliases:
  - km-tui.inscope-dialog-migration
  - km-tui-inscope-dialog-migration
created_by: Bjørn Stabell
created_at: 2026-04-15T04:25:38Z
---

# [ ] Migrate inScope("dialog:*") → *DialogOpen predicates @km/tui #task #P2

blocks:: [[@km/tui]]

The focus-scope stack populated by pushDialogMode("dialog:*") has a production-vs-test wiring gap. The dialog guard is a module-level singleton installed by a React useLayoutEffect in Board.tsx:110-117, whose own comment calls it a 'production gap' workaround. When that effect hasn't run yet (or runs after the first key event), inScope("dialog:*") returns false and keybindings fall through to wildcards or board bindings. Fixed for favorites in commit 40aacb487 by switching to favoritesDialogOpen (direct UI state). This bead migrates the remaining dialogs to the same pattern.

Targets in packages/@km/_orphan/commands/src/keybindings.ts:
- Filter dialog (13 bindings, lines 551-564): replace inScope("dialog:filter") with filterDialogOpen (already exported from when.ts)
- Tab routing (2 bindings, lines 638-639): replace not(inScope("dialog:search")) with not(searchDialogOpen) (already exported from when.ts)

Both target predicates already exist. Import filterDialogOpen, searchDialogOpen from ./when.ts at the top of keybindings.ts.

After migration, the only remaining inScope("dialog:*") usage in keybindings is gone. pushDialogMode("dialog:filter") and pushDialogMode("dialog:search") become dead for key routing; they may still be used by isDialogOpen() in board-app.ts's dialog filter, which should also be audited and migrated in a follow-up.

Add regression tests in apps/@km/tui/tests/dialog-lifecycle.test.ts modeled on the favorites dialog test (commit 40aacb487): for each dialog kind, open the dialog, verify the UI state flag is true, press Escape, verify the flag is false.

Held: don't land until the omnibox agent (km-3/km-4) finishes its Phase 7+ work in keybindings.ts and board-app.ts to avoid merge conflicts. The in-flight commits as of 2026-04-15 touching keybindings.ts include: 0d79abcc7, fbf7c2bb4.