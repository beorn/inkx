---
aliases:
  - km-tui.no-invisible-cursors-render-invariants
  - km-tui-no-invisible-cursors-render-invariants
created_at: 2026-05-08T21:55:02.768Z
---

# No invisible cursors; subitems auto-reveal with render invariants #bug #P0

## Problem

The cursor can land on a node that is filtered, folded, clipped behind a `+N more` row, or otherwise not rendered. The user-visible failure is a disappearing cursor; a related failure is multiple rendered cursors when duplicate node ids exist through embeds.

Invisible cursor is a programming error. Multiple visible cursors is also a programming error.

## Required Shape

After every command/render in board mode, the rendered board must have one visible cursor occurrence and only one, except for explicit modes that intentionally replace the board cursor with a text/edit cursor.

Subitem navigation must reveal the target before the frame commits. Tests must prove that hidden targets are absent before navigation and present after navigation, including reverse navigation back up.

## Acceptance

- Render invariants enforce exactly one visible rendered cursor after commands in board mode.
- Render invariant failure includes action, cursor path/node, root, and enough context to debug the path.
- Inline/text edit and other deliberate cursor-suppressed modes are explicitly whitelisted; they must not weaken board-mode checks.
- `block_nav_down`, `cursor_down`, and reverse navigation auto-reveal subitems hidden by fold depth, `+N more`, and task-status filters.
- Tests verify: hidden subitem does not exist before navigation; target subitem exists with `data-cursor` after navigation; cursor remains visible when navigating back up.
- Tests cover duplicate embedded/source occurrences and assert both "one cursor" and "cursor is on the intended visual occurrence".
- Include termless or tty-backed verification for the real-screen path, not only state assertions.

## Related

![[cursor-is-path-no-global-subscriptions]]

