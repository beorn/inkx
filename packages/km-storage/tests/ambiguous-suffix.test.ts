/**
 * Ambiguous ID Suffix Resolution Tests
 *
 * When a short ID suffix matches multiple nodes, the resolver should
 * return null instead of silently picking one arbitrarily.
 *
 * Covers both:
 * - getNodeByIdPrefix (core-lookup.ts) — used by CLI
 * - resolveNode (smart-resolver.ts) — used by smart resolution
 */

import { describe, test, expect } from "vitest"
import { ulid } from "ulid"

import { getNodeByIdPrefix, getTaskByIdPrefix, resolveNode } from "../src/db.ts"
import { withTestEnvSync } from "@km/storage"

describe("ambiguous ID suffix resolution", () => {
  // Helper: create two nodes whose IDs share the same suffix
  function createNodesWithSharedSuffix(emitter: { emit: (e: any) => any }, suffix: string): [string, string] {
    // Create two ULIDs, then replace the last N chars with our suffix
    const id1 = ulid().slice(0, -suffix.length) + suffix
    const id2 = ulid().slice(0, -suffix.length) + suffix
    // Ensure IDs are actually different (different ULID prefixes)
    expect(id1).not.toBe(id2)

    emitter.apply({
      type: "node_created",
      actor: "test",
      data: { id: id1, type: "p", item: {}, content: "Node 1" },
    })
    emitter.apply({
      type: "node_created",
      actor: "test",
      data: { id: id2, type: "p", item: {}, content: "Node 2" },
    })

    return [id1, id2]
  }

  describe("getNodeByIdPrefix", () => {
    test("exact match is unambiguous", () =>
      withTestEnvSync(({ db, emitter }) => {
        const [id1] = createNodesWithSharedSuffix(emitter, "XYZABC")
        // Exact match should always work
        const node = getNodeByIdPrefix(db, id1)
        expect(node).not.toBeNull()
        expect(node?.id).toBe(id1)
      }))

    test("unique suffix returns the node", () =>
      withTestEnvSync(({ db, emitter }) => {
        const id = ulid()
        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id, type: "p", item: {}, content: "Unique node" },
        })

        // Use enough chars to be unique
        const suffix = id.slice(-12)
        const node = getNodeByIdPrefix(db, suffix)
        expect(node).not.toBeNull()
        expect(node?.id).toBe(id)
      }))

    test("ambiguous suffix returns null", () =>
      withTestEnvSync(({ db, emitter }) => {
        const suffix = "QRSTUV"
        createNodesWithSharedSuffix(emitter, suffix)

        // The suffix matches both nodes — should return null, not pick one arbitrarily
        const node = getNodeByIdPrefix(db, suffix)
        expect(node).toBeNull()
      }))

    test("ambiguous prefix returns null", () =>
      withTestEnvSync(({ db, emitter }) => {
        const prefix = "01AABBCC"
        const id1 = prefix + ulid().slice(prefix.length)
        const id2 = prefix + ulid().slice(prefix.length)
        expect(id1).not.toBe(id2)

        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: id1, type: "p", item: {}, content: "Node A" },
        })
        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: id2, type: "p", item: {}, content: "Node B" },
        })

        // The prefix matches both — should return null
        const node = getNodeByIdPrefix(db, prefix)
        expect(node).toBeNull()
      }))
  })

  describe("getTaskByIdPrefix", () => {
    test("ambiguous suffix among tasks returns null", () =>
      withTestEnvSync(({ db, emitter }) => {
        const suffix = "TASKAB"
        const id1 = ulid().slice(0, -suffix.length) + suffix
        const id2 = ulid().slice(0, -suffix.length) + suffix
        expect(id1).not.toBe(id2)

        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: id1, type: "p", item: {}, content: "Task 1", task_status: "todo", task_marker: "[ ]" },
        })
        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: id2, type: "p", item: {}, content: "Task 2", task_status: "todo", task_marker: "[ ]" },
        })

        const node = getTaskByIdPrefix(db, suffix)
        expect(node).toBeNull()
      }))

    test("suffix unique among tasks returns the task", () =>
      withTestEnvSync(({ db, emitter }) => {
        const suffix = "UNIQTK"
        const taskId = ulid().slice(0, -suffix.length) + suffix
        const nonTaskId = ulid().slice(0, -suffix.length) + suffix

        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: taskId, type: "p", item: {}, content: "Task", task_status: "todo", task_marker: "[ ]" },
        })
        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: nonTaskId, type: "p", item: {}, content: "Not a task" },
        })

        // Only one task matches — should return it
        const node = getTaskByIdPrefix(db, suffix)
        expect(node).not.toBeNull()
        expect(node?.id).toBe(taskId)
      }))
  })

  describe("resolveNode (smart resolver)", () => {
    test("ambiguous ID suffix returns null", () =>
      withTestEnvSync(({ db, emitter }) => {
        const suffix = "SMTRES"
        const id1 = ulid().slice(0, -suffix.length) + suffix
        const id2 = ulid().slice(0, -suffix.length) + suffix
        expect(id1).not.toBe(id2)

        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: id1, type: "p", item: {}, content: "Smart node 1" },
        })
        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: id2, type: "p", item: {}, content: "Smart node 2" },
        })

        // resolveNode should detect ambiguity and return null
        const node = resolveNode(db, suffix)
        expect(node).toBeNull()
      }))

    test("ambiguous ID prefix returns null", () =>
      withTestEnvSync(({ db, emitter }) => {
        const prefix = "01SMTPFX"
        const id1 = prefix + ulid().slice(prefix.length)
        const id2 = prefix + ulid().slice(prefix.length)
        expect(id1).not.toBe(id2)

        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: id1, type: "p", item: {}, content: "Prefix node 1" },
        })
        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id: id2, type: "p", item: {}, content: "Prefix node 2" },
        })

        const node = resolveNode(db, prefix)
        expect(node).toBeNull()
      }))

    test("unique suffix still resolves correctly", () =>
      withTestEnvSync(({ db, emitter }) => {
        const id = ulid()
        emitter.apply({
          type: "node_created",
          actor: "test",
          data: { id, type: "p", item: {}, content: "Only one" },
        })

        const suffix = id.slice(-8)
        const node = resolveNode(db, suffix)
        expect(node).not.toBeNull()
        expect(node?.id).toBe(id)
      }))
  })
})
