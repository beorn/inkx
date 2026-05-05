/**
 * Tests for the typed graph-edge API (`addLink` / `removeLink` / `getLinks`).
 *
 * Pins the contract that `km task dep` / future `km link --rel blocks`
 * delegate to: idempotent add/remove, both-direction read, atomicity for
 * bulk callers, props-storage round-trip, and the back-compat invariant
 * that `nodeToBead` continues to surface `blockedBy` correctly.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo, addGraphEdge, removeGraphEdge, getGraphEdges } from "../../src/index.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-edges-"))
  scratch.push(dir)
  return runGenerator(createRepo(dir, { loadFiles: false }))
}

/**
 * Add a bead-shaped task with an explicit short id so the props-based
 * blocked-by storage has something stable to point at. Mirrors the
 * shape `Bead.from` reads.
 */
function addTask(repo: Repo, opts: { id?: string; content?: string; parentId?: string | null }): string {
  const data: Record<string, unknown> = {}
  if (opts.id) data.id = opts.id
  return repo.addNode(opts.parentId ?? null, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: opts.content ?? "task",
    data,
  })
}

describe("addGraphEdge — basic add", () => {
  test("adds a blocks edge to a node's blocked-by props", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })

    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })

    const node = repo.getNode(b)
    const props = (node?.data as { props?: Record<string, unknown> })?.props
    expect(props).toBeDefined()
    expect((props as Record<string, { type: string; target?: string }>)?.["blocked-by"]).toEqual({
      type: "link",
      target: "@km/foo/a",
    })
  })

  test("blocked-by is the same edge as blocks (alias)", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })

    addGraphEdge(repo, { from: a, to: b, rel: "blocked-by" })

    const edges = getGraphEdges(repo, b, { direction: "in" })
    expect(edges.length).toBe(1)
    expect(edges[0]?.from).toBe(a)
    expect(edges[0]?.to).toBe(b)
  })

  test("multiple blockers serialize as a list", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })
    const c = addTask(repo, { id: "@km/foo/c" })

    addGraphEdge(repo, { from: a, to: c, rel: "blocks" })
    addGraphEdge(repo, { from: b, to: c, rel: "blocks" })

    const node = repo.getNode(c)
    const props = (node?.data as { props?: Record<string, unknown> })?.props
    const entry = (props as Record<string, { type: string; values?: Array<{ target: string }> } | undefined>)[
      "blocked-by"
    ]
    expect(entry?.type).toBe("list")
    expect(entry?.values?.map((v) => v.target)).toEqual(["@km/foo/a", "@km/foo/b"])
  })

  test("uses bare node id when blocker has no short id", () => {
    const repo = freshRepo()
    const blocker = addTask(repo, {}) // no data.id
    const dependent = addTask(repo, { id: "@km/foo/dep" })

    addGraphEdge(repo, { from: blocker, to: dependent, rel: "blocks" })

    const node = repo.getNode(dependent)
    const props = (node?.data as { props?: Record<string, unknown> })?.props
    const entry = (props as Record<string, { target?: string } | undefined>)["blocked-by"]
    expect(entry?.target).toBe(blocker)
  })
})

describe("addGraphEdge — idempotency", () => {
  test("adding the same edge twice is a no-op", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })

    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })

    const node = repo.getNode(b)
    const props = (node?.data as { props?: Record<string, unknown> })?.props
    const entry = (props as Record<string, { type: string; target?: string } | undefined>)["blocked-by"]
    // Single-blocker entry stays as type=link, not a 1-element list.
    expect(entry?.type).toBe("link")
    expect(entry?.target).toBe("@km/foo/a")
  })

  test("adding distinct blockers accumulates; redundant ones don't", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })
    const c = addTask(repo, { id: "@km/foo/c" })

    addGraphEdge(repo, { from: a, to: c, rel: "blocks" })
    addGraphEdge(repo, { from: a, to: c, rel: "blocks" }) // redundant
    addGraphEdge(repo, { from: b, to: c, rel: "blocks" })

    const node = repo.getNode(c)
    const props = (node?.data as { props?: Record<string, unknown> })?.props
    const entry = (props as Record<string, { type: string; values?: Array<{ target: string }> } | undefined>)[
      "blocked-by"
    ]
    expect(entry?.values?.map((v) => v.target)).toEqual(["@km/foo/a", "@km/foo/b"])
  })
})

