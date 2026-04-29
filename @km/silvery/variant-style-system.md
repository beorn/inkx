---
id: "@km/silvery/variant-style-system"
aliases:
  - km-silvery.variant-style-system
  - km-silvery-variant-style-system
created_by: Bjørn Stabell
created_at: 2026-04-07T04:30:21Z
owner: bjorn@stabell.org
---

# [ ] Variant-based style system: leaves emit intent, composer resolves @km/silvery #feature #P2

## Why

@km/tui has recurring styling consistency bugs because there is no single authority over a cell's final style. Style is composed implicitly from 4 independent sources (leaf fg, context override, parent bg, wrapping Box attrs), with 4 different enforcement points and no unified precedence order. Every new styling change risks interacting with the others in unexpected ways.

Most recent example (2026-04-06): @km/tui/broken-wikilink-no-cue fix applied `color={$error}` to unresolved wikilinks. Under the cursor, this red fg competed with cursor-inverse yellow, producing inconsistent rendering between cursor and non-cursor cells. Fixed narrowly by dropping fg and keeping only the dashed underline (cursor-safe decoration) — but the pattern will recur every time we add a new content marker.

Also in this /big analysis we found:
- `shouldStripColor` computed 4 different ways across TreeNode/NodeView/DetailView/shared-components
- colorOverride is fg-only; underline/dim/bold/bg bypass the override pipeline
- Hardcoded hex values (#404050 pill bg in InlineComponents.tsx:284) bypass theme tokens
- Enforcement is convention-only; no lint rule catches violations

## The reframe

Leaves should emit **semantic intent**, not concrete colors. A single composer in the theme turns `(variant, cell-state) → StyleSpec`. Cell state is READ (via a hook/context), not PASSED as props. Leaves never know whether they're under the cursor, in edit mode, in a selected card, etc.

```typescript
// Before (current):
<Text color={resolveColor(ctx, "$error")} underlineStyle="dashed" underlineColor="$error">
  {node.target}
</Text>

// After (variant system):
<Variant name="brokenLink">{node.target}</Variant>
// Theme resolves:
//   theme.variants.brokenLink.cursor  = { underlineStyle: "dashed", underlineColor: "$error" }  (no fg — cursor-safe)
//   theme.variants.brokenLink.normal  = { color: "$error", underlineStyle: "dashed", underlineColor: "$error" }
//   theme.variants.brokenLink.dim     = { dim: true, underlineStyle: "dashed" }
```

## Variant enum (draft)

Per inline node type: BrokenLink | Resolved | Mention | Tag | Project | Code | Error | InputField | Pill | Normal

Cell states: normal | cursor | selected | dim | done | dropped | edit

Each variant × state combination resolves to a StyleSpec in the theme. The leaf just picks the variant; state is derived from context.

## Why this belongs in silvery, not km

Variant-based styling is a general TUI problem, not a @km/_orphan/specific one. Any silvery app with inline content and cell states will hit the same wall. Ship in @silvery/theme so it's reusable.

## Scope (3-4 day refactor)

1. Define StyleSpec + VariantResolver types in @silvery/theme
2. Add variants.* tables to the default theme
3. Create <Variant> component in @silvery/ag-react that reads cell state via hook and resolves
4. Port each InlineComponents.tsx leaf to use <Variant>
5. Delete `colorOverride`, `shouldStripColor`, `resolveColor` — replace with variant+state
6. Unify the 4 `shouldStripColor` sites
7. Migrate one app (km) to prove it works
8. Document in vendor/silvery/docs/guide/styling.md

## Parent

@km/all/tea-machines (eventually — variants are a clean extension of the TEA state machine idea: style is a pure function of state)

## Related beads

- @km/tui/broken-wikilink-no-cue (closed; narrow fix this /big session)
- @km/infra/style-precedence-lint (enforce convention until variants land)
- @km/silvery/tint-inverse (color blending API — sibling foundation)