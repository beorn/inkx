---
mentions:
  - km
id: "@km/silvery/tea-gap-substrate-merge"
aliases:
  - km-silvery.tea-gap-substrate-merge
  - km-silvery-tea-gap-substrate-merge
created_by: Bjørn Stabell
created_at: 2026-04-18T19:01:25Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.tea-gap-substrate-merge
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-18T12:02:05Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.tea
---

# [ ] TEA gap: substrate stuck on feat/tea-apply-chain-types branch — merge to main @km/silvery #task #P1

blocks:: [[@km/silvery/tea]]

Discovered while executing the aichat-v2 spike (@km/silvery/tea-aichat).

## Problem

The TEA Phase 2 substrate — createBaseApp, Op/Effect/ApplyResult types,
withTerminalChain/withInputChain/withPasteChain/withFocusChain,
lifecycle-effects, event-loop — exists fully on branch
origin/feat/tea-apply-chain-types and has 90 passing tests, but has NOT
been merged to silvery's main branch.

Commits that need to land on main (or a PR merged):

cb42b3ed types(create): add Op/Effect/ApplyResult apply-chain types
  f0bca9ad feat(create): BaseApp apply-chain substrate + 13 contract tests
  65cc8f2d feat(create): four apply-chain plugins + 40 tests
  3e141371 feat(create): event-loop + lifecycle-effects + 37 tests
  2aedbed9 feat(create): promote with-{focus,terminal,input,paste}.ts
  aaf819cc docs: document @silvery/create/runtime apply-chain substrate
  a846627c refactor(create): delete wrapApply — inline the idiom

Total: 90 tests, covering the entire substrate the aichat-v2 spike
needed to validate.

## Impact

The aichat-v2 spike (@km/silvery/tea-aichat) had to inline a minimal
substrate implementation in apply-chain.test.ts to validate the
design. That validation was successful: the substrate contract handles
a real app. But until Phase 2 merges, every downstream spike and
@km/tui migration (@km/tui/tea) has to either:

(a) Duplicate the inline substrate, or
(b) Depend on a branch, or
(c) Wait.

## Proposed action

Close the parallel work being done on the create-app.tsx monolith
decomposition, rebase feat/tea-apply-chain-types on main, resolve any
conflicts with the ag-react hook migrations, and merge.

## Related

- @km/silvery/tea-useinput — Phase 2 decomposition bead
- Parallel agent work mentioned in @km/silvery/tea-aichat bead body
  (tea-create-app-split, tea-inputboundary, tea-custom-events)

## Effort

Unknown — depends on how far the parallel tea-useinput work has
diverged from the feat/tea-apply-chain-types branch.

