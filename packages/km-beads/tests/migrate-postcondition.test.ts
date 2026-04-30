/**
 * Migration post-condition: visible == migrated.
 *
 * Companion to {@link migrate.test.ts} (per-helper unit pins) and
 * {@link migrate-roundtrip.fuzz.test.ts} (frontmatter round-trip
 * property). This test pins the *batch* invariant that motivates bead
 * `km-beads-migrate-postcondition-plateau`:
 *
 *   For every issue in the source export, after `migrateBeadsToMarkdown`
 *   returns, that issue is:
 *
 *     1. counted in `result.migrated` (no silent drops),
 *     2. emitted as a markdown file in `result.files`,
 *     3. resolvable from the on-disk vault via every form a caller might
 *        legitimately reference it as — bd-form (dot + dash), canonical
 *        path-form, slug-augmented path-form (for numeric leaves), the
 *        scope-epic synthetic path, the `_orphan/` parking lot.
 *
 * The third clause mirrors the index `bd-migrate.ts buildVaultIdIndex`
 * builds at recapture time: every bead must be findable by `frontmatter.id`
 * AND by every entry in `frontmatter.aliases`. If the postcondition fails
 * here, `bd migrate` silently dropped beads from the vault — the same class
 * of bug that motivates the plateau.
 *
 * The test uses a real on-disk fs (tmp dir) instead of an in-memory fake
 * because the postcondition is fundamentally about disk state — what
 * `km bd list` and `km bd show` see when they walk the vault. An
 * in-memory fake could mask path normalization or directory-creation bugs.
 */

import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { describe, it, expect, afterEach } from "vitest"
import { parse as parseYaml } from "yaml"
import { bdIdToPathForm, buildIdMap, migrateBeadsToMarkdown, splitFrontmatter } from "../src/migrate.ts"
import type { BeadsFs } from "../src/types.ts"
import type { BeadsIssue } from "../src/schema.ts"

const nodeFs: BeadsFs = { existsSync, readFileSync, writeFileSync, mkdirSync }

/**
 * Build a `bdId → file path` index by walking `vaultRoot`, parsing
 * frontmatter from every `.md` file, and indexing by `id` + `aliases`
 * + `short_id`. Mirrors the runtime index `bd-migrate.ts` builds for
 * --update-only recapture, scoped down to a test-sized vault.
 */
function buildVaultIndex(vaultRoot: string): Map<string, string> {
  const index = new Map<string, string>()
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        walk(full)
        continue
      }
      if (!name.endsWith(".md")) continue
      const content = readFileSync(full, "utf-8")
      const split = splitFrontmatter(content)
      if (!split) continue
      const fm = (parseYaml(split.frontmatter) ?? {}) as Record<string, unknown>
      const id = typeof fm.id === "string" ? fm.id : null
      const aliases = Array.isArray(fm.aliases)
        ? (fm.aliases as unknown[]).filter((x): x is string => typeof x === "string")
        : []
      for (const key of [id, ...aliases]) {
        if (!key) continue
        if (!index.has(key)) index.set(key, full)
      }
    }
  }
  walk(vaultRoot)
  return index
}

/**
 * Synthesize the bd-export shape of a record. Mirrors what `bd export`
 * writes to `.beads/issues.jsonl`: one JSON record per line, with `_type`
 * discriminating issues from memories.
 */
function issueLine(issue: Partial<BeadsIssue> & { id: string; title: string }): string {
  const full = {
    _type: "issue",
    description: "",
    status: "open" as const,
    priority: 2,
    issue_type: "task",
    created_at: "2026-04-28T00:00:00Z",
    updated_at: "2026-04-28T00:00:00Z",
    ...issue,
  }
  return JSON.stringify(full)
}

/**
 * Set up a minimal `.beads/issues.jsonl` containing the given lines. The
 * structure mirrors the on-disk shape `migrateBeadsToMarkdown` consumes
 * (it accepts either a `.beads` dir or the `.jsonl` directly).
 */
