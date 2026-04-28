/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Omnibox parse chips — derive a visible "what the parser understood"
 * legend from the current buffer.
 *
 * Bead: km-tui.omnibox-parse-chips. The /big + /pro research flagged
 * "hidden grammar accretion" as the top discoverability failure mode of
 * the unified omnibox: users won't find `[x]`, `"exact"`, `prop::value`
 * unless the UI teaches and echoes them back. Live parse chips are the
 * "visible narrowing legend" pattern from Emacs Consult and which-key.
 *
 * This module is a pure derivation — `(buffer) → Chip[]` — so the same
 * derivation can be:
 *   - rendered above the input by `UnifiedOmnibox`
 *   - asserted directly in unit tests
 *   - reused by other consumers (preview pane, debugging) without
 *     re-deriving from the parser tree.
 *
 * The design intentionally does NOT change the parser or the syntax;
 * it only surfaces parsed state to the user.
 */
import { parseQuery, type ParsedQuery, type QueryTerm, type QuerySigil } from "./omnibox-query-parser.ts"
import { modeOf, type OmniboxMode } from "./omnibox.ts"

/** A single visible chip in the parse-chip strip above the input. */
export interface Chip {
  /**
   * Stable key for React (sigil/term position is enough — the chip strip
   * never shows duplicates of the same sigil and the term order is
   * source-order from the parser).
   */
  key: string
  /**
   * Kind drives chip color/style. The seven kinds map onto the seven
   * visible families a user can express in the buffer:
   *
   * | kind         | example     | what it means                              |
   * |--------------|-------------|--------------------------------------------|
   * | command      | :move       | command-mode (`:` sigil)                   |
   * | context      | @me         | context sigil scope                        |
   * | tag          | #urgent     | tag sigil scope                            |
   * | project      | +km         | project sigil scope                        |
   * | node         | [foo        | regular-node sigil scope (non-task)        |
   * | local_find   | /todo       | in-pane find scope                         |
   * | task         | [] / [x] /… | bracket task filter                        |
   * | text         | foo         | smart match term (positive)                |
   * | phrase       | "foo bar"   | exact phrase                               |
   * | exclude      | -foo / !foo | negated term                               |
   */
  kind: "command" | "context" | "tag" | "project" | "node" | "local_find" | "task" | "text" | "phrase" | "exclude"
  /** What the chip displays — usually the verbatim source text. */
  label: string
  /**
   * Semantic theme token for the chip's foreground color. Background
   * decisions (border? badge bg?) live in the renderer; this is the
   * single dimension the kind→color mapping owns.
   */
  color: string
}

/**
 * Color map per chip kind. Uses semantic theme tokens so the chips
 * adapt to all 84 of silvery's color schemes. Sigil-family chips share
 * the same color as their typing-time prompt color where applicable
 * for visual consistency between "what you typed" and "what the
 * omnibox echoed back."
 */
const KIND_COLOR: Readonly<Record<Chip["kind"], string>> = Object.freeze({
  command: "$fg-accent",
  context: "$fg-accent",
  tag: "$fg-success",
  project: "$fg-info",
  node: "$fg-default",
  local_find: "$fg-warning",
  task: "$fg-success",
  text: "$fg-default",
  phrase: "$fg-info",
  exclude: "$fg-error",
})

const SIGIL_KIND: Readonly<Record<QuerySigil, Chip["kind"]>> = Object.freeze({
  "@": "context",
  "#": "tag",
  "+": "project",
  "[": "node",
})

const MODE_KIND: Readonly<Record<OmniboxMode, Chip["kind"] | null>> = Object.freeze({
  command: "command",
  context: "context",
  tag: "tag",
  project: "project",
  node: "node",
  local_find: "local_find",
  universal: null,
})

function chipFromTerm(term: QueryTerm, idx: number): Chip {
  if (term.negated) {
    const sign = term.negationChar ?? "-"
    return {
      key: `term-${idx}`,
      kind: "exclude",
      label: `${sign}${term.value}`,
      color: KIND_COLOR.exclude,
    }
  }
  if (term.kind === "phrase") {
    return {
      key: `term-${idx}`,
      kind: "phrase",
      label: `"${term.value}"`,
      color: KIND_COLOR.phrase,
    }
  }
  // A positive smart term may itself be a sigil-prefixed token if the
  // parser only consumed the leading sigil for the buffer head — terms
  // after a space (e.g. `[] @me urgent`) keep their sigil. Detect those
  // inline and surface them as the matching sigil-kind chip.
  const sigilFromTerm = sigilForTerm(term.value)
  if (sigilFromTerm) {
    return {
      key: `term-${idx}`,
      kind: SIGIL_KIND[sigilFromTerm],
      label: term.value,
      color: KIND_COLOR[SIGIL_KIND[sigilFromTerm]],
    }
  }
  return {
    key: `term-${idx}`,
    kind: "text",
    label: term.value,
    color: KIND_COLOR.text,
  }
}

