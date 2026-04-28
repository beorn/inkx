import { describe, test, expect } from "vitest"
import { createIssueNode, updateIssueFields, closeIssueFields, dropIssueFields } from "../src/mutations.ts"
import type { Issue } from "../src/types.ts"

describe("createIssueNode", () => {
  test("creates a basic issue node", () => {
    const { node, shortId } = createIssueNode("Fix the login bug")

    expect(node.type).toBe("p")
    expect(node.item).toBeDefined()
    expect(node.item?.task?.status).toBe("todo")
    expect(node.item?.task?.marker).toBe("[ ]")
    expect(node.content).toContain("Fix the login bug")
    expect(node.content).toContain("@issue")
    expect(shortId).toMatch(/^km-[a-z0-9]{4}$/)
  })

  test("creates issue with type tag", () => {
    const { node } = createIssueNode("Fix the login bug", { type: "bug" })

    expect(node.content).toContain("#bug")
  })

  test("creates issue with priority", () => {
    const { node } = createIssueNode("Critical fix", { priority: "P0" })

    expect(node.content).toContain("#P0")
    expect(node.priority).toBe("P0")
  })

  test("creates issue with assignee", () => {
    const { node } = createIssueNode("Assigned task", { assignee: "alice" })

    expect(node.content).toContain("@alice")
    expect(node.data?.mentions).toContain("alice")
  })

  test("creates issue with custom ID", () => {
    const { shortId } = createIssueNode("Epic task", { customId: "auth-epic" })

    expect(shortId).toBe("km-auth-epic")
  })

  test("creates sub-issue with parent ID", () => {
    const { shortId } = createIssueNode("Sub task", { parentId: "km-epic" })

    expect(shortId).toMatch(/^km-epic\.\d+$/)
  })

  test("creates issue with labels", () => {
    const { node } = createIssueNode("Labeled task", {
      labels: ["urgent", "frontend"],
    })

    expect(node.content).toContain("#urgent")
    expect(node.content).toContain("#frontend")
  })

  test("defaults to P2 priority", () => {
    const { node } = createIssueNode("Normal task")

    expect(node.content).toContain("#P2")
    expect(node.priority).toBe("P2")
  })
})

describe("updateIssueFields", () => {
  const baseIssue: Issue = {
    id: "01ABC123",
    shortId: "km-abc1",
    title: "Test issue",
    status: "todo",
    priority: "P2",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  test("updates status to done", () => {
    const updates = updateIssueFields(baseIssue, { status: "done" })

    expect(updates.item?.task?.status).toBe("done")
    expect(updates.item?.task?.marker).toBe("[x]")
  })

  test("updates status to wip", () => {
    const updates = updateIssueFields(baseIssue, { status: "wip" })

    expect(updates.item?.task?.status).toBe("wip")
    expect(updates.item?.task?.marker).toBe("[/]")
  })

  test("updates status to blocked", () => {
    const updates = updateIssueFields(baseIssue, { status: "blocked" })

    expect(updates.item?.task?.status).toBe("blocked")
    expect(updates.item?.task?.marker).toBe("[!]")
  })

  test("updates status to dropped", () => {
    const updates = updateIssueFields(baseIssue, { status: "dropped" })

    expect(updates.item?.task?.status).toBe("dropped")
    expect(updates.item?.task?.marker).toBe("[-]")
  })

  test("updates priority", () => {
    const updates = updateIssueFields(baseIssue, { priority: "P1" })

    expect(updates.priority).toBe("P1")
  })

  test("updates title", () => {
    const updates = updateIssueFields(baseIssue, { title: "New title" })

    expect(updates.content).toBe("New title")
  })

  test("sets updated_at timestamp", () => {
    const before = Date.now()
    const updates = updateIssueFields(baseIssue, { status: "done" })
    const after = Date.now()

    expect(updates.updated_at).toBeGreaterThanOrEqual(before)
    expect(updates.updated_at).toBeLessThanOrEqual(after)
  })
})

describe("closeIssueFields", () => {
  test("closes issue with done status", () => {
    const updates = closeIssueFields()

    expect(updates.item?.task?.status).toBe("done")
    expect(updates.item?.task?.marker).toBe("[x]")
  })

  test("closes issue with reason", () => {
    const updates = closeIssueFields("Fixed in PR #123")

    expect(updates.data).toEqual({ closeReason: "Fixed in PR #123" })
  })

  // km-beads.close-drop-data-wipe — closing with a reason MUST preserve
  // existing data fields (id, aliases, short_id, mentions, tags). Without
  // currentData merging, partial-replace storage semantics wipe these
  // and the issue vanishes from short-id resolution.
  test("preserves existing data fields when closing with reason", () => {
    const currentData = {
      id: "01ABC123",
      aliases: ["foo/bar", "old-id"],
      short_id: "km-abc1",
      mentions: ["alice"],
      tags: ["bug", "P1"],
    }
    const updates = closeIssueFields("Fixed in PR #456", currentData)

    expect(updates.data).toEqual({
      id: "01ABC123",
      aliases: ["foo/bar", "old-id"],
      short_id: "km-abc1",
      mentions: ["alice"],
      tags: ["bug", "P1"],
      closeReason: "Fixed in PR #456",
    })
  })

  test("no data write when no reason, even with currentData (preserves existing blob untouched)", () => {
    const currentData = { id: "01ABC123", aliases: ["foo/bar"] }
    const updates = closeIssueFields(undefined, currentData)
    // Without a reason there's nothing to write — leaving updates.data
    // unset means storage's updateNode skips the data column entirely.
    expect(updates.data).toBeUndefined()
  })
})

describe("dropIssueFields", () => {
  test("drops issue with dropped status", () => {
    const updates = dropIssueFields()

    expect(updates.item?.task?.status).toBe("dropped")
    expect(updates.item?.task?.marker).toBe("[-]")
  })

  test("drops issue with reason", () => {
    const updates = dropIssueFields("No longer needed")

    expect(updates.data).toEqual({ dropReason: "No longer needed" })
  })

  // km-beads.close-drop-data-wipe — same invariant as closeIssueFields.
  test("preserves existing data fields when dropping with reason", () => {
    const currentData = {
      id: "01XYZ789",
      aliases: ["abandoned/feature"],
      short_id: "km-xyz9",
    }
    const updates = dropIssueFields("Superseded by km-abc1", currentData)

    expect(updates.data).toEqual({
      id: "01XYZ789",
      aliases: ["abandoned/feature"],
      short_id: "km-xyz9",
      dropReason: "Superseded by km-abc1",
    })
  })
})
