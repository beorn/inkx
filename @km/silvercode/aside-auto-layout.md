---
_stub: true
id: "@km/silvercode/aside-auto-layout"
aliases:
  - delete-aside-layout
closed_at: 2026-05-07T00:59:57.805Z
closeReason: "Shipped 1a74f387d: AsideLayout auto-decides aside-vs-inline via
  useResponsiveBoxProps reading viewport breakpoint. Below md → flexDirection:
  column (aside stacks below main). At/above md → flexDirection: row (aside is
  right-side flex sibling). No mode enum, no overlay positioning, no
  useResponsiveDisclosure thread-through. Caller's job: presence (panel.open +
  tiny-terminal floor); component's job: layout. Stability tests 11/11 pass."
---

# [x] Silvercode: AsideLayout auto-decides aside-vs-inline (no mode enum) ^aside-auto-layout

Redesign `apps/silvercode/src/components/AsideLayout.tsx` so the component AUTO-DECIDES aside-vs-inline based on its own measured width. No `mode` enum. No `AsideMode` type. The caller writes one element with a breakpoint; the component coordinates the three layout concerns automatically.

## Why

The only reason `<AsideLayout>` should exist as a component (rather than just a Box pattern) is that the responsive aside-vs-inline decision requires three coordinated layout concerns:

1. Aside's position (`absolute` when room exists, otherwise inline flow)
2. Main's right-padding (reserved when aside is absolute, zero when inline)
3. Parent's `position="relative"` (always — free, but required for the aside's containing block)

If the caller has to do all three by hand, they get one wrong and the layout breaks. If the component handles all three automatically, the caller writes one element with a breakpoint and never thinks about it again.

The current `mode: "inline" | "overlay" | "hidden"` enum is the anti-pattern: it forces the caller to compute via `useResponsiveDisclosure` the very thing the component should be deciding from its own measured width. That's a leaky abstraction — the framework knows more than the caller about its own dimensions.

## API

```tsx
<AsideLayout aside={<Outline/>} breakpoint="md" asideWidth={32}>
  {chatStream}
</AsideLayout>
```

- `aside`: ReactNode | null. Null hides the aside entirely.
- `breakpoint`: `"sm" | "md" | "lg" | "xl"` or pixel number. Component reads its own measured width via deferred `useBoxRect` and picks aside-vs-inline.
- `asideWidth`: column count for the aside when promoted.
- (optional) `inlinePosition`: `"above" | "below"` — when demoted to inline, where the aside content lands relative to children. Default: `"above"`.

Above breakpoint:
- Aside renders as `position="absolute"` right-anchored sibling
- Main gets `paddingRight={asideWidth}` to leave room
- Parent is `position="relative"`

Below breakpoint:
- Aside renders inline (in default flow), no padding adjustment
- Main renders normally

## Approach

