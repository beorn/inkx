---
mentions:
  - km
id: "@km/review/silvery-gap-analysis"
aliases:
  - km-review.silvery-gap-analysis
  - km-review-silvery-gap-analysis
created_by: Bjørn Stabell
created_at: 2026-04-15T14:41:44Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-review.silvery-gap-analysis
    depends_on_id: km-silvery.selection-focus-plateau
    type: parent-child
    created_at: 2026-04-15T11:31:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-review.silvery-gap-analysis
    depends_on_id: km-silvery.tea.migration
    type: blocks
    created_at: 2026-04-15T11:31:34Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-review.silvery-gap-analysis
    depends_on_id: km-tui.tea
    type: blocks
    created_at: 2026-04-15T11:31:32Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.selection-focus-plateau
      - type: link
        target: km-silvery.tea.migration
      - type: link
        target: km-tui.tea
---

# [ ] Gap analysis: km vs silvery — what it takes for km to truly leverage silvery @km/review #task #P2

blocks:: [[@km/silvery/selection-focus-plateau]], [[@km/silvery/tea/migration]], [[@km/tui/tea]]

## km ↔ silvery gap analysis

## Why

/big round 1 in this session surfaced ~700 LOC of duplication between @km/tui and silvery (UnifiedOmnibox, InputBox, useDialogInput, manual scroll/selection wiring). That was just ONE feature. A broader sweep would likely surface more, because the same anti-pattern ("build @km/_orphan/local because it feels domain-specific") repeats across dialogs, pickers, inputs, lists.

## Goal

Produce a complete gap analysis: for every @km/tui view/hook/helper, is there a silvery primitive that already does it? What would it cost to migrate?

## Scope

Audit the following directories against vendor/silvery/packages/ag-react/src/:

1. apps/@km/tui/src/views/*.tsx — every view component
2. apps/@km/tui/src/hooks/*.ts — every hook
3. apps/@km/tui/src/views/shared-components.tsx — all the utility components
4. apps/@km/tui/src/text/*.tsx — inline text rendering
5. apps/@km/tui/src/state/* — state helpers (exclude domain-specific)

For each file, produce one of these verdicts:

- **PURE DOMAIN** — can't come from silvery (board reducer, node tree logic, etc.)
- **COMPOSED** — already uses silvery primitives correctly, no change
- **DUPLICATE (migrate)** — silvery has this, should migrate
- **PARTIAL DUPLICATE** — silvery has 80% of this, gaps listed
- **SILVERY GAP** — silvery should add this primitive; km builds it now as owner

## Deliverables

1. A gap analysis doc at docs/review/silvery-gap-analysis.md with:
  - Table of every @km/tui file + verdict
  - Migration order (by effort and impact)
  - Estimated total LOC deletable
  - List of new silvery primitives km needs (to file as @km/silvery.* feature beads)
2. Concrete follow-up beads:
  - One bead per DUPLICATE verdict with migration plan
  - One @km/silvery.* bead per SILVERY GAP verdict

## How to run

1. List all files: `find apps/km-tui/src/views apps/km-tui/src/hooks apps/km-tui/src/text -name '*.ts' -o -name '*.tsx'`
2. For each file, read the top comment + exported symbols
3. Grep vendor/silvery/packages/ag-react/src/ for matches
4. Run /pro or /llm --deep on ambiguous cases: "is there a silvery component that does X?"
5. Compile results into the gap analysis doc

## Depends on

- @km/tui/omnibox-use-silvery (lands silvery-components.md which is the starting inventory)
- @km/infra/activation-rules-audit (procedural gate that prevents NEW duplication while this gap is being closed)

## Related

- The /big analysis that spawned this bead is documented in @km/tui/omnibox-use-silvery description

