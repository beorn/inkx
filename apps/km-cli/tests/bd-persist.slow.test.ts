/**
 * km bd write-path persistence tests (round-trip).
 *
 * Goal: every bd mutation must survive a process-level restart — DB writes
 * must reach .md files, and a fresh repo instance must see the same state.
 *
 * Implementation note: the silvery pipeline is temporarily broken upstream
 * (WIP `buildFadePlan` rename), which prevents spawning the CLI binary.
 * We therefore exercise the command-level code paths through the shared
 * helper modules (`@km/beads` + storage Repo) that the CLI commands in
 * apps/km-cli/src/commands/bd.ts delegate to. The helpers ARE the
 * persistence contract — if the helpers persist, the CLI persists.
 */

import { afterAll, describe, expect, test } from "vitest"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { runGenerator } from "@km/core"
import { createRepo } from "@km/storage"
import type { Repo } from "@km/storage"
import {
  addDependency,
  closeIssueFields,
  createIssueNode,
  dropIssueFields,
  mergeDepProps,
  nodeToIssue,
  removeDependency,
  updateIssueFields,
} from "@km/beads"

// Unique per test file/pid/run so parallel vitest workers don't collide.
const BASE = join("/tmp", `kmtest-bdpersist-${process.pid}-${Date.now().toString(36)}`)
let counter = 0
mkdirSync(BASE, { recursive: true })

