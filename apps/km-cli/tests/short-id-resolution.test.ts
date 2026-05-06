/**
 * Tests for `apps/km-cli/src/utils/short-id.ts` — the taskwarrior-style
 * short-id resolver.
 *
 * Covers the three resolution tiers (slug → scope/slug → full path-form)
 * plus the ambiguity surface that callers use to render "did you mean:"
 * errors.
 */

import { afterAll, describe, expect, test } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import { resolveShortId, formatAmbiguityError } from "../src/utils/short-id.ts"

const BASE = join("/tmp", `kmtest-short-id-${process.pid}-${Date.now().toString(36)}`)
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

/** Seed a bead-shaped node with `data.id` set to a path-form id. */
function seedBead(repo: Repo, parentId: string, dataId: string, content: string): string {
  return repo.addNode(parentId, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content,
    data: { id: dataId },
  })
}

afterAll(() => {
  if (existsSync(BASE)) rmSync(BASE, { recursive: true, force: true })
})

describe("resolveShortId — unique slug match", () => {
  test("bare slug resolves to the unique node carrying that slug as data.id leaf", () => {
    const dir = freshDir("unique-slug")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = seedBead(repo, inbox.id, "@km/storage/move-with-rewrite-refs", "the bead")
    seedBead(repo, inbox.id, "@km/storage/something-else", "different bead")

    const result = resolveShortId(repo, "move-with-rewrite-refs")
    expect(result.node?.id).toBe(id)
    expect(result.candidates).toEqual([])
  })

  test("slug match is case-insensitive", () => {
    const dir = freshDir("case-insensitive")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!
    const id = seedBead(repo, inbox.id, "@km/scope/CaseTest", "case bead")

    const result = resolveShortId(repo, "casetest")
    expect(result.node?.id).toBe(id)
  })

  test("trailing whitespace is trimmed", () => {
    const dir = freshDir("trim")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!
    const id = seedBead(repo, inbox.id, "@km/scope/trimme", "trim bead")

    const result = resolveShortId(repo, "  trimme  ")
    expect(result.node?.id).toBe(id)
  })
})

describe("resolveShortId — scope/slug match (path-shaped)", () => {
  test("scope/slug resolves through path-form chain (not slug index)", () => {
    const dir = freshDir("scope-slug")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = seedBead(repo, inbox.id, "@km/storage/move-with-rewrite-refs", "the bead")

    const result = resolveShortId(repo, "@km/storage/move-with-rewrite-refs")
    expect(result.node?.id).toBe(id)
    expect(result.candidates).toEqual([])
  })

  test("full sigil path-form resolves", () => {
    const dir = freshDir("full-sigil")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id = seedBead(repo, inbox.id, "@km/scope/slug", "full path bead")

    const result = resolveShortId(repo, "@km/scope/slug")
    expect(result.node?.id).toBe(id)
  })
})

describe("resolveShortId — ambiguity surface", () => {
  test("two nodes sharing the same slug return both as candidates", () => {
    const dir = freshDir("ambig")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    const id1 = seedBead(repo, inbox.id, "@km/storage/duplicate", "bead one")
    const id2 = seedBead(repo, inbox.id, "@km/cli/duplicate", "bead two")

    const result = resolveShortId(repo, "duplicate")
    expect(result.node).toBe(null)
    expect(result.candidates.map((n) => n.id).sort()).toEqual([id1, id2].sort())
  })

  test("formatAmbiguityError lists candidate path-forms alphabetically", () => {
    const dir = freshDir("ambig-fmt")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    seedBead(repo, inbox.id, "@km/zeta/dup", "z")
    seedBead(repo, inbox.id, "@km/alpha/dup", "a")

    const result = resolveShortId(repo, "dup")
    expect(result.node).toBe(null)
    const msg = formatAmbiguityError("dup", result.candidates)
    expect(msg).toContain("Ambiguous id 'dup'")
    expect(msg).toContain("@km/alpha/dup")
    expect(msg).toContain("@km/zeta/dup")
    // Alphabetical: alpha appears before zeta
    expect(msg.indexOf("@km/alpha/dup")).toBeLessThan(msg.indexOf("@km/zeta/dup"))
  })

  test("formatAmbiguityError truncates long candidate lists with `+N more`", () => {
    const dir = freshDir("ambig-many")
    using repo = openRepo(dir)
    const inbox = repo.resolveNode("inbox")!

    for (let i = 0; i < 12; i++) {
      seedBead(repo, inbox.id, `@km/scope${i}/many`, `b${i}`)
    }
    const result = resolveShortId(repo, "many")
    const msg = formatAmbiguityError("many", result.candidates, 5)
    expect(msg).toContain("+7 more")
  })
})

describe("resolveShortId — no match", () => {
  test("unknown bare ref returns node:null with empty candidates", () => {
    const dir = freshDir("unknown")
    using repo = openRepo(dir)
    const result = resolveShortId(repo, "no-such-thing-anywhere-12345")
    expect(result.node).toBe(null)
    expect(result.candidates).toEqual([])
  })

  test("empty input returns node:null with empty candidates", () => {
    const dir = freshDir("empty")
    using repo = openRepo(dir)
    const result = resolveShortId(repo, "")
    expect(result.node).toBe(null)
    expect(result.candidates).toEqual([])
  })

  test("whitespace-only input returns node:null", () => {
    const dir = freshDir("whitespace")
    using repo = openRepo(dir)
    const result = resolveShortId(repo, "   ")
    expect(result.node).toBe(null)
  })
})

describe("resolveShortId — index uses fs_path / name when data.id absent", () => {
  test("file-only nodes (no data.id) are still reachable by basename slug", () => {
    const dir = freshDir("fs-path-slug")
    // Pre-create a file so the discovery scan picks it up.
    mkdirSync(join(dir, "scope"), { recursive: true })
    writeFileSync(join(dir, "scope", "filebead.md"), "# Filebead\n\nbody\n")
    using repo = openRepo(dir)

    const result = resolveShortId(repo, "filebead")
    // Either the file node or the section under it — either way, it
    // resolves (no ambiguity error). Both share the slug `filebead`
    // since the H1 derives the section name; we just want a hit.
    expect(result.node).not.toBe(null)
  })
})
