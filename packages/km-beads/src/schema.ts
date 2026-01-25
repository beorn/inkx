/**
 * Beads Issue Schema
 *
 * Zod schema for runtime validation of BeadsIssue JSON data.
 */

import { z } from "zod"

/**
 * Status values for beads issues
 */
export const beadsStatusSchema = z.enum([
  "open",
  "in_progress",
  "closed",
  "blocked",
])

/**
 * Beads issue schema for validating JSON from issues.jsonl
 */
export const beadsIssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: beadsStatusSchema,
  priority: z.number(),
  issue_type: z.string().optional(),
  created_at: z.string(),
  created_by: z.string().optional(),
  updated_at: z.string(),
  closed_at: z.string().optional(),
  close_reason: z.string().optional(),
  // Dependencies
  blocked_by: z.array(z.string()).optional(),
  blocks: z.array(z.string()).optional(),
  parent_id: z.string().optional(),
  // Metadata
  labels: z.array(z.string()).optional(),
  assignee: z.string().optional(),
  // Additional fields that may appear (notes from bd update)
  notes: z.string().optional(),
  body: z.string().optional(),
  children: z.array(z.string()).optional(),
})

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
 * Parse multiple lines of JSONL, collecting valid issues and errors.
 */
export function parseBeadsIssuesJsonl(content: string): {
  issues: BeadsIssue[]
  errors: Array<{ line: number; error: string }>
} {
  const lines = content.trim().split("\n").filter(Boolean)
  const issues: BeadsIssue[] = []
  const errors: Array<{ line: number; error: string }> = []

  for (let i = 0; i < lines.length; i++) {
    const result = parseBeadsIssueLine(lines[i]!)
    if (result.success) {
      issues.push(result.data)
    } else {
      errors.push({ line: i + 1, error: result.error })
    }
  }

  return { issues, errors }
}
