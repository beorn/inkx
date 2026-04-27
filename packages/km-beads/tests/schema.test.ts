import { describe, test, expect } from "vitest"
import { beadsIssueSchema, parseBeadsIssueLine, parseBeadsIssuesJsonl } from "../src/schema.ts"

describe("beadsIssueSchema", () => {
  test("validates a minimal valid issue", () => {
    const issue = {
      id: "km-abc1",
      title: "Test issue",
      status: "open",
      priority: "P2",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
    }

    const result = beadsIssueSchema.safeParse(issue)
    expect(result.success).toBe(true)
  })

  test("validates a full issue with all fields", () => {
    const issue = {
      id: "km-xyz9",
      title: "Full issue",
      description: "A complete issue with all fields",
      status: "in_progress",
      priority: "P1",
      issue_type: "feature",
      created_at: "2024-01-15T10:00:00Z",
      created_by: "user",
      updated_at: "2024-01-16T10:00:00Z",
      closed_at: "2024-01-17T10:00:00Z",
      close_reason: "completed",
      blocked_by: ["km-dep1", "km-dep2"],
      blocks: ["km-other"],
      parent_id: "km-parent",
      labels: ["bug", "high-priority"],
      assignee: "developer",
      notes: "Some notes",
      body: "Extended body content",
      children: ["km-child1", "km-child2"],
    }

    const result = beadsIssueSchema.safeParse(issue)
    expect(result.success).toBe(true)
  })

  test("rejects invalid status", () => {
    const issue = {
      id: "km-abc1",
      title: "Test",
      status: "invalid_status",
      priority: "P2",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
    }

    const result = beadsIssueSchema.safeParse(issue)
    expect(result.success).toBe(false)
  })

  test("rejects missing required fields", () => {
    const issue = {
      id: "km-abc1",
      // missing title, status, priority, created_at, updated_at
    }

    const result = beadsIssueSchema.safeParse(issue)
    expect(result.success).toBe(false)
  })

  test("accepts deferred status emitted by `bd defer`", () => {
    const issue = {
      id: "km-tui.contact-short-names",
      title: "Test",
      status: "deferred",
      priority: 4,
      created_at: "2026-04-27T00:00:00Z",
      updated_at: "2026-04-27T00:00:00Z",
    }
    const result = beadsIssueSchema.safeParse(issue)
    expect(result.success).toBe(true)
  })

  test("accepts real bd export shape (priority as number, dependencies array)", () => {
    // Real shape emitted by `bd export -o issues.jsonl` (bd v1.0.0).
    // Captured from .beads/issues.jsonl on 2026-04-27 — see bead km-beads.cutover.
    const issue = {
      id: "km-silvercode.ambient-phase-1-thesis-proof",
      title: "Phase 1: empirical proof of boundary thesis on Anthropic (A vs B)",
      description: "See hub/silvercode/design/ambient-context-safety.md §4 Phase 1",
      status: "closed",
      priority: 0,
      issue_type: "task",
      assignee: "claude:4de4a3ab",
      owner: "bjorn@stabell.org",
      created_at: "2026-04-27T20:23:07Z",
      created_by: "claude:4de4a3ab",
      updated_at: "2026-04-27T20:39:19Z",
      started_at: "2026-04-27T20:23:14Z",
      closed_at: "2026-04-27T20:39:19Z",
      close_reason: "Phase 1 thesis-proof complete",
      dependencies: [
        {
          issue_id: "km-silvercode.ambient-phase-1-thesis-proof",
          depends_on_id: "km-silvercode.ambient-phase-0",
          dep_type: "blocks",
        },
      ],
      dependency_count: 1,
      dependent_count: 0,
      comment_count: 0,
      metadata: "{}",
      acceptance_criteria: "...",
      design: "...",
      notes: "...",
    }

    const result = beadsIssueSchema.safeParse(issue)
    expect(result.success).toBe(true)
  })
})

describe("parseBeadsIssueLine", () => {
  test("parses valid JSON line", () => {
    const line = JSON.stringify({
      id: "km-test",
      title: "Test",
      status: "open",
      priority: "P2",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
    })

    const result = parseBeadsIssueLine(line)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe("km-test")
    }
  })

  test("returns error for invalid JSON", () => {
    const result = parseBeadsIssueLine("not valid json")
    expect(result.success).toBe(false)
  })

  test("returns error for valid JSON with invalid schema", () => {
    const result = parseBeadsIssueLine('{"id": "test"}')
    expect(result.success).toBe(false)
  })
})

describe("parseBeadsIssuesJsonl", () => {
  test("parses multiple valid lines", () => {
    const content = [
      JSON.stringify({
        id: "km-1",
        title: "First",
        status: "open",
        priority: "P1",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
      }),
      JSON.stringify({
        id: "km-2",
        title: "Second",
        status: "closed",
        priority: "P2",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
      }),
    ].join("\n")

    const { issues, errors } = parseBeadsIssuesJsonl(content)
    expect(issues).toHaveLength(2)
    expect(errors).toHaveLength(0)
  })

  test("collects errors for invalid lines while parsing valid ones", () => {
    const content = [
      JSON.stringify({
        id: "km-1",
        title: "Valid",
        status: "open",
        priority: "P1",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
      }),
      "invalid json line",
      JSON.stringify({ id: "incomplete" }), // valid JSON, invalid schema
    ].join("\n")

    const { issues, errors } = parseBeadsIssuesJsonl(content)
    expect(issues).toHaveLength(1)
    expect(errors).toHaveLength(2)
    expect(errors[0]!.line).toBe(2)
    expect(errors[1]!.line).toBe(3)
  })

  test("handles empty content", () => {
    const { issues, errors } = parseBeadsIssuesJsonl("")
    expect(issues).toHaveLength(0)
    expect(errors).toHaveLength(0)
  })

  test("silently skips bd memory lines (`_type: 'memory'`) without flagging as errors", () => {
    const content = [
      JSON.stringify({
        id: "km-1",
        title: "Real issue",
        status: "open",
        priority: 1,
        created_at: "2026-04-27T00:00:00Z",
        updated_at: "2026-04-27T00:00:00Z",
      }),
      JSON.stringify({
        _type: "memory",
        key: "some-key",
        value: "some remembered fact",
      }),
    ].join("\n")

    const { issues, errors } = parseBeadsIssuesJsonl(content)
    expect(issues).toHaveLength(1)
    expect(errors).toHaveLength(0)
  })
})
