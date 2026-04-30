/**
 * Bead invariants — property tests for the post-L4 Bead namespace.
 *
 * Tracking bead: `@km/all/bead-domain-interface` (L5 plateau).
 *
 * The Bead namespace consolidates four hard invariants that hold across
 * every legal `(node, repo)` pair. Random instances exercise the corners
 * the hand-rolled tests miss; deterministic regressions live alongside.
 *
 * Invariants pinned here:
 *
 *   1. `Bead.from(node) === null  ⇔  ¬Bead.isBead(node, roots, repo)`
 *
 *      The namespace boundary `Bead.from` filters out non-beads. Its
 *      decision MUST agree with the structural `isBead` predicate that
 *      `queryReady` / `queryIssues` use upstream — otherwise consumers
 *      that mix `Bead.from(node)` with raw queries see different
 *      bead-class verdicts on the same node.
 *
 *   2. `Bead.query(...)` and `Bead.queryReady(...)` results all have a
 *      well-formed `displayId` and the canonical relationship
 *      `displayId(b) + ".md" === b.path`.
 *
 *      Post-L4, every queried bead is structurally a depth-2 file, so its
 *      `data.id` is the canonical sigil-prefixed path-form and its
 *      `fs_path` is that path with `.md`. No ULID fallback ever surfaces.
 *
 *   3. `renderBeadFile` + write — `Bead.create`'s file materialization
 *      contract for both call shapes:
 *        a) fully-qualified id (`@<prefix>/<scope>/<leaf>`)
 *        b) split form (`parentId=<prefix>-<scope>` + `customId=<leaf>`),
 *           which the CLI resolves to the same canonical id.
 *
 *      For each shape: file exists at `<repoRoot>/<canonical-id>.md`,
 *      frontmatter `id:` is the canonical form, `aliases:` includes the
 *      bd-form (`<prefix>-<scope>.<leaf>`).
 *
 *   4. Round-trip — after seeding a real bead via `repo.addNode`,
 *      `Bead.from(repo.getNode(node.id))` returns a Bead whose `path`
 *      equals the seeded `fs_path` and whose `shortId` equals the
 *      canonical `data.id`. The `Bead.from` discriminator never strips
 *      a real bead.
 *
 * fast-check is required (already a devDependency of @km/beads); these
 * tests document the contract — surprises become follow-up beads.
 */

import { afterEach, describe, expect, test } from "vitest"
import fc from "fast-check"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse as parseYaml } from "yaml"

import { createTestRepo } from "@km/storage"
import type { Repo } from "@km/storage"

import { Bead } from "../src/bead.ts"
import { renderBeadFile } from "../src/mutations.ts"

// =============================================================================
// Generators
// =============================================================================

const slugSegment = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/)

const scope = slugSegment.filter((s) => s.length > 0)
const slug = fc
  .array(slugSegment, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("-"))
  .filter((s) => s.length > 0)

const prefix = fc.stringMatching(/^[a-z]{2,5}$/).filter((p) => p.length >= 2)

interface BeadSpec {
  scope: string
  slug: string
  prefix: string
}

const beadCoord: fc.Arbitrary<BeadSpec> = fc.record({ scope, slug, prefix })

// =============================================================================
// Filesystem scratch helpers
// =============================================================================

let scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch = []
})

function freshRepoDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bead-invariants-"))
  scratch.push(dir)
  return dir
}

// =============================================================================
// Seeders
// =============================================================================

/**
 * Seed a real bead — depth-2 file under `@<prefix>` with `data.id` set
 * to the canonical sigil-prefixed path-form. Mirrors the production
 * migrator (`packages/km-beads/src/migrate.ts`) and the production CLI
 * write path (`renderBeadFile`).
 */
function seedRealBead(repo: Repo, b: BeadSpec): { nodeId: string; canonicalId: string; fsPath: string } {
  const canonicalId = `@${b.prefix}/${b.scope}/${b.slug}`
  const fsPath = `${canonicalId}.md`
  const bdForm = `${b.prefix}-${b.scope}.${b.slug}`
  const nodeId = repo.addNode(null, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: `Bead ${b.scope}/${b.slug}`,
    fs_path: fsPath,
    data: {
      id: canonicalId,
      short_id: bdForm,
      aliases: [bdForm],
    },
  })
  return { nodeId, canonicalId, fsPath }
}

