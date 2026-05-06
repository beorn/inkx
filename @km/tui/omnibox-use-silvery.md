---
mentions:
  - km
id: "@km/tui/omnibox-use-silvery"
aliases:
  - km-tui.omnibox-use-silvery
  - km-tui-omnibox-use-silvery
created_by: Bjørn Stabell
created_at: 2026-04-15T14:33:59Z
closed_at: 2026-04-15T16:01:18Z
close_reason: >-
  Done. Phase A + B + C complete on top of f84e1375a (unified omnibox dogfood
  polish).


  SILVERY COMMITS (vendor/silvery branch km-tui-omnibox-use-silvery):

  - 204849a7 feat(ag-react): TextInput supports parent-driven onChange overrides
    + regression test tests/features/text-input.test.tsx slippery-sigil case (21/21 pass)
  - 67c40c39 fix(ag-react): readline ignores Cmd/Super-modified keystrokes
    prevents command-system + useInput double-handling of cmd+shift+k style chords
  - submodule pointer bumped from 74b466b2 → 67c40c39 via Phase A commit


  KM COMMITS (worktree-agent-aad51a32, rebased onto origin/main):

  - 22f1e7aa9 refactor(km-tui): unified omnibox uses silvery
  ModalDialog+TextInput+PickerList (Phase A)

  - 1e88580a1 refactor(km-tui,km-commands): retire legacy Omnibox + dogfood
  command_palette on unified (Phase B+C)

  - 059d2c5c0 test(km-commands): keybinding test expects command_palette on
  cmd-k (rebase fixup)


  WHAT SHIPPED:

  - UnifiedOmnibox.tsx reframed as thin wrapper over ModalDialog + TextInput +
  PickerList from silvery

  - UnifiedOmniboxConnector retired useDialogInput; silvery TextInput drives
  input in controlled mode, slippery sigil rule runs inside onChange and silvery
  echoes back the override

  - dialogTargetRef still wires the command-system
  dialog.nav_up/down/confirm/cancel path

  - Row click/hover via OmniboxRowClickable wrapper (keeps OmniboxRow pure)

  - Legacy Omnibox.tsx (486 LOC) deleted

  - showOmnibox boolean field removed from UIState, isInDialog, isDialogInput,
  createInitialUIState

  - COMMAND_PALETTE op + CommandPaletteOp interface + command_palette_legacy
  command all removed

  - command_palette command rewired to emit OPEN_UNIFIED_OMNIBOX directly (cmd-k
  dogfood)

  - cmd-shift-k / ctrl-shift-k dev aliases retired

  - omnibox.test.ts deleted (287 LOC of obsolete legacy UI assertions; unified
  surface covered by unified-omnibox-integration.test.ts)

  - Test fixtures (board-bottom-bar, key-bar) dropped showOmnibox seed

  - keybinding test assertions updated to expect command_palette on cmd-k


  LOC DELTA vs origin/main (excluding vendor/silvery):
    17 files changed, 402 insertions(+), 967 deletions(-)
    Net -565 LOC in km. Plus ~80 LOC added in silvery (TextInput feature + regression test + readline filter).

  VERIFICATION:

  - bunx tsc --noEmit (filtered) = 16 errors, all pre-existing baseline (vs 19
  baseline; dropped 3 from deleted Omnibox.tsx)

  - bun vitest run apps/km-tui/tests/ packages/km-commands/tests/ = 112 passed |
  1 skipped (113 files); 2799 passed | 38 skipped (2837 tests); 0 failures

  - bun vitest run --project vendor
  vendor/silvery/tests/features/text-input.test.tsx = 21 passed

  - Grep showOmnibox, COMMAND_PALETTE, unified_omnibox_open,
  command_palette_legacy across the repo = zero references


  DOGFOOD PRESERVED from f84e1375a:

  - modeChrome lookup for title/hotkey/placeholder per sigil

  - Keybinding hint decoration (commandId → formatKeybinding lookup map in
  connector)

  - Row highlight via selectedIndex → PickerList (its internal ListView cursor
  handles highlighting)

  - Click + hover wiring on rows

  - Escape/click-outside handlers for ui.omnibox (new)

  - Dialog min-height clamp (Math.max(10, ...))


  OPEN FOLLOW-UPS (not this bead):

  - InputBox and useDialogInput still alive for SearchDialog, NewItemDialog,
  DatePromptDialog, ItemPicker consumers — can be retired separately under
  km-review.silvery-gap-analysis

  - km-silvery.popover still blocks hover-popover content
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-use-silvery
    depends_on_id: km-session.0415a
    type: parent-child
    created_at: 2026-04-15T08:25:29Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-session.0415a
---

# [x] Replace UnifiedOmnibox internals with silvery PickerDialog + TextInput @km/tui #task #P2

blocks:: [[@km/session/0415a]]

## /big reframe: we're reimplementing basic components

## Observation

UnifiedOmnibox currently duplicates primitives that silvery already ships in `vendor/silvery/packages/ag-react/src/ui/components/`:

| @km/tui custom                                    | silvery equivalent                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| UnifiedOmnibox.tsx (dialog shell)                 | PickerDialog<T> (ModalDialog + input + scrolling list + keyboard routing) |
| InputBox + ghostHint workaround                   | TextInput (native placeholder, readline, border, focus, prompt)           |
| useDialogInput                                    | useReadline (kill ring, word movement, transpose)                         |
| UnifiedOmniboxConnector selection/scroll/keyboard | PickerDialog owns all of this                                             |
| Manual scroll-offset math                         | PickerList -> ListView (virtualized)                                      |
| Legacy Omnibox.tsx (486 LOC)                      | CommandPalette + PickerDialog                                             |

~500-700 LOC deletable.

## What km should actually own

- Sigil detection + slippery rule (state/omnibox.ts)
- Projection: commands/tags/projects/nodes -> rows (state/omnibox-projection.ts)
- OmniboxRow renderer + domain adapters (commandToRow, nodeToRow, favoriteToRow)
- Keybinding hint lookup
- Connector: results computation, dispatch on select

## Target shape

```tsx
<PickerDialog<OmniboxRowData>
  title={chrome.label}
  placeholder={chrome.placeholder}
  items={results}
  getKey={(row) => row.id}
  renderItem={(row, selected) => <OmniboxRow data={{...row, isSelected: selected}} />}
  onChange={handleBufferChange}
  onSelect={handleConfirm}
  onCancel={handleCancel}
  width={width}
  prompt="> "
  promptColor="$primary"
/>
```

TextInput gets its native placeholder behaviour back (hides on non-empty input) so the ghostHint workaround evaporates.

## Tradeoffs to resolve

- Slippery sigil rule: needs to intercept onChange and override the input value. TextInput is controlled via `value` prop so this works.
- Pre-fill with `:` vs showing placeholder: consider not pre-filling and using a separate prompt label instead, so TextInput sees an empty value and the placeholder shows natively.
- Mouse hover (onHover on rows) and click-to-confirm: PickerList uses ListView; confirm mouse/hover support is already there. Verify by reading ListView source.
- Keybinding hint column: OmniboxRow already supports hint prop, so keep the post-projection decoration pass.

## Related

- @km/tui/omnibox-unified (parent epic)
- @km/tui/omnibox-quality-plateau (superseded by this)
- @km/tui/omnibox-migration-cleanup (superseded by this)

## Effort

Medium. ~500-700 LOC deletable, wiring changes in WorkspaceChrome + UnifiedOmnibox. Break into 3 phases: (1) swap in PickerDialog shell, (2) retire InputBox/useDialogInput in omnibox path, (3) delete legacy Omnibox.tsx + unused primitives.

