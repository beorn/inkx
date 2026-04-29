---
id: "@km/silvery/design-bake-flat-generic"
aliases:
  - km-silvery.design-bake-flat-generic
  - km-silvery-design-bake-flat-generic
created_by: claude:4274df30
created_at: 2026-04-20T17:07:28Z
closed_at: 2026-04-20T17:24:55Z
close_reason: "Shipped. Silvery: 8d4c34ac (feat(ansi): bakeFlat + FlattenRule),
  de2b3e3b (refactor(sterling): use defineDesignSystem auto-flatten, delete
  flatten.ts). km-docs: dab762447 (docs(sterling): flatten is a framework
  feature). Tests 215 → 232 (17 new). All sterling/theme tests green. Sterling
  consumers see identical behaviour; alternative systems now get flat-projection
  for free via defineDesignSystem({ flatten: true }) or custom FlattenRule."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.design-bake-flat-generic
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-20T10:07:43Z
    created_by: claude:4274df30
    metadata: "{}"
---

# [x] DesignSystem contract: generic bakeFlat helper for any token system @km/silvery #feature #P3

blocks:: [[@km/silvery]]

Make the Sterling-specific flat-projection-on-same-object feature universal to any DesignSystem. Currently Sterling's flatten logic lives inside Sterling's pipeline (packages/theme/src/sterling/flatten.ts). Any alternative DesignSystem (@silvery/design-material, etc.) would need to reimplement the walk-and-flatten.

Surfaced 2026-04-20 via user insight: 'the augmentWithSterling feature should probably be available to any token system we pass in, right?'

## Proposed

### 1. Public helper in @silvery/ansi

```ts
// @silvery/ansi/flatten.ts
export function bakeFlat<T extends object>(theme: T, rule?: FlattenRule): T {
  // Walks hex leaves in nested structure, writes flat keys onto same object
  // Freezes result
  // Default rule: {role}.{kind}.{state?} → {kind}-{role}-{state?} (channel-role-state)
}

export interface FlattenRule {
  (path: string[]): string  // Takes path like ['accent', 'hover', 'bg'], returns 'bg-accent-hover'
}
```

Exported from silvery barrel alongside quantizeHex + pickColorLevel.

### 2. Opt-in via defineDesignSystem

```ts
defineDesignSystem({
  name: 'material',
  flatten: true,              // use default rule
  // or:
  flatten: customRule,        // use system-specific rule
  // or:
  flatten: false,             // opt out (system bakes its own)
  // ... other DesignSystem fields
})
```

When `flatten` is true/custom, the framework auto-applies bakeFlat after each derivation method runs. System authors get flat+nested duality for free.

### 3. Refactor Sterling to use the generic helper

Sterling's private flatten.ts gets deleted; sterling.ts declares `flatten: true` with the channel-role-state default. Behavior unchanged.

## Why

- Unblocks @silvery/design-material (and any other alternative) from reimplementing the same walk
- Consolidates the three generic Theme walkers (bakeFlat, pickColorLevel, quantizeHex) in one package
- Makes DesignSystem contract clearly say 'flat access is a framework feature, not a Sterling feature'
- Per-system rule gives flexibility (Material's onPrimary vs Sterling's fg-on-accent)

## Acceptance

- @silvery/ansi exports bakeFlat + FlattenRule
- Sterling's flatten.ts deleted; sterling.ts opts in via flatten: true
- 219 Sterling tests still pass (identical behavior, just via the generic path)
- New test: defineDesignSystem({ flatten: customRule }) produces a Theme with the custom flat keys
- Documented in design-system.md §'Design-system contract' as an opt-in field

## Not in scope

- Changing Sterling's flatten rule (stays channel-role-state)
- Shipping @silvery/design-material itself (separate bead sterling-design-material)
- Per-system override behavior for pickColorLevel (it already walks generically via hex detection; unchanged)

## Depends on / blocks

- BLOCKED on: nothing (can land any time; doesn't touch the breaking 2e scope)
- RELATES to: sterling-design-material (validates the generic helper with a real second consumer)
- POST-PLATEAU: prefer to land after 0.19.0 so 2e doesn't have to rebase onto this

Parent: @km/silvery