---
aliases:
  - km-silvercode.flex-defaults-cleanup
  - km-silvercode-flex-defaults-cleanup
created_at: 2026-05-06T23:58:53.366Z
---

# Silvercode: drop redundant flexShrink={1} minWidth={0} ceremony #P3

Batch-refactor `flexShrink={1} minWidth={0}` and related Yoga-era prop ceremony out of `apps/silvercode/src/components/` where redundant given silvery's CSS-correct defaults.

## Why

Silvery's flex defaults are CSS-correct (`flexShrink: 1`, `alignContent: stretch`, plus CSS §4.5 flex-item auto min-size with recursive intrinsic min-content). Per `vendor/silvery/CLAUDE.md`: "You don't need to thread `flexShrink={1} minWidth={0}` through wrap chains for typical layouts — that ceremony was required under historical Yoga-flavored defaults and is no longer load-bearing."

Audit of apps/silvercode shows ~80 occurrences of the prop pair, most as cargo-cult ceremony. Some are genuinely load-bearing (non-wrappable Text, containers narrower than longest unbreakable word — see Yoga-divergences guide).

## Approach

1. Grep for `flexShrink={1} minWidth={0}` in apps/silvercode/src/.
2. Per-file: remove the props, run `bun vitest run apps/silvercode/tests/<file-tests>`, visually verify in `bun silvercode`.
3. Where removal breaks layout, leave it AND add a one-line comment naming the reason (non-wrappable Text, container narrower than longest token, etc.).
4. Don't touch vendor/silvery internals — silvery owns its own ceremony.

## Files in scope

apps/silvercode/src/components/*.tsx — Chat.tsx (heaviest), Content.tsx (after measurement-ceremony-collapse), AvailableCommandsPalette.tsx, BoundedScroll.tsx, ActivityIndicator.tsx, etc.

## Acceptance

- Audit shows reduced ceremony (target: drop 60+ of ~80 prop pairs)
- Remaining load-bearing pairs have a one-line comment explaining why
- Real-TTY visual: `bun silvercode` looks identical at all terminal widths
- No regressions in `bun vitest run apps/silvercode`

## Notes

Mechanical work; bundle into the same PR as `@km/silvercode/body-subsumes-lanes` if both touch the same files.
