---
aliases:
  - km-all.test-system.real-vault-golden-snapshot
  - km-all-test-system-real-vault-golden-snapshot
created_at: 2026-05-05T21:23:12.390Z
---

# Real-vault golden cell-snapshot CI step (catches regressions visible in user env) #feature #P2

Even with the testBoard harness fix and no-stale-residue invariant, we have no CI step that asserts 'the kanban view at user dimensions, on the user's actual vault, renders the same cells today as it did yesterday.' Without it, any rendering regression that doesn't trip an existing invariant ships unnoticed (today's incident: 13 columns of stale paint in production for an unknown duration).

Proposal: a slow CI step that runs km-tui against a checked-in test-vault (or a synthetic vault built to match real-vault density), at 360x120, captures the rendered frame as a cell-level snapshot (text + bg/fg per cell), and asserts byte-identical match against golden. Auto-update on intentional change; fail loudly on drift.

Reuse existing snapshot infrastructure (vitest snapshots) but at cell granularity, not text. For dependent fields (timestamps, transient UI state) use placeholder masking.

Acceptance:
- new test apps/km-tui/tests/golden-vault-frame.slow.spec.ts (or similar)
- runs in test:slow project (excluded from test:fast for speed)
- captures full 360x120 cell grid post-render
- diff output shows changed cells with neighboring context for human review
- documented in km CLAUDE.md as the canonical 'visible regression' check