function sigilForTerm(value: string): QuerySigil | null {
  if (value.length < 2) return null
  const head = value[0]!
  if (head === "@" || head === "#" || head === "+" || head === "[") return head
  return null
}

/**
 * Derive the chip strip from the current buffer. Pure; never throws.
 *
 * Order: sigil/mode chip first (if any), task-filter chip second (if any
 * and distinct from the sigil), then term chips in source order.
 *
 * Special case — bare sigil with no body (e.g. `:`, `@`, `[`): the chip
 * still shows the sigil so the user gets immediate feedback that they
 * are in the corresponding mode. The body is empty, so no term chips
 * follow.
 */
export function chipsFromQuery(buffer: string): Chip[] {
  if (buffer.trim().length === 0) return []

  const chips: Chip[] = []

  // 1. Mode chip — for `:` (command) and `/` (local_find), the mode is
  //    not stored in ParsedQuery; we read it directly from the buffer.
  //    The command body is the leading whitespace-bounded word; anything
  //    after the first space is processed as additional terms.
  const mode = modeOf(buffer)
  if (mode === "command" || mode === "local_find") {
    const kind = MODE_KIND[mode]!
    const trimmed = buffer.trimEnd()
    const firstSpace = trimmed.indexOf(" ")
    const head = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)
    const tail = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1)
    chips.push({
      key: `mode-${mode}`,
      kind,
      label: head,
      color: KIND_COLOR[kind],
    })
    if (tail.trim().length > 0) {
      // Re-parse the tail as a free-text query; its sigil/term chips
      // append after the command chip.
      const tailParsed = parseQuery(tail)
      pushSigilAndTerms(chips, tailParsed)
    }
    return chips
  }

  // 2. Bracket task filter — must be checked BEFORE sigil parsing, since
  //    the parser does the same precedence (`[]` is task, `[foo` is sigil).
  const parsed: ParsedQuery = parseQuery(buffer)
  if (parsed.taskFilter) {
    const taskLabel = extractTaskFilterLabel(buffer)
    chips.push({
      key: "task-filter",
      kind: "task",
      label: taskLabel,
      color: KIND_COLOR.task,
    })
  }

  pushSigilAndTerms(chips, parsed)

  return chips
}

/**
 * Push the sigil chip (if any) and the term chips for a `ParsedQuery` into
 * an existing chip list. Shared between the universal/sigil path and the
 * `:` command-mode path (which pre-consumes the command head).
 */
function pushSigilAndTerms(chips: Chip[], parsed: ParsedQuery): void {
  // Sigil chip (when not consumed by the task-filter).
  if (parsed.sigil && !parsed.taskFilter) {
    const kind = SIGIL_KIND[parsed.sigil]
    const body = firstPositiveSmartTerm(parsed)
    chips.push({
      key: `sigil-${parsed.sigil}`,
      kind,
      label: body !== null ? `${parsed.sigil}${body}` : parsed.sigil,
      color: KIND_COLOR[kind],
    })
  }

  // Term chips. When a sigil is present, the first positive smart term is
  // consumed into the sigil chip (`@me` is one chip, not `@` + `me`); all
  // remaining terms become their own chips.
  const sigilConsumesFirstSmart = parsed.sigil != null && !parsed.taskFilter
  let consumedFirstSmart = false
  parsed.terms.forEach((term, idx) => {
    if (sigilConsumesFirstSmart && !consumedFirstSmart && !term.negated && term.kind === "smart") {
      consumedFirstSmart = true
      return
    }
    chips.push(chipFromTerm(term, idx))
  })
}

/**
 * Extract the verbatim leading bracket-task token from the buffer.
 * Mirrors `BRACKET_TASK_FILTERS` keys in `omnibox-query-parser.ts` —
 * we re-recognize them here so the chip label preserves the user's
 * original spacing (`[ ]` vs `[]`).
 */
function extractTaskFilterLabel(buffer: string): string {
  const trimmed = buffer.trimStart()
  // Try the longer tokens first to avoid `[]` shadowing `[ ]`.
  const tokens = ["[ ]", "[x]", "[X]", "[/]", "[!]", "[-]", "[.]", "[]"]
  for (const tok of tokens) {
    if (trimmed === tok || trimmed.startsWith(tok + " ")) return tok
  }
  return trimmed.slice(0, 2) // fallback — shouldn't happen if parsed.taskFilter is set
}

function firstPositiveSmartTerm(q: ParsedQuery): string | null {
  for (const t of q.terms) {
    if (!t.negated && t.kind === "smart") return t.value
  }
  return null
}