describe("removeGraphEdge", () => {
  test("removes an existing edge", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })

    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    removeGraphEdge(repo, { from: a, to: b, rel: "blocks" })

    const node = repo.getNode(b)
    const props = (node?.data as { props?: Record<string, unknown> })?.props
    expect((props as Record<string, unknown>)?.["blocked-by"]).toBeUndefined()
  })

  test("removing the last blocker drops the prop entirely", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })

    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    removeGraphEdge(repo, { from: a, to: b, rel: "blocks" })

    const node = repo.getNode(b)
    const data = node?.data as { props?: Record<string, unknown> }
    expect(data.props?.["blocked-by"]).toBeUndefined()
  })

  test("removing a non-existent edge is a no-op", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })

    expect(() => removeGraphEdge(repo, { from: a, to: b, rel: "blocks" })).not.toThrow()
  })

  test("preserves remaining blockers when one is removed", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })
    const c = addTask(repo, { id: "@km/foo/c" })

    addGraphEdge(repo, { from: a, to: c, rel: "blocks" })
    addGraphEdge(repo, { from: b, to: c, rel: "blocks" })
    removeGraphEdge(repo, { from: a, to: c, rel: "blocks" })

    const node = repo.getNode(c)
    const props = (node?.data as { props?: Record<string, unknown> })?.props
    const entry = (props as Record<string, { type: string; target?: string } | undefined>)["blocked-by"]
    // Single remaining blocker collapses back to type=link.
    expect(entry?.type).toBe("link")
    expect(entry?.target).toBe("@km/foo/b")
  })
})

describe("getGraphEdges — read both directions", () => {
  test("direction='in' surfaces blockers", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })
    const c = addTask(repo, { id: "@km/foo/c" })

    addGraphEdge(repo, { from: a, to: c, rel: "blocks" })
    addGraphEdge(repo, { from: b, to: c, rel: "blocks" })

    const edges = getGraphEdges(repo, c, { direction: "in", rel: "blocks" })
    expect(edges.length).toBe(2)
    expect(edges.map((e) => e.from).sort()).toEqual([a, b].sort())
    expect(edges.every((e) => e.to === c)).toBe(true)
  })

  test("direction='out' surfaces dependents", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })
    const c = addTask(repo, { id: "@km/foo/c" })

    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    addGraphEdge(repo, { from: a, to: c, rel: "blocks" })

    const edges = getGraphEdges(repo, a, { direction: "out", rel: "blocks" })
    expect(edges.length).toBe(2)
    expect(edges.every((e) => e.from === a)).toBe(true)
    expect(edges.map((e) => e.to).sort()).toEqual([b, c].sort())
  })

  test("direction='both' is the default and unions in+out", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })
    const c = addTask(repo, { id: "@km/foo/c" })

    // a blocks b; c blocks a → from a's POV: 1 in, 1 out.
    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    addGraphEdge(repo, { from: c, to: a, rel: "blocks" })

    const edges = getGraphEdges(repo, a)
    expect(edges.length).toBe(2)
    const inE = edges.find((e) => e.to === a)
    const outE = edges.find((e) => e.from === a)
    expect(inE?.from).toBe(c)
    expect(outE?.to).toBe(b)
  })

  test("returns empty array for unknown node", () => {
    const repo = freshRepo()
    expect(getGraphEdges(repo, "nonexistent", { direction: "both" })).toEqual([])
  })

  test("dangling blocker key is dropped from in-edges", () => {
    // If a node's blocked-by points at an id that no longer resolves,
    // getGraphEdges drops it (rather than crashing). The user-facing
    // command surfaces this as a missing entry.
    const repo = freshRepo()
    const b = addTask(repo, { id: "@km/foo/b" })
    // Manually plant a dangling props entry — simulates a renamed
    // blocker whose alias wasn't kept.
    repo.updateNode(b, {
      data: {
        id: "@km/foo/b",
        props: { "blocked-by": { type: "link", target: "@km/ghost" } },
        propsRaw: { "blocked-by": "[[@km/ghost]]" },
      },
    })

    const edges = getGraphEdges(repo, b, { direction: "in" })
    expect(edges).toEqual([])
  })
})

