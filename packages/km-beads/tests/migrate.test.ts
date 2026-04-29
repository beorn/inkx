/**
 * Migrate helpers — slug-augmentation for numeric-leaf bd ids.
 *
 * bd auto-numbers sub-ids when callers don't supply a custom suffix
 * (`km-rev-code-0203.1`, `.2`, …); the bare numeric leaf is unhelpful
 * as a filename or card label after migration. These tests pin the
 * augmentation behavior + the parent-path exemption.
 */

import { describe, it, expect } from "vitest"
import {
  bdIdToPathForm,
  bdIdToPathFormWithSlug,
  bdIdToAliases,
  buildIdMap,
  migrateBeadsToMarkdown,
  readBeadsExport,
  rewriteLegacyIdMentions,
} from "../src/migrate.ts"
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

describe("migrateBeadsToMarkdown — flat @memory layout", () => {
  /** Trackable in-memory fs that captures every write. */
  function trackFs(seed: Record<string, string> = {}): BeadsFs & { files: Record<string, string>; dirs: Set<string> } {
    const files: Record<string, string> = { ...seed }
    const dirs = new Set<string>()
    return {
      files,
      dirs,
      existsSync: (p: string) => files[p] !== undefined || dirs.has(p),
      readFileSync: (p: string) => files[p] ?? "",
      writeFileSync: (p: string, content: string) => {
        files[p] = content
      },
      mkdirSync: (p: string) => {
        dirs.add(p)
      },
    }
  }

  function memoryLine(key: string, value: string): string {
    return JSON.stringify({ _type: "memory", key, value, created_at: "2026-04-28T00:00:00Z" })
  }

  it("appends '## From <source>' subsection on slug collision when memSourceLabel is set", () => {
    const fs = trackFs({
      "/src-a/.beads/issues.jsonl": memoryLine("workflow-tip", "Source A insight"),
    })
    migrateBeadsToMarkdown("/src-a/.beads", {
      targetDir: "/repo/beads",
      memDir: "/repo/beads/@memory",
      memSourceLabel: "src-a-2026-04-28",
      fs,
      sourcePrefix: "km",
    })
    expect(fs.files["/repo/beads/@memory/workflow-tip.md"]).toContain("Source A insight")

    // Second source — same slug, different content.
    fs.files["/src-b/.beads/issues.jsonl"] = memoryLine("workflow-tip", "Source B insight")
    const result = migrateBeadsToMarkdown("/src-b/.beads", {
      targetDir: "/repo/beads",
      memDir: "/repo/beads/@memory",
      memSourceLabel: "src-b-2026-04-28",
      fs,
      sourcePrefix: "km",
    })

    const merged = fs.files["/repo/beads/@memory/workflow-tip.md"]!
    expect(merged).toContain("Source A insight")
    expect(merged).toContain("## From src-b-2026-04-28")
    expect(merged).toContain("Source B insight")
    expect(result.memoriesMigrated).toBe(1)
  })

  it("is idempotent — re-running the same source does not stack subsections", () => {
    const fs = trackFs({
      "/src-a/.beads/issues.jsonl": memoryLine("dup", "first"),
    })
    migrateBeadsToMarkdown("/src-a/.beads", {
      targetDir: "/repo/beads",
      memDir: "/repo/beads/@memory",
      memSourceLabel: "src-a",
      fs,
      sourcePrefix: "km",
    })

    fs.files["/src-b/.beads/issues.jsonl"] = memoryLine("dup", "second")
    migrateBeadsToMarkdown("/src-b/.beads", {
      targetDir: "/repo/beads",
      memDir: "/repo/beads/@memory",
      memSourceLabel: "src-b",
      fs,
      sourcePrefix: "km",
    })
    // Re-run src-b — same source label, must not append another subsection.
    const result = migrateBeadsToMarkdown("/src-b/.beads", {
      targetDir: "/repo/beads",
      memDir: "/repo/beads/@memory",
      memSourceLabel: "src-b",
      fs,
      sourcePrefix: "km",
    })

    const merged = fs.files["/repo/beads/@memory/dup.md"]!
    const occurrences = merged.match(/## From src-b/g)?.length ?? 0
    expect(occurrences).toBe(1)
    expect(result.memoriesSkipped).toBe(1)
  })

  it("falls back to skip behavior when memSourceLabel is not provided", () => {
    const fs = trackFs({
      "/src-a/.beads/issues.jsonl": memoryLine("k", "first"),
    })
    migrateBeadsToMarkdown("/src-a/.beads", {
      targetDir: "/repo/beads",
      memDir: "/repo/beads/@memory",
      fs,
      sourcePrefix: "km",
    })

    fs.files["/src-b/.beads/issues.jsonl"] = memoryLine("k", "second")
    const result = migrateBeadsToMarkdown("/src-b/.beads", {
      targetDir: "/repo/beads",
      memDir: "/repo/beads/@memory",
      // memSourceLabel omitted — collision must skip rather than merge.
      fs,
      sourcePrefix: "km",
    })

    expect(result.memoriesSkipped).toBe(1)
    expect(fs.files["/repo/beads/@memory/k.md"]).not.toContain("second")
  })
})
