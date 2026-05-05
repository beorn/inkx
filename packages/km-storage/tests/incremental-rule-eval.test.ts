/**
 * Incremental rule-eval triage tests.
 *
 * `evaluateAllRules` runs every rule on every sync. For a 1021-rule vault
 * that's expensive even when only one file changed. The incremental path
 * filters rules by signature intersection: a rule whose query references
 * `@inbox` only re-runs when the change set includes `@inbox`.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA, migrateSchema, migrateData } from "../src/db/schema.ts"
import {
  extractChangedAttrs,
  extractRuleSignature,
  ruleIsAffected,
  evaluateAffectedRules,
  createRuleContext,
} from "../src/db/rules.ts"

function freshDb(): Database {
  const db = new Database(":memory:")
  migrateSchema(db)
  db.run(SCHEMA)
  migrateData(db)
  return db
}

function insertNode(
  db: Database,
  id: string,
  parentId: string | null,
  opts: { type?: string; content?: string; title?: string; fs_path?: string; rules?: object } = {},
): void {
  const now = Date.now()
  const data = opts.rules ? JSON.stringify({ rules: opts.rules }) : "{}"
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, item, content, title, fs_path, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.type ?? "p",
      parentId,
      now,
      opts.content ?? null,
      opts.title ?? null,
      opts.fs_path ?? null,
      data,
      now,
      now,
    ],
  )
}

describe("extractRuleSignature", () => {
  test("captures positive tag refs", () => {
    const sig = extractRuleSignature(["#bug #urgent"])
    expect(sig.tags.has("bug")).toBe(true)
    expect(sig.tags.has("urgent")).toBe(true)
    expect(sig.hasPositiveSelector).toBe(true)
  })

  test("captures positive mention refs", () => {
    const sig = extractRuleSignature(["@inbox"])
    expect(sig.mentions.has("inbox")).toBe(true)
    expect(sig.hasPositiveSelector).toBe(true)
  })

  test("ignores negated refs", () => {
    const sig = extractRuleSignature(["#bug -#archived -@stale"])
    expect(sig.tags.has("bug")).toBe(true)
    expect(sig.tags.has("archived")).toBe(false)
    expect(sig.mentions.has("stale")).toBe(false)
  })

  test("pure negative path filter is not a positive selector", () => {
    const sig = extractRuleSignature(["-path:archive/"])
    expect(sig.hasPositiveSelector).toBe(false)
    expect(sig.positivePaths).toHaveLength(0)
  })

  test("positive path filter is a positive selector", () => {
    const sig = extractRuleSignature(["path:src/ -path:archive/"])
    expect(sig.hasPositiveSelector).toBe(true)
    expect(sig.positivePaths).toContain("src/")
  })

  test("status field condition counts as positive selector", () => {
    const sig = extractRuleSignature(["status:open"])
    expect(sig.hasPositiveSelector).toBe(true)
  })

  test("plain text term counts as positive selector", () => {
    const sig = extractRuleSignature(["bug"])
    expect(sig.hasPositiveSelector).toBe(true)
  })

  test("multiple queries are unioned", () => {
    const sig = extractRuleSignature(["#bug", "@inbox"])
    expect(sig.tags.has("bug")).toBe(true)
    expect(sig.mentions.has("inbox")).toBe(true)
  })
})

describe("extractChangedAttrs", () => {
  test("collects tags, mentions, projects, paths from changed nodes", () => {
    const db = freshDb()
    insertNode(db, "n1", null, {
      content: "task with #bug and @inbox mention",
      fs_path: "@km/inbox/task.md",
    })
    insertNode(db, "n2", null, {
      title: "title with +project",
    })

    const result = extractChangedAttrs(db, ["n1", "n2"])

    expect(result.tags.has("bug")).toBe(true)
    expect(result.mentions.has("inbox")).toBe(true)
    expect(result.projects.has("project")).toBe(true)
    expect(result.paths.has("@km/inbox/task.md")).toBe(true)
  })

  test("handles empty / missing nodes gracefully", () => {
    const db = freshDb()
    const result = extractChangedAttrs(db, ["nonexistent"])
    expect(result.tags.size).toBe(0)
    expect(result.mentions.size).toBe(0)
    expect(result.paths.size).toBe(0)
  })
})

describe("ruleIsAffected", () => {
  test("intersection on tag matches", () => {
    const sig = extractRuleSignature(["#bug"])
    const changed = {
      tags: new Set(["bug"]),
      mentions: new Set<string>(),
      projects: new Set<string>(),
      paths: new Set<string>(),
    }
    expect(ruleIsAffected(sig, changed)).toBe(true)
  })

  test("no intersection skips the rule", () => {
    const sig = extractRuleSignature(["#bug"])
    const changed = {
      tags: new Set(["feature"]),
      mentions: new Set<string>(),
      projects: new Set<string>(),
      paths: new Set<string>(),
    }
    expect(ruleIsAffected(sig, changed)).toBe(false)
  })

  test("pure-negation queries always re-eval", () => {
    const sig = extractRuleSignature(["-path:archive/"])
    const changed = {
      tags: new Set<string>(),
      mentions: new Set<string>(),
      projects: new Set<string>(),
      paths: new Set<string>(),
    }
    expect(ruleIsAffected(sig, changed)).toBe(true)
  })

  test("path prefix match", () => {
    const sig = extractRuleSignature(["path:src/components/"])
    const changed = {
      tags: new Set<string>(),
      mentions: new Set<string>(),
      projects: new Set<string>(),
      paths: new Set(["src/components/Button.tsx"]),
    }
    expect(ruleIsAffected(sig, changed)).toBe(true)
  })
})

describe("evaluateAffectedRules", () => {
  test("only iterates rules whose signature intersects the change set", () => {
    const db = freshDb()
    // Section nodes hosting rules
    insertNode(db, "section-bug", ".", {
      type: "h",
      content: "Bug board",
      rules: { add: "#bug" },
    })
    insertNode(db, "section-feature", ".", {
      type: "h",
      content: "Feature board",
      rules: { add: "#feature" },
    })
    insertNode(db, "section-catchall", ".", {
      type: "h",
      content: "Catch-all",
      rules: { add: "-path:archive/" },
    })

    const ctx = createRuleContext()
    const changedAttrs = {
      tags: new Set(["bug"]),
      mentions: new Set<string>(),
      projects: new Set<string>(),
      paths: new Set<string>(),
    }

    const progresses = []
    for (const p of evaluateAffectedRules(db, ctx, changedAttrs)) {
      progresses.push(p)
    }
    // The first yield reports the affected count; subsequent yields tick.
    // Affected = section-bug + section-catchall (catch-all always runs).
    // Skipped = section-feature.
    expect(progresses[0]?.total).toBe(2)
    expect(progresses[progresses.length - 1]?.current).toBe(2)
  })

  test("falls back to full eval when changedAttrs is null", () => {
    const db = freshDb()
    insertNode(db, "section-1", ".", { type: "h", content: "B1", rules: { add: "#a" } })
    insertNode(db, "section-2", ".", { type: "h", content: "B2", rules: { add: "#b" } })

    const ctx = createRuleContext()
    const progresses = []
    for (const p of evaluateAffectedRules(db, ctx, null)) {
      progresses.push(p)
    }
    // Full eval iterates every rule.
    expect(progresses[0]?.total).toBe(2)
  })
})
