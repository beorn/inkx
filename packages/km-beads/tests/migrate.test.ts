/**
 * Migrate helpers — slug-augmentation for numeric-leaf bd ids.
 *
 * bd auto-numbers sub-ids when callers don't supply a custom suffix
 * (`km-rev-code-0203.1`, `.2`, …); the bare numeric leaf is unhelpful
 * as a filename or card label after migration. These tests pin the
 * augmentation behavior + the parent-path exemption.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import {
  applyAddOnlyPatch,
  bdIdToPathForm,
  bdIdToPathFormWithSlug,
  bdIdToAliases,
  buildIdMap,
  issueToMarkdown,
  readBeadsExport,
  recaptureFromExport,
  rewriteLegacyIdMentions,
  splitFrontmatter,
} from "../src/migrate.ts"
import { parseBeadsIssuesJsonl } from "../src/schema.ts"
import type { BeadsFs } from "../src/types.ts"
import type { BeadsIssue } from "../src/schema.ts"

function fakeIssue(id: string, title: string, overrides: Partial<BeadsIssue> = {}): BeadsIssue {
  return {
    id,
    title,
    description: "",
    status: "open",
    priority: 2,
    issue_type: "task",
    created_at: "2026-04-28T00:00:00Z",
    ...overrides,
  } as BeadsIssue
}

describe("bdIdToPathFormWithSlug", () => {
  it("augments numeric leaf with title-derived slug", () => {
    expect(bdIdToPathFormWithSlug("km-rev-code-0203.1", "Add keyboard nav")).toBe(
      "@km/rev-code-0203/1-add-keyboard-nav",
    )
  })

  it("leaves non-numeric leaves untouched", () => {
    expect(bdIdToPathFormWithSlug("km-silvercode.acp.rename", "ACP rename")).toBe("@km/silvercode/acp/rename")
  })

  it("falls back to base path-form when slug is empty (title is all symbols)", () => {
    expect(bdIdToPathFormWithSlug("km-foo.1", "...")).toBe("@km/foo/1")
  })

  it("returns null for empty stripped id", () => {
    expect(bdIdToPathFormWithSlug("km-", "anything")).toBeNull()
  })
})

describe("buildIdMap", () => {
  it("augments leaf-only numeric ids", () => {
    const map = buildIdMap([
      fakeIssue("km-rev-code-0203.1", "Remove ensureOpen anti-pattern"),
      fakeIssue("km-rev-code-0203.2", "Convert getters to plain properties"),
    ])
    expect(map.get("km-rev-code-0203.1")).toBe("@km/rev-code-0203/1-remove-ensureopen-anti-pattern")
    expect(map.get("km-rev-code-0203.2")).toBe("@km/rev-code-0203/2-convert-getters-to-plain-properties")
  })

  it("routes scope epics (no-dot id with dotted children) to @<prefix>/<scope>.md, not _orphan/", () => {
    // km-silvery is the umbrella scope bead; km-silvery.foo and .bar are children
    const map = buildIdMap([
      fakeIssue("km-silvery", "[epic] Silvery render pipeline", { issue_type: "epic" }),
      fakeIssue("km-silvery.foo", "Foo"),
      fakeIssue("km-silvery.bar", "Bar"),
    ])
    expect(map.get("km-silvery")).toBe("@km/silvery")
    // Children are unaffected — they still go to their dotted paths via default routing.
    expect(map.has("km-silvery.foo")).toBe(false)
  })

  it("leaves no-dot orphan auto-ids in _orphan/ when they have no children", () => {
    // km-q5hji has no children — stays as orphan auto-id (no map entry, default routing)
    const map = buildIdMap([fakeIssue("km-q5hji", "Random auto-id bead")])
    expect(map.has("km-q5hji")).toBe(false)
    // Default routing still parks it under _orphan/
    expect(bdIdToPathForm("km-q5hji")).toBe("@km/_orphan/q5hji")
  })

  it("scope-epic routing uses the dynamic prefix", () => {
    const map = buildIdMap(
      [fakeIssue("pim-tasks", "[epic] PIM tasks", { issue_type: "epic" }), fakeIssue("pim-tasks.inbox", "Inbox")],
      "pim",
    )
    expect(map.get("pim-tasks")).toBe("@pim/tasks")
  })

  it("skips augmenting when the id is also a parent of other ids", () => {
    // km-silvery.1 is BOTH a leaf issue AND a parent of km-silvery.1.foo;
    // augmenting it would break the directory path the child file lives under.
    const map = buildIdMap([
      fakeIssue("km-silvery.1", "Interactive node signals"),
      fakeIssue("km-silvery.1.foo", "Sub issue"),
    ])
    expect(map.has("km-silvery.1")).toBe(false)
    expect(map.has("km-silvery.1.foo")).toBe(false)
  })

  it("does not augment non-numeric leaves", () => {
    const map = buildIdMap([fakeIssue("km-silvercode.acp.rename", "Rename ACP components")])
    expect(map.has("km-silvercode.acp.rename")).toBe(false)
  })
})

describe("bdIdToAliases", () => {
  it("includes bd-form, dash variant, and the sigil-prefixed path-form when slug-augmented", () => {
    const aliases = bdIdToAliases("km-rev-code-0203.1", "@km/rev-code-0203/1")
    expect(aliases).toContain("km-rev-code-0203.1")
    expect(aliases).toContain("km-rev-code-0203-1")
    expect(aliases).toContain("@km/rev-code-0203/1")
  })

  it("omits extra path-form when not provided (non-augmented issue)", () => {
    const aliases = bdIdToAliases("km-silvercode.acp")
    expect(aliases).toEqual(["km-silvercode.acp", "km-silvercode-acp"])
  })
})

describe("rewriteLegacyIdMentions", () => {
  it("rewrites bd-form mentions to slug-augmented path when idMap provides one", () => {
    const idMap = new Map([["km-rev-code-0203.1", "@km/rev-code-0203/1-remove-ensureopen"]])
    const out = rewriteLegacyIdMentions("See km-rev-code-0203.1 for details.", "km", idMap)
    expect(out).toBe("See @km/rev-code-0203/1-remove-ensureopen for details.")
  })

  it("falls back to bare path-form when idMap has no entry", () => {
    const out = rewriteLegacyIdMentions("See km-foo.bar for details.", "km")
    expect(out).toBe("See @km/foo/bar for details.")
  })
})

describe("bdIdToPathForm", () => {
  it("prepends @<prefix>/ and converts dots to slashes", () => {
    expect(bdIdToPathForm("km-silvercode.acp.rename")).toBe("@km/silvercode/acp/rename")
  })

  it("parks orphan ids under @<prefix>/_orphan/", () => {
    expect(bdIdToPathForm("km-q5hji")).toBe("@km/_orphan/q5hji")
  })

  it("honors a non-default sourcePrefix (e.g. @pim/ for pim-prefixed vault)", () => {
    expect(bdIdToPathForm("pim-tasks.inbox", "pim")).toBe("@pim/tasks/inbox")
  })
})

describe("readBeadsExport", () => {
  // In-memory fake fs scoped to the path we know we'll be probing. Just
  // enough surface to cover the dir-or-file branch.
  function memFs(files: Record<string, string>): BeadsFs {
    return {
      existsSync: (p: string) => files[p] !== undefined,
      readFileSync: (p: string) => files[p] ?? "",
      writeFileSync: () => {},
      mkdirSync: () => {},
    }
  }

  const sampleLine = JSON.stringify({
    id: "km-foo",
    title: "Foo",
    description: "",
    status: "open",
    priority: 2,
    issue_type: "task",
    created_at: "2026-04-28T00:00:00Z",
    updated_at: "2026-04-28T00:00:00Z",
  })

  it("resolves <dir>/issues.jsonl when given a directory", () => {
    const fs = memFs({ "/repo/.beads/issues.jsonl": sampleLine })
    const { issues } = readBeadsExport(fs, "/repo/.beads")
    expect(issues).toHaveLength(1)
    expect(issues[0]!.id).toBe("km-foo")
  })

  it("reads the file directly when given a .jsonl path", () => {
    const fs = memFs({ "/tmp/foreign-export.jsonl": sampleLine })
    const { issues } = readBeadsExport(fs, "/tmp/foreign-export.jsonl")
    expect(issues).toHaveLength(1)
    expect(issues[0]!.id).toBe("km-foo")
  })

  it("returns empty when the resolved path doesn't exist", () => {
    const fs = memFs({})
    expect(readBeadsExport(fs, "/missing/.beads")).toEqual({ issues: [], memories: [] })
    expect(readBeadsExport(fs, "/missing.jsonl")).toEqual({ issues: [], memories: [] })
  })
})

/**
 * Round-trip property test — every non-recomputable field bd export ships
 * survives parse → emit → re-parse-frontmatter. Recomputable counts
 * (dependency_count, dependent_count, comment_count) are intentionally
 * dropped: they're derivable from the dependencies array and the comment
 * markdown subsection, so persisting them risks drift.
 *
 * Fixture sources:
 *   - 7 real issues from /tmp/km-bd-archive-20260428-193507/issues.jsonl
 *     (lightly anonymized; cover started_at, defer_until, work_type,
 *     metadata, dependencies, closed_at, assignee, owner, design,
 *     acceptance_criteria, labels, simple)
 *   - 1 synthetic pre-v1.0 issue covering blocked_by/blocks/children/
 *     parent_id (real v1.0 exports have moved this graph into
 *     `dependencies[]`; legacy fields only show up in older archives)
 *
 * Body-content fields (description, notes, design, acceptance_criteria,
 * body) flow into the markdown body, not frontmatter. The round-trip
 * for those is covered by separate tests; here we focus on
 * frontmatter-level identity and graph fields.
 */
