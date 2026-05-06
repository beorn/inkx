---
mentions:
  - km
id: "@km/infra/style-precedence-lint"
aliases:
  - km-infra.style-precedence-lint
  - km-infra-style-precedence-lint
created_by: Bjørn Stabell
created_at: 2026-04-07T04:30:42Z
owner: bjorn@stabell.org
---

# [ ] Lint/grep guard against hardcoded colors on inline Text leaves @km/infra #task #P3

## Why

The /big styling analysis (2026-04-06) found that @km/tui style precedence is enforced by convention only. Leaves MUST route foreground colors through `resolveColor(ctx, token)` for cursor/done/strip states to work, but there is no automated check. Hardcoded values slip in (`#404050` in InlineComponents.tsx:284 is a live example).

This bead is the cheap enforcement layer to hold the line UNTIL the variant system (@km/silvery/variant-style-system) lands.

## Scope

Grep-based check in `bun fix` (or an oxlint custom rule if that's easy) that flags:

1. **Hardcoded hex colors on Text/Box components** inside `apps/km-tui/src/text/` and `apps/km-tui/src/views/`:
  - Ban: `color="#..."`, `backgroundColor="#..."`, `color="red"`, `color="blue"`
  - Allow: `color="$..."` (theme tokens), `color={resolveColor(ctx, ...)}` (override-aware)
2. **Raw `color=` on Text components** inside InlineComponents.tsx (the leaves of the inline tree):
  - Should be: `color={resolveColor(ctx, "$token")}` if fg is state-aware
  - Exception: decoration-only markers (underline, dim, italic) that don't set `color=` at all are fine — they're cursor-safe by construction
3. **Multiple `shouldStripColor` computations** — currently computed 4 different ways in TreeNode/NodeView/DetailView/shared-components. Flag duplicates; require all to import from a single helper.

## Implementation

Simplest version: add a shell check to `bun fix` (via `check-no-hardcoded-colors.sh` in scripts/) that greps and fails. Later upgrade to a proper oxlint rule.

Alternatively: add a Grep assertion to packages/@km/infra/vitest/style-check.test.ts that runs on every test suite pass.

## Done when

- [ ] CI (bun fix) rejects new hardcoded colors in inline components
- [ ] Existing violations are either fixed or allowlisted with comments
- [ ] `shouldStripColor` has one canonical implementation
- [ ] selection-style.ts rulebook is updated to reference the guard

## Parent

@km/silvery/variant-style-system (this is the holding action until that lands)

