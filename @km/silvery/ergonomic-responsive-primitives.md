---
_stub: true
id: "@km/silvery/ergonomic-responsive-primitives"
aliases:
  - km-kzfe
---


## Update 2026-05-06 — primitive layer added: useResponsiveDisplay

User question: "what about `const display = useResponsiveDisplay(...); <Box {...display}>`?"

That's the right primitive layer, and it should be the foundation everything else is built on.

### Layered surface

```tsx
// Layer 1 — primitive hook (BoxProps in, BoxProps out, breakpoint-aware)
const display = useResponsiveDisplay({
  default: { display: "none" },
  md: { position: "absolute", top: 0, right: 0, bottom: 0, width: 32 },
  lg: { flexBasis: 32, flexShrink: 0 },
})
<Box {...display} flexDirection="column">{children}</Box>

// Layer 2 — sugar component for the common case
<Aside side="right" mode={{ default: "hidden", md: "overlay", lg: "inline" }}>
  {children}
</Aside>

// Layer 3 — preset for the very-common case
<Aside side="right" preset="auto-panel">{children}</Aside>
```

Why all three coexist:

- `useResponsiveDisplay` is the primitive — composable with any `Box`, type-safe (BoxProps autocomplete inside each variant), works for any responsive layout decision (not just asides).
- `<Aside>` wraps the primitive with one named policy ("inline / overlay / hidden") to avoid drift across multiple aside consumers in an app.
- Preset hides the breakpoint map for the silvercode-scale common case.

### Implementation graph

- `useResponsiveDisplay(map)` reads `useContainer()` (deferred-rect, no feedback edge) and resolves `map[breakpoint]` to a `BoxProps` object. Calls `useResponsiveValue` internally — same machinery, narrower API surface.
- `<Aside mode>` calls `useResponsiveDisplay` with a built-in mode→props mapping (inline → flexBasis, overlay → absolute, hidden → display:none-or-width:0). Wraps `<Layer>` for overlay.
- `<Layer>` (new bead) — primitive for "render out of normal flow at parent-relative coordinates." Used by Aside-overlay AND Popover AND any future floating element. Sidesteps the "absolute overlap" risk by owning the geometry.

### Cons of `useResponsiveDisplay` (vs full component)

- No component-level encapsulation — every consumer re-types the responsive map. (Mitigation: ship `<Aside>` as the canonical sugar.)
- Doesn't structurally prevent "branch on display" — careless consumer can still write `display ? <A/> : <B/>`. (Mitigation: SILVERY_STRICT warning when render branches on a responsive-display value.)

These are real but governable. The pattern matches what `useResponsiveValue` already is — a primitive, with sugar layered on top.

### Add to acceptance criteria

- silvery exports `useResponsiveDisplay(map: Responsive<Partial<BoxProps>>): Partial<BoxProps>`.
- silvery exports `<Layer>` primitive (separate bead).
- `<Aside>` is implemented as a thin wrapper over `useResponsiveDisplay` + `<Layer>` for overlay modes.
- All three reach `useContainer()` deferred-rect from `@km/silvery/use-deferred-box-rect-and-post-commit-observers`.

