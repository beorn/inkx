---
mentions:
  - km
  - Bjørn
projects:
  - remount
id: "@km/silvery/renderer-reuse"
aliases:
  - km-silvery.renderer-reuse
  - km-silvery-renderer-reuse
created_by: Bjørn Stabell
created_at: 2026-04-09T14:30:52Z
closed_at: 2026-04-09T15:54:43Z
close_reason: createRenderer reuses via rerender() when dims match. Flat list 10
  flipped from Ink 1.18x to Silvery 3.53x. Commit a9e10f2b.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] createRenderer: reuse instance instead of unmount+remount @km/silvery #task #P0 @Bjørn Stabell

Straight win. createRenderer's wrapper currently does unmount+remount on every iteration instead of using rerender.

## Impact

- Closes the 1.15x cold render gap (flat list 10 items)
- Makes createRenderer behave as its name suggests (a reusable renderer)
- The current behavior is surprising — createRenderer seems designed to persist but actually recreates

## Root cause

vendor/silvery/packages/ag-term/src/renderer.ts:1127 createRenderer wrapper:

```typescript
return (element: ReactElement, overrides?: PerRenderOptions): App => {
  if (current) {
    try {
      current.unmount()  // ← THE BUG: destroys prior instance
    } catch {}
  }
  current = render(element, opts)  // ← creates fresh RenderInstance
  return current
}
```

Every call recreates:

- New RenderInstance with 14 fields
- New EventEmitter
- New React container via createContainer
- New fiberRoot via createFiberRoot
- Render leak detection scan
- Layout engine assertion

## Fix

Detect when the new call is compatible with the existing instance (same dimensions, same options) and call the instance's rerender() instead:

```typescript
return (element: ReactElement, overrides?: PerRenderOptions): App => {
  if (current && !overrides && isCompatible(current, baseOpts)) {
    current.rerender(element)
    return current
  }
  if (current) { try { current.unmount() } catch {} }
  current = render(element, opts)
  return current
}
```

When overrides change dimensions or options, fall back to unmount+remount.

## Effort

~4 hours. Changes test semantics slightly — some tests may rely on fresh instances. Need to verify test suite passes.

## Verification

- bun vitest bench vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts
- Expected: flat list 10 cold gap closes (from Ink 1.15-1.20x to parity or silvery wins)
- Expected: larger cold scenarios also improve
- Run all silvery tests: bun vitest run vendor/silvery/tests/

