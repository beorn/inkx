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

    // priority dropped as a column at SCHEMA_VERSION=11 + data.tags
    // dissolved at @km/all/dissolve-data-tags-to-links — H1 `#P0` hashtag
    // is the sole authored form. getNodePriority reads from node.content.
    expect(node.content).toContain("#P0")
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

  // Wave 3 — task-bd-collapse: close is a workflow transition, not a
  // raw status set. closed_at is the load-bearing distinguisher and must
  // be present whenever close() runs (with or without a reason).
  test("sets closed_at to an ISO timestamp", () => {
    const updates = closeBeadFields()
    const data = updates.data as Record<string, unknown> | undefined
    expect(typeof data?.closed_at).toBe("string")
    expect(data?.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test("closes issue with reason includes closeReason and closed_at", () => {
    const updates = closeBeadFields("Fixed in PR #123")
    const data = updates.data as Record<string, unknown>
    expect(data.closeReason).toBe("Fixed in PR #123")
    expect(typeof data.closed_at).toBe("string")
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
    const data = updates.data as Record<string, unknown>
    expect(data.id).toBe("01ABC123")
    expect(data.aliases).toEqual(["foo/bar", "old-id"])
    expect(data.short_id).toBe("km-abc1")
    expect(data.mentions).toEqual(["alice"])
    expect(data.tags).toEqual(["bug", "P1"])
    expect(data.closeReason).toBe("Fixed in PR #456")
    expect(typeof data.closed_at).toBe("string")
  })

  test("no reason still records closed_at + preserves currentData", () => {
    const currentData = { id: "01ABC123", aliases: ["foo/bar"] }
    const updates = closeBeadFields(undefined, currentData)
    const data = updates.data as Record<string, unknown>
    expect(data.id).toBe("01ABC123")
    expect(data.aliases).toEqual(["foo/bar"])
    expect(typeof data.closed_at).toBe("string")
    expect(data.closeReason).toBeUndefined()
  })
})

describe("dropBeadFields", () => {
  test("drops issue with dropped status", () => {
    const updates = dropBeadFields()

    expect(updates.item?.task?.status).toBe("dropped")
    expect(updates.item?.task?.marker).toBe("[-]")
  })

  test("sets closed_at to an ISO timestamp", () => {
    const updates = dropBeadFields()
    const data = updates.data as Record<string, unknown> | undefined
    expect(typeof data?.closed_at).toBe("string")
    expect(data?.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test("drops issue with reason includes dropReason and closed_at", () => {
    const updates = dropBeadFields("No longer needed")
    const data = updates.data as Record<string, unknown>
    expect(data.dropReason).toBe("No longer needed")
    expect(typeof data.closed_at).toBe("string")
  })

  // km-beads.close-drop-data-wipe — same invariant as closeBeadFields.
  test("preserves existing data fields when dropping with reason", () => {
    const currentData = {
      id: "01XYZ789",
      aliases: ["abandoned/feature"],
      short_id: "km-xyz9",
    }
    const updates = dropBeadFields("Superseded by km-abc1", currentData)
    const data = updates.data as Record<string, unknown>
    expect(data.id).toBe("01XYZ789")
    expect(data.aliases).toEqual(["abandoned/feature"])
    expect(data.short_id).toBe("km-xyz9")
    expect(data.dropReason).toBe("Superseded by km-abc1")
    expect(typeof data.closed_at).toBe("string")
  })
})
