---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-km-tui-selection-migration"
aliases:
  - km-silvery.sterling-km-tui-selection-migration
  - km-silvery-sterling-km-tui-selection-migration
created_by: claude:5e447b66
created_at: 2026-04-24T23:24:00Z
closed_at: 2026-04-25T05:59:20Z
close_reason: "Phase C shipped: km 1d886ad2a (29 files renamed) + 2fd5f79b8
  (docstring) + 6f81be10f (km-tui dim list update — completes the Sterling
  threading after Phase B). 30 files touched total.
  $selectionbg/$selection/$inversebg/$inverse/$link →
  $bg-selected/$fg-on-selected/$bg-inverse/$fg-on-inverse/$fg-link across
  apps/km-tui. All 18 $link uses cleanly mapped to $fg-link (no per-site
  bg-vs-fg ambiguity). 2521 km-tui tests pass; the 2 remaining failures
  (matchers.test.tsx::toBeContainedIn) are pre-existing and unrelated to
  Sterling. Pushed to origin/main."
started_at: 2026-04-25T05:20:50Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.sterling-km-tui-selection-migration
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:24:04Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-km-tui-selection-migration
    depends_on_id: km-silvery.sterling-selection-tokens
    type: blocks
    created_at: 2026-04-24T16:24:04Z
    created_by: claude:5e447b66
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-all.sterling
      - type: link
        target: km-silvery.sterling-selection-tokens
      - type: link
        target: "@km/silvery/sterling"
---

# [x] Phase C: Migrate km-tui consumers from legacy selection/inverse/link tokens to Sterling flat tokens @km/silvery #task #P2 @claude:22c2717d

blocks:: [[@km/silvery/sterling]], [[@km/silvery/sterling-selection-tokens]]

Mechanical rename across apps/@km/tui (~30 files, mix of src + tests).

## Renames

$selectionbg → $bg-selected
$selection → $fg-on-selected
$inversebg → $bg-inverse
$inverse → $fg-on-inverse
$link → $bg-link  (per-site decision: bg vs fg)

## Sites (audit before refactor)

- apps/@km/tui/src/views/selection-style.ts (incl. docstring lines 8-14 documenting the gap — DELETE the caveat)
- apps/@km/tui/src/views/TreeNode.tsx
- apps/@km/tui/src/views/DetailView.tsx
- apps/@km/tui/src/views/tree-node-helpers.tsx
- apps/@km/tui/src/text/InlineComponents.tsx
- apps/@km/tui/tests/board-selection.spec.ts
- apps/@km/tui/tests/board-zoom.slow.spec.ts
- apps/@km/tui/tests/card-bg-inheritance.test.ts
- apps/@km/tui/tests/card-rendering.slow.test.ts
- apps/@km/tui/tests/golden-visual-state.test.ts
- apps/@km/tui/tests/checkbox-click.test.ts
- apps/@km/tui/tests/windowing-wire.test.ts
- (any others — sweep with rg first)

## Approach

1. Run `rg '\$selectionbg|\$selection\\b|\$inversebg|\$inverse\\b|\$link\\b' apps/km-tui --type=ts --type=tsx` to enumerate
2. Use `bun vendor/bearly/tools/refactor.ts` for mechanical replace
3. Hand-fix sites that need bg-vs-fg distinction (e.g. $link can map to either bg-link or fg-on-link depending on usage)
4. Update selection-style.ts docstring — remove the 'no Sterling equivalent — migrate when added' caveat at lines 8-14

## Acceptance (literal /complete criteria)

- `grep -rn '\$selectionbg|\$selection\\b|\$inversebg|\$inverse\\b|\$link\\b' apps/km-tui --include='*.ts' --include='*.tsx' | wc -l` returns 0
- selection-style.ts:8-14 caveat about 'no Sterling equivalent' DELETED
- bun fix passes
- bun vitest run apps/@km/tui/tests passes (197 files, 2500+ tests)

## Coordination

- Worktree-isolated (>20 files, >30 min, breaks consumers in transit)
- Tribe broadcast before merge
- Depends on sterling-selection-tokens (Phase A) shipping first

