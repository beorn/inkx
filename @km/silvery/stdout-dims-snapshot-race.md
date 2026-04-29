---
id: "@km/silvery/stdout-dims-snapshot-race"
aliases:
  - km-silvery.stdout-dims-snapshot-race
  - km-silvery-stdout-dims-snapshot-race
created_by: claude:019d032d
created_at: 2026-04-22T20:41:41Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.stdout-dims-snapshot-race
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-22T13:41:52Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-silvery.stdout-dims-snapshot-race
    depends_on_id: km-silvery.term-sub-owners
    type: blocks
    created_at: 2026-04-22T13:47:53Z
    created_by: claude:019d032d
    metadata: "{}"
---

# [ ] stdout.columns/rows read races during SIGWINCH (44 readers take stale snapshots) @km/silvery #task #P2

blocks:: [[@km/silvery]], [[@km/silvery/term-sub-owners]]

Audit finding (2026-04-22, /tmp/shared-global-audit.md) — 44 call sites read process.stdout.columns / .rows directly. Several use static fallbacks (50, 80, 40 — TreeNode.tsx and others) that hide stale reads but cause silent layout corruption when SIGWINCH fires mid-render.

Same META-pattern: shared global mutable state (terminal dims) read by uncoordinated consumers. The term-provider already coalesces SIGWINCH events within one frame (commit 742b1676), but consumers that read stdout.columns/.rows directly bypass the coalescing.

Solution: dims should be read from a single source of truth (term provider's getDims()) that snapshots per-frame. Direct reads of process.stdout.columns/.rows banned outside the owner — same lint pattern as check-stdin-ownership.sh.

Audit report: /tmp/shared-global-audit.md (Suspect #1).