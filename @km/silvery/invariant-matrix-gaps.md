---
id: "@km/silvery/invariant-matrix-gaps"
aliases:
  - km-silvery.invariant-matrix-gaps
  - km-silvery-invariant-matrix-gaps
created_by: claude:950534f3
created_at: 2026-04-24T08:32:29Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.invariant-matrix-gaps
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-24T01:32:37Z
    created_by: claude:950534f3
    metadata: "{}"
  - issue_id: km-silvery.invariant-matrix-gaps
    depends_on_id: km-silvery.cursor-contrast-unguarded
    type: blocks
    created_at: 2026-04-24T01:32:37Z
    created_by: claude:950534f3
    metadata: "{}"
---

# [ ] Invariant matrix missing fg-muted/fg-cursor × many bg-* pairings @km/silvery #task #P2

blocks:: [[@km/silvery]], [[@km/silvery/cursor-contrast-unguarded]]

vendor/silvery/packages/ansi/src/theme/invariants.ts enforces only 3 spot-checks for the main fg token:

- fg / bg
- fg / bg-surface-subtle
- fg / bg-surface-overlay

Missing checks (enumerated):

fg × bg-surface-raised, bg-surface-hover, bg-muted, bg-cursor, bg-accent, bg-error, bg-warning, bg-success, bg-info — 9 gaps
fg-muted × bg, bg-surface-subtle, bg-surface-overlay, bg-surface-raised, bg-surface-hover, bg-cursor — 6 gaps (only fg-muted/bg-muted is checked, and at LARGE_RATIO 3:1 not AA 4.5:1)
fg-cursor × bg-cursor — untested; Espresso fails at 1.96:1

## Why this matters
Sterling auto-lifts tokens individually. If an invariant isn't declared, no auto-lift enforcement runs for that pair. Consumers (like @km/logview) cross-compose fg-cursor onto bg-surface-subtle; that pair is never contrast-checked at derivation or CI time.

## Fix
1. Expand the invariants array to cover the full fg × bg matrix at AA_RATIO.
2. Relax fg-muted/bg-muted from LARGE_RATIO to AA_RATIO (body text, not ornamentation).
3. Add a CI gate that runs deriveRoles against every catalog theme and asserts 0 violations.

## Blocked by
@km/silvery/cursor-contrast-unguarded (fix the cursor pair first; then adding its invariant becomes non-breaking).