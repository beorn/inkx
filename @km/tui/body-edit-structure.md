---
id: "@km/tui/body-edit-structure"
aliases:
  - km-tui.body-edit-structure
  - km-tui-body-edit-structure
created_by: Bjørn Stabell
created_at: 2026-04-06T19:01:28Z
closed_at: 2026-04-06T20:31:20Z
close_reason: "Fixed: BodyBlockEditor now renders non-active body blocks via
  TreeNode (display mode, isBody=true), preserving bullets, checkboxes,
  indentation, and width constraints. Active block still uses BodyEditField.
  TreeNode is injected via prop to break circular import."
---

# [x] [bug] Body block editing flattens tree structure — no bullets, no nesting, border overflow @km/tui #bug #P1 @Bjørn Stabell

When editing a card with body content (BodyBlockEditor), the tree structure is lost:

1. No bullet markers — list items render as plain indented text
2. Nested sub-items collapse into parent's wrapping text (invisible)
3. Text wraps past the card border (no overflow/width constraint)

Root cause: BodyBlockEditor renders body children as flat Text/InlineText blocks without TreeNode's bullet, indentation, and width constraint logic. Each body child is rendered as a single text blob, not as a tree node with prefix and children.

Fix approach: BodyBlockEditor should render non-active body blocks using TreeNode (display mode) instead of raw Text. Only the ACTIVE block being edited should use BodyEditField. This preserves bullets, nesting, and width constraints for all non-active body content.

Seen on: Marketing card in ~/Bear/Vault/TODO.md — list items with sub-items lose structure in edit mode.