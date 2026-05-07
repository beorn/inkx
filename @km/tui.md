---
mentions:
  - km
id: "@km/tui"
aliases:
  - km-tui
  - "@km/_orphan/tui"
created_at: 2026-02-04T11:26:59Z
---

# tui

TUI app views & interaction issues.

**TRACKING EPIC** — Keep this bead up-to-date when creating, closing, or reparenting TUI beads.
See `/pm` skill and `bd list --parent km-tui` for current children.

## EditContext Refactoring (P2 — next major work)

Unify the three separate text editing systems (useSlateEdit, useLineEdit, TextArea) into one EditContext-based system. See docs/future/universal-editor.md for the long-term vision.

- **@km/tui/edit-context** [feature] — Create EditContext primitives in hightea (createTermEditContext factory, TextOp, useEditContext hook)
- **@km/tui/edit-migrate** [task] — Replace blockEditTargetRef/useSlateEdit/useLineEdit with EditContext, drop Slate.js
- → unblocks @km/tui/selection-abstraction and @km/tui/text-mode

## Other Open (P2)

- **@km/tui/event-arch** [task] — Event architecture: stale layout during batches, module-level state
- [ ] km view <scope>: bare scope arg should snap cursor to scope root, not restore deep stale cursor #bug #P2 @issue priority:: P2
  - Repro
  ```
  km view beads
  ```

  User expects: TUI opens with @km/beads as the board root, top-level cards = the bead files in that scope, cursor on the first card.

  Actual: TUI opens at @km/beads correctly (breadcrumb shows 'km > @km > beads'), but the cursor is restored to a deeply-nested sub-item from a prior session — e.g. km > @km > beads > km-beads: Detailed Test Specifications @km/beads > (N478XNBJ). The user sees a sub-tree view of one bead's body content instead of the cards-at-board-level layout they expected.
  - Likely cause

  Per-board cursor save/restore restores the last-known cursor position regardless of how the board is opened. When opened with km view <bare-scope>, the user intent is 'show me the scope as a board' — they want the board root, not whatever deep cursor was last saved.
  - Acceptance
  - [ ] `km view <bare-scope>` (e.g. `km view beads`) opens the board with cursor at the scope root (top-level cards = top-level board items), regardless of saved cursor state
  - [ ] Saved cursor still restored when opening via path with explicit cursor (e.g. `km view @km/beads/some-bead` keeps existing behavior — restore cursor inside that bead)
  - [ ] Test: open beads board with deep saved cursor → close → `km view beads` → cursor at scope root
  - Workflow

  The view-open path lives in apps/km-tui/src/ (entry point) and packages/km-board/src/ (board state). The scope-resolver probably converts 'beads' → '@km/beads' correctly; the bug is later, in cursor-restore-vs-fresh-arrival logic.

  Found 2026-04-29 by user.

