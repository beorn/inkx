---
mentions:
  - km
id: "@km/infra/test-system/p4-invariants"
aliases:
  - @km/infra/test-system.p4-invariants
  - @km/infra/test-system-p4-invariants
created_by: Bjørn Stabell
created_at: 2026-04-18T07:45:54Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: @km/infra/test-system.p4-invariants
    depends_on_id: @km/infra/test-system
    type: parent-child
    created_at: 2026-04-18T00:46:09Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: "@km/infra/test-system"
---

# [ ] Phase 4 continued: Content stability invariant + property-based tier @km/all #task #P2

blocks:: [[@km/infra/test-system]]

## Remaining Phase 4 items

The original Phase 4 in parent bead had 4 items:

1. Cursor-content stability → default invariant — NOT DONE
2. Border integrity → strict-2 invariant only — DONE (apps/@km/tui/tests/helpers/test-app.ts:809)
3. Property-based tier via fast-check — NOT DONE
4. withStore reason tag — DONE (signature exists on TestApp.withStore)

## Items remaining for this bead

### 1. Cursor-content stability invariant (default level)

After every structural action (navigation: press j/k/h/l, fold, zoom), verify text content is unchanged when no mutation occurred. Cost: ~2ms per action (cheap, /pro approved).

Design notes:

- Classify actions: navigation (no content change expected) vs mutation (content can change)
- Navigation set: press(hjkl/HJKL/gG/up/down/left/right), zoom in/out, fold/unfold
- Mutation set: press(Enter/i/a/o/O/x/dd/yy/p), type(), paste(), command() for edit ops
- Invariant: before nav action, snapshot visible text; after, verify match (allowing cursor/selection style diffs)
- Implementation: extend runDisposeInvariants or add per-action hook (strict level 1)

### 2. Property-based tier via fast-check

- Install fast-check dev dep
- Generate random action sequences: nav + fold + selection
- Assert invariants hold across all generated sequences
- Start with: cursor stability, selection integrity, no ghost chars
- 10-min timeout, 1000 runs per property

### 3. withStore reason-tag migration (optional, cosmetic)

193 withStore callsites don't have reason strings. These are grep-unfriendly but not broken. Pro finding is the reason tag enables greppable callsites for audit. Migration is mass edit — could be done per-domain when Phase 5 MECE reorg happens.

## /complete criteria

- content-stability-invariant.test.ts demonstrates the invariant catches a regression
- fast-check property tests run in test:fast (or test:ci fuzz project)
- grep 'withStore("' apps/@km/tui/tests/ shows meaningful adoption (>50% of callsites)

blocks:: [[@km/infra/test-system]]

