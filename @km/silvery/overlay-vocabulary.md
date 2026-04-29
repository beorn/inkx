---
id: "@km/silvery/overlay-vocabulary"
aliases:
  - km-silvery.overlay-vocabulary
  - km-silvery-overlay-vocabulary
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:37Z
---

# [/] silvery overlays — DropdownMenu, ContextMenu, HoverCard, Tag, RadioGroup, Switch, TabSelect @km/silvery #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvery]]

Add overlay primitives missing from silvery's component vocabulary.

## Audit (2026-04-26)
Already in vendor/silvery/packages/ag-react/src/ui/components/:
- Tooltip — terminal-inline help text near target
- Popover — hover-driven floating overlay (mid-WIP in the working tree, not yet pushed)
- Tabs — compound TabList/TabPanel
- Badge — small inline status label
- Toggle — focusable checkbox-style toggle (Space-to-toggle)

## Real gap (4 net-new + 3 aliases)
- <DropdownMenu> — button-triggered menu (like a select), keyboard-navigable
- <ContextMenu> — keybind-triggered (Ctrl+? or similar) action menu — not right-click since TUI mouse semantics differ
- <RadioGroup> — mutually-exclusive options for forms, focus-group integrated
- <TabSelect> — segmented-control variant of Tabs (pill-style, single-row)
- <Tag> — re-export alias of Badge
- <Switch> — re-export alias of Toggle
- <HoverCard> — re-export alias of Popover (or distinct if structured-content semantics warrant)

## Estimated LOC: ~350-500 (was 600-900 before audit)

## Acceptance
- New components in vendor/silvery/packages/ag-react/src/ui/components/
- Each new component has a test in vendor/silvery/tests/
- Exported from ag-react barrel
- Listed in vendor/silvery/docs/components/ (one .md per component)
- Aliases re-export verbatim — no parallel implementation

## Blocks
B.5 file-tabs (TabSelect for narrow chrome), B.8 model-tooltip (HoverCard), B.10 settings (RadioGroup, Switch), B.11 dialog-fork, B.12 status-popover.

## Source plan
hub/silvery/future/ai-terminal/component-parity-plan.md § Tier 0 bead 3.