describe("issueToMarkdown — round-trip preserves all non-recomputable fields", () => {
  const fixturePath = join(__dirname, "fixtures/bd-export-sample.jsonl")
  const fixtureContent = readFileSync(fixturePath, "utf-8")
  const { issues } = parseBeadsIssuesJsonl(fixtureContent)

  function extractFrontmatter(md: string): Record<string, unknown> {
    // Frontmatter delimited by --- on first/second line; body follows.
    const match = md.match(/^---\n([\s\S]*?)\n---\n/)
    if (!match) throw new Error(`no frontmatter in:\n${md.slice(0, 200)}`)
    return parseYaml(match[1]!) as Record<string, unknown>
  }

  it("loaded fixture issues with full feature coverage", () => {
    expect(issues.length).toBeGreaterThanOrEqual(7)
    // Spot-check coverage so future fixture edits don't silently shrink
    // the property surface this test exercises.
    expect(issues.some((i) => i.started_at)).toBe(true)
    expect(issues.some((i) => i.defer_until)).toBe(true)
    expect(issues.some((i) => i.work_type)).toBe(true)
    expect(issues.some((i) => i.metadata && i.metadata !== "{}")).toBe(true)
    expect(issues.some((i) => i.dependencies && i.dependencies.length > 0)).toBe(true)
    expect(issues.some((i) => i.children && i.children.length > 0)).toBe(true)
    expect(issues.some((i) => i.blocked_by && i.blocked_by.length > 0)).toBe(true)
  })

  it.each(
    issues.map((issue) => [issue.id, issue] as const),
  )("preserves non-recomputable frontmatter fields for %s", (_id, issue) => {
    const md = issueToMarkdown(issue, "km")
    const fm = extractFrontmatter(md)

    // Identity.
    expect(fm.id).toBeTruthy()
    if (issue.created_by !== undefined) expect(fm.created_by).toBe(issue.created_by)
    expect(fm.created_at).toBe(issue.created_at)

    // Lifecycle timestamps.
    if (issue.started_at !== undefined) expect(fm.started_at).toBe(issue.started_at)
    if (issue.closed_at !== undefined) expect(fm.closed_at).toBe(issue.closed_at)
    if (issue.close_reason !== undefined) expect(fm.close_reason).toBe(issue.close_reason)
    if (issue.defer_until !== undefined) expect(fm.defer_until).toBe(issue.defer_until)

    // Ownership.
    if (issue.owner !== undefined) expect(fm.owner).toBe(issue.owner)
    if (issue.assignee !== undefined) expect(fm.assignee).toBe(issue.assignee)

    // Graph — parent_id, children, dependencies (verbatim), legacy_deps.
    if (issue.parent_id !== undefined) expect(fm.parent_id).toBe(issue.parent_id)
    if (issue.children && issue.children.length > 0) {
      expect(fm.children).toEqual(issue.children)
    }
    if (issue.dependencies && issue.dependencies.length > 0) {
      expect(fm.dependencies).toEqual(issue.dependencies)
    }
    if ((issue.blocked_by && issue.blocked_by.length > 0) || (issue.blocks && issue.blocks.length > 0)) {
      const expected: Record<string, string[]> = {}
      if (issue.blocked_by?.length) expected.blocked_by = issue.blocked_by
      if (issue.blocks?.length) expected.blocks = issue.blocks
      expect(fm.legacy_deps).toEqual(expected)
    }

    // Freeform blob.
    if (issue.metadata !== undefined && issue.metadata !== "{}") {
      expect(fm.metadata).toBe(issue.metadata)
    } else {
      // Empty metadata is intentionally suppressed as noise.
      expect(fm.metadata).toBeUndefined()
    }

    // work_type — present iff source had it.
    if (issue.work_type !== undefined) expect(fm.work_type).toBe(issue.work_type)
  })

  it("never persists recomputable counts in frontmatter", () => {
    for (const issue of issues) {
      const md = issueToMarkdown(issue, "km")
      const fm = extractFrontmatter(md)
      expect(fm.dependency_count, `${issue.id} leaked dependency_count`).toBeUndefined()
      expect(fm.dependent_count, `${issue.id} leaked dependent_count`).toBeUndefined()
      expect(fm.comment_count, `${issue.id} leaked comment_count`).toBeUndefined()
    }
  })
})

