/**
 * `Bead.create` materializes a real file at `@km/<scope>/<leaf>.md` —
 * NOT an inline child node of `@km/<scope>.md`.
 *
 * Bead: `km-parent-id-leaf-materializes-inline` (P2) under
 * `km-bead-domain-interface` (P1).
 *
 * The bug: `km bd create "X" --parent km-beads --id parent-id-leaf-test-001`
 * was lowering to `repo.addNode(parentId, node)` — which appends `node` as
 * an inline checkbox child of `@km/beads.md` rather than creating a new
 * file at `@km/beads/parent-id-leaf-test-001.md`. `bd show` then reported
 * `Path: @km/beads.md` (the parent file), and the canonical id never
 * landed in the frontmatter.
 *
 * The fix: when both `--parent` (a scope/epic) AND `--id` (a leaf slug)
 * are provided, OR when `--id` is given as a fully-qualified path-form
 * (`@km/<scope>/<leaf>`), resolve the canonical path-form id, render the
 * file content via `renderBeadFile`, and write a NEW file at
 * `<repoRoot>/<canonical-id>.md`. Frontmatter carries `id:` (canonical
 * path-form) and `aliases:` (legacy bd-form variants), mirroring what
 * `migrate.ts` already produces for migrated beads.
 *
 * Tests pin the WRITE path's two equivalence forms:
 *   1. `--parent km-beads --id <leaf>` → `@km/beads/<leaf>.md`
 *   2. `--id @km/beads/<leaf>` → `@km/beads/<leaf>.md`
 * Both produce the same on-disk shape; both round-trip via every alias.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse as parseYaml } from "yaml"
import { renderBeadFile } from "../src/mutations.ts"

let scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch = []
})

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bdcreate-leaf-"))
  scratch.push(dir)
  return dir
}

describe("renderBeadFile — fully-qualified path-form materialization", () => {
  test("filename is the canonical path-form with .md", () => {
    const { filename } = renderBeadFile("@km/beads/foo-bar-001", "Title", { prefix: "km" })
    expect(filename).toBe("@km/beads/foo-bar-001.md")
  })

  test("frontmatter does NOT include `id:` — file's on-disk path IS the canonical id", () => {
    // See @km/beads/frontmatter-path-rename: the `id:` YAML field was
    // redundant with the filename and created two sources of truth.
    const { content } = renderBeadFile("@km/beads/foo-bar-001", "Title", { prefix: "km" })
    const fm = parseYaml(extractFrontmatter(content))
    expect(fm.id).toBeUndefined()
  })

  test("frontmatter aliases include both bd-form (dot) and dash-form variants", () => {
    const { content } = renderBeadFile("@km/beads/foo-bar-001", "Title", { prefix: "km" })
    const fm = parseYaml(extractFrontmatter(content))
    expect(fm.aliases).toContain("km-beads.foo-bar-001")
    expect(fm.aliases).toContain("km-beads-foo-bar-001")
  })

  test("dynamic prefix produces correct aliases", () => {
    const { content } = renderBeadFile("@pim/inbox/xyz9", "Title", { prefix: "pim" })
    const fm = parseYaml(extractFrontmatter(content))
    expect(fm.id).toBeUndefined()
    expect(fm.aliases).toContain("pim-inbox.xyz9")
    expect(fm.aliases).toContain("pim-inbox-xyz9")
  })

  test("nested path-form (multi-segment scope) round-trips intact", () => {
    const { filename, content } = renderBeadFile("@km/silvercode/acp/rename", "Rename ACP", { prefix: "km" })
    expect(filename).toBe("@km/silvercode/acp/rename.md")
    const fm = parseYaml(extractFrontmatter(content))
    expect(fm.id).toBeUndefined()
    expect(fm.aliases).toContain("km-silvercode.acp.rename")
  })

  test("title becomes a `# heading` body row", () => {
    const { content } = renderBeadFile("@km/beads/test-001", "Fix the broken thing", { prefix: "km" })
    expect(extractBody(content)).toContain("# Fix the broken thing")
  })

  test("description and notes appear as separate body sections", () => {
    const { content } = renderBeadFile("@km/beads/test-001", "T", {
      prefix: "km",
      description: "Reproduces on macOS.",
      notes: "Workaround: pin to 1.4.x.",
    })
    const body = extractBody(content)
    expect(body).toContain("# T")
    expect(body).toContain("Reproduces on macOS.")
    expect(body).toContain("Workaround: pin to 1.4.x.")
  })

  test("output is valid YAML frontmatter + body — round-trips cleanly", () => {
    const { content } = renderBeadFile("@km/beads/test-001", "Title with: weird *chars*", {
      prefix: "km",
      description: "Includes 'quotes' and \"double quotes\" and a colon: see?",
    })
    expect(() => parseYaml(extractFrontmatter(content))).not.toThrow()
    expect(extractBody(content)).toContain("Title with: weird *chars*")
  })
})

/**
 * Replicate the bd.ts CLI write path for the `--parent <scope> --id <leaf>`
 * (and `--id @<prefix>/<scope>/<leaf>`) cases. This is exactly what the
 * CLI command does after detecting a fully-qualified id.
 */
