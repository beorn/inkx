---
aliases:
  - km-silvery.cell-outside-rect-strict-check
  - km-silvery-cell-outside-rect-strict-check
created_at: 2026-05-08T21:40:21.857Z
---

# Silvery painter STRICT invariant: no cell painted outside bordered rect #task #P3

L5 follow-up to `@km/silvery/card-content-overflow-clip` (closed at de0f08c4 + 3968462ec). The shipped fix is L3 (architecture knows about wrap policy). The L5 move is a runtime invariant: when a Box has `borderStyle` set, no cell painted by its descendants may have coordinates outside the bordered rectangle.

This makes the entire class of "text overflows card border / selected-bg leaks past border" bugs impossible by construction. The just-fixed bug is one instance; similar shapes have appeared in modals, popovers, and table cells over the last six months.

## Acceptance

- [ ] New SILVERY_STRICT slug `bordered-rect-clip` (or similar): when enabled, silvery's pipeline asserts that every painted cell falls inside its nearest ancestor's bordered rectangle.
- [ ] Slug enrolled in tier 2 (every-action invariants) so it runs on all painted frames in test mode.
- [ ] `bordered-rect-clip` is **in the canonical strict slug docs** (`vendor/silvery/docs/guide/debugging.md`).
- [ ] Runtime error message includes: cell coordinate, parent box id + rect, depth path, suggested fix (set `overflow="hidden"` or `wrap` mode).
- [ ] Generic regression test: a `<Box borderStyle="round" width={20}><Text>{"a".repeat(40)}</Text></Box>` triggers the invariant unless the consumer opts into a wrap or truncate mode.
- [ ] Fix existing offenders surfaced by the invariant before merge.

## Why P3 not P0

- The shipped fix already pins the user-visible regression (separator-aware wrap + min-content).
- The L4 truncate-fallback (`@km/silvery/card-body-truncate-ellipsis`) ships next.
- This invariant is preventive — catches future regressions, not currently-broken behavior.

## Related

- `@km/silvery/card-content-overflow-clip` (closed) — the immediate fix
- `@km/silvery/card-body-truncate-ellipsis` (P2) — truncate fallback for atomic tokens
- `@km/silvery/wrapper-friendly-render-primitive` (P2) — silvery agent's separate L4 surface
- `vendor/silvery/CLAUDE.md` § "SILVERY_STRICT is the only knob" — slug taxonomy
- `docs/lessons/no-parallel-derivation.md` — same class of "fix-at-the-right-level" lesson

## /big analysis

Surfaced via `/big` reframing of `card-content-overflow-clip`. Three independent hypotheses (H3, H14, H16) converged: the painter should enforce that descendants don't paint outside their parent's bordered rectangle. This is the L4-L5 move that makes the *class* impossible.
