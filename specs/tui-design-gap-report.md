# TUI Design System Gap Report

**Generated**: 2026-01-15
**Spec Reference**: [km-design-system.md](km-design-system.md)

## Summary

Overall, the implementation is **well-aligned** with the design system spec. Most core visual patterns are correctly implemented. This report documents specific gaps and deviations found during analysis.

---

## ✅ Compliant Areas

### Selection Colors

- **Card borders**: Correctly use `cyanBright` for selected, `blackBright` for unselected (Board.tsx:214)
- **Status icons**: All 5 status icons match spec (○ gray, ◐ yellow, ⊘ red, ✓ green, ∅ gray)
- **Due date underlines**: Correctly implement urgency-based RGB underlines (TreeNode.tsx:150-159)

### Column Headers

- **Selected**: Yellow + bold ✓
- **Unselected**: Yellow bright + dimmed ✓
- **Column-owned colors**: Override yellow when present ✓

### Done/Dropped Styling

- **Dimmed + strikethrough**: Correctly applied for done/dropped tasks (TreeNode.tsx:219-225)

### UI Chrome

- **Scroll indicators**: Gray background with white text ✓
- **Column separators**: Gray │ character ✓

---

## ⚠️ Gaps Found

### 1. Selection Background Color Mismatch (HIGH)

**Spec says**:

> `cyan` bg + `black` fg for Selection (all) - Cursor, focused item, multi-select

**Implementation** (TreeNode.tsx:208-213):

```tsx
if (isSelected) {
  backgroundColor = "blue"; // ❌ Should be "cyan"
  textColor = "white"; // ❌ Should be "black"
} else if (isMultiSelected) {
  backgroundColor = "cyan"; // ✓ Correct
  textColor = "black"; // ✓ Correct
}
```

**Gap**: Single selection uses **blue bg / white fg** instead of **cyan bg / black fg**. Multi-select is correct.

**Impact**: Visual hierarchy is inconsistent - single selection looks different from multi-selection when both should use cyan.

