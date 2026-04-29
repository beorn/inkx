---
id: "@km/tui"
aliases:
  - km-tui
  - "@km/_orphan/tui"
created_at: 2026-02-04T11:26:59Z
---

# [ ] TUI app views & interaction issues @km/tui #epic #P2

**TRACKING EPIC** — Keep this bead up-to-date when creating, closing, or reparenting TUI beads.
See `/pm` skill and `bd list --parent km-tui` for current children.

## EditContext Refactoring (P2 — next major work)

Unify the three separate text editing systems (useSlateEdit, useLineEdit, TextArea) into one EditContext-based system. See docs/future/universal-editor.md for the long-term vision.

- **@km/tui/edit-context** [feature] — Create EditContext primitives in hightea (createTermEditContext factory, TextOp, useEditContext hook)
- **@km/tui/edit-migrate** [task] — Replace blockEditTargetRef/useSlateEdit/useLineEdit with EditContext, drop Slate.js
- → unblocks @km/tui/selection-abstraction and @km/tui/text-mode

## Other Open (P2)

- **@km/tui/event-arch** [task] — Event architecture: stale layout during batches, module-level state