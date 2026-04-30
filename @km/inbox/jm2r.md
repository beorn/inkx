---
id: "@km/inbox/jm2r"
aliases:
  - km-jm2r
  - "@km/_orphan/jm2r"
created_at: 2026-01-22T13:04:04Z
closed_at: 2026-01-22T13:19:05Z
---

# [x] curswant for visual node navigation @km/_orphan #feature #P3

Implement sticky cursor coordinates for **visual node navigation** (moving between cards/columns in the board) using **curswantX** and **curswantY**, matching how Vim preserves cursor position during navigation.

> **Scope:** This bead covers the **node cursor** (which card/column is selected). A future bead will cover the **text cursor** (character position within text editing), which will use the same curswant pattern.

## Background: Vim's curswant

Vim uses `curswant` ("cursor wanted column") to remember the desired x-coordinate during vertical navigation. When moving through lines of varying length, the cursor temporarily adjusts to shorter lines but snaps back to `curswant` on longer lines.

We apply this concept to **both axes** for node cursor navigation:
- **curswantY**: sticky y-coordinate for h/l (cross-column) navigation
- **curswantX**: sticky column index for j/k (board↔column) navigation

```typescript
interface BoardState {
  // Node cursor curswant (this bead)
  curswantX: number | null;  // sticky column index for board↔column navigation
  curswantY: number | null;  // sticky y-coordinate for cross-column navigation
  
  // Future: Text cursor curswant (separate bead)
  // textCurswantX: number | null;  // sticky column for j/k in text editing
}
```

---

## curswantX: Board ↔ Column Navigation

### Problem
When pressing k at column level to exit to board level, then j to re-enter:
- Current: always enters column 0
- Desired: remember which column you came from

### Behavior

**Setting curswantX:**
- k at column level → board level: set `curswantX` to current column index

**Using curswantX:**
- j at board level → column level: go to `curswantX` column (or first column if null)

**Resetting curswantX:**
- h/l at board level clears curswantX (explicit horizontal navigation)
- Any non-j/k action at board level clears curswantX

### Example
```
State          Action   Result              curswantX
─────          ──────   ──────              ─────────
cursor=[2]     k        cursor=[]           2 (set from col 2)
cursor=[]      j        cursor=[2]          2 (preserved)
cursor=[2]     j        cursor=[2,0]        null (entering card clears it)
cursor=[2,0]   k        cursor=[2]          null
cursor=[2]     k        cursor=[]           2 (set again)
cursor=[]      l        cursor=[]           null (h/l resets at board level)
cursor=[]      j        cursor=[0]          null (goes to first column)
```

---

## curswantY: Cross-Column Navigation

### Problem
Current cross-column navigation uses simple row index clamping:

```
Col A (3 cards)    Col B (2 cards)
───────────────    ───────────────
Card A0            Card B0
Card A1            Card B1  ← node cursor lands here
Card A2  ← node cursor
```

Pressing `l` from A2 goes to B1 (clamped from index 2). This ignores visual position.

### Behavior

**Setting curswantY:**
- First h/l press after any other action → set `curswantY` from current card's title y-coordinate
- `curswantY` = top of card title relative to column content area

**Using curswantY:**
- On h/l: find target card whose title y is closest to `curswantY`
- If target column is shorter, land on closest card (bottom)
- If target column is taller, restore to original visual level

**Resetting curswantY:**
- Any non-h/l action clears `curswantY`: j/k, Enter, Escape, mouse click, etc.

### Example
```
Col A    Col B    Col C        curswantY
──────   ──────   ──────       ─────────
Card 0   Card 0   Card 0       
Card 1   Card 1   Card 1       
Card 2 ← (empty)  Card 2       null (j/k navigation)
         ↓ l
Card 0   Card 0   Card 0       
Card 1 ← Card 1   Card 1       60px (set on first 'l')
Card 2   (empty)  Card 2       
         ↓ l
Card 0   Card 0   Card 0 ←     
Card 1   Card 1   Card 1       60px (preserved, lands at closest)
Card 2   (empty)  Card 2       
         ↓ h h
Card 0   Card 0   Card 0       
Card 1   Card 1   Card 1       
Card 2 ← (empty)  Card 2       60px (back in tall col, snaps to curswantY)
```

---

## Algorithm

