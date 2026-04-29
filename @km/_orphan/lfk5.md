---
id: "@km/_orphan/lfk5"
aliases:
  - km-lfk5
created_at: 2026-01-20T13:23:08Z
closed_at: 2026-01-22T11:42:22Z
---

# [x] Flexx: Document all Yoga behavioral differences @km/_orphan #task #P3

## Task
Create comprehensive documentation of all Flexx limitations and behavioral differences from Yoga.

## Content to Document

### Critical Bugs (P1)
- **Column direction layout**: Only shows last child (@km/_orphan/rn80)

### Layout Differences (P2)
- flexShrink overflow calculation (@km/_orphan/62vy)
- marginX/marginY shorthand (@km/_orphan/1796-flexx-fix-marginx-marginy-calculation)
- padding+margin combined (@km/_orphan/20bp)

### Test Reference
All differences are documented as skipped tests in:
vendor/beorn-inkx/tests/layout-equivalence.test.tsx

## Output Location
Create vendor/beorn-flexx/docs/LIMITATIONS.md with:
1. Summary table of all known differences
2. Workarounds where available
3. Links to tracking beads
4. Status of each issue

## Verification
- All skipped tests in layout-equivalence.test.tsx are documented
- Each limitation has a tracking bead linked