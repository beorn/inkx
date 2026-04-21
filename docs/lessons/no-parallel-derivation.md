# Lesson: No Parallel Derivation

## Incident

**`km-tui.column-top-disappears`** — April 2026. User reported: "top of column disappears on cursor-down, reappears on cursor-up." Then: "blank space at top of adjacent column at tall terminals." Then: "same bug, different shape, still there."

Five fix rounds before resolution:

1. Forward-walk height-aware (commit `435251de`)
2. Backward-walk scrollOffset alignment (rolled back — broke test 3)
3. Real-vault reproduction harness
4. Gap-accounting parity in window walks (commit `4779af71`)
5. Body-card row-budget clamp (commit `06e8c19`)

After each fix, the bug returned with a new terminal size × data distribution. The user's confirmation after fix #5: *"btw, i confirm that the bug is still there."*

## Root cause

Two systems were computing "what's visible in this scroll container" from the same tree:

| System | Space | Heights used | Output |
|---|---|---|---|
| `useVirtualizer` (React) | count-space | estimated `+` measured | `start`, `end`, `leadingHeight`, `trailingHeight` |
| `calculateScrollState` (ag-term layout-phase) | pixel-space | measured only | `firstVisibleChild`, `lastVisibleChild`, `scrollOffset`, `hiddenAbove`, `hiddenBelow` |

Neither subscribed to the other. They ran the same question through different math and hoped to arrive at the same answer. Under short-first-items + tall-viewport + variable heights, they'd disagree — the virtualizer would render a window that didn't fill the scroll container's viewport, producing blank rows.

## Why every fix failed

Each fix aligned the two systems' answers for one more input shape:

- Fix #1: forward walk agrees when items shorter than estimate
- Fix #4: gap accounting agrees when `(itemCount - 1) * gap` vs per-item `+ gap`
- Rolled-back A2a: tried to make virtualizer *use* layout's offset directly, but only halfway — the remaining divergence produced 59 blank rows

The problem wasn't the math in any one place. The problem was **two systems computing the same thing**.

## Resolution

`km-silvery.virtualizer-from-layout` — rewrite `useVirtualizer` as a consumer of `layout-signals`' scroll state. One computation, one source, no divergence.

Bootstrap (first render, before layout): use estimates. Steady state: read `useScrollState(containerNode)`, render items at the indices layout-phase just computed, compute `leadingHeight = sumHeights(0, firstVisible)` from the same measured heights layout-phase used. By construction, `leadingHeight == scrollOffset`.

## Takeaways

1. **When a bug has a 3+ round failure cycle, stop patching math.** Step back and ask: is this a single-owner bug, or a divergence between two owners? The former gets fixed in place. The latter gets fixed by eliminating one owner.
2. **"Two systems computing the same quantity" is a false redundancy.** It looks defensive; it's actually a bug factory — every edge case becomes a silent divergence.
3. **Invariants are cheaper than re-computing.** If two systems genuinely must compute independently, a STRICT-mode equality check costs ~one assertion per frame and catches divergence the moment it appears.
4. **Property tests cover the space; point tests cover instances.** Existing tests hardcoded `cols:60 rows:120` and `200×120`. User's bug appeared at `240×117`. Random-input property tests catch bugs that exist in the continuous parameter space between our point tests.

## Rule (in `principles.md`)

> Two systems must not independently compute the same derived quantity. Either share the source, or enforce runtime equality with a STRICT invariant.

## Related

- Principle: [No Parallel Derivation](../principles.md#no-parallel-derivation)
- Principle: [Signal Ownership](../principles.md#signal-ownership) — closely related, covers single-writer-per-signal within one process
- Beads: `km-tui.column-top-disappears`, `km-silvery.virtualizer-from-layout`, `km-silvery.implicit-invariants-audit`
