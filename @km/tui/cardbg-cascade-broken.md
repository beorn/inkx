---
id: "@km/tui/cardbg-cascade-broken"
aliases:
  - km-tui.cardbg-cascade-broken
  - km-tui-cardbg-cascade-broken
created_by: claude:53042a7f
created_at: 2026-04-26T08:11:06Z
closed_at: 2026-04-26T08:35:15Z
close_reason: Stale Sterling-renamed token in test (theme.selectionbg →
  theme["bg-selected"]). Actual rendering was correct; test was reading
  undefined and falling back to selectedBg(theme) blend. Fixed in commit
  51017489e — test now reads bg-selected first with back-compat fallback. All 4
  tests in the file pass.
---

# [x] card-bg cascade: sub-items don't inherit cursor-card's $bg-selected @km/tui #bug #P3

blocks:: [[@km/tui]]

The card-bg-inheritance test asserts that when cursor is on a card-title, all rows inside the card (including sub-items under sections) render with $bg-selected — a unified-highlight effect.

Currently fails: sub-item-1 (under Section1, under card-title) renders with theme default bg #4C566A instead of the card's $bg-selected (~#383C45).

## Failing test

apps/@km/tui/tests/card-bg-inheritance.test.ts:248
> "card bg matches expected selectedBg tint (not multiSelectedBg)"

Error:
> Sub-item bg (76,86,106) does not match \$bg-selected=#383C45 (56,60,69), diff=37.

## Why this is unrelated to text-intrinsic-vs-render

This test was failing BEFORE silvery's fce71edd commit (the text-intrinsic split). The silvery agent listed it as one of 7 pre-existing failures, but the fix mechanism (minWidth={0} on Box wrappers) only addressed 6/7. This one needs CardColumn theme-cascade investigation — different code path entirely.

## Investigation entry points

- apps/@km/tui/src/views/CardColumn.tsx:561-569 — `cardBg` computation. When `isCursorOnThis`, returns `\"\$bg-selected\"` (token, not resolved color).
- apps/@km/tui/src/views/CardColumn.tsx:617 / :655 — applies `backgroundColor={cardBg}` to the card root Box.
- apps/@km/tui/src/views/TreeNode.tsx — descendant rows. Look for any `backgroundColor` or theme override that might block cascade.

## Hypothesis

Some descendant Box (likely Section or sub-item rendering in TreeNode) sets an explicit `backgroundColor` that overrides the card's `\$bg-selected` cascade.

## Acceptance

- card-bg-inheritance test passes (sub-item bg within tolerance of expected $bg-selected)
- No new failures elsewhere