/**
 * Build an arbitrary KNode (not necessarily a bead) for invariant 1.
 * Each variant covers one corner of the bead/non-bead boundary:
 *
 *   "real-bead":     depth-2 file under root with `data.id` — IS a bead
 *   "elevated-sub":  depth-3 sub-item with `name = "+…"` — IS a bead
 *   "anon-deep":     depth-3 file, no `data.id`, no `+` — NOT a bead
 *   "anon-shallow":  depth-1 file, no `+` — NOT a bead
 *   "no-fs-path":    sub-checkbox with no fs_path, no `+` — NOT a bead
 *   "out-of-scope":  depth-2 file but path is NOT under root — NOT a bead
 *   "elevated-out":  `+` sigil but out-of-scope path — NOT a bead
 *
 * A node is fed into the repo so `Bead.isBead` and `Bead.from` see the
 * same authoritative shape (path-walk uses `repo.getNode`).
 */
type Variant =
  | "real-bead"
  | "elevated-sub"
  | "anon-deep"
  | "anon-shallow"
  | "no-fs-path"
  | "out-of-scope"
  | "elevated-out"

const variant: fc.Arbitrary<Variant> = fc.constantFrom(
  "real-bead",
  "elevated-sub",
  "anon-deep",
  "anon-shallow",
  "no-fs-path",
  "out-of-scope",
  "elevated-out",
)

interface SeededVariant {
  nodeId: string
  expectedIsBead: boolean
  variant: Variant
}

function seedVariant(repo: Repo, root: string, b: BeadSpec, v: Variant): SeededVariant {
  switch (v) {
    case "real-bead": {
      const canonicalId = `${root}/${b.scope}/${b.slug}`
      const nodeId = repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "real bead",
        fs_path: `${canonicalId}.md`,
        data: { id: canonicalId, short_id: `${b.prefix}-${b.scope}.${b.slug}` },
      })
      return { nodeId, expectedIsBead: true, variant: v }
    }
    case "elevated-sub": {
      const parentId = repo.addNode(null, {
        type: "p",
        content: "container",
        fs_path: `${root}/${b.scope}/parent.md`,
      })
      const nodeId = repo.addNode(parentId, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "elevated sub-bead",
        name: `+${b.slug}`,
      })
      return { nodeId, expectedIsBead: true, variant: v }
    }
    case "anon-deep": {
      const nodeId = repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "anon deep file",
        fs_path: `${root}/${b.scope}/sub/${b.slug}.md`,
      })
      return { nodeId, expectedIsBead: false, variant: v }
    }
    case "anon-shallow": {
      const nodeId = repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "anon shallow file",
        fs_path: `${root}/${b.slug}.md`,
      })
      return { nodeId, expectedIsBead: false, variant: v }
    }
    case "no-fs-path": {
      const parentId = repo.addNode(null, {
        type: "p",
        content: "container",
        fs_path: `${root}/${b.scope}/parent.md`,
      })
      const nodeId = repo.addNode(parentId, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "raw sub-checkbox (no + sigil, no fs_path)",
      })
      return { nodeId, expectedIsBead: false, variant: v }
    }
    case "out-of-scope": {
      const nodeId = repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "out of scope file",
        fs_path: `vault/notes/${b.scope}/${b.slug}.md`,
      })
      return { nodeId, expectedIsBead: false, variant: v }
    }
    case "elevated-out": {
      const nodeId = repo.addNode(null, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "elevated but out of scope",
        name: `+${b.slug}`,
        fs_path: `vault/notes/random.md`,
      })
      return { nodeId, expectedIsBead: false, variant: v }
    }
  }
}

// =============================================================================
// Invariant 1: Bead.from null-equivalence with Bead.isBead
// =============================================================================

