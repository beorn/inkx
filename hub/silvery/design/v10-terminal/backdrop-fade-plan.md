# Backdrop fade — implementation plan

Bead: `km-silvery.backdrop-fade`
Parent: `km-silvery.design-system`
Spec: [terminal-color-strategy.md §Backdrop fade](./terminal-color-strategy.md)

## Principle

Backdrop fade is a **render-time cell transform**, not a component concern. Analogous to CSS `backdrop-filter: opacity(0.5)`. Components behind the backdrop render normally; the renderer applies a cell-level color transform on the finished buffer before the output phase diffs it.

## Semantics — two markers, one pass

Two props, both emitted as `data-backdrop-fade-*` attributes on `<silvery-box>` so they flow naturally into `AgNode.props` without touching `BoxProps`:

| Marker                            | Meaning                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `data-backdrop-fade={amount}`     | Fade the cells covered by THIS node's screen rect by `amount` (0..1). Use case: `<Backdrop>` wrapping content that should fade. |
| `data-backdrop-fade-excluded={amount}` | Fade every cell of the buffer EXCEPT those covered by this node's screen rect. Use case: modal dialog (fade everything behind it, keep the modal crisp). |

Both read by the backdrop pass. If multiple nodes carry markers, each applies independently. Overlapping transforms compose (cells faded twice are faded ~twice — acceptable, rare).

## Pipeline integration

A new pass sits between `renderPhase` and the output phase, applied in `ag.render()` in `ag.ts`:

```
measure → layout → scroll → sticky → scrollRect → notify
  → content (renderPhase) → decoration → [backdrop] → output
```

`backdrop-phase.ts` exports one function: `applyBackdropFade(root, buffer, caps)`.
- Walks the tree once, collects nodes with markers.
- For each, looks up `node.screenRect` (set by `scrollrectPhase`).
- Picks one of three strategies based on `caps.colorLevel`:
  - **truecolor / 256**: per cell, `cell.fg = blend(currentFg, currentBg, amount)` using `@silvery/color`'s `blend()` (OKLab). Also stamps the `dim` attribute so ANSI-palette cells without resolvable RGB still look softer.
  - **ansi16**: stamp `dim` attribute (SGR 2) on every cell in the region. Can't blend arbitrary palette slots.
  - **mono**: passthrough — the modal's border + box-drawing characters already carry visual separation.

The pass mutates a CLONE of the buffer in place. `renderPhase` remains deterministic; since both the incremental buffer and any fresh-render comparison run through the same pass, `SILVERY_STRICT=1` stays green (identical pre-transform → identical post-transform).

## Incremental correctness

`SILVERY_STRICT=1` compares: `renderPhase(clone of prev)` vs `renderPhase(null)`. Both produce the same buffer (renderPhase invariant). The backdrop pass runs AFTER `renderPhase`, once, on the final buffer — identical inputs on both sides means identical outputs.

What must be preserved:
- Pre-transform buffer is identical for incremental + fresh render (already true — renderPhase invariant).
- The pass operates on a FRESHLY CLONED buffer, not the stored `_prevBuffer` snapshot. `_prevBuffer` must hold the **pre-transform** buffer so incremental cloning + skipping continues to work.

**Subtle point:** The incremental cascade reads the prev buffer's pixels to decide whether to re-render. If `_prevBuffer` had FADED pixels (post-transform), the next frame's clone would have faded pixels, and fresh renders on top would show non-faded content in unaffected areas — mismatch.

Solution: `_prevBuffer = buffer` in `ag.ts` stays pre-transform. The backdrop pass clones that buffer before mutating and returns the clone. The clone is what gets painted; the pre-transform buffer is what gets stored for next-frame incremental.

## API

```tsx
// Manual
<Backdrop fade={0.5}>
  <Board />
</Backdrop>

// Automatic: ModalDialog fades its backdrop by default
<ModalDialog open>...</ModalDialog>                   // fade={0.4}
<ModalDialog open fade={0}>...</ModalDialog>          // disable
<ModalDialog open fade={0.6}>...</ModalDialog>        // custom

// Propagates through PickerDialog
<PickerDialog fade={0} title="..." items={...} />
```

## Files

- `vendor/silvery/packages/ag-react/src/ui/components/Backdrop.tsx` — new component
- `vendor/silvery/packages/ag-term/src/pipeline/backdrop-phase.ts` — new pass
- `vendor/silvery/packages/ag-term/src/ag.ts` — wire the pass into `doRender()`
- `vendor/silvery/packages/ag-term/src/pipeline/index.ts` — export
- `vendor/silvery/packages/ag-react/src/ui/components/ModalDialog.tsx` — add `fade` prop, emit `data-backdrop-fade-excluded`
- `vendor/silvery/packages/ag-react/src/ui/components/PickerDialog.tsx` — pass `fade` through
- `vendor/silvery/tests/pipeline/backdrop-fade.test.tsx` — STRICT regression test
- `vendor/silvery/packages/ag-react/tests/backdrop.test.tsx` — unit test

## Hard rules honored

- `blend()` from `@silvery/color` (OKLab) — not hand-rolled RGB.
- STRICT test written first, realistic fixture (50+ nodes).
- `_prevBuffer` holds the pre-transform buffer — incremental invariant preserved.
- Incremental = fresh output comparison: both run through the same pass, deterministic.