function seedBeadsDir(repoRoot: string, lines: string[]): string {
  const beadsDir = join(repoRoot, ".beads")
  mkdirSync(beadsDir, { recursive: true })
  writeFileSync(join(beadsDir, "issues.jsonl"), lines.join("\n"), "utf-8")
  return beadsDir
}

describe("migrateBeadsToMarkdown — post-condition: every input id is resolvable post-migration", () => {
  const tmpRoots: string[] = []
  afterEach(() => {
    for (const root of tmpRoots.splice(0)) {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        // best-effort — tmp is gc'd by the OS regardless
      }
    }
  })

  function freshTmp(): { repoRoot: string; targetDir: string } {
    const repoRoot = mkdtempSync(join(tmpdir(), "km-migrate-postcond-"))
    tmpRoots.push(repoRoot)
    const targetDir = join(repoRoot, "beads")
    mkdirSync(targetDir, { recursive: true })
    return { repoRoot, targetDir }
  }

  it("count(migrated files) == count(input issues), zero errors, zero skips", () => {
    const { repoRoot, targetDir } = freshTmp()

    // Mixed corpus exercising every routing branch the migrator owns:
    //   - canonical scope.slug
    //   - scope-epic (no-dot id with dotted children → @<prefix>/<scope>.md)
    //   - orphan auto-id (no scope → @<prefix>/_orphan/<id>.md)
    //   - numeric-leaf (slug-augmented to keep filename legible)
    //   - parent + child path (dotted-2)
    //   - comments[] (rendered as @comments subsection)
    //   - parent_id reference
    //   - dependencies[] (cross-graph link)
    const issues: Array<Partial<BeadsIssue> & { id: string; title: string }> = [
      { id: "km-beads.cutover", title: "Cutover from Go bd to km bd" },
      { id: "km-beads.migrate-postcondition-plateau", title: "Post-migration index integrity" },
      // Scope epic — no dot, but km-beads.* children make it a scope.
      { id: "km-beads", title: "[epic] Beads scope", issue_type: "epic" },
      // Numeric leaf — slug augmentation triggers.
      { id: "km-rev-code-0203.1", title: "Remove ensureOpen anti-pattern" },
      { id: "km-rev-code-0203.2", title: "Convert getters to plain properties" },
      // Orphan auto-id (no dot, no children).
      { id: "km-q5hji", title: "Random auto-id orphan bead" },
      // Parent + child (3-level dotted path).
      { id: "km-silvery.virtualizer.from-layout", title: "Wire virtualizer from layout" },
      // With comments — exercises the @comments subsection emission.
      {
        id: "km-silvery.diagnostics-v2",
        title: "Diagnostics v2",
        comments: [
          { author: "claude", text: "first pass landed", created_at: "2026-04-20T01:00:00Z" },
          { author: "bjorn", text: "follow-up note", created_at: "2026-04-21T01:00:00Z" },
        ],
      },
      // With parent_id (legacy bd<v1.0) + dependencies (bd v1.0).
      {
        id: "km-storage.link-model-canonical",
        title: "Canonicalize link model",
        parent_id: "km-storage",
        dependencies: [
          {
            type: "blocks",
            issue_id: "km-storage.link-model-canonical",
            depends_on_id: "km-beads.cutover",
          },
        ],
      },
      // Status variants — closed bead must still migrate.
      {
        id: "km-beads.closed-example",
        title: "Already-closed bead",
        status: "closed" as const,
        closed_at: "2026-04-01T00:00:00Z",
      },
    ]

    const lines = issues.map(issueLine)
    const beadsDir = seedBeadsDir(repoRoot, lines)
    const result = migrateBeadsToMarkdown(beadsDir, {
      targetDir,
      memDir: join(targetDir, "@memory"),
      memSourceLabel: "km-test-2026-04-28",
      fs: nodeFs,
      sourcePrefix: "km",
    })

    // Postcondition #1 — counts agree: every input issue migrated, zero
    // dropped, zero unexpectedly skipped, zero errors. A failure here is
    // the literal symptom the plateau bead names.
    expect(result.errors).toEqual([])
    expect(result.skipped).toBe(0)
    expect(result.migrated).toBe(issues.length)
    expect(result.files).toHaveLength(issues.length)

    // Postcondition #2 — every emitted file actually exists on disk.
    for (const f of result.files) {
      expect(existsSync(f), `migrate reported ${f} but it isn't on disk`).toBe(true)
    }

    // Postcondition #3 — vault index built fresh from disk resolves every
    // input issue id (and every alias variant a caller might use). This
    // is the integrity guarantee `km bd show <id>` depends on.
    const index = buildVaultIndex(targetDir)
    const idMap = buildIdMap(issues as BeadsIssue[], "km")
    for (const issue of issues) {
      // bd-form id (canonical export shape) must resolve.
      expect(index.has(issue.id), `${issue.id} (bd-form) not resolvable post-migration`).toBe(true)

      // dash-form variant must resolve when the bd-form contained a dot.
      if (issue.id.includes(".")) {
        const dashForm = issue.id.replace(/\./g, "-")
        expect(index.has(dashForm), `${dashForm} (dash-form alias) not resolvable`).toBe(true)
      }

      // Canonical path-form (`@km/...`) must resolve. For scope-epic and
      // numeric-leaf ids this is the slug-augmented form from buildIdMap;
      // for everything else it falls back to bdIdToPathForm.
      const expectedPath = idMap.get(issue.id) ?? bdIdToPathForm(issue.id, "km")
      expect(expectedPath, `${issue.id} produced no path-form`).toBeTruthy()
      expect(index.has(expectedPath!), `${expectedPath} (path-form) not resolvable`).toBe(true)

      // The resolved file matches the expected path on disk: under
      // `<targetDir>/<path-form>.md`. Sanity-check both ends agree.
      const filepath = index.get(issue.id)!
      const rel = relative(targetDir, filepath).replace(/\\/g, "/")
      expect(rel, `${issue.id} landed at unexpected on-disk path`).toBe(`${expectedPath}.md`)
    }
  })

  it("orphan ids land under @<prefix>/_orphan/ so they don't collide with scoped beads", () => {
    const { repoRoot, targetDir } = freshTmp()
    const lines = [
      issueLine({ id: "km-q5hji", title: "First orphan" }),
      issueLine({ id: "km-z9abc", title: "Second orphan" }),
    ]
    seedBeadsDir(repoRoot, lines)

    const result = migrateBeadsToMarkdown(join(repoRoot, ".beads"), {
      targetDir,
      memDir: join(targetDir, "@memory"),
      fs: nodeFs,
      sourcePrefix: "km",
    })
    expect(result.migrated).toBe(2)
    expect(result.errors).toEqual([])

    expect(existsSync(join(targetDir, "@km/_orphan/q5hji.md"))).toBe(true)
    expect(existsSync(join(targetDir, "@km/_orphan/z9abc.md"))).toBe(true)
  })

  it("scope-epic with dotted children writes @<prefix>/<scope>.md as a sibling to the children directory", () => {
    const { repoRoot, targetDir } = freshTmp()
    const lines = [
      issueLine({ id: "km-silvery", title: "[epic] Silvery scope", issue_type: "epic" }),
      issueLine({ id: "km-silvery.foo", title: "Foo child" }),
      issueLine({ id: "km-silvery.bar", title: "Bar child" }),
    ]
    seedBeadsDir(repoRoot, lines)

    const result = migrateBeadsToMarkdown(join(repoRoot, ".beads"), {
      targetDir,
      memDir: join(targetDir, "@memory"),
      fs: nodeFs,
      sourcePrefix: "km",
    })
    expect(result.migrated).toBe(3)

    // Scope epic sits alongside its children directory — NOT parked under _orphan/.
    expect(existsSync(join(targetDir, "@km/silvery.md"))).toBe(true)
    expect(existsSync(join(targetDir, "@km/silvery/foo.md"))).toBe(true)
    expect(existsSync(join(targetDir, "@km/silvery/bar.md"))).toBe(true)
    // Negative: never wrongly routed to _orphan/.
    expect(existsSync(join(targetDir, "@km/_orphan/silvery.md"))).toBe(false)
  })

  it("numeric-leaf ids get slug-augmented filenames AND remain reachable via the bare path-form alias", () => {
    const { repoRoot, targetDir } = freshTmp()
    const lines = [
      issueLine({ id: "km-rev-code-0203.1", title: "Add keyboard nav" }),
      issueLine({ id: "km-rev-code-0203.2", title: "Convert getters" }),
    ]
    seedBeadsDir(repoRoot, lines)

    const result = migrateBeadsToMarkdown(join(repoRoot, ".beads"), {
      targetDir,
      memDir: join(targetDir, "@memory"),
      fs: nodeFs,
      sourcePrefix: "km",
    })
    expect(result.migrated).toBe(2)

    // Slug-augmented filename is what the user sees on disk.
    expect(existsSync(join(targetDir, "@km/rev-code-0203/1-add-keyboard-nav.md"))).toBe(true)

    // Bare path-form (`@km/rev-code-0203/1`) must remain in `aliases` so prose
    // still resolves it. Index it from disk and confirm.
    const index = buildVaultIndex(targetDir)
    expect(index.has("@km/rev-code-0203/1")).toBe(true)
    expect(index.has("km-rev-code-0203.1")).toBe(true)
    expect(index.has("km-rev-code-0203-1")).toBe(true)
  })

  it("dynamic sourcePrefix routes ids under @<prefix>/, not hardcoded @km/", () => {
    const { repoRoot, targetDir } = freshTmp()
    const lines = [
      issueLine({ id: "pim-tasks.inbox", title: "Inbox" }),
      issueLine({ id: "pim-q9zzz", title: "Pim orphan" }),
    ]
    seedBeadsDir(repoRoot, lines)

    const result = migrateBeadsToMarkdown(join(repoRoot, ".beads"), {
      targetDir,
      memDir: join(targetDir, "@memory"),
      fs: nodeFs,
      sourcePrefix: "pim",
    })
    expect(result.migrated).toBe(2)
    expect(existsSync(join(targetDir, "@pim/tasks/inbox.md"))).toBe(true)
    expect(existsSync(join(targetDir, "@pim/_orphan/q9zzz.md"))).toBe(true)
    // Negative: never leaks under @km/.
    expect(existsSync(join(targetDir, "@km"))).toBe(false)
  })

  it("status filter migrates only matching beads — non-matches drop silently and ARE expected", () => {
    const { repoRoot, targetDir } = freshTmp()
    const lines = [
      issueLine({ id: "km-foo.open-1", title: "Open one", status: "open" }),
      issueLine({ id: "km-foo.open-2", title: "Open two", status: "open" }),
      issueLine({ id: "km-foo.closed-1", title: "Closed one", status: "closed", closed_at: "2026-04-01T00:00:00Z" }),
    ]
    seedBeadsDir(repoRoot, lines)

    const result = migrateBeadsToMarkdown(join(repoRoot, ".beads"), {
      targetDir,
      memDir: join(targetDir, "@memory"),
      fs: nodeFs,
      sourcePrefix: "km",
      statusFilter: ["open"],
    })

    // Status filter is the ONE legitimate way to drop beads. The post-
    // condition `migrated == count(filter-matched input)` still holds.
    expect(result.migrated).toBe(2)
    expect(result.errors).toEqual([])

    const index = buildVaultIndex(targetDir)
    expect(index.has("km-foo.open-1")).toBe(true)
    expect(index.has("km-foo.open-2")).toBe(true)
    expect(index.has("km-foo.closed-1")).toBe(false)
  })
})
