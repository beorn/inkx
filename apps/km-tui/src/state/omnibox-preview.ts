/**
 * Omnibox preview content — pure derivation of the "preview-as-selection"
 * pane content from the currently-highlighted row (km-tui.omnibox-preview-pane).
 *
 * Why pure: the row may be a command (registry-resident) or a node
 * (repo-resident). The row adapter (`commandToRow` / `nodeToRow`) has
 * already projected the domain object into the unified `OmniboxRowData`
 * shape, so the preview only needs to repackage what's already on the
 * row plus an "what Enter will do" summary derived from the effective
 * command.
 *
 * The view-layer (`PreviewPane` in UnifiedOmnibox.tsx) is a thin renderer
 * over `PreviewContent`. Keeping the derivation pure means tests can
 * assert on the structured content without instantiating React.
 */
import type { OmniboxRowData } from "../views/OmniboxRow.tsx"

/** Caller-supplied context for the "what Enter will do" summary. */
export interface PreviewContext {
  /**
   * The effective command id the omnibox would dispatch on Enter against
   * this row (e.g. `goto`, `move`, `create_at`). When undefined, the
   * preview falls back to the row's own kind heuristic ("command rows
   * run themselves; node rows go to default-command").
   */
  effectiveCommand?: string
}

/** Structured preview content — view layer renders this declaratively. */
export interface PreviewContent {
  kind: "command" | "node"
  /** Primary heading — usually the row's title. */
  title: string
  /**
   * Body lines. Order matters; first line is most prominent. For commands
   * this is the description; for nodes it's the breadcrumb / context.
   */
  lines: string[]
  /** Optional right-hint (keybinding for commands). */
  hint?: string
  /** "What Enter will do" summary — single line, pre-formatted. */
  summary: string
  /** Carries the row's disabled flag through so the renderer can dim. */
  disabled: boolean
}

/**
 * Derive preview content for the currently-highlighted row.
 *
 * Returns null when no row is selected (caller should hide the pane).
 */
export function previewForRow(row: OmniboxRowData | null, ctx: PreviewContext): PreviewContent | null {
  if (!row) return null

  const lines: string[] = []
  if (row.context && row.context.length > 0) lines.push(row.context)

  const summary = renderSummary(row, ctx)

  const content: PreviewContent = {
    kind: row.kind,
    title: row.title,
    lines,
    summary,
    disabled: row.disabled === true,
  }
  if (row.hint) content.hint = row.hint
  return content
}

/**
 * Render the "Enter will run X" string. Two cases:
 *
 *   - command row: Enter will run the command itself, regardless of the
 *     ambient effectiveCommand. Show the command id.
 *   - node row: Enter will run `effectiveCommand` (passed in by the
 *     connector — typically `goto` for default, or `move` for binary
 *     verbs that opened the omnibox via a verb chord).
 */
function renderSummary(row: OmniboxRowData, ctx: PreviewContext): string {
  if (row.kind === "command") {
    return `Enter runs ${row.id}`
  }
  const cmd = ctx.effectiveCommand ?? "default"
  return `Enter runs ${cmd} on this node`
}
