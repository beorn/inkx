/**
 * Regression: `bd close <id>` accepts every id form `bd show <id>` accepts.
 *
 * Tracks `@km/beads/close-resolver-asymmetric` (P2 bug). Pre-L4 alias-drop,
 * `bd close` and `bd show` had divergent resolver paths — `show` walked the
 * unified resolver chain while `close` had its own narrower lookup that
 * rejected migrated-bead aliases (dot-form, dash-form). After the L4 cutover
 * both subcommands route through `resolveIssue` / `resolveTaskNode` (see
 * `apps/km-cli/src/utils/resolve-task.ts`).
 *
 * This test is a symmetry check: for a migrated bead with the canonical
 * `aliases:` triplet (path-form id, dot-form, dash-form), every form must
 * resolve to the same node via BOTH `resolveTaskNode` (the show path) AND
 * `resolveIssue` (the close path). It also exercises `Bead.close` against
 * the resolved Bead to confirm the close mutation runs without throwing.
 *
 * If a future refactor reintroduces a divergent resolver in any bd
 * subcommand (close, drop, claim, comment, mention, …), this test will
 * fire. The "show vs close" case is the canonical failure mode that
 * users hit on migrated beads.
 */

import { afterAll, describe, expect, test } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { Bead } from "@km/beads"
import { createRepo } from "@km/storage"
import type { Repo } from "@km/storage"
import { resolveIssue, resolveTaskNode } from "../src/utils/resolve-task.ts"

const BASE = join("/tmp", `kmtest-bd-close-resolver-${process.pid}-${Date.now().toString(36)}`)
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

/**
 * Create a node that mimics a migrated bead — frontmatter `id` is the
 * canonical path-form, `aliases` carries the legacy bd-form (dot) and
 * dash-form. This matches what `packages/km-beads/src/migrate.ts`
 * (`bdIdToPathForm` + `bdIdToAliases`) produces on `bd migrate`.
 */
function addMigratedBead(repo: Repo, scope: string, slug: string): { nodeId: string; forms: string[] } {
  const inbox = repo.resolveNode("inbox")!
  const pathForm = `@km/${scope}/${slug}`
  const dotForm = `km-${scope}.${slug}`
  const dashForm = `km-${scope}-${slug}`

  const nodeId = repo.addNode(inbox.id, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: "Migrated bead — close-resolver symmetry test",
    data: {
      id: pathForm,
      short_id: dotForm,
      aliases: [dashForm, dotForm],
    },
  })

  return { nodeId, forms: [pathForm, dotForm, dashForm] }
}

describe("bd close ↔ bd show resolver symmetry (regression: close-resolver-asymmetric)", () => {
  test("resolveTaskNode (show path) accepts all 3 forms for a migrated bead", () => {
    const dir = freshDir("show-symmetric")
    using repo = openRepo(dir)
    const { nodeId, forms } = addMigratedBead(repo, "beads", "parent-id-leaf-materializes-inline")

    for (const form of forms) {
      const node = resolveTaskNode(repo, form)
      expect(node, `resolveTaskNode("${form}") must resolve`).toBeTruthy()
      expect(node?.id, `resolveTaskNode("${form}") must point at the migrated bead`).toBe(nodeId)
    }
  })

  test("resolveIssue (close path) accepts all 3 forms for a migrated bead", () => {
    const dir = freshDir("close-symmetric")
    using repo = openRepo(dir)
    const { nodeId, forms } = addMigratedBead(repo, "beads", "parent-id-leaf-materializes-inline")

    for (const form of forms) {
      const issue = resolveIssue(repo, form)
      expect(issue, `resolveIssue("${form}") must resolve`).toBeTruthy()
      expect(issue?.id, `resolveIssue("${form}") must point at the migrated bead`).toBe(nodeId)
    }
  })

  test("symmetry: show and close paths return the same node for every form", () => {
    const dir = freshDir("symmetry")
    using repo = openRepo(dir)
    const { forms } = addMigratedBead(repo, "beads", "close-resolver-asymmetric")

    for (const form of forms) {
      const showNode = resolveTaskNode(repo, form)
      const closeIssue = resolveIssue(repo, form)
      expect(closeIssue?.id, `close-path id must match show-path id for "${form}"`).toBe(showNode?.id)
    }
  })

  test("Bead.close runs against an issue resolved via every form (path/dot/dash)", () => {
    // End-to-end: replicate the exact sequence in the bd close handler —
    // resolveIssueArg → Bead.close → repo.updateNode. Each form lands the
    // status mutation on the same node.
    for (const formIndex of [0, 1, 2]) {
      const dir = freshDir(`close-mutate-form-${formIndex}`)
      using repo = openRepo(dir)
      const { nodeId, forms } = addMigratedBead(repo, "beads", "close-resolver-asymmetric")
      const form = forms[formIndex]!

      const issue = resolveIssue(repo, form)
      expect(issue, `resolveIssue("${form}") returned null — close handler would fail`).toBeTruthy()

      const node = repo.getNode(issue!.id)
      const currentData = node?.data as Record<string, unknown> | undefined
      const updates = Bead.close(repo, issue!, "regression test", currentData)
      repo.updateNode(issue!.id, updates)

      const after = repo.getNode(nodeId)
      expect(after?.item?.task?.status, `close via "${form}" must mark status=done`).toBe("done")
    }
  })

  test("retired alias-arm still works: bare aliases string with no `id` resolves both paths", () => {
    // Older migrated beads (pre-`id` adoption) carry only `short_id` +
    // aliases — exercises that the resolver doesn't require `data.id`.
    const dir = freshDir("aliases-only")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const dotForm = "km-beads.aliases-only-bead"
    const dashForm = "km-beads-aliases-only-bead"

    const nodeId = repo.addNode(inbox.id, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "aliases-only legacy bead",
      data: { short_id: dotForm, aliases: [dashForm] },
    })

    expect(resolveTaskNode(repo, dotForm)?.id).toBe(nodeId)
    expect(resolveTaskNode(repo, dashForm)?.id).toBe(nodeId)
    expect(resolveIssue(repo, dotForm)?.id).toBe(nodeId)
    expect(resolveIssue(repo, dashForm)?.id).toBe(nodeId)
  })
})
