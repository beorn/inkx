---
id: "@km/silvery/sterling-prune-state-variants"
aliases:
  - km-silvery.sterling-prune-state-variants
  - km-silvery-sterling-prune-state-variants
created_by: claude:4274df30
created_at: 2026-04-20T03:18:04Z
closed_at: 2026-04-20T03:36:07Z
close_reason: Shipped in vendor/silvery commit bfc017a5. Pruned
  fg.hover/fg.active from info/success/warning/error — only accent (link-like)
  keeps fg state variants. New BgStatePair type; FlatToken union pruned from 48
  to 40. Consumer grep confirms zero references to pruned tokens. 6 new
  prune-invariant tests + 84-scheme catalog sweep. design-system.md docs
  aligned. Paired with km-silvery.sterling-derivation-adaptive (dce80b83).
  sterling-2d-release forward-blocks are for the 0.19.0 release cut — this bead
  was a prerequisite, unblocking it is correct.
---

# [x] Sterling: prune meaningless fg.hover / fg.active variants (design-system grammar) @km/silvery #feature #P2 @claude:4274df30

blocks:: [[@km/silvery/sterling-2d-release]], [[@km/silvery/theme-v4]]

Sterling's derivation generates all 24 state-variants per role algorithmically. Most are semantically meaningless: hover/active are INTERACTIVE-SURFACE states, not text states. No mainstream design system ships fg.hover per role.

## Current (over-generated)

Per role (error, warning, success, info, accent):
- fg, bg, fgOn
- hover.fg, hover.bg
- active.fg, active.bg

8 tokens per role × 5 roles = 40+ state variants.

## Actually meaningful

- `bg-<role>-hover` ✓ always (surface hover)
- `bg-<role>-active` ✓ always
- `fg-on-<role>` ✓ always (text on fill — doesn't change on hover)
- `fg-accent-hover` ✓ only accent (link-like text)
- `fg-accent-active` ✓ only accent
- `fg-link-hover` ✓ only link
- `fg-<role>-hover` for error/warning/success/info ✗ error text doesn't hover
- `fg-on-<role>-hover` ✗ fg-on-X doesn't change when the bg-X hovers

## Fix

Remove fg.hover / fg.active from Theme shape for: error, warning, success, info, muted. Keep for: accent, link (interactive text roles).

Token count drops from ~40 state variants to ~16.

## Rationale

- Matches Primer / Material / shadcn / Polaris grammar (none ship fg.<role>.hover by default)
- Removes over-generation that today produces whitewashed values
- Simpler mental model: 'is this interactive text? If no, it doesn't have state variants'
- Smaller Theme objects, faster derivation, cleaner token tree in storybook

## Acceptance

- Theme type no longer has error.hover.fg, warning.hover.fg, success.hover.fg, info.hover.fg, muted.hover.*
- theme.accent.hover.fg + theme.link.hover.fg still exist (interactive text cases)
- Flat tokens: $fg-accent-hover + $fg-link-hover remain; $fg-error-hover / $fg-warning-hover / etc. removed
- All 84 schemes still pass catalog contrast gate on remaining tokens
- Storybook token tree no longer shows over-generated rows
- Components that reference removed tokens: tsc errors guide cleanup (there shouldn't be any in @silvery/ui or @km/tui at this point — they shouldn't have been used for real)

## Scope

~50 LOC in sterling/types.ts + sterling/derive.ts + sterling/flatten.ts. Removes derivation rules for the pruned tokens. Updates test expectations. ~1 session.

## Depends on / blocks

- **Depends on**: sterling-2d (breaking Theme shape change — bundle into 0.19.0)
- **Blocks**: nothing critical; quality-of-life improvement

Parent: @km/silvery/theme-v4