**Files to fix**: [TreeNode.tsx:208-213](../apps/km-cli/src/tui/views/TreeNode.tsx#L208-L213)

---

### 2. Column Header Selection Background (MEDIUM)

**Spec says**:

> Panel-Level Focus: Active panel border = `cyanBright`, header = `yellow`, `bold`

**Implementation** (ColumnsView.tsx:119-121):

```tsx
backgroundColor={
  isColumnHeaderSelected ? "blue" : ownColor ? ownColor : undefined
}
```

**Gap**: Column header uses **blue** background when selected, not documented in spec. Spec mentions yellow text + bold for active column, but doesn't specify background color for column-level selection.

**Recommendation**: Clarify in spec whether column headers should have a background color when selected at column level, or update implementation to match item selection (cyan bg).

**Files**: [ColumnsView.tsx:119-121](../apps/km-cli/src/tui/views/ColumnsView.tsx#L119-L121), [ListView.tsx:92](../apps/km-cli/src/tui/views/ListView.tsx#L92), [TabsView.tsx:116](../apps/km-cli/src/tui/views/TabsView.tsx#L116)

---

### 3. Top Bar / Breadcrumb Colors Not Implemented (LOW)

**Spec says**:

> - Board path: `black` text on `white` background
> - Item path (within board): `blue` text on `white` background
> - Boundary separator: `blue` bold

**Current**: Top bar shows "Next Actions / Tasks ready to work on now." but doesn't appear to use the specified color scheme (appears as default text color on dark background).

**Impact**: Minor - breadcrumb is functional but lacks visual distinction specified in spec.

**Files to investigate**: Board.tsx top bar rendering

---

### 4. Dialog Border Color Inconsistency (LOW)

**Spec says**:

> Dialog border: `cyan`

**Implementation varies**:

- DetailPane.tsx: `borderColor="cyan"` ✓
- ProjectPicker.tsx: `borderColor="cyan"` ✓
- HelpOverlay.tsx: `borderColor="cyan"` ✓
- NewItemDialog.tsx: `borderColor="green"` ❌

**Gap**: NewItemDialog uses green border instead of cyan.

**Files to fix**: [NewItemDialog.tsx:166](../apps/km-cli/src/tui/views/NewItemDialog.tsx#L166)

---

### 5. GTD Board Colors in colors.ts (INFO)

**Spec says**:

> The app does not assign default colors to GTD boards (inbox, next, etc). Users can customize via `color=` attribute in headings.

**Implementation** (colors.ts:14-22):

```ts
export const GTD_BOARD_COLORS: Record<string, string> = {
  inbox: "white",
  next: "cyan", // ⚠️ cyan is reserved for selection
  waiting: "yellow",
  someday: "gray",
  done: "green",
  dropped: "gray",
  blocked: "red",
};
```

**Observations**:

1. Spec says "does not assign" but code defines defaults
2. `next: "cyan"` conflicts with spec's reserved color rule ("cyan background for selection only")

**Recommendation**: Either remove GTD_BOARD_COLORS or update spec to document this exception. Consider changing `next` to a different color to avoid cyan conflict.

**Files**: [colors.ts:14-22](../apps/km-cli/src/text/colors.ts#L14-L22)

---

### 6. Tabs View - Missing Tab Selection Highlight (MEDIUM)

**Spec (Component Guidelines > Column Headers)**:

> isSelected → color="yellow", bold={true}

**Visual inspection**: In Tabs view, the active tab shows yellow text correctly, but when at column-level selection, tabs use blue background similar to column headers elsewhere.

**Gap**: Tabs view styling is consistent with columns view but both deviate from spec's "cyan for selection" rule.

---

### 7. Input Fields - Picker Arrow Prefix (LOW)

**Spec says**:

> Selected item in picker: `cyan` bg, arrow prefix `▸`
> Unselected item: no prefix indent

**Not verified**: Would need to capture ProjectPicker dialog to verify arrow prefix implementation.

---

## 📊 Gap Summary Table

| Gap                  | Severity | Spec Section       | Current    | Expected                   | Files                                       |
| -------------------- | -------- | ------------------ | ---------- | -------------------------- | ------------------------------------------- |
| Selection bg color   | HIGH     | Selection Colors   | blue/white | cyan/black                 | TreeNode.tsx                                |
| Column header bg     | MEDIUM   | Panel-Level Focus  | blue       | cyan or none               | ColumnsView.tsx, ListView.tsx, TabsView.tsx |
| Top bar colors       | LOW      | Top Bar/Breadcrumb | default    | white bg + black/blue text | Board.tsx                                   |
| NewItemDialog border | LOW      | Dialogs            | green      | cyan                       | NewItemDialog.tsx                           |
| GTD cyan conflict    | INFO     | Reserved Colors    | next=cyan  | avoid cyan                 | colors.ts                                   |

---

## Recommendations

### Priority 1 (High Impact)

1. **Fix selection background**: Change `backgroundColor = "blue"` to `"cyan"` and `textColor = "white"` to `"black"` in TreeNode.tsx for single selection

### Priority 2 (Consistency)

2. **Unify column/tab selection**: Decide whether column-level selection should use cyan bg (matching item selection) or no background (text styling only), then update spec and code to match
3. **Fix NewItemDialog border**: Change from green to cyan

### Priority 3 (Polish)

4. **Implement top bar colors**: Add white background with black/blue text styling per spec
5. **Resolve GTD color conflict**: Either change `next` from cyan to another color, or update spec to note this exception

---

## Verification Method

Screenshots captured using headless ttyd + Playwright:

- Cards view, Columns view, Tabs view, List view
- Located in `/tmp/gap-analysis/`

Code analysis performed on:

- TreeNode.tsx, Board.tsx, ColumnsView.tsx, TabsView.tsx, ListView.tsx
- colors.ts, icons.ts