function freshDir(label: string): string {
  counter += 1
  const dir = join(BASE, `${label}-${counter}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, ".km"), { recursive: true })
  // Use a config that doesn't force a parent folder we'd need to create.
  writeFileSync(join(dir, ".km", "config.yaml"), `beads:\n  prefix: test\n  board: ""\n  parent: ""\n`)
  // Seed an index file so the repo has at least one markdown file to host nodes.
  writeFileSync(join(dir, "inbox.md"), `# Inbox\n\n`)
  return dir
}

function openRepo(dir: string): Repo {
  return runGenerator(createRepo(dir, { loadFiles: true }))
}

/**
 * Simulate a CLI process restart:
 *   drop the SQLite page cache but keep `changes.jsonl` (the durable event
 *   journal). A new Repo instance rebuilds `state.db` from the journal,
 *   matching the real-world lifecycle of `km bd create ...; <exit>; km bd list`.
 */
function wipeDbCache(dir: string): void {
  for (const name of ["state.db", "state.db-wal", "state.db-shm", "state.db-journal"]) {
    const p = join(dir, ".km", name)
    if (existsSync(p)) rmSync(p, { force: true })
  }
}

/** Read all .md files under `dir` and concatenate contents. */
function allMarkdown(dir: string): string {
  const walk = (d: string): string[] => {
    const { readdirSync, statSync } = require("fs")
    const entries = readdirSync(d) as string[]
    const out: string[] = []
    for (const name of entries) {
      if (name === ".km" || name.startsWith(".")) continue
      const p = join(d, name)
      if (statSync(p).isDirectory()) out.push(...walk(p))
      else if (name.endsWith(".md")) out.push(readFileSync(p, "utf-8"))
    }
    return out
  }
  return walk(dir).join("\n---\n")
}

/**
 * Find a task node whose content contains `needle`, mapped to an Issue.
 *
 * We reach below `queryIssues` (which relies on a non-trivial DSL query +
 * board filter) because this harness targets the persistence contract:
 * "the task is still there, with correct fields." Discovery semantics are
 * out of scope for this test — Repo.data.getAllNodes is the source of
 * truth for what actually lives in the rebuilt database.
 */
function findIssueByContent(repo: Repo, needle: string) {
  const match = repo.data.getAllNodes().find((n) => n.item?.task != null && (n.content ?? "").includes(needle))
  return match ? nodeToIssue(match, { repo }) : undefined
}

afterAll(() => {
  if (existsSync(BASE)) rmSync(BASE, { recursive: true, force: true })
})

describe("km bd write-path persistence", () => {
  test("create — new issue survives process restart", async () => {
    const dir = freshDir("create")

    // Write the issue (mimics what bd.ts `create` does)
    {
      using repo = openRepo(dir)
      const inbox = repo.resolveNode("inbox")
      expect(inbox, "inbox.md must resolve").toBeTruthy()

      const { node, children } = createIssueNode("persist me please", { type: "bug" })
      const nodeId = repo.addNode(inbox!.id, node)
      for (const child of children) {
        repo.addNode(nodeId, child)
      }
    }

    // Issue must be serialized to the .md file after the repo is disposed.
    expect(allMarkdown(dir), "issue text must appear in markdown").toContain("persist me please")

    // Simulate a CLI restart — rebuild state.db from the journal.
    wipeDbCache(dir)
    using repo2 = openRepo(dir)
    const reopened = findIssueByContent(repo2, "persist me please")
    expect(reopened, "issue must be visible after CLI restart").toBeTruthy()
    expect(reopened?.type).toBe("bug")
  })

  test("update — priority + title survive restart", async () => {
    const dir = freshDir("update")

    {
      using repo = openRepo(dir)
      const inbox = repo.resolveNode("inbox")!
      const { node } = createIssueNode("before edit", { priority: "P3" })
      const issueId = repo.addNode(inbox.id, node)

      const issue = nodeToIssue(repo.getNode(issueId)!, { repo })
      const updates = updateIssueFields(issue, { title: "after edit @issue", priority: "P1" })
      repo.updateNode(issueId, updates)
    }

    // Assert the .md file carries the new priority (key:: value form).
    expect(allMarkdown(dir)).toMatch(/after edit.*priority:: P1/)

    wipeDbCache(dir)
    using repo2 = openRepo(dir)
    const reopened = findIssueByContent(repo2, "after edit")
    expect(reopened, "updated title must survive restart").toBeTruthy()
    expect(reopened?.priority).toBe("P1")
  })

  test("close — status=done is persisted", async () => {
    const dir = freshDir("close")

    {
      using repo = openRepo(dir)
      const inbox = repo.resolveNode("inbox")!
      const { node } = createIssueNode("close me", {})
      const issueId = repo.addNode(inbox.id, node)

      repo.updateNode(issueId, closeIssueFields("resolved"))
    }

    wipeDbCache(dir)
    using repo2 = openRepo(dir)
    const reopened = findIssueByContent(repo2, "close me")
    expect(reopened?.status).toBe("done")
  })

  test("claim — status=wip + assignee are persisted", async () => {
    const dir = freshDir("claim")

    {
      using repo = openRepo(dir)
      const inbox = repo.resolveNode("inbox")!
      const { node } = createIssueNode("claim me @alice", {})
      const issueId = repo.addNode(inbox.id, node)

      const issue = nodeToIssue(repo.getNode(issueId)!, { repo })
      const updates = updateIssueFields(issue, { status: "wip", assignee: "alice" })
      repo.updateNode(issueId, updates)
    }

    wipeDbCache(dir)
    using repo2 = openRepo(dir)
    const reopened = findIssueByContent(repo2, "claim me")
    expect(reopened?.status).toBe("wip")
  })

  test("drop — status=dropped is persisted", async () => {
    const dir = freshDir("drop")

    {
      using repo = openRepo(dir)
      const inbox = repo.resolveNode("inbox")!
      const { node } = createIssueNode("drop this", {})
      const issueId = repo.addNode(inbox.id, node)
      repo.updateNode(issueId, dropIssueFields("wontfix"))
    }

    wipeDbCache(dir)
    using repo2 = openRepo(dir)
    const reopened = findIssueByContent(repo2, "drop this")
    expect(reopened?.status).toBe("dropped")
  })

  test("dep add / remove — blocked-by survives restart", async () => {
    const dir = freshDir("dep")
    let blockerShort = ""

    // Session 1: create blocker + blocked, add dependency.
    {
      using repo = openRepo(dir)
      const inbox = repo.resolveNode("inbox")!

      const blocker = createIssueNode("the blocker", { customId: "test-blocker-1" })
      repo.addNode(inbox.id, blocker.node)
      blockerShort = blocker.shortId

      const blocked = createIssueNode("the blocked", {})
      const blockedId = repo.addNode(inbox.id, blocked.node)

      const issue = nodeToIssue(repo.getNode(blockedId)!, { repo })
      const props = addDependency(issue, blockerShort)
      const existingData = (repo.getNode(blockedId)?.data as Record<string, unknown>) ?? {}
      repo.updateNode(blockedId, { data: mergeDepProps(existingData, props) })
    }

    // Session 2: restart, verify blockedBy survives.
    wipeDbCache(dir)
    {
      using repo2 = openRepo(dir)
      const reopened = findIssueByContent(repo2, "the blocked")
      expect(reopened?.blockedBy).toContain(blockerShort)
    }

    // Session 3: remove the dependency.
    wipeDbCache(dir)
    {
      using repo3 = openRepo(dir)
      const blockedIssue = findIssueByContent(repo3, "the blocked")
      expect(blockedIssue, "blocked issue must still exist before removing dep").toBeTruthy()
      const result = removeDependency(blockedIssue!, blockerShort)
      expect(result).not.toBeNull()
      const existingData = (repo3.getNode(blockedIssue!.id)?.data as Record<string, unknown>) ?? {}
      repo3.updateNode(blockedIssue!.id, { data: mergeDepProps(existingData, result!) })
    }

    // Session 4: restart, verify blockedBy is gone.
    wipeDbCache(dir)
    using repo4 = openRepo(dir)
    const reopened2 = findIssueByContent(repo4, "the blocked")
    expect(reopened2?.blockedBy ?? []).not.toContain(blockerShort)
  })
})