/**
 * Recapture (--update-only) — ADD missing fields from the export onto
 * already-migrated vault beads, never overwrite present-and-non-empty.
 *
 * The diff property: for any field set in the target before recapture,
 * its value is byte-identical after. The only changes the function may
 * introduce are filling in fields whose target value was absent or
 * empty (with `metadata` allowed to merge).
 */
describe("applyAddOnlyPatch — ADD missing, NEVER overwrite", () => {
  function baseIssue(overrides: Partial<BeadsIssue> = {}): BeadsIssue {
    return {
      id: "km-test.foo",
      title: "Foo",
      description: "",
      status: "open",
      priority: 2,
      issue_type: "task",
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:00Z",
      ...overrides,
    } as BeadsIssue
  }

  it("ADDs started_at when target is missing it", () => {
    const fm: Record<string, unknown> = { id: "@km/test/foo" }
    const changed = applyAddOnlyPatch(fm, baseIssue({ started_at: "2026-04-01T00:00:00Z" }))
    expect(fm.started_at).toBe("2026-04-01T00:00:00Z")
    expect(changed).toContain("started_at")
  })

  it("NEVER overwrites started_at when target already has it", () => {
    const fm: Record<string, unknown> = { id: "@km/test/foo", started_at: "2025-01-01T00:00:00Z" }
    const changed = applyAddOnlyPatch(fm, baseIssue({ started_at: "2026-04-01T00:00:00Z" }))
    expect(fm.started_at).toBe("2025-01-01T00:00:00Z")
    expect(changed).not.toContain("started_at")
  })

  it("ADDs owner/assignee when missing", () => {
    const fm: Record<string, unknown> = { id: "@km/test/foo" }
    const changed = applyAddOnlyPatch(fm, baseIssue({ owner: "beorn", assignee: "beorn" }))
    expect(fm.owner).toBe("beorn")
    expect(fm.assignee).toBe("beorn")
    expect(changed).toEqual(expect.arrayContaining(["owner", "assignee"]))
  })

  it("ADDs dependencies array when target has none", () => {
    const fm: Record<string, unknown> = { id: "@km/test/foo" }
    const deps = [{ type: "blocks", issue_id: "km-test.foo", depends_on_id: "km-test.bar" }]
    const changed = applyAddOnlyPatch(fm, baseIssue({ dependencies: deps as BeadsIssue["dependencies"] }))
    expect(fm.dependencies).toEqual(deps)
    expect(changed).toContain("dependencies")
  })

  it("NEVER overwrites a non-empty dependencies array", () => {
    const existing = [{ type: "blocks", issue_id: "km-test.foo", depends_on_id: "km-test.legacy" }]
    const fm: Record<string, unknown> = { id: "@km/test/foo", dependencies: existing }
    const sourceDeps = [{ type: "blocks", issue_id: "km-test.foo", depends_on_id: "km-test.bar" }]
    const changed = applyAddOnlyPatch(fm, baseIssue({ dependencies: sourceDeps as BeadsIssue["dependencies"] }))
    expect(fm.dependencies).toEqual(existing)
    expect(changed).not.toContain("dependencies")
  })

  it("ADDs legacy_deps from blocked_by/blocks when target has none", () => {
    const fm: Record<string, unknown> = { id: "@km/test/foo" }
    const changed = applyAddOnlyPatch(
      fm,
      baseIssue({ blocked_by: ["km-test.up"], blocks: ["km-test.down"] }),
    )
    expect(fm.legacy_deps).toEqual({ blocked_by: ["km-test.up"], blocks: ["km-test.down"] })
    expect(changed).toContain("legacy_deps")
  })

  it("ADDs children when target has none", () => {
    const fm: Record<string, unknown> = { id: "@km/test/foo" }
    const changed = applyAddOnlyPatch(fm, baseIssue({ children: ["km-test.foo.1"] }))
    expect(fm.children).toEqual(["km-test.foo.1"])
    expect(changed).toContain("children")
  })

  it("MERGES metadata when both target and source non-empty", () => {
    const fm: Record<string, unknown> = { id: "@km/test/foo", metadata: '{"vault":"existing"}' }
    const changed = applyAddOnlyPatch(fm, baseIssue({ metadata: '{"export":"original"}' }))
    expect(fm.metadata).toBe('{"vault":"existing"}\n---\n{"export":"original"}')
    expect(changed).toContain("metadata")
  })

  it("ADDs metadata as-is when target empty", () => {
    const fm: Record<string, unknown> = { id: "@km/test/foo" }
    const changed = applyAddOnlyPatch(fm, baseIssue({ metadata: '{"export":"original"}' }))
    expect(fm.metadata).toBe('{"export":"original"}')
    expect(changed).toContain("metadata")
  })

  it("treats {} metadata as empty (no-op when source is also {})", () => {
    const fm: Record<string, unknown> = { id: "@km/test/foo", metadata: "{}" }
    const changed = applyAddOnlyPatch(fm, baseIssue({ metadata: "{}" }))
    expect(changed).toEqual([])
  })

  it("NEVER touches scalar fields outside the recapture set", () => {
    const fm: Record<string, unknown> = {
      id: "@km/test/foo",
      title: "vault title",
      status: "closed",
      priority: 0,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-06-01T00:00:00Z",
      closed_at: "2025-12-01T00:00:00Z",
    }
    const before = JSON.stringify(fm)
    applyAddOnlyPatch(
      fm,
      baseIssue({
        title: "export title",
        status: "open",
        priority: 4,
        created_at: "2026-04-28T00:00:00Z",
        closed_at: "2026-04-28T00:00:00Z",
        started_at: "2026-04-01T00:00:00Z",
      }),
    )
    // Only started_at is added; everything else is untouched.
    expect(fm.title).toBe("vault title")
    expect(fm.status).toBe("closed")
    expect(fm.priority).toBe(0)
    expect(fm.created_at).toBe("2025-01-01T00:00:00Z")
    expect(fm.updated_at).toBe("2025-06-01T00:00:00Z")
    expect(fm.closed_at).toBe("2025-12-01T00:00:00Z")
    expect(fm.started_at).toBe("2026-04-01T00:00:00Z")
    // Sanity: only the started_at key changed.
    const after = JSON.parse(JSON.stringify(fm)) as Record<string, unknown>
    delete after.started_at
    expect(JSON.stringify(after)).toBe(before)
  })
})

