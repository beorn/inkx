---
id: "@km/tui/omnibox-quality-plateau"
aliases:
  - km-tui.omnibox-quality-plateau
  - km-tui-omnibox-quality-plateau
created_by: Bjørn Stabell
created_at: 2026-04-15T05:49:01Z
closed_at: 2026-04-18T18:25:40Z
close_reason: "Work already landed in 73db39348 (refactor: retire legacy Omnibox
  + dogfood command_palette on unified). Verified grep /complete criteria:
  ui.showOmnibox=0 hits, command_palette in km-tui/src=0 hits, Omnibox.tsx file
  gone. command_palette still exists as CommandDef in km-commands (intentional —
  dispatches OPEN_UNIFIED_OMNIBOX with ':' prefix for command mode; open_omnibox
  does empty buffer for Cmd+K). SearchDialog/NodeLine cleanup moved to
  km-tui.omnibox-migration-cleanup parent."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tui.omnibox-quality-plateau
    depends_on_id: km-silvery.selection-focus-plateau
    type: parent-child
    created_at: 2026-04-15T11:31:08Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Omnibox quality plateau — delete legacy Omnibox.tsx and reroute : / Cmd+K @km/tui #task #P1 @Bjørn Stabell

blocks:: [[@km/silvery/selection-focus-plateau]]

## Context

After the 14+ omnibox commits this session + the /big round 3 cleanup
(0e22fe452), the remaining weight is the parallel legacy rendering path.

## What's still duplicated

- apps/@km/tui/src/views/Omnibox.tsx — 474 lines, still the default for
  : / Cmd+K, still the user's dogfood surface
- apps/@km/tui/src/views/UnifiedOmnibox.tsx — 135 lines, opens via
  Cmd+Shift+K, feature-capable but not the default
- ui.showOmnibox (boolean) + ui.omnibox (OmniboxPane | null) — dual state
- Two input routes: legacy useDialogInput + unified connector
- NodeLine renderer survives for FavoritesDialog / SearchDialog (which
  are ALSO legacy and scheduled for deletion)

Total removable on Phase 12: ~900 lines.

## Gating concerns

(a) Feature parity check: the legacy omnibox shows goto-locations
(inbox / journal / home / archive) as a special row category above
command results. The unified path routes these through the 'default'
command + repo.search() — verify they still surface cleanly for an
empty buffer.

(b) The 'cmd:'-prefix strip logic currently lives in
WorkspaceChrome's UnifiedOmniboxConnector confirm handler, not in
default.execute(). Moving it into default.execute() is a separate
cleanup that should probably precede Phase 12 so the legacy and
unified paths dispatch identically.

(c) Pre-select subtlety: the agent's Phase 7b pre-select test asserts
against pane.spec.initialArgumentId (frozen seed) rather than
pane.state.selectedArgumentId (mutable sticky slot), because the
results useEffect overwrites the sticky arg with the top-ranked
projection pick. Worth resolving before flipping the default trigger.

## Steps

1. Flip keybinding: in packages/@km/_orphan/commands/src/keybindings.ts, change
   ':' and 'Cmd+K' / 'Ctrl+K' from command_palette → unified_omnibox_open
2. Delete apps/@km/tui/src/views/Omnibox.tsx
3. Delete any remaining command_palette handling that's now dead (the
   command still exists as a CommandDef but its execute() path may be
   unreachable)
4. Delete the ui.showOmnibox boolean + its readers in board-actions,
   command-bridge, board-app, ui-reducer
5. Migrate apps/@km/tui/tests/omnibox.test.ts — most tests should still
   pass against the unified component; some may need rewrite to match
   the new mount point
6. Delete FavoritesDialog if its only trigger was manage_favorites and
   manage_favorites now routes through the unified omnibox (via a
   wrapper that pre-scopes candidates to favorites)
7. Delete SearchDialog if its only trigger was search
8. Delete NodeLine if it's no longer used after (6) + (7)

## Acceptance

(a) : and Cmd+K open UnifiedOmnibox in production
(b) No consumers of ui.showOmnibox remain
(c) Legacy Omnibox.tsx, FavoritesDialog.tsx, SearchDialog.tsx deleted
(d) All omnibox tests pass against the single unified component
(e) Dogfood on a real vault: @next / +tax / goto patterns all work

## Effort + risk

Medium — touches 6-10 files, mostly deletions + one trigger flip.
Risk: UX regressions in edge cases where the legacy path had feature
parity the unified path doesn't yet (e.g. specific goto rows, favorites
key bindings). Dogfood cycle required.

## Related

- 0e22fe452 refactor(@km/tui): omnibox elegance pass (this session)
- 55c55e42e refactor: push ranking into FTS5 bm25() column weights
- @km/tui/omnibox-migration-cleanup (parent / overlap)

## Why separate from @km/tui/omnibox-migration-cleanup?

The existing omnibox-migration-cleanup bead tracks Phase 12 broadly.
This one is the concrete shippable unit with the gating checks and
step list. Close omnibox-migration-cleanup when this is done.