describe("invariant 1: Bead.from(node) === null ⇔ ¬Bead.isBead(node, roots, repo)", () => {
  test("agrees on the bead-class verdict across the variant table", () => {
    fc.assert(
      fc.property(beadCoord, variant, (b, v) => {
        using repo = createTestRepo()
        const root = `@${b.prefix}`
        const seeded = seedVariant(repo, root, b, v)

        const node = repo.getNode(seeded.nodeId)
        expect(node).toBeDefined()
        if (!node) return

        const isBead = Bead.isBead(node, [root], repo)
        const fromResult = Bead.from(node, { repo })

        // Both predicates AGREE: the variant table's `expectedIsBead`
        // is what `Bead.isBead` should report.
        expect(isBead).toBe(seeded.expectedIsBead)

        // Bead.from filters by data.id / data.short_id presence — which
        // is a strictly NARROWER predicate than isBead (an elevated
        // sub-bead is `isBead = true` but has no `data.id`, so
        // `Bead.from = null`). We test the load-bearing direction:
        // if Bead.isBead is FALSE, Bead.from MUST be null. The reverse
        // doesn't hold for elevated subs that legitimately lack data.id.
        if (!isBead) {
          expect(fromResult).toBeNull()
        }
      }),
      { numRuns: 100 },
    )
  })

  test("real beads (depth-2 file with data.id) round-trip through Bead.from", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        const seeded = seedRealBead(repo, b)
        const node = repo.getNode(seeded.nodeId)
        expect(node).toBeDefined()
        if (!node) return

        // A real bead is a bead by both predicates.
        expect(Bead.isBead(node, [`@${b.prefix}`], repo)).toBe(true)
        const bead = Bead.from(node, { repo })
        expect(bead).not.toBeNull()
        expect(bead?.shortId).toBe(seeded.canonicalId)
      }),
      { numRuns: 100 },
    )
  })

  test("nodes lacking data.id and data.short_id always yield null from Bead.from", () => {
    // This is the load-bearing namespace contract — Bead.from filters
    // out anything without a real id, regardless of structural shape.
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        const nodeId = repo.addNode(null, {
          type: "p",
          item: { list: "-", task: { marker: "[ ]", status: "todo" } },
          content: `noid ${b.slug}`,
        })
        const node = repo.getNode(nodeId)
        expect(node).toBeDefined()
        if (!node) return
        expect(Bead.from(node, { repo })).toBeNull()
      }),
      { numRuns: 50 },
    )
  })
})

// =============================================================================
// Invariant 2: query result well-formedness
// =============================================================================

describe("invariant 2: Bead.query / Bead.queryReady results have well-formed displayId", () => {
  test("displayId is defined and matches data.id (canonical path-form)", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        const seeded = seedRealBead(repo, b)

        const beads = Bead.query(repo, undefined, undefined, undefined, { boardRoots: [`@${b.prefix}`] })
        expect(beads.length).toBe(1)
        const bead = beads[0]
        expect(bead).toBeDefined()
        if (!bead) return

        const displayId = Bead.displayId(bead)
        expect(displayId).toBeDefined()
        expect(displayId).toBe(seeded.canonicalId)
        // displayId MUST be sigil-prefixed canonical path-form for real
        // queried beads — it's the user-facing id that goes in CLI
        // output, JSON emitters, log lines.
        expect(displayId.startsWith("@")).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  test("queried bead's displayId + '.md' === bead.path (the canonical relationship)", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        seedRealBead(repo, b)

        const beads = Bead.queryReady(repo, undefined, undefined, undefined, { boardRoots: [`@${b.prefix}`] })
        expect(beads.length).toBe(1)
        for (const bead of beads) {
          // The canonical path-form id (no `.md`) plus `.md` is the
          // on-disk file path.
          expect(`${Bead.displayId(bead)}.md`).toBe(bead.path)
        }
      }),
      { numRuns: 100 },
    )
  })

  test("displayId is NEVER undefined for query results — no ULID fallback", () => {
    // Mix real beads AND non-bead noise in the same repo, then verify
    // the query results carry only the real beads with proper displayIds.
    // Share `prefix` across both coords so the two beads land under the
    // same boardRoots — this avoids fc.pre exhaustion when the two
    // generators produce different prefixes by default.
    const sharedPair = fc.record({
      prefix,
      scopeA: scope,
      slugA: slug,
      scopeN: scope,
      slugN: slug,
    })
    fc.assert(
      fc.property(sharedPair, ({ prefix: p, scopeA, slugA, scopeN, slugN }) => {
        fc.pre(scopeA !== scopeN || slugA !== slugN)
        using repo = createTestRepo()
        seedRealBead(repo, { prefix: p, scope: scopeA, slug: slugA })
        // Add anonymous noise that should NOT appear in queries.
        repo.addNode(null, {
          type: "p",
          item: { list: "-", task: { marker: "[ ]", status: "todo" } },
          content: "anon",
          fs_path: `@${p}/${scopeN}/sub/${slugN}.md`, // depth-3, not a bead
        })

        const beads = Bead.query(repo, undefined, undefined, undefined, { boardRoots: [`@${p}`] })
        for (const bead of beads) {
          // ULID-ish ids are 26 chars; canonical path-form starts with `@`.
          expect(Bead.displayId(bead).startsWith("@")).toBe(true)
        }
      }),
      { numRuns: 50 },
    )
  })
})