```typescript
// curswantX: board ↔ column (node cursor)
function handleVerticalNav(state: BoardState, dir: 'up' | 'down'): BoardState {
  if (dir === 'up' && state.cursor.length === 1) {
    // k at column level → board level: remember column
    return { ...state, cursor: [], curswantX: state.cursor[0] };
  }
  
  if (dir === 'down' && state.cursor.length === 0) {
    // j at board level → column level: restore curswantX or default to 0
    const targetCol = state.curswantX ?? 0;
    return { ...state, cursor: [targetCol], curswantX: null };
  }
  
  // Other vertical nav clears curswantX
  return { ...state, ...normalNav(state, dir), curswantX: null };
}

// curswantY: cross-column (node cursor)
function handleCrossColumn(state: BoardState, dir: 'left' | 'right'): BoardState {
  // At board level: h/l clears curswantX (explicit horizontal movement)
  if (state.cursor.length === 0) {
    return { ...state, curswantX: null };
  }
  
  const targetColIndex = dir === 'left' ? colIndex - 1 : colIndex + 1;
  if (targetColIndex < 0 || targetColIndex >= columns.length) return state;
  
  const targetCol = columns[targetColIndex];
  
  // At column level: stay at column level
  if (state.cursor.length === 1) {
    return { ...state, cursor: [targetColIndex], curswantY: 0 };
  }
  
  // Set curswantY on first h/l (when null)
  const newCurswantY = state.curswantY ?? getCardTitleY(state.cursor);
  
  // Empty column: go to column header
  if (targetCol.cards.length === 0) {
    return { ...state, cursor: [targetColIndex], curswantY: newCurswantY };
  }
  
  // Find card closest to curswantY
  const targetCardIndex = findClosestCardByY(targetCol, newCurswantY);
  
  return {
    ...state,
    cursor: [targetColIndex, targetCardIndex],
    curswantY: newCurswantY,
  };
}
```

---

## Implementation Plan

### 1. Add curswant fields to BoardState
- `packages/km-board/src/board-types.ts`:
  ```typescript
  curswantX: number | null;  // column index for board↔column
  curswantY: number | null;  // y-coordinate for cross-column
  ```
- Initialize both as `null` in `createBoardState()`

### 2. Implement curswantX for board↔column navigation
- `packages/km-board/src/board-reducer-cursor.ts`:
  - k at column→board: set curswantX
  - j at board→column: use curswantX
  - Clear curswantX on other actions

### 3. Implement curswantY for cross-column navigation
- `packages/km-board/src/board-reducer.ts`:
  - Accept cardYPositions from UI layer
  - Set curswantY on first h/l
  - Find closest card by y-coordinate

### 4. Track card y-positions in render
- `apps/km-tui/packages/km-ink/src/views/Board.tsx` - collect y-positions
- `apps/km-tui/packages/km-ink/src/ui-context.tsx` - expose to reducer

### 5. Update documentation
- `docs/06-ui.md` - Add curswant section under "Visual Block Model"
  - Explain curswantX and curswantY for node cursor
  - Note future text cursor curswant
  - Reference Vim analogy
  - Document reset conditions

### 6. Add tests
- `packages/km-board/tests/curswant.test.ts`:
  - **curswantX tests:**
    - k at column sets curswantX
    - j at board uses curswantX
    - h/l at board clears curswantX
    - Other actions clear curswantX
  - **curswantY tests:**
    - First h/l sets curswantY
    - Consecutive h/l preserves curswantY
    - Moving to shorter column lands on closest card
    - Moving back to taller column snaps to curswantY
    - j/k clears curswantY

---

## Future: Text Cursor curswant (Separate Bead)

When we implement text editing, we'll have a **separate** text cursor with its own curswant:
- j/k moving through lines of varying length within a text field
- Preserve x-coordinate (character column) across short lines
- This is the original Vim `curswant` use case

The node cursor curswant (this bead) and text cursor curswant (future bead) are distinct concepts that happen to use the same pattern.

---

## Related

- Follows from @km/_orphan/fz2e (closed) which implemented basic cross-column navigation
- Vim curswant: https://til.hashrocket.com/posts/ve7bgff5hg
- Emacs goal column: https://www.masteringemacs.org/article/effective-editing-movement

---

## Acceptance Criteria

### curswantX (board ↔ column)
- [ ] k at column level sets curswantX to current column index
- [ ] j at board level uses curswantX (or defaults to 0)
- [ ] h/l at board level clears curswantX
- [ ] Entering a card (j from column) clears curswantX

### curswantY (cross-column)
- [ ] First h/l sets curswantY from current card
- [ ] Consecutive h/l preserves curswantY
- [ ] Moving to shorter column lands on closest card
- [ ] Moving back to taller column snaps to curswantY
- [ ] j/k clears curswantY
- [ ] Column-level h/l works (curswantY = 0)
- [ ] Empty column fallback to column header

### Documentation & Tests
- [ ] docs/06-ui.md updated with curswant section (node cursor)
- [ ] packages/@km/_orphan/board/tests/curswant.test.ts exists with full coverage