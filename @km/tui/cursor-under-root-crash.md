---
id: "@km/tui/cursor-under-root-crash"
aliases:
  - km-tui.cursor-under-root-crash
  - km-tui-cursor-under-root-crash
created_by: Bjørn Stabell
created_at: 2026-04-15T01:30:12Z
closed_at: 2026-04-15T01:39:46Z
close_reason: "Reactive fix shipped in 791067dd1: cursor-under-root,
  cursor-visible, and cursor-in-walkOrder invariants now recoverable with
  auto-reset to rootId + warning toast. km view no longer crashes on load with a
  stale cursor. Root-cause investigation (find the ghost writer) deferred to
  km-tui.cursor-gate-refactor."
---

# [x] km view crashes on load: cursor-under-root invariant violation @km/tui #bug #P1 @Bjørn Stabell

blocks:: [[@km/tui]]

On launching km view against ~/Bear/Vault, the invariant check #2 (cursor-under-root) throws InvariantViolationError on the first event, killing the TUI. Repro: rootId=projects/+mamamuse (a folder node), cursor=01KP6N1FKS2RRRGRTFMRQK9S3P (a ULID whose parent chain leads to ref/People/Family/Bjorn.md, not projects/+mamamuse). Walking parent_id from the cursor never reaches the rootId, so isDescendantOf returns false and the invariant throws. Workaround: delete ~/Bear/Vault/.km/workspaces/default.json. Fix: (1) guard computeInitialCursorFromRepo to verify the computed cursor is a descendant of rootId; (2) make the cursor-under-root invariant recoverable (log + reset cursor) instead of crashing. The underlying question — where the stale cursor is actually being restored from — is a separate investigation.