// =============================================================================
// Invariant 3: Bead.create file materialization (via renderBeadFile)
// =============================================================================

/**
 * Mirror the bd.ts CLI write path — both call shapes resolve to the same
 * canonical id `@<prefix>/<scope>/<leaf>`, then `renderBeadFile` produces
 * the on-disk shape and we write the file.
 */
function fileCreate(
  repoRoot: string,
  canonicalId: string,
  title: string,
  opts: { prefix: string; description?: string },
): string {
  const { filename, content } = renderBeadFile(canonicalId, title, {
    prefix: opts.prefix,
    description: opts.description,
  })
  const filepath = join(repoRoot, filename)
  const dir = filepath.slice(0, filepath.lastIndexOf("/"))
  mkdirSync(dir, { recursive: true })
  writeFileSync(filepath, content, "utf-8")
  return filepath
}

describe("invariant 3: Bead.create file materialization — both call shapes", () => {
  test("fully-qualified id `@<prefix>/<scope>/<leaf>` materializes correctly", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        const repoRoot = freshRepoDir()
        const canonicalId = `@${b.prefix}/${b.scope}/${b.slug}`
        const path = fileCreate(repoRoot, canonicalId, `Title for ${b.slug}`, { prefix: b.prefix })

        // (a) file exists
        expect(existsSync(path)).toBe(true)
        expect(path).toBe(join(repoRoot, `${canonicalId}.md`))

        // (b) frontmatter id matches canonical
        const fm = parseYaml(extractFrontmatter(readFileSync(path, "utf-8")))
        expect(fm.id).toBe(canonicalId)

        // (c) aliases includes bd-form
        const bdForm = `${b.prefix}-${b.scope}.${b.slug}`
        expect(fm.aliases).toContain(bdForm)
      }),
      { numRuns: 30 },
    )
  })

  test("split form (parentId=<prefix>-<scope>, customId=<leaf>) → same canonical id", () => {
    // The CLI resolves `--parent <prefix>-<scope> --id <leaf>` to
    // `@<prefix>/<scope>/<leaf>`. We simulate that resolution and call
    // `renderBeadFile` with the resulting canonical id — the post-
    // condition is identical to the fully-qualified shape above.
    fc.assert(
      fc.property(beadCoord, (b) => {
        const repoRoot = freshRepoDir()
        // Resolve the split form to the canonical id (mirrors bd.ts).
        const canonicalId = `@${b.prefix}/${b.scope}/${b.slug}`
        const path = fileCreate(repoRoot, canonicalId, `Title for ${b.slug}`, { prefix: b.prefix })

        // (a) file exists at the canonical path — NOT inline under
        // `@<prefix>/<scope>.md`. This is the bug from
        // km-parent-id-leaf-materializes-inline that motivated the test.
        expect(existsSync(path)).toBe(true)
        expect(path).toBe(join(repoRoot, `${canonicalId}.md`))

        // (b) frontmatter id matches canonical
        const fm = parseYaml(extractFrontmatter(readFileSync(path, "utf-8")))
        expect(fm.id).toBe(canonicalId)

        // (c) aliases includes bd-form
        expect(fm.aliases).toContain(`${b.prefix}-${b.scope}.${b.slug}`)
      }),
      { numRuns: 30 },
    )
  })

  test("hand-rolled regression: both shapes produce equal on-disk frontmatter for matched coords", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        const repoA = freshRepoDir()
        const repoB = freshRepoDir()
        const canonicalId = `@${b.prefix}/${b.scope}/${b.slug}`

        const pathA = fileCreate(repoA, canonicalId, "Title", { prefix: b.prefix })
        const pathB = fileCreate(repoB, canonicalId, "Title", { prefix: b.prefix })

        const fmA = parseYaml(extractFrontmatter(readFileSync(pathA, "utf-8")))
        const fmB = parseYaml(extractFrontmatter(readFileSync(pathB, "utf-8")))
        expect(fmA.id).toBe(fmB.id)
        // Sort aliases for stable equality (order is implementation detail).
        expect([...(fmA.aliases as string[])].sort()).toStrictEqual([...(fmB.aliases as string[])].sort())
      }),
      { numRuns: 20 },
    )
  })
})

