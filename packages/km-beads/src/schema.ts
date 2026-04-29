/**
 * Beads Issue Schema
 *
 * Zod schema for runtime validation of BeadsIssue JSON data.
 */

import { z } from "zod"

/**
 * Status values for beads issues. "deferred" is emitted by `bd defer <id>`
 * for work intentionally pushed to a future date.
 */
export const beadsStatusSchema = z.enum(["open", "in_progress", "closed", "blocked", "deferred"])

/**
 * Dependency edge as emitted by bd v1.0+ in `bd export`.
 *
 * Real exports use the field name `type` (values: "blocks", "parent-child",
 * "related"). Earlier internal docs called it `dep_type`; we accept both for
 * back-compat and surface both via the typed inference.
 *
 * Real exports also carry `created_at`, `created_by`, and a `metadata` blob
 * per edge — preserved verbatim through migration so round-trip property
 * tests pass and downstream consumers can re-derive the bd graph.
 */
export const beadsDependencySchema = z.object({
  issue_id: z.string(),
  depends_on_id: z.string(),
  type: z.string().optional(),
  dep_type: z.string().optional(),
  created_at: z.string().optional(),
  created_by: z.string().optional(),
  metadata: z.string().optional(),
})

/**
 * Beads issue schema for validating JSON from issues.jsonl
 *
 * Reflects bd v1.0 export format (priority is numeric 0-4, dependencies live
 * in a `dependencies` array). Earlier bd versions used "P0"-"P4" strings and
 * separate blocked_by/blocks/parent_id fields — both shapes are accepted.
 */
export const beadsIssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: beadsStatusSchema,
  priority: z.union([z.number(), z.string()]),
  issue_type: z.string().optional(),
  created_at: z.string(),
  created_by: z.string().optional(),
  updated_at: z.string(),
  started_at: z.string().optional(),
  closed_at: z.string().optional(),
  close_reason: z.string().optional(),
  owner: z.string().optional(),
  // Dependencies — bd v1.0 emits `dependencies`; older exports used the trio below
  dependencies: z.array(beadsDependencySchema).optional(),
  blocked_by: z.array(z.string()).optional(),
  blocks: z.array(z.string()).optional(),
  parent_id: z.string().optional(),
  // Counters (bd v1.0)
  dependency_count: z.number().optional(),
  dependent_count: z.number().optional(),
  comment_count: z.number().optional(),
  // Metadata
  labels: z.array(z.string()).optional(),
  assignee: z.string().optional(),
  // Freeform JSON-encoded blob bd uses for plug-in extensions. Preserved
  // verbatim — never parsed or transformed during migration.
  metadata: z.string().optional(),
  // Set by `bd defer <id> --until <ISO>`; presence implies status=deferred.
  defer_until: z.string().optional(),
  // bd v1.0 work-graph annotation (e.g. "mutex" — ids that should not run in
  // parallel). Preserved as-is; km doesn't yet act on it.
  work_type: z.string().optional(),
  // Body content fields
  notes: z.string().optional(),
  body: z.string().optional(),
  acceptance_criteria: z.string().optional(),
  design: z.string().optional(),
  children: z.array(z.string()).optional(),
})

export type BeadsDependency = z.infer<typeof beadsDependencySchema>

/**
 * Type inferred from schema - use this instead of manual interface
 */
export type BeadsIssue = z.infer<typeof beadsIssueSchema>

/**
 * Parse a single line of JSONL and validate it as a BeadsIssue.
 * Returns null if parsing or validation fails.
 */
export function parseBeadsIssueLine(
  line: string,
): { success: true; data: BeadsIssue } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(line)
    const result = beadsIssueSchema.safeParse(parsed)
    if (result.success) {
      return { success: true, data: result.data }
    }
    return { success: false, error: result.error.message }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * `bd export` interleaves issues with `_type: "memory"` records produced by
 * `bd remember`. Shape: `{_type: "memory", key: <slug>, value: <text>}`.
 * Memories are surfaced separately (not as issues) and migrated into the
 * vault's `mem/` root.
 */
export const beadsMemorySchema = z.object({
  _type: z.literal("memory"),
  key: z.string(),
  value: z.string(),
})

export type BeadsMemory = z.infer<typeof beadsMemorySchema>

function isMemoryLine(parsed: unknown): boolean {
  return typeof parsed === "object" && (parsed as { _type?: unknown })?._type === "memory"
}

/**
 * Parse multiple lines of JSONL, collecting valid issues, memories,
 * and errors.
 */
export function parseBeadsIssuesJsonl(content: string): {
  issues: BeadsIssue[]
  memories: BeadsMemory[]
  errors: Array<{ line: number; error: string }>
} {
  const lines = content.trim().split("\n").filter(Boolean)
  const issues: BeadsIssue[] = []
  const memories: BeadsMemory[] = []
  const errors: Array<{ line: number; error: string }> = []

  for (const [i, line] of lines.entries()) {
    try {
      const parsed = JSON.parse(line)
      if (isMemoryLine(parsed)) {
        const memResult = beadsMemorySchema.safeParse(parsed)
        if (memResult.success) {
          memories.push(memResult.data)
        } else {
          errors.push({ line: i + 1, error: `memory: ${memResult.error.message}` })
        }
        continue
      }
    } catch {
      // fall through to parseBeadsIssueLine which will record the JSON error
    }

    const result = parseBeadsIssueLine(line)
    if (result.success) {
      issues.push(result.data)
    } else {
      errors.push({ line: i + 1, error: result.error })
    }
  }

  return { issues, memories, errors }
}
