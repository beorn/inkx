import { describe, test, expect } from "vitest"
import { effect } from "alien-signals"
import { withReactive } from "../src/store/reactive.ts"
import { createStoreFromRepo } from "../src/store/store.ts"
import { ResourceState, type CommitResult } from "../src/store/commit-types.ts"
import type { Change } from "@km/core"
import { createFakeRepo, board, column, task } from "../src/testing/index.ts"

function setupReactiveStore() {
  const fixture = board("board", [column("col", [task("t1"), task("t2")])])
  const repo = createFakeRepo({ nodes: fixture.nodes })

  // Look up actual node IDs by content/title
  const allNodes = repo.getAllNodes()
  const colNode = allNodes.find((n) => n.title === "col")!
  const t1Node = allNodes.find((n) => n.content === "t1")!
  const t2Node = allNodes.find((n) => n.content === "t2")!

  const store = withReactive(createStoreFromRepo(repo))
  return { store, repo, colId: colNode.id, t1Id: t1Node.id, t2Id: t2Node.id }
}

describe("withReactive", () => {
  test("nodeState returns loaded for existing node", () => {
    const { store, repo, t1Id } = setupReactiveStore()
    const t1 = repo.getNode(t1Id)!

    const sig = store.nodeState(t1Id)
    const state = sig()

    expect(state.status).toBe("loaded")
    expect(ResourceState.value(state)).toEqual(t1)
  })

  test("nodeState returns unloaded for missing node", () => {
    const { store } = setupReactiveStore()

    const sig = store.nodeState("nonexistent")
    expect(sig().status).toBe("unloaded")
  })

  test("childIdsState returns loaded child IDs", () => {
    const { store, colId, t1Id, t2Id } = setupReactiveStore()

    const sig = store.childIdsState(colId)
    const state = sig()

    expect(state.status).toBe("loaded")
    const ids = ResourceState.value(state)!
    expect(ids).toContain(t1Id)
    expect(ids).toContain(t2Id)
  })

  test("nodeState updates when commit modifies node", () => {
    const { store, t1Id } = setupReactiveStore()

    const sig = store.nodeState(t1Id)
    const before = sig()
    expect(ResourceState.value(before)?.content).toBe("t1")

    store.commit([{ type: "node_updated", actor: "test", target: t1Id, data: { content: "updated" } }])

    const after = sig()
    expect(after.status).toBe("loaded")
    expect(ResourceState.value(after)?.content).toBe("updated")
  })

  test("childIdsState updates when commit adds child", () => {
    const { store, colId } = setupReactiveStore()

    const sig = store.childIdsState(colId)
    const before = ResourceState.value(sig())!
    expect(before).toHaveLength(2)

    store.commit([
      {
        type: "node_created",
        actor: "test",
        data: { id: "new-child", parent_id: colId, content: "t3", type: "p" },
      },
    ])

    const after = ResourceState.value(sig())!
    expect(after).toHaveLength(3)
    expect(after).toContain("new-child")
  })

  test("nodeState transitions to deleted on node_deleted", () => {
    const { store, t2Id, colId } = setupReactiveStore()

    const sig = store.nodeState(t2Id)
    expect(sig().status).toBe("loaded")

    store.commit([{ type: "node_deleted", actor: "test", target: t2Id, data: { parent_id: colId } }])

    expect(sig().status).toBe("deleted")
  })

  test("signals are lazy — no signal created until accessed", () => {
    const { store, t1Id } = setupReactiveStore()

    // Commit before any signal access
    store.commit([{ type: "node_updated", actor: "test", target: t1Id, data: { content: "changed" } }])

    // Now access signal — should get current state, not stale
    const sig = store.nodeState(t1Id)
    expect(ResourceState.value(sig())?.content).toBe("changed")
  })

  test("same signal returned for same id", () => {
    const { store, t1Id } = setupReactiveStore()

    const sig1 = store.nodeState(t1Id)
    const sig2 = store.nodeState(t1Id)
    expect(sig1).toBe(sig2)
  })

  test("effects trigger on signal change", () => {
    const { store, t1Id } = setupReactiveStore()

    const values: string[] = []
    const sig = store.nodeState(t1Id)

    const dispose = effect(() => {
      const state = sig()
      if (ResourceState.isLoaded(state)) {
        values.push(state.value.content ?? "")
      }
    })

    expect(values).toEqual(["t1"])

    store.commit([{ type: "node_updated", actor: "test", target: t1Id, data: { content: "v2" } }])

    expect(values).toEqual(["t1", "v2"])
    dispose()
  })

  test("batch: single notification for multi-event commit", () => {
    const { store, t1Id, t2Id } = setupReactiveStore()

    let effectRuns = 0
    const sig1 = store.nodeState(t1Id)
    const sig2 = store.nodeState(t2Id)

    const dispose = effect(() => {
      sig1()
      sig2()
      effectRuns++
    })

    expect(effectRuns).toBe(1)

    // One commit with two events — should batch signal updates
    store.commit([
      { type: "node_updated", actor: "test", target: t1Id, data: { content: "a" } },
      { type: "node_updated", actor: "test", target: t2Id, data: { content: "b" } },
    ])

    // Effect should run exactly once for the batch, not twice
    expect(effectRuns).toBe(2)
    dispose()
  })
})

describe("Replicated interface", () => {
  test("getChanges returns committed envelopes", () => {
    const { store, t1Id, t2Id } = setupReactiveStore()

    store.commit([{ type: "node_updated", actor: "test", target: t1Id, data: { content: "v1" } }])
    store.commit([{ type: "node_updated", actor: "test", target: t2Id, data: { content: "v2" } }])

    const changes = store.getChanges()
    expect(changes).toHaveLength(2)
    expect(changes[0]!.source).toBe("local")
    expect(changes[0]!.changes).toHaveLength(1)
    expect(changes[1]!.changes).toHaveLength(1)
  })

  test("getChanges(since) returns changes after cursor", () => {
    const { store, t1Id, t2Id } = setupReactiveStore()

    const r1 = store.commit([{ type: "node_updated", actor: "test", target: t1Id, data: { content: "v1" } }])
    store.commit([{ type: "node_updated", actor: "test", target: t2Id, data: { content: "v2" } }])

    const changes = store.getChanges(r1.meta.commitId)
    expect(changes).toHaveLength(1)
    expect(changes[0]!.changes[0]!.target).toBe(t2Id)
  })

  test("applyChanges imports envelopes and notifies subscribers", () => {
    const { store, t1Id } = setupReactiveStore()

    const results: CommitResult[] = []
    store.onCommit((r) => results.push(r))

    store.applyChanges([
      {
        commitId: "remote-1",
        source: "remote",
        changes: [
          {
            type: "node_updated",
            actor: "remote",
            target: t1Id,
            data: { content: "remote-v" },
            id: "r1",
            ts: Date.now(),
          },
        ],
      },
    ])

    expect(results).toHaveLength(1)
    expect(results[0]!.meta.source).toBe("remote")
    expect(store.peekNode(t1Id)?.content).toBe("remote-v")
  })

  test("applyChanges records in change log", () => {
    const { store, t1Id } = setupReactiveStore()

    store.applyChanges([
      {
        commitId: "ext-1",
        source: "fs-import",
        changes: [
          { type: "node_updated", actor: "fs", target: t1Id, data: { content: "fs-v" }, id: "f1", ts: Date.now() },
        ],
      },
    ])

    const allChanges = store.getChanges()
    expect(allChanges).toHaveLength(1)
    expect(allChanges[0]!.source).toBe("fs-import")
  })
})
