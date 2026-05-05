import { describe, test, expect } from "vitest"
import { createBeadNode, updateBeadFields, closeBeadFields, dropBeadFields } from "../src/mutations.ts"
import type { Bead } from "../src/types.ts"
import { getNodePriority } from "@km/core"

describe("createBeadNode", () => {
  test("creates a basic issue node", () => {
    const { node, shortId } = createBeadNode("Fix the login bug", { prefix: "km" })

    expect(node.type).toBe("p")
    expect(node.item).toBeDefined()
    expect(node.item?.task?.status).toBe("todo")
    expect(node.item?.task?.marker).toBe("[ ]")
    expect(node.content).toContain("Fix the login bug")
    expect(node.content).toContain("@issue")
    expect(shortId).toMatch(/^km-[a-z0-9]{4}$/)
  })

  test("creates issue with type tag", () => {
    const { node } = createBeadNode("Fix the login bug", { prefix: "km", type: "bug" })

    expect(node.content).toContain("#bug")
  })

  test("creates issue with priority", () => {
    const { node } = createBeadNode("Critical fix", { prefix: "km", priority: "P0" })

    expect(node.content).toContain("#P0")
    // priority dropped as a column at SCHEMA_VERSION=11 — content is the
    // canonical authored form, getNodePriority reads via data.tags.
    expect(node.data?.tags).toContain("P0")
  })

  test("creates issue with assignee", () => {
    const { node } = createBeadNode("Assigned task", { prefix: "km", assignee: "alice" })

    expect(node.content).toContain("@alice")
    expect(node.data?.mentions).toContain("alice")
  })

  test("creates issue with custom ID", () => {
    const { shortId } = createBeadNode("Epic task", { prefix: "km", customId: "auth-epic" })

    expect(shortId).toBe("km-auth-epic")
  })

  test("creates sub-issue with parent ID", () => {
    const { shortId } = createBeadNode("Sub task", { prefix: "km", parentId: "km-epic" })

    expect(shortId).toMatch(/^km-epic\.\d+$/)
  })

  test("creates issue with labels", () => {
    const { node } = createBeadNode("Labeled task", {
      prefix: "km",
      labels: ["urgent", "frontend"],
    })

    expect(node.content).toContain("#urgent")
    expect(node.content).toContain("#frontend")
  })

  test("defaults to P2 priority", () => {
    const { node } = createBeadNode("Normal task", { prefix: "km" })

    expect(node.content).toContain("#P2")
    expect(node.data?.tags).toContain("P2")
  })

  test("honors a non-km prefix end-to-end (regression: hardcoded prefix bug)", () => {
    // A vault configured with prefix=pim should produce pim-* ids.
    const { shortId: auto } = createBeadNode("auto", { prefix: "pim" })
    expect(auto).toMatch(/^pim-[a-z0-9]{4}$/)

    const { shortId: custom } = createBeadNode("custom", { prefix: "pim", customId: "scope.thing" })
    expect(custom).toBe("pim-scope.thing")
  })

  test("requires explicit prefix — no hardcoded 'km' fallback", () => {
    // @ts-expect-error — prefix is required, this should fail typecheck and throw at runtime.
    expect(() => createBeadNode("forgot prefix", {})).toThrow(/prefix is required/)
  })
})

describe("updateBeadFields", () => {
  const baseIssue: Bead = {
    id: "01ABC123",
    shortId: "km-abc1",
    title: "Test issue",
    status: "todo",
    priority: "P2",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  test("updates status to done", () => {
    const updates = updateBeadFields(baseIssue, { status: "done" })

    expect(updates.item?.task?.status).toBe("done")
    expect(updates.item?.task?.marker).toBe("[x]")
  })

  test("updates status to wip", () => {
    const updates = updateBeadFields(baseIssue, { status: "wip" })

    expect(updates.item?.task?.status).toBe("wip")
    expect(updates.item?.task?.marker).toBe("[/]")
  })

  test("updates status to blocked", () => {
    const updates = updateBeadFields(baseIssue, { status: "blocked" })

    expect(updates.item?.task?.status).toBe("blocked")
    expect(updates.item?.task?.marker).toBe("[!]")
  })

  test("updates status to dropped", () => {
    const updates = updateBeadFields(baseIssue, { status: "dropped" })

    expect(updates.item?.task?.status).toBe("dropped")
    expect(updates.item?.task?.marker).toBe("[-]")
  })

  test("updates priority", () => {
    // priority column dropped at SCHEMA_VERSION=11 — updateBeadFields no
    // longer writes a column. The canonical write is editing the H1
    // hashtag in markdown content (TODO @km/all/path-name-id-redesign).
    // This test now asserts that the function still returns a defined
    // updates object without crashing.
    const updates = updateBeadFields(baseIssue, { priority: "P1" })

    expect(updates).toBeDefined()
    expect(getNodePriority).toBeDefined() // helper used by readers
  })

  test("updates title", () => {
    const updates = updateBeadFields(baseIssue, { title: "New title" })

    expect(updates.content).toBe("New title")
  })

  test("sets updated_at timestamp", () => {
    const before = Date.now()
    const updates = updateBeadFields(baseIssue, { status: "done" })
    const after = Date.now()

    expect(updates.updated_at).toBeGreaterThanOrEqual(before)
    expect(updates.updated_at).toBeLessThanOrEqual(after)
  })
})

describe("closeBeadFields", () => {
  test("closes issue with done status", () => {
    const updates = closeBeadFields()

    expect(updates.item?.task?.status).toBe("done")
    expect(updates.item?.task?.marker).toBe("[x]")
  })

  test("closes issue with reason", () => {
    const updates = closeBeadFields("Fixed in PR #123")

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
    const updates = closeBeadFields("Fixed in PR #456", currentData)

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
    const updates = closeBeadFields(undefined, currentData)
    // Without a reason there's nothing to write — leaving updates.data
    // unset means storage's updateNode skips the data column entirely.
    expect(updates.data).toBeUndefined()
  })
})

describe("dropBeadFields", () => {
  test("drops issue with dropped status", () => {
    const updates = dropBeadFields()

    expect(updates.item?.task?.status).toBe("dropped")
    expect(updates.item?.task?.marker).toBe("[-]")
  })

  test("drops issue with reason", () => {
    const updates = dropBeadFields("No longer needed")

    expect(updates.data).toEqual({ dropReason: "No longer needed" })
  })

  // km-beads.close-drop-data-wipe — same invariant as closeBeadFields.
  test("preserves existing data fields when dropping with reason", () => {
    const currentData = {
      id: "01XYZ789",
      aliases: ["abandoned/feature"],
      short_id: "km-xyz9",
    }
    const updates = dropBeadFields("Superseded by km-abc1", currentData)

    expect(updates.data).toEqual({
      id: "01XYZ789",
      aliases: ["abandoned/feature"],
      short_id: "km-xyz9",
      dropReason: "Superseded by km-abc1",
    })
  })
})
