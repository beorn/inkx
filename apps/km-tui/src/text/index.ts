/**
 * Text Rendering Module (Layer 1 - Shared)
 *
 * This module provides shared text rendering utilities used by both
 * CLI commands and TUI components.
 *
 * ## Modules
 * - `rich` - ANSI string utilities (displayLength, stripAnsi)
 * - `icons` - Status and type icons
 * - `format` - Node formatting for display
 * - `inline-parser` - Markdown text → InlineNode[] AST
 * - `InlineComponents` - InlineNode[] → React JSX rendering
 */

// Text pipeline utilities (extractRefs, prettifyUrl, SIGIL_PATTERN)
// Now sourced from @km/text-render (extracted package — see km-shared.text-render-package).
export { extractRefs, prettifyUrl, SIGIL_PATTERN } from "@km/text-render"

// Icon utilities (moved from @km/tui-core)
export {
  getStatusIcon,
  getTypeIcon,
  getNodeIcon,
  getFoldMarker,
  FOLDED_MARKER,
  getTypeBullet,
  getCircleBullet,
  getColumnHeaderIcon,
  isSigilName,
  type StatusIcon,
} from "../icons.ts"

// Node formatting
export { formatNode, formatStatus, formatNodeBrief, formatCollapsedAncestor } from "./format.ts"

// Term primitives (re-exported from silvery)
export { createTerm, term, type Term, type StyleChain } from "@silvery/ag-react"

// Extended ANSI features (from @silvery/ag-term/ansi).
//
// Post km-silvery.underline-on-style (Phase 6 of the unicode plateau,
// 2026-04-23): the bare `curlyUnderline()` / `styledUnderline()` / etc.
// exports were folded into methods on `Term` (via `StyleChain`). Consumers
// write `term.curlyUnderline(x)` / `term.styledUnderline(...)` — caps are
// bound at Term construction.
export { hyperlink, type UnderlineStyle } from "@silvery/ag-term/ansi"

// Inline AST (parser + types) — extracted to @km/text-render so silvercode
// can consume them too. React components (InlineNodes/InlineText) stay in
// km-tui because they depend on view-tree concerns (Popover, AutolinksContext).
export { parseInlineText, parseToPlainText, inlineNodesToPlainText } from "@km/text-render"
export type { InlineNode, TextDecoration } from "@km/text-render"
export { computeSearchDecorations, computeSearchDecorationsFromSource } from "@km/text-render"
export { InlineNodes, InlineText, InlineRenderProvider, type InlineRenderContext } from "./InlineComponents.tsx"

// Board color system
export {
  GTD_BOARD_COLORS,
  getTermColor,
  normalizeBoardName,
  getBoardColorByName,
  colorize,
  themeFg,
  type TermColor,
} from "./colors.ts"
