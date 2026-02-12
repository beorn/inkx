import { describe, test, expect } from "vitest"
import { beadsIssueSchema, parseBeadsIssueLine, parseBeadsIssuesJsonl } from "../src/schema.ts"

describe("beadsIssueSchema", () => {
  test("validates a minimal valid issue", () => {
    const issue = {
      id: "km-abc1",
      title: "Test issue",
      status: "open",
      priority: 2,
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
      priority: 1,
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
      priority: 2,
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
})

describe("parseBeadsIssueLine", () => {
  test("parses valid JSON line", () => {
    const line = JSON.stringify({
      id: "km-test",
      title: "Test",
      status: "open",
      priority: 2,
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
        priority: 1,
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
      }),
      JSON.stringify({
        id: "km-2",
        title: "Second",
        status: "closed",
        priority: 2,
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
        priority: 1,
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
})