1. Drop `AsideMode` enum entirely.
2. Add `breakpoint` prop (default: `"md"`).
3. Use deferred `useBoxRect` (silvery agent's in-flight work) to read the layout container width — never re-read mid-batch.
4. Branch internally on `containerWidth >= breakpoint`. The branch produces different React subtrees, BUT both subtrees include the aside content (so unmount/remount cycles don't reset descendant `useBoxRect` state — the same lesson Content.Row learned).
5. Caller `App.tsx:1297` drops its `useResponsiveDisclosure` mode computation; just passes `aside` + `breakpoint`.

## Files in scope

- apps/silvercode/src/components/AsideLayout.tsx (rewrite, ~30 LOC)
- apps/silvercode/src/App.tsx (drop mode computation)
- apps/silvercode/storybook/* (update stories to show breakpoint behavior)

## Dependencies

- BLOCKED BY: silvery agent's deferred `useBoxRect` (in flight) — without it, the auto-decide loop ping-pongs near the breakpoint
- RELATED: `@km/silvercode/measurement-ceremony-collapse` — same root cause (measurement-aware components need stable measurements)

## Acceptance

- `AsideMode` symbol gone from apps/silvercode
- Caller writes `<AsideLayout aside={x} breakpoint="md">{main}</AsideLayout>` — no mode prop
- Real-TTY: aside auto-promotes/demotes smoothly when terminal is resized through the breakpoint, no flicker
- After deferred-rect: bead `@km/silvercode/post-resize-ui-stability` STRICT count stays low through breakpoint crossings

## Tracks

This supersedes the earlier "delete AsideLayout entirely" framing. User correction (2026-05-06): "the only reason to make Aside a component is to make it more ergonomic — render as aside if there's space, otherwise inline as body." The component IS the ergonomic primitive; the redesign is to make it self-deciding instead of mode-dispatching.

Redesign `apps/silvercode/src/components/AsideLayout.tsx` so the component AUTO-DECIDES aside-vs-inline based on its own measured width. No `mode` enum. No `AsideMode` type. The caller writes one element with a breakpoint; the component coordinates the three layout concerns automatically.

## Why

The only reason `<AsideLayout>` should exist as a component (rather than just a Box pattern) is that the responsive aside-vs-inline decision requires three coordinated layout concerns:

1. Aside's position (`absolute` when room exists, otherwise inline flow)
2. Main's right-padding (reserved when aside is absolute, zero when inline)
3. Parent's `position="relative"` (always — free, but required for the aside's containing block)

If the caller has to do all three by hand, they get one wrong and the layout breaks. If the component handles all three automatically, the caller writes one element with a breakpoint and never thinks about it again.

The current `mode: "inline" | "overlay" | "hidden"` enum is the anti-pattern: it forces the caller to compute via `useResponsiveDisclosure` the very thing the component should be deciding from its own measured width. That's a leaky abstraction — the framework knows more than the caller about its own dimensions.

## API

```tsx
<AsideLayout aside={<Outline/>} breakpoint="md" asideWidth={32}>
  {chatStream}
</AsideLayout>
```

- `aside`: ReactNode | null. Null hides the aside entirely.
- `breakpoint`: `"sm" | "md" | "lg" | "xl"` or pixel number. Component reads its own measured width via deferred `useBoxRect` and picks aside-vs-inline.
- `asideWidth`: column count for the aside when promoted.
- (optional) `inlinePosition`: `"above" | "below"` — when demoted to inline, where the aside content lands relative to children. Default: `"above"`.

Above breakpoint:

- Aside renders as `position="absolute"` right-anchored sibling
- Main gets `paddingRight={asideWidth}` to leave room
- Parent is `position="relative"`

Below breakpoint:

- Aside renders inline (in default flow), no padding adjustment
- Main renders normally

## Approach

1. Drop `AsideMode` enum entirely.
2. Add `breakpoint` prop (default: `"md"`).
3. Use deferred `useBoxRect` (silvery agent's in-flight work) to read the layout container width — never re-read mid-batch.
4. Branch internally on `containerWidth >= breakpoint`. The branch produces different React subtrees, BUT both subtrees include the aside content (so unmount/remount cycles don't reset descendant `useBoxRect` state — the same lesson Content.Row learned).
5. Caller `App.tsx:1297` drops its `useResponsiveDisclosure` mode computation; just passes `aside` + `breakpoint`.

## Files in scope

- apps/silvercode/src/components/AsideLayout.tsx (rewrite, ~30 LOC)
- apps/silvercode/src/App.tsx (drop mode computation)
- apps/silvercode/storybook/* (update stories to show breakpoint behavior)

## Dependencies

- BLOCKED BY: silvery agent's deferred `useBoxRect` (in flight) — without it, the auto-decide loop ping-pongs near the breakpoint
- RELATED: `@km/silvercode/measurement-ceremony-collapse` — same root cause (measurement-aware components need stable measurements)

## Acceptance

- `AsideMode` symbol gone from apps/silvercode
- Caller writes `<AsideLayout aside={x} breakpoint="md">{main}</AsideLayout>` — no mode prop
- Real-TTY: aside auto-promotes/demotes smoothly when terminal is resized through the breakpoint, no flicker
- After deferred-rect: bead `@km/silvercode/post-resize-ui-stability` STRICT count stays low through breakpoint crossings

## Tracks

This supersedes the earlier "delete AsideLayout entirely" framing. User correction (2026-05-06): "the only reason to make Aside a component is to make it more ergonomic — render as aside if there's space, otherwise inline as body." The component IS the ergonomic primitive; the redesign is to make it self-deciding instead of mode-dispatching.

