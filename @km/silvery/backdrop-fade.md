---
id: "@km/silvery/backdrop-fade"
aliases:
  - km-silvery.backdrop-fade
  - km-silvery-backdrop-fade
created_by: Bjørn Stabell
created_at: 2026-04-18T06:09:47Z
closed_at: 2026-04-18T18:27:16Z
close_reason: "Shipped in v0.18.0: <Backdrop fade={n}> primitive + new pipeline
  backdrop-phase.ts + ModalDialog/PickerDialog default fade=0.4 + STRICT
  regression tests + ff768681 incremental-invariant fix (separates pre-fade
  carry-forward from post-fade paint). Tests pass at SILVERY_STRICT=2 with
  realistic 140+ node fixture. ANSI16 emits SGR 2; mono no-op."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.backdrop-fade
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T23:09:47Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Backdrop fade effect — render-time cell blend for modal backgrounds and drag overlays @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

Silvery needs a principled way to fade background content when a modal, popover, or drag overlay is active. Today apps either (a) do nothing (crisp content behind modal — distracting), (b) manually set $muted on children (brittle, doesn't compose), or (c) wrap in dim (unreliable, doesn't work at truecolor).

## Principle

Backdrop fade is a **render-time effect**, not a component concern. Analogous to CSS backdrop-filter: opacity(0.5). Components behind the backdrop render normally; the renderer applies a cell-level color transform to the backdrop's rect when painting.

## Behavior per tier

- **Truecolor / 256**: cell.fg = blend(cell.fg, cell.bg, fadeAmount). Deterministic hex output. Preserves hierarchy (muted fades less than primary — they shift toward bg by equal amount).
- **ANSI 16**: apply SGR 2 to the region. Best available (can't blend arbitrary hexes at 16 slots).
- **Monochrome**: no fade — modal's border and box-drawing characters carry separation visually.

## Modal default: fade ON

Every silvery modal component has backdrop fade ON BY DEFAULT:
- ModalDialog (and everything built on it): CommandPalette, Toast dialogs, confirm prompts
- PickerDialog
- Popover (when it dims the page behind a floating picker)
- Any future modal-shaped primitive

Apps don't opt in — the fade comes automatically when a modal is open. Escape hatch: `<ModalDialog fade={0}>` to disable for cases where the backdrop should stay crisp (rare — e.g., a modal that's actually a sidebar).

## API

```tsx
// Automatic: ModalDialog fades its backdrop by default
<ModalDialog open={isOpen}>
  <ModalContent>…</ModalContent>
</ModalDialog>

// Manual: Backdrop primitive for non-modal use cases (drag ghosts, popover shadows)
<Backdrop fade={0.5}>
  <Board />        {/* faded during drag */}
</Backdrop>
<DragGhost />      {/* crisp, on top */}

// Override: disable fade for specific modal (rare)
<ModalDialog open={isOpen} fade={0}>…</ModalDialog>
```

## Implementation

- New render phase between layout and output: apply cell transforms for <Backdrop> rects
- Transform is a fg-toward-bg blend using silvery/color's blend()
- Respects tier: blend at truecolor/256, SGR 2 at ANSI 16, passthrough at mono
- ModalDialog wraps its non-modal region in an implicit Backdrop
- Config: fade amount (default 0.4), per-tier override, disable flag for accessibility preference

## km migration

All km views must be audited + migrated away from ad-hoc dimming:

- [ ] apps/@km/tui: grep for dimColor / $muted-on-backgrounded-content / manual 'fade behind modal' patterns
- [ ] Audit every modal/dialog in km: rely on default fade, remove manual dimming
- [ ] Omnibox: verify the backdrop fades when it's open (board view behind it)
- [ ] UnifiedOmnibox, FavoritesDialog (if still exists), PickerDialog consumers, any modal or overlay
- [ ] @km/tui settings modals, confirm dialogs, help screens
- [ ] Delete any @km/_orphan/side 'DimmedContext' or equivalent workarounds
- [ ] Snapshot tests: modal-open state at each tier (truecolor / ANSI 16 / mono)

## Acceptance

- [ ] <Backdrop fade={0.5}> renders children normally with cell-level fade applied
- [ ] ModalDialog automatically fades its backdrop region when open (default ON)
- [ ] fade={0} prop disables the effect for specific modals
- [ ] Fade is deterministic at truecolor (same RGB output in every terminal)
- [ ] ANSI 16 fallback uses SGR 2 for region
- [ ] Monochrome gracefully skips (no fade emitted)
- [ ] Works with any content behind (images, ANSI-colored subprocess output, silvery components)
- [ ] Snapshot tests cover modal-with-backdrop at each tier
- [ ] km migration complete: no manual background-dimming in @km/tui views
- [ ] Documented in styling.md and hub/silvery/design/v10-terminal/terminal-color-strategy.md

## Why not alternatives

- **Wrap each child in dim** — couples fade to every component; components shouldn't know
- **Re-derive theme with reduced contrast** — too heavy; doesn't reach non-token hex (images, subprocess ANSI, user content)
- **App manually sets $muted on backgrounded content** — requires app-level coordination, brittle, doesn't compose with nested modals/popovers

Render-time transform is the equivalent of opacity in CSS: pure presentation, fully encapsulated.

Parent: @km/silvery/design-system
Related: @km/silvery/theme-dim-deprecate (this provides the answer to 'how do you dim' once dimColor is removed)
Reference: hub/silvery/design/v10-terminal/terminal-color-strategy.md
