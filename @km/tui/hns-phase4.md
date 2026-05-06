---
mentions:
  - km
  - Bjørn
id: "@km/tui/hns-phase4"
aliases:
  - km-tui.hns-phase4
  - km-tui-hns-phase4
created_by: Bjørn Stabell
created_at: 2026-04-08T07:31:26Z
closed_at: 2026-04-08T08:18:12Z
close_reason: Added editingDescendant reduced signal. CardColumn + TreeNode
  expansion now use reduced signals. expandedEditCardId kept for 1 global
  reader. All 217 tests pass. Commit 825c2d424.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Phase 4: Editing + sigils — extend reduced signals @km/tui #task #P1 @Bjørn Stabell

Add editingDescendant and excludedSigils as reduced signals. Delete syncEdit and hydrate sigil walk.

## What to do

1. Add editingDescendant: tree.descendants(s => s.editing).some()
2. Add excludedSigils: tree.ancestors(s => s.ownSigils).reduce(concat, [], { equals: arrayShallowEqual })
3. Delete syncEdit() method
4. Delete expandedEditCardId store-level signal
5. Delete sigil propagation from hydrate()
6. Fix tsc errors
7. Final bench comparison

## Delete

- syncEdit (method)
- expandedEditCardId (store-level signal)
- Sigil walk in hydrate()

## /complete

\`\`\`bash
rg syncEdit --glob '!.beads' --glob '!vendor' --glob '!docs' -t ts -c 2>/dev/null | wc -l  # → 0
rg expandedEditCardId --glob '!.beads' --glob '!vendor' --glob '!docs' -t ts -c 2>/dev/null | wc -l  # → 0
rg 'useSignal.*expandedEditCardId' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0

## Sigil hydration removed:

rg 'hydrateDescendant\|deriveExcludedSigils\|deriveColumnExcludedSigils' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0 (or only definition if utility is kept)

bun run test:fast  # all pass

## Bench: content render ≤ 8% of wall time (same or better than Phase 0 baseline)

## Full sweep — nothing left from the old system:

rg 'syncCursor\|syncSelected\|syncEdit\|_legacySync\|prevDescendantCardId\|expandWithDescendants\|hydrateDescendantSelection\|assertParity' --glob '!.beads' --glob '!vendor' --glob '!docs' -t ts -c 2>/dev/null | wc -l  # → 0
\`\`\`

