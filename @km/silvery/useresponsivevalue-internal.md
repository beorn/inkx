---
aliases:
  - km-silvery.useresponsivevalue-internal
  - km-silvery-useresponsivevalue-internal
created_at: 2026-05-06T23:59:12.717Z
closed_at: 2026-05-07T00:57:05.010Z
closeReason: Superseded — useResponsiveValue serves a distinct primitive use
  case beyond Box props (useResponsiveDisclosure consumes it for Zone string
  resolution). useResponsiveBoxProps is the canonical Box-prop sugar;
  useResponsiveValue stays as the primitive both depend on. Both remain public.
---

# [x] Silvery: demote useResponsiveValue from public export; useResponsiveBoxProps is canonical #P3

After `useResponsiveBoxProps` lands as the public ergonomic surface (silvery agent in flight), demote `useResponsiveValue` from the public namespace export. Keep the internal primitive — both hooks share resolver logic — but make `useResponsiveBoxProps` the only thing in the public docs.

## Why

`useResponsiveValue<T>(map)` resolves a value of arbitrary T against the breakpoint cascade. `useResponsiveBoxProps(map)` is the same shape but specialized to `Partial<BoxProps>` and feeds straight into `<Box {...display}>`. The latter is dramatically more ergonomic for the dominant use case (responsive layout primitives — the whole point of silvery's responsive-layout promise) and `useResponsiveValue` survives mostly as a generic primitive used internally by both.

Two public hooks for the same shape = double doc surface, double mental model. App authors shouldn't have to choose.

## Approach

1. After silvery agent ships `useResponsiveBoxProps`, audit `useResponsiveValue` exports.
2. Drop from `vendor/silvery/src/index.ts` namespace export.
3. Keep available internally for `useResponsiveBoxProps` and any framework-internal consumers.
4. Update `vendor/silvery/CLAUDE.md` § Responsive breakpoints — promote useResponsiveBoxProps as the canonical hook.
5. Update `vendor/silvery/docs/guide/responsive-layout.md` accordingly.

## Files in scope

- vendor/silvery/packages/ag-react/src/hooks/useResponsiveValue.ts (keep internal)
- vendor/silvery/src/index.ts (drop export)
- vendor/silvery/CLAUDE.md
- vendor/silvery/docs/guide/responsive-layout.md (silvery agent is creating this)

## Dependencies

- BLOCKED BY: silvery agent's `useResponsiveBoxProps` work (in flight as of 2026-05-06)

## Acceptance

- `useResponsiveValue` not in public namespace export
- Docs reference only `useResponsiveBoxProps` for app code
- No external app relies on `useResponsiveValue` (grep apps/silvercode + apps/km-tui to confirm)

Investigation 2026-05-07: useResponsiveValue serves a distinct use case from useResponsiveBoxProps — it's the primitive for any responsive non-Box-prop value (e.g. useResponsiveDisclosure resolves a Zone string). Real consumer in apps/silvercode/src/hooks/useResponsiveDisclosure.ts. Demoting it would break that hook. Closing as superseded — both useResponsiveValue (primitive) and useResponsiveBoxProps (Box-prop sugar) coexist as public; docs canonicalize useResponsiveBoxProps for Box-spread use case.

