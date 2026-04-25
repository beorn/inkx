/**
 * Selection + Inline Styling Rules — km-tui style system
 *
 * Codifies all visual treatment for selection/cursor state AND the precedence
 * order for composing cell styles in km. One place to understand, one place
 * to change. If you change any styling logic in km-tui, update this file too.
 *
 * Note: `$bg-selected` / `$fg-on-selected` / `$bg-inverse` / `$fg-on-inverse`
 * / `$fg-link` are Sterling flat tokens (silvery 0.19.x+). Matching nested
 * roles (`theme.selected`, `theme.inverse`, `theme.link`) are also available.
 *
 * ## Precedence: how a cell's final style is composed
 *
 * Four independent sources contribute to a cell's rendered output. They
 * compose in this fixed order — LATER layers override EARLIER layers for any
 * attribute they set:
 *
 * ```
 *   1. Content intent     — leaf components (InlineWikiLink, InlineCode, InlineMention, …)
 *                           emit color/underline/dim based on what the CONTENT means
 *                           (e.g. code → $border-default fg, broken link → dashed $fg-error underline)
 *
 *   2. Type state         — done/dropped tasks strip colors; headings get bold; body
 *                           items get dim. Applied via tree-node-helpers.computeNodeStyle().
 *
 *   3. Container state    — the cell's wrapping card/column/board tint when
 *                           cursor is at that level (subtle primary blend via selectedBg).
 *                           Applied via CardColumn.tsx / Board.tsx backgroundColor.
 *
 *   4. Cursor state       — the cursor NODE gets inverse-yellow head row
 *                           ($bg-selected bg + $fg-on-selected fg). This forces the fg
 *                           color across the entire cursor line, so leaves in this
 *                           cell MUST be cursor-safe (see "Cursor-safe leaves" below).
 * ```
 *
 * ## Cursor-safe leaves
 *
 * When a leaf component applies its own `color=` attribute, it competes with
 * the cursor inverse at layer 4. Two strategies:
 *
 * a) Use `color="inherit"` (the silvery cascade primitive) — the leaf walks
 *    the AgNode parent tree to find the nearest ancestor's resolved fg.
 *    Callers set `stripInlineColors: true` in `InlineRenderContext` to enable
 *    this on the whole inline subtree. The cursor row's `<Text color="$fg-on-selected">`
 *    ancestor provides the forced fg; when no ancestor has a color (done/dropped
 *    with no override), the leaf resolves to terminal default.
 *    This is the CURRENT model for most leaves.
 *
 * b) Don't set fg at all — use DECORATION attributes (underlineStyle,
 *    underlineColor, dim, italic) which pass through layer 4 unchanged
 *    because cursor inverse only forces fg/bg, not decorations. This is
 *    the RIGHT model for "broken wikilink", "external link", and any
 *    content marker that must be visible in ALL states.
 *
 * Rule of thumb: if the marker must be visible under the cursor, use
 * decoration (b). If the marker is informational and can be dimmed under
 * the cursor, use stripInlineColors (a).
 *
 * ## Known gaps in the current precedence model (tracked in km-silvery.variant-style-system)
 *
 * - `stripInlineColors` only handles fg. Decoration attributes (underline, dim,
 *   bold, bg) don't go through it — they pass through regardless. This is
 *   fine for the cursor-safe decoration rule above, but it means inconsistent
 *   enforcement: a leaf can hardcode `underlineStyle` and nothing can strip it.
 *
 * - `shouldStripColor` is computed 2 different ways across TreeNode and NodeView.
 *   They should share one helper.
 *
 * - Hardcoded hex values exist (e.g. `#404050` pill bg in InlineComponents.tsx).
 *   They bypass the theme token system and break dark/light mode consistency.
 *
 * - Enforcement is convention-only. There's no lint rule banning raw `color=`
 *   or requiring `stripInlineColors`. Tracked in km-infra.style-precedence-lint.
 *
 * ## Hierarchy
 *
 * Board → Column → Card → Sub-item
 *
 * ## Rules
 *
 * 1. CURSOR NODE TITLE: The node where the cursor IS gets inverse yellow
 *    on its title row only (headRowBg = $bg-selected, textColor = $fg-on-selected).
 *    Inline colors are stripped for readability on the inverse bg.
 *
 * 2. CARD CONTAINER: When cursor is anywhere in the card (directly on the card
 *    OR on a descendant sub-item), the entire card gets a subtle primary bg
 *    tint (selectedBg = blend(bg, primary, 12%)). This prevents zebra-pattern
 *    artifacts where some sub-item rows have bg and others don't.
 *
 * 3. COLUMN CONTAINER: When cursor is at COLUMN level (not card level),
 *    the entire column gets the subtle bg tint. When cursor is at card level,
 *    the column does NOT get the tint.
 *
 * 4. BOARD CONTAINER: When cursor is at BOARD level, the entire board
 *    (including column titles) gets the subtle bg tint.
 *
 * 5. PARENT INDICATORS: Regardless of cursor depth:
 *    - Card border: yellow ($bg-selected) when card or descendant has cursor
 *    - Column title: yellow when any child has cursor
 *    - Column underline: yellow when any child has cursor
 *
 * 6. MULTI-SELECTION (isNodeSelected): Gets a STRONGER primary bg tint than
 *    the card-level cursor tint — multiSelectedBg = blend(bg, primary, 14%),
 *    roughly double selectedBg's 6%. The stronger tint lets the user count
 *    selected items at a glance, even when some are inside a card that already
 *    has the subtle cursor-tint.
 *
 *    Sites:
 *    - Multi-selected cards (CardColumn.cardBg): entire card box uses
 *      multiSelectedBg(theme).
 *    - Multi-selected sub-items (TreeNode.headRowBg): the title row uses
 *      multiSelectedBg(theme) when isNodeSelected && !isSelected.
 *    - Cursor node stays inverse (rule 1); the cursor card still gets the
 *      stronger tint on its body when it is part of a multi-selection.
 *
 *    For ANSI-16 themes (no hex bg), multiSelectedBg falls back to "blackBright"
 *    so the marker remains visible (selectedBg returns undefined in ANSI-16).
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
 * - TreeNode.tsx: headRowBg/effectiveBg — title-only inverse (rule 1),
 *   multi-select tint for sub-items (rule 6)
 * - TreeNode.tsx: shouldStripColor — inline color stripping (rules 1, 8)
 * - CardColumn.tsx Card: cardBg — card container tint (rules 2, 6)
 * - CardColumn.tsx Card: borderColor — parent indicator (rule 5)
 * - CardColumn.tsx Column: columnBg — column container tint (rule 3)
 * - Board.tsx: boardBg — board container tint (rule 4)
 * - theme.ts: selectedBg() — 6% primary tint for cursor containers (rules 2-4)
 * - theme.ts: multiSelectedBg() — 14% primary tint for multi-selected (rule 6)
 *
 * ## Future
 *
 * When silvery ships `/ amount%` color blending (km-silvery.tint-inverse),
 * rules 2-4 become: backgroundColor="$fg-accent / 12%" on the container Box.
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