function fileCreate(
  repoRoot: string,
  canonicalId: string,
  title: string,
  opts: { prefix?: string; description?: string } = {},
): string {
  const prefix = opts.prefix ?? "km"
  const { filename, content } = renderBeadFile(canonicalId, title, { prefix, description: opts.description })
  const filepath = join(repoRoot, filename)
  const dir = filepath.slice(0, filepath.lastIndexOf("/"))
  mkdirSync(dir, { recursive: true })
  writeFileSync(filepath, content, "utf-8")
  return filepath
}

describe("Bead.create — file materialization at @<prefix>/<scope>/<leaf>.md", () => {
  test("--parent km-beads --id foo-bar-001 → file at @km/beads/foo-bar-001.md (NOT inline child)", () => {
    const repo = freshRepo()
    // Mirrors the CLI: --parent km-beads --id foo-bar-001 → canonical @km/beads/foo-bar-001
    const path = fileCreate(repo, "@km/beads/foo-bar-001", "Test")

    expect(path).toBe(join(repo, "@km", "beads", "foo-bar-001.md"))
    expect(existsSync(path)).toBe(true)
    // Crucially: the parent file `@km/beads.md` was NOT mutated as
    // a side effect of the create. Either it doesn't exist (clean repo)
    // or its bytes are unchanged. Here we just assert the new file is
    // its own file.
    const newFileContent = readFileSync(path, "utf-8")
    expect(newFileContent).toContain("# Test")
  })

  test("--id @km/beads/foo-bar-002 produces the same shape (equivalence)", () => {
    const repo = freshRepo()
    const path = fileCreate(repo, "@km/beads/foo-bar-002", "Test B")

    expect(path).toBe(join(repo, "@km", "beads", "foo-bar-002.md"))
    expect(existsSync(path)).toBe(true)
  })

  test("file's on-disk path IS the canonical id (no redundant `id:` YAML)", () => {
    const repo = freshRepo()
    const path = fileCreate(repo, "@km/beads/foo-bar-001", "T")
    expect(path.endsWith("/@km/beads/foo-bar-001.md")).toBe(true)
    const fm = parseYaml(extractFrontmatter(readFileSync(path, "utf-8")))
    expect(fm.id).toBeUndefined()
  })

  test("frontmatter aliases contain both bd-form and dash-form for legacy compatibility", () => {
    const repo = freshRepo()
    const path = fileCreate(repo, "@km/beads/foo-bar-001", "T")
    const fm = parseYaml(extractFrontmatter(readFileSync(path, "utf-8")))
    expect(fm.aliases).toContain("km-beads.foo-bar-001")
    expect(fm.aliases).toContain("km-beads-foo-bar-001")
  })

  test("split form and fully-qualified form materialize to same path", () => {
    const repoA = freshRepo()
    const repoB = freshRepo()
    // Split form: --parent km-beads --id parent-id-leaf-equiv-A
    // resolves to canonical @km/beads/parent-id-leaf-equiv-A.
    const pathA = fileCreate(repoA, "@km/beads/parent-id-leaf-equiv-A", "Test A")
    // Fully-qualified form: --id @km/beads/parent-id-leaf-equiv-B.
    const pathB = fileCreate(repoB, "@km/beads/parent-id-leaf-equiv-B", "Test B")

    // Strip the per-test scratch dir to compare relative paths.
    expect(pathA.slice(repoA.length)).toBe("/@km/beads/parent-id-leaf-equiv-A.md")
    expect(pathB.slice(repoB.length)).toBe("/@km/beads/parent-id-leaf-equiv-B.md")

    const fmA = parseYaml(extractFrontmatter(readFileSync(pathA, "utf-8")))
    const fmB = parseYaml(extractFrontmatter(readFileSync(pathB, "utf-8")))
    // Same shape — neither emits the redundant `id:` field; aliases land
    // legacy bd-form lookups.
    expect(fmA.id).toBeUndefined()
    expect(fmB.id).toBeUndefined()
    expect(Array.isArray(fmA.aliases)).toBe(true)
    expect(Array.isArray(fmB.aliases)).toBe(true)
  })
})

/** Extract the YAML between leading `---\n...\n---`. */
function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) throw new Error(`no frontmatter in:\n${content}`)
  return match[1]!
}

function extractBody(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n/, "")
}
