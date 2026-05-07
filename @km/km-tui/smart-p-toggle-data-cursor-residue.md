---
aliases:
  - km-km-tui.smart-p-toggle-data-cursor-residue
  - km-km-tui-smart-p-toggle-data-cursor-residue
created_at: 2026-05-07T06:48:06.108Z
---

# smart-p-toggle: data-cursor attribute residue when detail pane is open #bug #P2

**Symptom**: `apps/km-tui/tests/smart-p-toggle.test.ts` has 2 failing tests in the "cursor movement with detail pane" suite.

After: `toggle_detail_pane` → `cursor_left` (return to board) → `cursor_down`:
- `app.state.cursor` is correctly "card2" ✓
- `#card2[data-cursor]` exists ✓
- `#card1[data-cursor]` STILL exists ❌ — attribute residue from before cursor moved

**Class**: same shape as `@km/silvery/incremental-bg-residue-shrink-move` (just fixed) — but at the React-attribute layer, not the silvery-pipeline layer. data-cursor is a JSX attribute on `<Box>`; somehow it's rendering on the previous cursor's card despite the React tree being correct.

**Suspected root cause** (needs verification):
- BoardView's CardColumn renders card with `{...(isSelected && { "data-cursor": true })}` (CardColumn.tsx:462)
- `isSelected` comes from a signal/store subscription
- When cursor moves, the OLD card's component MAY not re-render to remove the attribute — JSX spread `{...(false && { ... })}` should produce no attribute, but if the prop spread is cached or the component is memoized incorrectly...

OR:
- `isSelected` semantically means "cursor is anywhere inside this card" not "cursor matches this exact node" — see CLAUDE.md gotcha
- After cursor moves to card2, both card1 (because old `isSelected` was true) and card2 (because new) might transiently both be considered cursor

**Investigation steps**:
1. Reproduce minimally: `bun vitest run apps/km-tui/tests/smart-p-toggle.test.ts -t "cursor movement with detail pane"`
2. Add `app.snapshotTree()` after each step to see the actual rendered DOM
3. Check `app.q("#card1[data-cursor]").count()` — how many matches? 1 (real bug) or 2 (selector matching DetailView too)?
4. Check git blame on CardColumn.tsx:462 and the `isSelected` derivation
5. Test WITHOUT the silvery case-2 fix (revert vendor/silvery to 27cb6dc6) to confirm pre-existence

**Files**:
- `apps/km-tui/src/views/CardColumn.tsx:462` — data-cursor write
- `apps/km-tui/src/views/DetailView.tsx:232,432,711` — three other data-cursor sites in detail pane (could collide on selector)
- `apps/km-tui/tests/smart-p-toggle.test.ts:71-100, 102-130` — failing tests

**Pre-existing**: confirmed by silvery agent's ablation (revert case-2 → tests still fail). Not caused by `@km/silvery/incremental-bg-residue-shrink-move`.