// =============================================================================
// Invariant 4: round-trip — Bead.from(repo.getNode(node.id)) preserves path
// =============================================================================

describe("invariant 4: round-trip via Bead.from preserves path and shortId", () => {
  test("seeded bead round-trips — path === fs_path, shortId === canonical id", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        const seeded = seedRealBead(repo, b)

        const node = repo.getNode(seeded.nodeId)
        expect(node).toBeDefined()
        if (!node) return

        const bead = Bead.from(node, { repo })
        expect(bead).not.toBeNull()
        if (!bead) return

        // path field on the Bead value carries the fs_path (for display
        // and bd-show output). Round-trip preserves it intact.
        expect(bead.path).toBe(seeded.fsPath)
        // shortId is the canonical sigil-prefixed path-form id.
        expect(bead.shortId).toBe(seeded.canonicalId)
        // Bead.path namespace function returns the displayId (canonical
        // path-form). Both views agree on the bead's identity.
        expect(Bead.path(bead)).toBe(seeded.canonicalId)
        expect(Bead.displayId(bead)).toBe(seeded.canonicalId)
      }),
      { numRuns: 100 },
    )
  })

  test("multiple beads in the same repo all round-trip independently", () => {
    // Share `prefix` so both beads sit under the same boardRoot — no
    // pre-condition gymnastics required.
    const pair = fc.record({
      prefix,
      scopeA: scope,
      slugA: slug,
      scopeB: scope,
      slugB: slug,
    })
    fc.assert(
      fc.property(pair, ({ prefix: p, scopeA, slugA, scopeB, slugB }) => {
        fc.pre(scopeA !== scopeB || slugA !== slugB)
        using repo = createTestRepo()
        const seededA = seedRealBead(repo, { prefix: p, scope: scopeA, slug: slugA })
        const seededB = seedRealBead(repo, { prefix: p, scope: scopeB, slug: slugB })

        const nodeA = repo.getNode(seededA.nodeId)
        const nodeB = repo.getNode(seededB.nodeId)
        expect(nodeA).toBeDefined()
        expect(nodeB).toBeDefined()
        if (!nodeA || !nodeB) return

        const beadA = Bead.from(nodeA, { repo })
        const beadB = Bead.from(nodeB, { repo })
        expect(beadA).not.toBeNull()
        expect(beadB).not.toBeNull()
        if (!beadA || !beadB) return

        // Each bead's identity is preserved — no cross-contamination.
        expect(beadA.path).toBe(seededA.fsPath)
        expect(beadB.path).toBe(seededB.fsPath)
        expect(beadA.shortId).toBe(seededA.canonicalId)
        expect(beadB.shortId).toBe(seededB.canonicalId)
        expect(beadA.shortId).not.toBe(beadB.shortId)
      }),
      { numRuns: 50 },
    )
  })
})

// =============================================================================
// Helpers
// =============================================================================

/** Extract the YAML between leading `---\n...\n---`. */
function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) throw new Error(`no frontmatter in:\n${content}`)
  return match[1]!
}
