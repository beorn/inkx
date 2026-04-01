/**
 * Timestamp Preservation Tests (Markdown Layer)
 *
 * Verify that frontmatter dates and inline metadata dates are
 * correctly parsed into KNode created_at/updated_at fields.
 */

import { describe, test, expect } from "vitest"
import { parseMarkdownWithLinks } from "../src/ast2nodes.ts"

// ============================================================================
// Frontmatter → KNode timestamp tests
// ============================================================================

describe("frontmatter dates → KNode timestamps", () => {
  test("created_at from frontmatter created_at (ISO string)", () => {
    const md = `---
created_at: 2023-06-15T10:30:00Z
modified_at: 2024-01-20T14:00:00Z
---

# Test
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const fileNode = result.nodes[0]!

    expect(fileNode.created_at).toBe(new Date("2023-06-15T10:30:00Z").getTime())
    expect(fileNode.updated_at).toBe(new Date("2024-01-20T14:00:00Z").getTime())
  })

  test("created_at from frontmatter created (date-only string)", () => {
    const md = `---
created: 2025-01-08
---

# Test
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const fileNode = result.nodes[0]!

    // Date-only string: Date parses as midnight UTC
    expect(fileNode.created_at).toBe(new Date("2025-01-08").getTime())
  })

  test("modified_at from frontmatter modified (date-only string)", () => {
    const md = `---
modified: 2025-02-14
---

# Test
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const fileNode = result.nodes[0]!

    expect(fileNode.updated_at).toBe(new Date("2025-02-14").getTime())
  })

  test("created_at takes precedence over created", () => {
    const md = `---
created: 2020-01-01
created_at: 2023-06-15T10:30:00Z
---

# Test
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const fileNode = result.nodes[0]!

    // created_at should take precedence since ?? checks null/undefined, and
    // the code does data.created_at ?? data.created — if created_at exists, it wins
    expect(fileNode.created_at).toBe(new Date("2023-06-15T10:30:00Z").getTime())
  })

  test("no frontmatter dates → timestamps are Date.now()", () => {
    const before = Date.now()
    const md = `---
title: No Dates
---

# Test
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const after = Date.now()
    const fileNode = result.nodes[0]!

    expect(fileNode.created_at).toBeGreaterThanOrEqual(before)
    expect(fileNode.created_at).toBeLessThanOrEqual(after)
    expect(fileNode.updated_at).toBeGreaterThanOrEqual(before)
    expect(fileNode.updated_at).toBeLessThanOrEqual(after)
  })

  test("no frontmatter at all → timestamps are Date.now()", () => {
    const before = Date.now()
    const md = `# Test

Some content
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const after = Date.now()
    const fileNode = result.nodes[0]!

    expect(fileNode.created_at).toBeGreaterThanOrEqual(before)
    expect(fileNode.created_at).toBeLessThanOrEqual(after)
  })

  test("import frontmatter with created_at and modified_at (Asana import format)", () => {
    const md = `---
created_at: 2022-03-10
modified_at: 2023-11-05
imported_from: asana
---

# Project Tasks
`
    const result = parseMarkdownWithLinks(md, "/test/asana-import.md")
    const fileNode = result.nodes[0]!

    expect(fileNode.created_at).toBe(new Date("2022-03-10").getTime())
    expect(fileNode.updated_at).toBe(new Date("2023-11-05").getTime())
  })
})

// ============================================================================
// Inline metadata → KNode timestamp tests
// ============================================================================

describe("inline created:: metadata → KNode timestamps", () => {
  test("task with created:: gets that as created_at", () => {
    const md = `# Test

- [ ] Buy groceries created:: 2024-04-18
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const task = result.nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)!

    expect(task.created_at).toBe(new Date("2024-04-18").getTime())
  })

  test("task without created:: gets Date.now() as created_at", () => {
    const before = Date.now()
    const md = `# Test

- [ ] Buy groceries
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const after = Date.now()
    const task = result.nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)!

    expect(task.created_at).toBeGreaterThanOrEqual(before)
    expect(task.created_at).toBeLessThanOrEqual(after)
  })

  test("task with created:: and other metadata", () => {
    const md = `# Test

- [ ] Task due:: 2024-12-31 created:: 2024-01-15 completed:: 2024-12-30
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const task = result.nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)!

    expect(task.created_at).toBe(new Date("2024-01-15").getTime())
    // updated_at should still be Date.now() since there's no modified:: inline
    expect(task.updated_at).toBeGreaterThan(0)
  })

  test("non-task list items also parse created:: into timestamps", () => {
    // parseInlineProperties runs for ALL list items (task and non-task),
    // so created:: is parsed and used for created_at on any list item
    const md = `# Test

- Regular item created:: 2020-01-01
`
    const result = parseMarkdownWithLinks(md, "/test/file.md")
    const li = result.nodes.find((n) => n.type === "p" && n.item != null && !n.item?.task?.marker)!

    expect(li.created_at).toBe(new Date("2020-01-01").getTime())
  })
})
