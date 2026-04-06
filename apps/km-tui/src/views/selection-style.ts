/**
 * Selection Styling Rules
 *
 * Codifies all visual treatment for selection/cursor state in km.
 * One place to understand, one place to change.
 *
 * ## Hierarchy
 *
 * Board → Column → Card → Sub-item
 *
 * ## Rules
 *
 * 1. CURSOR NODE TITLE: The node where the cursor IS gets inverse yellow
 *    on its title row only (headRowBg = $selection-bg, textColor = $selection).
 *    Inline colors are stripped for readability on the inverse bg.
 *
 * 2. CARD CONTAINER: When cursor is DIRECTLY on the card (not on a sub-item),
 *    the entire card gets a subtle primary bg tint (selectedBg = blend(bg, primary, 12%)).
 *    Sub-items keep their regular fg colors. When cursor is on a sub-item,
 *    only the sub-item title gets inverse — the card does NOT get the tint.
 *
 * 3. COLUMN CONTAINER: When cursor is at COLUMN level (not card level),
 *    the entire column gets the subtle bg tint. When cursor is at card level,
 *    the column does NOT get the tint.
 *
 * 4. BOARD CONTAINER: When cursor is at BOARD level, the entire board
 *    (including column titles) gets the subtle bg tint.
 *
 * 5. PARENT INDICATORS: Regardless of cursor depth:
 *    - Card border: yellow ($selection-bg) when card or descendant has cursor
 *    - Column title: yellow when any child has cursor
 *    - Column underline: yellow when any child has cursor
 *
 * 6. MULTI-SELECTION (isNodeSelected): Gets card bg tint from CardColumn,
 *    but NOT inverse on title. Only the direct cursor node gets inverse.
 *
 * 7. OVERFLOW INDICATORS: "+N more" inside cards uses dimColor (inherits
 *    card bg tint). "+N more" on card border also gets card bg tint.
 *
 * 8. DONE/DROPPED: Inline colors stripped, dimColor applied. Overrides
 *    selection styling (a done task under cursor still shows inverse title
 *    but its content colors are stripped regardless).
 *
 * ## Implementation Sites
 *
 * - tree-node-helpers.tsx: computeNodeStyle() — cursor inverse (rule 1)
 * - TreeNode.tsx: headRowBg/effectiveBg — title-only inverse (rule 1)
 * - TreeNode.tsx: shouldStripColor — inline color stripping (rules 1, 8)
 * - CardColumn.tsx Card: cardBg — card container tint (rule 2)
 * - CardColumn.tsx Card: borderColor — parent indicator (rule 5)
 * - CardColumn.tsx Column: columnBg — column container tint (rule 3)
 * - Board.tsx: boardBg — board container tint (rule 4)
 * - theme.ts: selectedBg() — computes the blend color
 *
 * ## Future
 *
 * When silvery ships `/ amount%` color blending (km-silvery.tint-inverse),
 * rules 2-4 become: backgroundColor="$primary / 12%" on the container Box.
 * No helper function, no useTheme().
 */

// This file is documentation + the test spec below.
// The actual styling logic lives in the files listed above.
// If you change selection styling, update BOTH the logic AND this spec.

/** Selection style rule identifiers — used in tests */
export const SELECTION_RULES = {
  CURSOR_INVERSE: "cursor-node-title-gets-inverse",
  CARD_TINT: "card-container-gets-bg-tint",
  COLUMN_TINT: "column-gets-tint-only-at-column-level",
  BOARD_TINT: "board-gets-tint-only-at-board-level",
  PARENT_BORDER: "parent-card-border-yellow-when-child-selected",
  MULTI_SELECT_NO_INVERSE: "multi-select-gets-tint-not-inverse",
  OVERFLOW_DIM: "overflow-indicators-use-dimColor",
  DONE_STRIP: "done-dropped-strips-colors",
} as const
