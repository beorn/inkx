---
id: "@km/silvery/flexshrink-default"
aliases:
  - km-silvery.flexshrink-default
  - km-silvery-flexshrink-default
created_by: claude:0940ca20
created_at: 2026-04-24T22:12:11Z
closed_at: 2026-04-25T06:53:07Z
close_reason: "Phase 1-4 + 9-10 landed. Foundation (defaults preset config)
  complete: createFlexily/Node.create accept {defaults:'css'|'yoga'},
  closure-captured (no globals per principles.md). Yoga-compat tests pinned.
  Tests preset-flip-tolerant. Silvery has opt-in via
  createFlexilyZeroEngine({defaults:'css'}). Prose docs updated for post-flip
  state. Phase 5-8+11 (audit + actual flip) deferred to follow-up beads
  km-silvery.flexshrink-flip-silvery-only and
  km-silvery.flexshrink-audit-silvery — cleaner architectural path of
  silvery-only opt-in vs global flip."
---

# [x] Evaluate flipping flexily flexShrink default from 0 → 1 (CSS parity) @km/silvery #task #P2 @claude:53042a7f

blocks:: [[@km/silvercode/wrap-ergonomic]]

## Recommendation: flip flexily default to CSS, expose `defaults` preset for Yoga-compat consumers

Re-evaluated 2026-04-24 after multi-target reframe + Yoga-compat-as-config insight. Final form.

## Why flip (re-framed for multi-target + rich-text)

Per `docs/silvery-positioning-brief.md`: pick the cross-platform / Polaris-aligned answer over the TUI-idiom one. silvery is a multi-target design system — terminal today, canvas + DOM as explicit future targets. Yoga's `flexShrink: 0` is a React-Native-ism that doesn't travel.

User reframe (2026-04-24): "the common case is to have deeply nested rich text that you want to wrap sensibly." That inverts the migration math:
- Cases where rigidity is correct: a finite, bounded set of framework primitives — virtual list rows, scroll indicators, fixed-height bars, focus rings, frame chrome. ~30-50 sites in silvery, ~30-50 in km. All can be made explicit in one audit pass.
- Cases where shrink-and-wrap is correct: unbounded — every consumer component that could ever contain text. The current default makes those wrong-by-default; the flip makes them right-by-default.

Prose-as-required-wrapper is the same negative-knowledge tax under a different name. Keeping Prose mandatory for wrap doesn't fix the footgun, just renames it. After the flip, Prose becomes optional sugar — a typography primitive, not a wrap-enablement chain.

## Yoga-compat-as-config (the key insight)

flexily already exposes a factory: `createFlexily(options?)`. Extend with a `defaults` preset:

```typescript
type DefaultsPreset = "css" | "yoga"

interface FlexilyOptions {
  charWidth?: number
  charHeight?: number
  defaults?: DefaultsPreset  // Default: "css"
}

// CSS-default consumers (silvery, web, canvas):
createFlexily()  // or createFlexily({ defaults: "css" })

// Yoga-compat consumers (drop-in replacement for yoga-layout):
createFlexily({ defaults: "yoga" })
```

