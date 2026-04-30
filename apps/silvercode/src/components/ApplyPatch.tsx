/**
 * <ApplyPatch>
 *
 * Aider-style search/replace block renderer. Parallel to silvery's `<Diff>`
 * but distinct in shape: instead of a unified line-by-line diff, the model
 * emitted a SEARCH block and a REPLACE block, and the patch engine is
 * expected to find the SEARCH block in the file and substitute. Each
 * search/replace pair renders as two stacked code blocks separated by a
 * "→" rule.
 *
 * Use this when an `edit`-kind ACP `ToolCall` carries `rawInput` shaped as
 * Aider patches (`<<<<<<< SEARCH ... =======  ... >>>>>>> REPLACE` blocks)
 * rather than ACP's structured `Diff` content variant. silvercode's
 * `<Diff>` (re-exported from silvery) handles the structured-diff path;
 * `<ApplyPatch>` handles the search/replace path.
 *
 * Bead: km-silvercode.acp-tool-call.
 */

import React from "react"
import { Box, LineNumber, Muted, Text } from "silvery"

// =============================================================================
// Types
// =============================================================================

/** A single search/replace pair within a patch. */
export interface ApplyPatchHunk {
  /** Lines from the OLD file the patch is searching for. */
  search: ReadonlyArray<string>
  /** Lines that REPLACE the search target. */
  replace: ReadonlyArray<string>
  /** Optional descriptor — e.g. function name, header. */
  header?: string
}

export interface ApplyPatchProps {
  /** Optional file path label (rendered as `--- src/foo.ts`). */
  filePath?: string
  /** Search/replace pairs to render in order. */
  hunks: ReadonlyArray<ApplyPatchHunk>
  /** Show line-number gutter. Default true. */
  showLineNumbers?: boolean
}

// =============================================================================
// Component
// =============================================================================

export function ApplyPatch({ filePath, hunks, showLineNumbers = true }: ApplyPatchProps): React.ReactElement {
  // Width derives from the largest line index across all hunks (per-block,
  // 1-indexed within each search/replace block). LineNumber is right-aligned
  // so per-block indices align cleanly even across hunks of varying length.
  const maxN = hunks.reduce((m, h) => Math.max(m, h.search.length, h.replace.length), 1)
  const lineNumberWidth = String(maxN).length

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$border">
      {filePath ? <Muted>--- {filePath}</Muted> : null}
      {hunks.map((hunk, i) => (
        <Box key={i} flexDirection="column">
          {hunk.header ? <Muted>{`@@ ${hunk.header} @@`}</Muted> : null}
          {/* SEARCH block — red ($error) coloring, "<" marker. */}
          <Box>
            <Text color="$error" bold>
              &lt;&lt;&lt;&lt;&lt;&lt;&lt; SEARCH
            </Text>
          </Box>
          {hunk.search.map((line, j) => (
            <Box key={`s${j}`} flexDirection="row">
              {showLineNumbers ? <LineNumber n={j + 1} width={lineNumberWidth} /> : null}
              <Text> </Text>
              <Text color="$error">- {line}</Text>
            </Box>
          ))}
          {/* Divider — explicit "→" rule between SEARCH and REPLACE. */}
          <Box>
            <Muted>=======</Muted>
          </Box>
          {/* REPLACE block — green ($success) coloring, ">" marker. */}
          {hunk.replace.map((line, j) => (
            <Box key={`r${j}`} flexDirection="row">
              {showLineNumbers ? <LineNumber n={j + 1} width={lineNumberWidth} /> : null}
              <Text> </Text>
              <Text color="$success">+ {line}</Text>
            </Box>
          ))}
          <Box>
            <Text color="$success" bold>
              &gt;&gt;&gt;&gt;&gt;&gt;&gt; REPLACE
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

// =============================================================================
// Parser — extract ApplyPatchHunk[] from a raw Aider patch string.
// =============================================================================

/**
 * Extract `ApplyPatchHunk[]` from an Aider-style search/replace patch string.
 * The wire format produced by edit-tools that don't use ACP's structured
 * `Diff` content variant looks like:
 *
 * ```
 * <<<<<<< SEARCH
 * old line 1
 * old line 2
 * =======
 * new line 1
 * new line 2
 * >>>>>>> REPLACE
 * ```
 *
 * Tolerant of leading/trailing whitespace and line-ending variations. When
 * the input doesn't match the expected fence pattern, returns an empty
 * array — caller should fall back to a different renderer (raw text /
 * `<Diff>`).
 */
export function parseAiderPatch(raw: string): ApplyPatchHunk[] {
  const hunks: ApplyPatchHunk[] = []
  // Split into per-hunk segments. The fences are case-sensitive in Aider
  // but we accept any-case to absorb model-author drift.
  const pattern = /<{6,}\s*SEARCH\s*\n([\s\S]*?)\n={4,}\s*\n([\s\S]*?)\n>{6,}\s*REPLACE/gi
  let m: RegExpExecArray | null
  while ((m = pattern.exec(raw)) !== null) {
    const search = (m[1] ?? "").split("\n")
    const replace = (m[2] ?? "").split("\n")
    hunks.push({ search, replace })
  }
  return hunks
}
