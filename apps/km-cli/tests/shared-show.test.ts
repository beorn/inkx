/**
 * Tests for the shared `printTaskDetails` helper used by both
 * `bd show <id>` and `tasks <id>`.
 *
 * Both modes route through `nodeToBead`, so the field-extraction logic
 * is shared by construction. These tests pin the rendering contract
 * for each mode (bd vs task) and the JSON contract.
 */

import { afterAll, describe, expect, test } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { runGenerator } from "@km/core"
import { createRepo } from "@km/storage"
import type { Repo } from "@km/storage"
import { printTaskDetails } from "../src/commands/shared-show.ts"

const BASE = join("/tmp", `kmtest-shared-show-${process.pid}-${Date.now().toString(36)}`)
let counter = 0
mkdirSync(BASE, { recursive: true })

function freshDir(label: string): string {
  counter += 1
  const dir = join(BASE, `${label}-${counter}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, ".km"), { recursive: true })
  writeFileSync(join(dir, ".km", "config.yaml"), `beads:\n  prefix: km\n  board: ""\n  parent: ""\n`)
  writeFileSync(join(dir, "inbox.md"), `# Inbox\n\n`)
  return dir
}

function openRepo(dir: string): Repo {
  return runGenerator(createRepo(dir, { loadFiles: true }))
}

afterAll(() => {
  if (existsSync(BASE)) rmSync(BASE, { recursive: true, force: true })
})

/** Capture console.log output for assertion. Returns the lines written. */
function captureOutput(fn: () => void): string {
  const original = console.log
  const lines: string[] = []
  console.log = (...args: unknown[]) => {
    lines.push(args.join(" "))
  }
  try {
    fn()
  } finally {
    console.log = original
  }
  return lines.join("\n")
}

/** Strip ANSI escapes so assertions don't depend on theme colors. */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

describe("printTaskDetails", () => {
  test("bd mode emits status, priority, type, blocked-by", () => {
    const dir = freshDir("bd-mode")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "wip" } },
      content: "Wire up the share-print helper",
      // priority via data.tags '#P[0-4]' (column dropped at SCHEMA_VERSION=11)
      data: {
        id: "beads/share-print-details",
        tags: ["task", "P1"],
        props: {
          "blocked-by": {
            type: "list",
            values: [{ target: "km-foo.bar" }, { target: "km-baz.qux" }],
          },
        },
      },
    })

    const node = repo.getNode(id)!
    const out = stripAnsi(captureOutput(() => printTaskDetails(repo, node, { bd: true })))

    expect(out).toContain("Wire up the share-print helper")
    expect(out).toContain("Status: in_progress") // wip → in_progress in bd terms
    expect(out).toContain("Priority: P1")
    expect(out).toContain("Type: task")
    expect(out).toContain("Blocked by (2):")
    expect(out).toContain("↳ km-foo.bar")
    expect(out).toContain("↳ km-baz.qux")
  })

  test("task mode emits raw status (no bd term mapping) and no #P0 chip", () => {
    const dir = freshDir("task-mode")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "wip" } },
      content: "task content here",
      // priority via data.tags '#P[0-4]' (column dropped at SCHEMA_VERSION=11)
      assigned_to: "alice",
      due_at: "2026-05-01",
      data: { id: "scope/slug", tags: ["task", "P1"] },
    })

    const node = repo.getNode(id)!
    const out = stripAnsi(captureOutput(() => printTaskDetails(repo, node, { bd: false })))

    expect(out).toContain("task content here")
    // Task-mode keeps raw status, not the bd-mapped "in_progress"
    expect(out).toContain("Status: wip")
    expect(out).not.toContain("in_progress")
    // Priority shown verbatim from the node, not as a chip
    expect(out).toContain("Priority: P1")
    expect(out).toContain("Assigned: alice")
    expect(out).toContain("Due: 2026-05-01")
  })

  test("default opts (no .bd) renders task mode", () => {
    const dir = freshDir("default-task")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "default-mode task",
      data: {},
    })

    const node = repo.getNode(id)!
    const out = stripAnsi(captureOutput(() => printTaskDetails(repo, node, {})))

    expect(out).toContain("default-mode task")
    expect(out).toContain("Status: todo")
    // bd-mode would have emitted "Status: open" — confirm we did NOT
    expect(out).not.toMatch(/Status: open/)
  })

  test("task mode hides priority when node carries none (no P2 default leak)", () => {
    const dir = freshDir("no-priority")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "no-priority task",
      data: {},
    })

    const node = repo.getNode(id)!
    const out = stripAnsi(captureOutput(() => printTaskDetails(repo, node, { bd: false })))

    // nodeToBead defaults to P2; task mode shouldn't surface it as
    // "Priority: P2" when the node never declared one.
    expect(out).not.toMatch(/Priority:/)
  })

  test("bd mode shows P2 default priority (issue mode renders it verbatim)", () => {
    const dir = freshDir("p2-default")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "default priority issue",
      data: {},
    })

    const node = repo.getNode(id)!
    const out = stripAnsi(captureOutput(() => printTaskDetails(repo, node, { bd: true })))

    // bd-show has always rendered the P2 default; preserve that behavior.
    expect(out).toContain("Priority: P2")
  })

  test("json mode dumps the Bead shape regardless of bd flag", () => {
    const dir = freshDir("json")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "json task",
      data: { id: "scope/slug" },
    })

    const node = repo.getNode(id)!
    const out = captureOutput(() => printTaskDetails(repo, node, { json: true }))
    const parsed = JSON.parse(out) as { id: string; shortId: string; title: string }
    expect(parsed.id).toBe(id)
    expect(parsed.shortId).toBe("scope/slug")
    expect(parsed.title).toBe("json task")
  })

  test("both modes share the field set (parity check)", () => {
    // Sanity check the load-bearing claim: anything nodeToBead extracts
    // is available to both modes. We hit the helper twice with the same
    // input and assert that fields the user populated appear in BOTH
    // outputs. If a field falls out of one mode it'll show up here as a
    // missing substring rather than a quiet drift.
    const dir = freshDir("parity")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "parity test task",
      assigned_to: "bob",
      data: {
        id: "parity/slug",
        props: {
          "blocked-by": {
            type: "link",
            target: "km-other.dep",
          },
        },
      },
    })
    const node = repo.getNode(id)!

    const bdOut = stripAnsi(captureOutput(() => printTaskDetails(repo, node, { bd: true })))
    const taskOut = stripAnsi(captureOutput(() => printTaskDetails(repo, node, { bd: false })))

    // Title, assignee, blocked-by show up in both.
    for (const out of [bdOut, taskOut]) {
      expect(out).toContain("parity test task")
      expect(out).toMatch(/bob/)
      expect(out).toContain("km-other.dep")
    }
  })
})