describe("error cases", () => {
  test("addGraphEdge throws when from-node missing", () => {
    const repo = freshRepo()
    const b = addTask(repo, { id: "@km/foo/b" })
    expect(() => addGraphEdge(repo, { from: "ghost", to: b, rel: "blocks" })).toThrow(/'from' node not found/)
  })

  test("addGraphEdge throws when to-node missing", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    expect(() => addGraphEdge(repo, { from: a, to: "ghost", rel: "blocks" })).toThrow(/'to' node not found/)
  })

  test("addGraphEdge with unsupported rel throws", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })
    expect(() => addGraphEdge(repo, { from: a, to: b, rel: "related" })).toThrow(/not yet supported/)
  })
})

describe("nodeToBead compatibility", () => {
  test("addGraphEdge populates blockedBy on the dependent's bead view", async () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/blocker" })
    const b = addTask(repo, { id: "@km/foo/dependent" })

    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })

    // Round-trip via @km/beads — same surface bd / tasks list reads.
    const { Bead } = await import("@km/beads")
    const node = repo.getNode(b)
    expect(node).not.toBeNull()
    if (!node) return
    const bead = Bead.from(node, { repo })
    if (!bead) throw new Error("not a bead")
    expect(bead.blockedBy).toEqual(["@km/foo/blocker"])
  })

  test("nodeToBead status flips to 'blocked' when blocker added (open status)", async () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/blocker" })
    const b = addTask(repo, { id: "@km/foo/dependent" })

    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })

    const { Bead } = await import("@km/beads")
    const node = repo.getNode(b)
    if (!node) throw new Error("missing")
    const bead = Bead.from(node, { repo })
    if (!bead) throw new Error("not a bead")
    expect(bead.status).toBe("blocked")
  })
})

describe("property test — random add/rm sequences preserve invariants", () => {
  // Mulberry32 seeded RNG — deterministic so failures replay.
  function rng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  test("random sequences keep state consistent with a reference set", () => {
    const repo = freshRepo()
    const ids: string[] = []
    for (let i = 0; i < 6; i++) {
      ids.push(addTask(repo, { id: `@km/p/${i}` }))
    }

    const reference = new Set<string>() // canonical pair: `${from}->${to}`
    const rand = rng(1234)

    for (let step = 0; step < 200; step++) {
      const from = ids[Math.floor(rand() * ids.length)]!
      const to = ids[Math.floor(rand() * ids.length)]!
      if (from === to) continue
      const op = rand() < 0.7 ? "add" : "rm"
      const key = `${from}->${to}`

      if (op === "add") {
        addGraphEdge(repo, { from, to, rel: "blocks" })
        reference.add(key)
      } else {
        removeGraphEdge(repo, { from, to, rel: "blocks" })
        reference.delete(key)
      }

      // Spot-check: every reference edge surfaces in getGraphEdges; no
      // phantom edges appear.
      for (const node of ids) {
        const inE = getGraphEdges(repo, node, { direction: "in", rel: "blocks" })
        const expectedIn = [...reference].filter((k) => k.endsWith(`->${node}`)).length
        expect(inE.length).toBe(expectedIn)

        const outE = getGraphEdges(repo, node, { direction: "out", rel: "blocks" })
        const expectedOut = [...reference].filter((k) => k.startsWith(`${node}->`)).length
        expect(outE.length).toBe(expectedOut)
      }
    }
  })

  test("idempotency invariant: add(e) twice = add(e) once; rm(e) twice = rm(e) once", () => {
    const repo = freshRepo()
    const a = addTask(repo, { id: "@km/foo/a" })
    const b = addTask(repo, { id: "@km/foo/b" })

    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    addGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    expect(getGraphEdges(repo, b, { direction: "in" }).length).toBe(1)

    removeGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    removeGraphEdge(repo, { from: a, to: b, rel: "blocks" })
    expect(getGraphEdges(repo, b, { direction: "in" }).length).toBe(0)
  })
})