The `yoga` preset reverts the documented divergences in one place:
- `flexDirection: column` (Yoga default; CSS is row)
- `flexShrink: 0` (Yoga default; CSS is 1)
- `overflow:hidden/scroll` no auto min-size override (Yoga's literal Section 4.5 ignore)

This dissolves the trade-off entirely:
- ✅ silvery and other multi-target consumers get CSS-correct defaults out of the box.
- ✅ Yoga-compat consumers (existing or future) opt in once, no per-Node migration.
- ✅ flexily's "Yoga-API-compatible" pitch holds — you can still drop it in for Yoga workflows by passing `{ defaults: "yoga" }`.
- ✅ Default expectation matches the audience flexily is most likely to ship to (web/canvas/multi-target, not React-Native-style rigid mobile UIs).

## Design — implementation surface

`Node.create()` is the bare factory (used directly in tests/benchmarks). Two paths:

1. **Module-level config**: `createFlexily({ defaults })` sets a module-level `_currentDefaults` ref; `Node.create()` reads it. Simple, but tests using bare `Node.create()` outside `createFlexily` get the module default.
2. **Per-Node override**: `Node.create({ defaults: "yoga" })`. More verbose but stateless.

Best balance: both. Module-level via `createFlexily`; per-Node override for tests + ad-hoc trees. Yoga compat tests in flexily pass `{ defaults: "yoga" }` explicitly so they continue to test Yoga-compat behavior.

## Empirical migration cost (unchanged from earlier analysis)

- flexily test suite: 10 fails (4 trivial + 5 real layout regressions documenting old behavior + 1 zero-size). The 5 layout regressions get re-classified as Yoga-compat tests after the preset lands — they pass `{ defaults: "yoga" }`.
- silvery test suite: 155 fails / 5341 pass. Top clusters: ListView/VirtualList row tests (14), scroll dirty propagation (6), useBoxMetrics (4), termless (4), child scopes (4), useAgNode (3), catalog WCAG invariants (3).
- Inventory: 104 explicit `flexShrink={0}` (load-bearing today, load-bearing after flip), 46 explicit `flexShrink={1}` (redundant after flip).

## Migration plan (sequenced)

1. **Add `defaults` config to flexily** (`createFlexily` + `Node.create()` + module-level ref). No behavior change yet — `defaults: "yoga"` matches current behavior; `defaults: "css"` available but not yet default.
2. **Update flexily Yoga-compat tests** to pass `{ defaults: "yoga" }` explicitly. Verify they still pass.
3. **Audit silvery components**: explicit `flexShrink={0}` on truly-rigid widgets (ListView rows, VirtualList rows, scroll indicators, frame chrome).
4. **Audit @km/tui**: same, for fixed-height bars and tree-node prefix Boxes.
5. **Add lint rule**: `<Box width={N}>` or `<Box flexBasis={N}>` without explicit `flexShrink` is suspicious.
6. **Flip default**: change `defaults` default from "yoga" → "css" in flexily.
7. **Run silvery tests**: target ≤30 failures (down from 155 after audits). Update the rest.
8. **Remove redundant `flexShrink={1}`**: 46 sites; cleanup pass.
9. **Reframe Prose**: from "required wrap container" → optional typography primitive. Update docstring + silvery CLAUDE.md.
10. **Update flexily docs**: "Intentional Divergences from Yoga" table — note CSS defaults with Yoga preset opt-in.
11. **Stage as silvery 1.0 boundary commit**: changelog, codemod (`bun batch-refactor` script that adds `flexShrink={0}` adjacent to fixed-size Box props).

## Risk mitigators

- **Worktree the audit + flip together**: don't ship flip without audits or you get the 155-failure mess in main.
- **Visual regression test pass post-audit**: silvercode visual suite + @km/tui termless tests catch UI regressions unit tests miss.
- **Codemod for the migration**: reviewable per-file diff; not magical.
- **Yoga preset stays available indefinitely**: zero pressure to remove it. flexily continues to be drop-in for Yoga consumers via one opt-in flag.

## Why the earlier "defer" recommendation was wrong

I framed silvery as a TUI library (rigid widgets are common) and concluded the migration cost wasn't worth it. The reframe corrected two things:
1. silvery is a multi-target design system, not a TUI library. CSS default is the multi-target-correct answer.
2. The common case is rich text that wants to wrap, not rigid widgets. The current default makes the common case wrong-by-default.
3. Yoga compat as an options object eliminates the "we'd lose Yoga-API parity" trade-off entirely — Yoga consumers opt in once, no per-Node migration.

The cost amortizes; the benefit compounds; the divergence has an escape hatch.

## Parent

@km/silvercode/wrap-ergonomic (P1 epic) — Phase 1 (wrap-measurement) closed, Phase 2 (Prose) shipped. This Phase 3 closes the wrap-ergonomic story by demoting Prose from required wrapper → optional sugar.