describe("recaptureFromExport — diff(before, after) ⊆ {fields previously empty}", () => {
  /**
   * In-memory fs sufficient for recapture: tracks file content, supports
   * the read/write methods recapture and `readBeadsExport` need.
   */
  function memFs(initial: Record<string, string>): { fs: BeadsFs; files: Record<string, string> } {
    const files = { ...initial }
    const fs: BeadsFs = {
      existsSync: (p: string) => files[p] !== undefined,
      readFileSync: (p: string) => files[p] ?? "",
      writeFileSync: (p: string, content: string) => {
        files[p] = content
      },
      mkdirSync: () => {},
    }
    return { fs, files }
  }

  function buildVaultBead(id: string, missingFields: string[], existingFields: Record<string, unknown> = {}): string {
    const fm: Record<string, unknown> = { id }
    // existingFields are the ones that should NOT be overwritten by recapture.
    Object.assign(fm, existingFields)
    void missingFields
    // Use yaml.stringify so values starting with `@` (sigils) round-trip
    // correctly — bare emission breaks because `@` is a reserved YAML
    // indicator outside quoted scalars.
    return [
      "---",
      stringifyYaml(fm).trimEnd(),
      "---",
      "",
      "# [x] Existing body — must NOT be touched.",
      "",
      "Some user-edited prose with `inline code` and a [[wikilink]].",
      "",
    ].join("\n")
  }

  function exportLine(issue: BeadsIssue): string {
    return JSON.stringify({ ...issue, _type: "issue" })
  }

  it("update-only: ADDs missing fields, never overwrites existing fields, never touches body", () => {
    // Vault has 3 beads. Each is missing a different subset of recapture fields.
    // Source export has all recapture fields populated for each.
    const issuesPath = "/src/issues.jsonl"
    const beadA = "/vault/@km/test/a.md"
    const beadB = "/vault/@km/test/b.md"
    const beadC = "/vault/@km/test/c.md"

    const aBefore = buildVaultBead("@km/test/a", ["started_at", "owner"])
    const bBefore = buildVaultBead("@km/test/b", ["dependencies"], {
      started_at: "2025-01-01T00:00:00Z",
      owner: "alice",
    })
    const cBefore = buildVaultBead("@km/test/c", [], {
      started_at: "2025-02-02T00:00:00Z",
      owner: "bob",
      dependencies: [{ type: "blocks", issue_id: "km-test.c", depends_on_id: "km-test.x" }],
    })

    const exportIssues: BeadsIssue[] = [
      {
        id: "km-test.a",
        title: "A",
        description: "",
        status: "open",
        priority: 2,
        issue_type: "task",
        created_at: "2026-04-28T00:00:00Z",
        updated_at: "2026-04-28T00:00:00Z",
        started_at: "2026-04-01T00:00:00Z",
        owner: "beorn",
      } as BeadsIssue,
      {
        id: "km-test.b",
        title: "B",
        description: "",
        status: "open",
        priority: 2,
        issue_type: "task",
        created_at: "2026-04-28T00:00:00Z",
        updated_at: "2026-04-28T00:00:00Z",
        started_at: "2026-04-01T00:00:00Z", // should NOT overwrite alice's
        owner: "beorn", // should NOT overwrite alice
        dependencies: [{ type: "blocks", issue_id: "km-test.b", depends_on_id: "km-test.y" }],
      } as BeadsIssue,
      {
        id: "km-test.c",
        title: "C",
        description: "",
        status: "open",
        priority: 2,
        issue_type: "task",
        created_at: "2026-04-28T00:00:00Z",
        updated_at: "2026-04-28T00:00:00Z",
        started_at: "2026-04-01T00:00:00Z", // should NOT overwrite
        owner: "beorn", // should NOT overwrite
        dependencies: [{ type: "blocks", issue_id: "km-test.c", depends_on_id: "km-test.z" }], // should NOT overwrite
      } as BeadsIssue,
    ]

    const { fs, files } = memFs({
      [issuesPath]: exportIssues.map(exportLine).join("\n"),
      [beadA]: aBefore,
      [beadB]: bBefore,
      [beadC]: cBefore,
    })

    const targetByBdId: Record<string, string> = {
      "km-test.a": beadA,
      "km-test.b": beadB,
      "km-test.c": beadC,
    }

    const result = recaptureFromExport(issuesPath, {
      fs,
      resolveTarget: (issue) => targetByBdId[issue.id] ?? null,
    })

    expect(result.errors).toEqual([])
    expect(result.skipped).toEqual([])
    // A: 2 fields added; B: 1 field added; C: nothing changed (already complete).
    expect(result.patched.map((p) => p.bdId).sort()).toEqual(["km-test.a", "km-test.b"])
    expect(result.unchanged).toBe(1)

    // === Property: diff ⊆ {fields previously empty} ===

    // A — was missing started_at + owner; both should now be set, body unchanged.
    {
      const before = parseYaml(splitFrontmatter(aBefore)!.frontmatter) as Record<string, unknown>
      const after = parseYaml(splitFrontmatter(files[beadA]!)!.frontmatter) as Record<string, unknown>
      expect(before.started_at).toBeUndefined()
      expect(before.owner).toBeUndefined()
      expect(after.started_at).toBe("2026-04-01T00:00:00Z")
      expect(after.owner).toBe("beorn")
      // Body byte-identical.
      expect(splitFrontmatter(files[beadA]!)!.body).toBe(splitFrontmatter(aBefore)!.body)
    }

    // B — had started_at + owner; export should NOT have overwritten them.
    {
      const after = parseYaml(splitFrontmatter(files[beadB]!)!.frontmatter) as Record<string, unknown>
      expect(after.started_at).toBe("2025-01-01T00:00:00Z") // pre-existing wins
      expect(after.owner).toBe("alice")
      expect(after.dependencies).toEqual([
        { type: "blocks", issue_id: "km-test.b", depends_on_id: "km-test.y" },
      ])
      expect(splitFrontmatter(files[beadB]!)!.body).toBe(splitFrontmatter(bBefore)!.body)
    }

    // C — fully populated already; file should be byte-identical.
    expect(files[beadC]).toBe(cBefore)
  })

  it("update-only: skips beads with no resolvable target (no --restore semantics yet)", () => {
    const issuesPath = "/src/issues.jsonl"
    const exportIssues: BeadsIssue[] = [
      {
        id: "km-test.missing",
        title: "Missing",
        description: "",
        status: "open",
        priority: 2,
        issue_type: "task",
        created_at: "2026-04-28T00:00:00Z",
        updated_at: "2026-04-28T00:00:00Z",
        started_at: "2026-04-01T00:00:00Z",
      } as BeadsIssue,
    ]
    const { fs } = memFs({
      [issuesPath]: exportIssues.map(exportLine).join("\n"),
    })
    const result = recaptureFromExport(issuesPath, {
      fs,
      resolveTarget: () => null,
    })
    expect(result.patched).toEqual([])
    expect(result.unchanged).toBe(0)
    expect(result.skipped).toEqual([{ bdId: "km-test.missing", reason: "no target file" }])
  })

  it("update-only: dryRun does not write to disk", () => {
    const issuesPath = "/src/issues.jsonl"
    const beadPath = "/vault/@km/test/foo.md"
    const before = buildVaultBead("@km/test/foo", ["started_at"])
    const exportLine = JSON.stringify({
      _type: "issue",
      id: "km-test.foo",
      title: "Foo",
      description: "",
      status: "open",
      priority: 2,
      issue_type: "task",
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:00Z",
      started_at: "2026-04-01T00:00:00Z",
    })
    const { fs, files } = memFs({ [issuesPath]: exportLine, [beadPath]: before })

    const result = recaptureFromExport(issuesPath, {
      fs,
      dryRun: true,
      resolveTarget: () => beadPath,
    })

    expect(result.patched).toHaveLength(1)
    expect(result.patched[0]!.fieldsChanged).toContain("started_at")
    // File on disk is unchanged in dry-run.
    expect(files[beadPath]).toBe(before)
  })
})
