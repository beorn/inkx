---
id: "@km/tui/omnibox-goto-no-cursor"
aliases:
  - km-tui.omnibox-goto-no-cursor
  - km-tui-omnibox-goto-no-cursor
created_by: Bjørn Stabell
created_at: 2026-04-15T14:36:52Z
closed_at: 2026-04-15T15:24:40Z
close_reason: "Fixed in f84e1375a: handleCursorTo cross-parent branch now
  detects leaf targets and zooms into parent with cursor on the leaf itself,
  preventing stranded cursors + Z 'Can't move up' bell. Regression test in
  apps/km-tui/tests/unified-omnibox-integration.test.ts — test was verified to
  catch the bug by temporarily reverting the fix. 265 tests green."
---

# [x] Omnibox goto lands without cursor — zoom out fails @km/tui #bug #P1

# Bug — goto leaves cursor invalid

## Symptom (user dogfood)

> when i 'goto' things like @delei - i end up somewhere without a cursor - and it doesn't work to e.g. zoom out (Z) - see desktop screenshot

Screenshot shows the user landed on a People page with cards rendered but bell "Can't move up" — cursor is not on any visible node and Z (zoom_outwards) fails.

## Likely cause

Earlier this session (commit b99a81fa9) we fixed 4 dialog goto paths to pair ZOOM_IN with `sel.root.set(nav.zoomTarget)` to satisfy the sel-root-matches-rootId invariant. The unified omnibox goto path (UnifiedOmniboxConnector.handleConfirm + handleRowClick) dispatches commands via dispatchCommandById — if the target command emits CURSOR_TO / ZOOM_IN but doesn't also call sel.root.set, the invariant recovers (via recent recoverable healing in 1d5ed465e) but the cursor ends up nowhere.

## Repro

1. Open the app
2. Press `:` -> unified omnibox
3. Type `@delei` (or any @sigil that resolves to a file)
4. Enter / click the result
5. Observe: cursor is missing, Z to zoom out bells "Can't move up"

## Investigation direction

- Read apps/@km/tui/src/views/WorkspaceChrome.tsx: handleRowClick + handleConfirm in UnifiedOmniboxConnector
- Read the CURSOR_TO locationKey dispatch path — does it pair with sel.root.set?
- Read the ZOOM_OUTWARDS handler to see why it bells
- Check the goto command in packages/@km/_orphan/commands/src/commands/navigation.ts — execute returns { type: "CURSOR_TO", locationKey: t }
- Related: b99a81fa9 fix for 4 dialog goto paths (ItemPicker, SearchDialog) — the unified path may have been missed

## Acceptance

After `:@delei<Enter>` or clicking @delei in the omnibox: cursor is on the @delei root, Z zooms out to its parent, navigation works normally. Regression test covers the unified goto path.