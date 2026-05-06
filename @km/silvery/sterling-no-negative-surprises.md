---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-no-negative-surprises"
aliases:
  - km-silvery.sterling-no-negative-surprises
  - km-silvery-sterling-no-negative-surprises
created_by: claude:22c2717d
created_at: 2026-04-25T15:49:06Z
closed_at: 2026-04-25T16:38:06Z
close_reason: Closed
started_at: 2026-04-25T16:01:58Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.sterling-no-negative-surprises
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-25T08:49:19Z
    created_by: claude:22c2717d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.sterling
---

# [x] Sterling v1 completeness — no negative surprises @km/silvery #task #P1 @claude:22c2717d

blocks:: [[@km/all/sterling]]

Sterling v1 completeness — eliminate negative surprises before consolidating demos. Implements the design principle: every reachable API must work or fail at compile time with a teaching message. Sterling MAY exceed expectations (positive surprise) but MUST NEVER undershoot them (negative surprise).

## Why now

The Sterling design system is mostly shipped (data layer, derivation, 84-palette WCAG pass, adaptive lift), but a v1 audit (Pro+Kimi 2026-04-25) surfaced concrete negative-surprise risks that block the demo-consolidation work:

- Missing disabled token family (`fg-disabled`/`bg-disabled`/`border-disabled`) — adopters reach for them, get undefined
- Missing backdrop/scrim token — distinct from `bg-surface-overlay` (popover card bg)
- `InteractiveRole` type name is misleading (status family lacks the `fg.hover/active` it implies)
- Component prop name `tone` reads awkward on action components (`<Button tone="destructive">`)
- Component-specific value unions not enforced — `<Alert tone="destructive">` currently compiles
- ANSI16 quantization-collision risk untested across the 84 palettes
- `$fg-default` / `$bg-default` are inferred, not explicit public tokens

Without this work, `consolidate-design-demos` would ship a beautiful explorer of an incomplete system, then have to be refit.

## Decisions locked (2026-04-25)

1. **Component prop name: `variant`** (industry-standard; replaces `tone`). All status + action components use `variant`. Component-specific value unions enforce correctness.
2. **`destructive` is component-layer alias to `error` palette** — NOT a separate token role. No `theme.destructive`.
3. **Disabled-token derivation: composite-based** (Pro v2 review):
  - `fg-disabled = composite(fg-default @ 0.38, bg-surface-default)` clamped to ≥3:1 contrast
  - `border-disabled = composite(border-default @ 0.24, bg-surface-default)`
  - `bg-disabled = composite(border-default @ 0.12, bg-surface-default)`
  - **Disabled is a NEUTRAL family** (not "muted error" / "muted success")
4. **Backdrop derivation: composite-based, derived from canvas `$bg-default` not surface**:
  - `bg-backdrop = composite(black @ 0.40, $bg-default)`
  - ANSI16 fallback: snap to nearest darker distinct color
5. **Compat aliases for one cycle**: `type InteractiveRole = StatusRole` with `@deprecated` annotation; legacy `disabledfg` aliased to `fg-disabled`. Removed in next sweep.
6. **Acceptance: BOTH compile-time AND runtime guards**:
  - TS unions enforce correctness at compile time
  - Dynamic indexing (e.g., `theme[someKey]`) returns teaching error, not `undefined`

## Acceptance criteria

### A. Disabled token family

- [ ] `fg-disabled`, `bg-disabled`, `border-disabled` in `FlatToken` union
- [ ] `DisabledRole { fg, bg, border }` interface added; `Roles.disabled` field added
- [ ] Composite-based derivation per Decision 3
- [ ] inline.ts emits all three flat tokens
- [ ] Legacy `disabledfg` aliased to `fg-disabled` (single-cycle bridge)
- [ ] Test: disabled tokens differ from default ones; `fg-disabled` has ≥3:1 contrast vs `bg-surface-default`

### B. Backdrop / scrim token

- [ ] `bg-backdrop` in `FlatToken` union
- [ ] Distinct from `bg-surface-overlay` (popover card bg vs modal scrim)
- [ ] Composite-based derivation per Decision 4
- [ ] Documented in design-system.md §Surface section
- [ ] Test: `bg-backdrop ≠ bg-surface-default` AND `bg-backdrop ≠ bg-surface-overlay` in ≥80/84 palettes

### C. Rename `InteractiveRole` → `StatusRole`

- [ ] Type rename in types.ts
- [ ] All call sites updated (status roles: info/success/warning/error)
- [ ] Deprecation alias `type InteractiveRole = StatusRole` with `@deprecated` JSDoc
- [ ] No semantic change

### D. `tone` → `variant` prop migration + component-specific value unions

- [ ] Rename `_tone.ts` → `_variant.ts`; rename `toneFillTokens` → `variantFillTokens`, etc.
- [ ] Rename `tone` prop → `variant` across all components: Alert, Banner, Toast, InlineAlert, Callout, Badge, Button (currently uses tone)
- [ ] Component-specific value unions:
  - Alert/Banner/Toast/InlineAlert/Callout: `variant: "info" | "success" | "warning" | "error"`
  - Button/Link: `variant: "default" | "primary" | "destructive"`
  - Badge: status set (info/success/warning/error/neutral)
- [ ] Type test: `<Alert variant="destructive">` fails to compile
- [ ] Type test: `<Button variant="warning">` fails to compile
- [ ] All call sites in vendor/silvery/examples/, vendor/silvery/docs/, apps/@km/tui/src/ migrated
- [ ] Tests in vendor/silvery/tests/ui/ migrated

### E. ANSI16 quantization-collision regression test

- [ ] New test: vendor/silvery/tests/sterling/ansi16-collision.test.ts (must run < 2s)
- [ ] For each of 84 palettes, quantize Theme to ANSI16
- [ ] Assert `bg-surface-default ≠ bg-surface-subtle` in ≥80/84
- [ ] Assert `bg-error ≠ bg-warning` in ALL 84 (status colors must be distinct)
- [ ] Failures form known-collision allowlist documented in design-system.md (not build failures)

### F. `$fg-default` / `$bg-default` made explicit public tokens

- [ ] Add to FlatToken union if not already there
- [ ] inline.ts emits both as flat tokens
- [ ] Documented in design-system.md as "the unstyled defaults"
- [ ] @km/tui audit: any `theme.foreground`/`theme.background` direct usage → migrate to flat tokens

### G. Document the principle

- [ ] Add §"Asymmetric Surprise" to hub/silvery/design/v10-terminal/design-system.md
- [ ] Concrete examples: type-enforced unions, sensible defaults, traces, no-undefined contract
- [ ] Cross-link from this bead to the principle

### H. Runtime teaching errors

- [ ] Dynamic token indexing throws `TypeError` with valid set + "Did you mean …?" hint (NOT `undefined` fallback)
- [ ] Audit silvery codebase for `theme[…]` patterns; replace with typed accessor `getToken(name)`
- [ ] At least one test asserts the runtime error message format

## Out of scope (handled by `consolidate-design-demos`)

- tokenManifest.ts (foundational for docs but lives in Tier 2)
- Storybook feature absorption from design.tsx / theme.tsx
- gen-token-docs.ts script
- Deletion of duplicate apps

## Dependencies

- None blocking. Can ship in one session.
- Blocks: @km/silvery/consolidate-design-demos (must NOT start until this freezes)

