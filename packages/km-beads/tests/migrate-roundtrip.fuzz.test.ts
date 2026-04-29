/**
 * Fuzz harness for the bd-export → markdown round-trip property.
 *
 * Companion to `migrate.test.ts`'s hand-written round-trip test
 * (`describe("issueToMarkdown — round-trip preserves all non-recomputable
 * fields")`). That test pins 8 real-shape fixtures; this one exercises the
 * same property over arbitrary BeadsIssue records to catch combinations the
 * fixtures don't cover.
 *
 * Property: for every randomly generated BeadsIssue I,
 *   parse(emit(I).frontmatter) ≡ I  (modulo recomputable counts and
 *                                     intentional projection rules)
 *
 * Generators are hand-rolled (zod-fast-check is not in this workspace).
 * They produce records that pass `beadsIssueSchema.safeParse` AND respect
 * the bd-form id shape so `bdIdToPathForm` succeeds — otherwise the
 * canonical-id fallback would muddy the comparison.
 *
 * Recomputable counts (`dependency_count`, `dependent_count`,
 * `comment_count`) are dropped from frontmatter by design — they're
 * derivable from `dependencies[]` and the comment markdown subsection.
 * Body-content fields (description, notes, body, acceptance_criteria,
 * design) flow into the body, not frontmatter; they're out of scope here.
 */

import { describe, it, expect } from "vitest"
import { parse as parseYaml } from "yaml"
import { issueToMarkdown } from "../src/migrate.ts"
import { beadsIssueSchema, type BeadsIssue, type BeadsDependency, type BeadsComment } from "../src/schema.ts"

const ITERATIONS = 200
const SOURCE_PREFIX = "km"

// Deterministic-ish RNG for reproducible fuzz runs. Seeds shift each
// iteration so the corpus changes test-to-test, but inside one iteration
// we know which seed produced which case (logged on failure).
function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!
}

function maybe<T>(rand: () => number, prob: number, gen: () => T): T | undefined {
  return rand() < prob ? gen() : undefined
}

function randomScopeWord(rand: () => number): string {
  const words = ["beads", "tui", "core", "infra", "silvery", "rev-code", "all", "session", "storage"]
  return pick(rand, words)
}

function randomSlugWord(rand: () => number): string {
  const words = [
    "cutover",
    "fix-the-thing",
    "wire-up",
    "audit",
    "refactor",
    "0203",
    "1",
    "alpha-beta",
    "x9k",
    "split-backend",
  ]
  return pick(rand, words)
}

// Generate a bd-form id that bdIdToPathForm can translate. Two shapes:
//   - dot-form: km-<scope>.<slug>     (canonical bd v1.0)
//   - orphan:   km-<5char>            (bd auto-id, no scope)
function randomBdId(rand: () => number, n: number): string {
  if (rand() < 0.15) {
    // orphan auto-id (no dots)
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    let s = ""
    for (let i = 0; i < 5; i++) s += alphabet[Math.floor(rand() * alphabet.length)]
    return `${SOURCE_PREFIX}-${s}${n}`
  }
  // scoped dot-form. Optionally a sub-id.
  const scope = `${randomScopeWord(rand)}-${n}`
  const slug = randomSlugWord(rand)
  if (rand() < 0.25) {
    return `${SOURCE_PREFIX}-${scope}.${slug}.${Math.floor(rand() * 50)}`
  }
  return `${SOURCE_PREFIX}-${scope}.${slug}`
}

// Generate an iso timestamp in a plausible range so values stay well-formed
// after yaml.stringify → parseYaml round-trips (yaml might canonicalize
// arbitrary date strings).
function randomTimestamp(rand: () => number): string {
  const baseMs = Date.UTC(2024, 0, 1)
  const span = 365 * 24 * 60 * 60 * 1000 * 3 // ~3 years
  const t = baseMs + Math.floor(rand() * span)
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z")
}

// Title text — keep ASCII printable, avoid yaml-pathological chars at boundaries.
function randomTitle(rand: () => number): string {
  const words = ["fix", "the", "thing", "audit", "refactor", "ship", "cutover", "wire", "up", "tea", "bd", "km"]
  const n = 2 + Math.floor(rand() * 6)
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(pick(rand, words))
  return out.join(" ")
}

// Freeform string — the harness for description / close_reason / etc.
// Body-content fields aren't asserted on (they go into the body, not frontmatter),
// but they exist in the source record so we generate them.
function randomBody(rand: () => number): string {
  const lines = []
  const n = 1 + Math.floor(rand() * 4)
  for (let i = 0; i < n; i++) lines.push(`Line ${i}: ${randomTitle(rand)}.`)
  return lines.join("\n")
}

// Metadata — bd emits as JSON-encoded string; "{}" gets suppressed by the
// emitter so we never compare against it.
function randomMetadata(rand: () => number): string {
  if (rand() < 0.3) return "{}"
  const tag = pick(rand, ["mutex", "shard-a", "owner-anon", "lab"])
  return JSON.stringify({ tag, n: Math.floor(rand() * 100) })
}

function randomDependency(rand: () => number, selfId: string, n: number): BeadsDependency {
  const otherId = randomBdId(rand, n + 1000)
  // Half the time, self is issue_id (outbound); half, self is depends_on_id (inbound).
  const selfIsIssue = rand() < 0.5
  const dep: BeadsDependency = {
    issue_id: selfIsIssue ? selfId : otherId,
    depends_on_id: selfIsIssue ? otherId : selfId,
  }
  if (rand() < 0.9) dep.type = pick(rand, ["blocks", "parent-child", "related"])
  if (rand() < 0.4) dep.created_at = randomTimestamp(rand)
  if (rand() < 0.3) dep.created_by = `claude:${Math.floor(rand() * 1e6).toString(16)}`
  if (rand() < 0.3) dep.metadata = randomMetadata(rand)
  return dep
}

function randomComment(rand: () => number, n: number): BeadsComment {
  const c: BeadsComment = {
    author: pick(rand, ["anon", "claude:abc", "beorn", "team-lead"]),
    text: randomBody(rand),
    created_at: randomTimestamp(rand),
  }
  if (rand() < 0.5) c.id = `c-${n}`
  if (rand() < 0.4) c.issue_id = `${SOURCE_PREFIX}-foo.bar`
  return c
}

function randomIssue(seed: number): BeadsIssue {
  const rand = mulberry32(seed)
  const id = randomBdId(rand, seed)
  const title = randomTitle(rand)
  const created_at = randomTimestamp(rand)

  const issue: BeadsIssue = {
    id,
    title,
    status: pick(rand, ["open", "in_progress", "closed", "blocked", "deferred"] as const),
    priority: pick(rand, [0, 1, 2, 3, 4]),
    issue_type: pick(rand, ["task", "bug", "feature", "epic", "chore"]),
    created_at,
    updated_at: randomTimestamp(rand),
  }

  // Fields the round-trip property covers — emit each with realistic frequency.
  if (rand() < 0.7) issue.description = randomBody(rand)
  if (rand() < 0.5) issue.created_by = `claude:${Math.floor(rand() * 1e6).toString(16)}`
  if (rand() < 0.4) issue.started_at = randomTimestamp(rand)
  if (rand() < 0.3) {
    issue.closed_at = randomTimestamp(rand)
    issue.close_reason = randomBody(rand)
  }
  if (rand() < 0.15) issue.defer_until = randomTimestamp(rand)
  if (rand() < 0.4) issue.owner = pick(rand, ["anon@example.com", "beorn", "tribe"])
  if (rand() < 0.4) issue.assignee = pick(rand, ["claude:abc", "anon", "team-lead"])
  if (rand() < 0.2) issue.work_type = pick(rand, ["mutex", "shard"])
  if (rand() < 0.2) issue.parent_id = randomBdId(rand, seed + 5000)

  // Children — bd emits as raw bd-form ids.
  if (rand() < 0.2) {
    const n = 1 + Math.floor(rand() * 4)
    issue.children = Array.from({ length: n }, (_, i) => randomBdId(rand, seed + 6000 + i))
  }

  // Dependencies (v1.0 graph) — preserved verbatim in frontmatter.
  if (rand() < 0.6) {
    const n = 1 + Math.floor(rand() * 6)
    issue.dependencies = Array.from({ length: n }, (_, i) => randomDependency(rand, id, seed + 7000 + i))
  }

  // Legacy graph (pre-v1.0) — preserved under `legacy_deps`. Only seed
  // these occasionally, since real v1.0 exports have moved to `dependencies[]`.
  if (rand() < 0.15) {
    const n = 1 + Math.floor(rand() * 3)
    issue.blocked_by = Array.from({ length: n }, (_, i) => randomBdId(rand, seed + 8000 + i))
  }
  if (rand() < 0.15) {
    const n = 1 + Math.floor(rand() * 3)
    issue.blocks = Array.from({ length: n }, (_, i) => randomBdId(rand, seed + 9000 + i))
  }

  // Comments — body subsection, not frontmatter; generated for completeness.
  if (rand() < 0.3) {
    const n = 1 + Math.floor(rand() * 4)
    issue.comments = Array.from({ length: n }, (_, i) => randomComment(rand, seed + 10000 + i))
  }

  // Metadata blob — emitted iff non-empty and not "{}".
  if (rand() < 0.5) issue.metadata = randomMetadata(rand)

  // Recomputable counts — bd ships them but the emitter drops them; seed
  // anyway so we verify the drop on inputs that have them.
  if (rand() < 0.5) {
    issue.dependency_count = Math.floor(rand() * 10)
    issue.dependent_count = Math.floor(rand() * 10)
    issue.comment_count = Math.floor(rand() * 10)
  }

  if (rand() < 0.3) {
    const n = 1 + Math.floor(rand() * 3)
    issue.labels = Array.from({ length: n }, () => pick(rand, ["urgent", "research", "needs-review", "good-first"]))
  }

  return issue
}

function extractFrontmatter(md: string): Record<string, unknown> {
  const match = md.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) throw new Error(`no frontmatter in:\n${md.slice(0, 200)}`)
  return parseYaml(match[1]!) as Record<string, unknown>
}

describe("migrate round-trip fuzz — every non-recomputable frontmatter field survives parse→emit→reparse", () => {
  it(`for ${ITERATIONS} random BeadsIssue records, the round-trip is identity (modulo recomputable counts)`, () => {
    const failures: Array<{ seed: number; issue: BeadsIssue; reason: string }> = []

    for (let i = 0; i < ITERATIONS; i++) {
      const seed = 0xc0ffee ^ (i * 2654435761)
      const issue = randomIssue(seed)

      // Pre-condition: generator must produce records the schema accepts.
      // Validation here catches generator bugs early — the parse path is
      // what real .jsonl imports go through, so this is the right gate.
      const validation = beadsIssueSchema.safeParse(issue)
      if (!validation.success) {
        failures.push({ seed, issue, reason: `schema rejected generated input: ${validation.error.message}` })
        continue
      }

      let md: string
      try {
        md = issueToMarkdown(issue, SOURCE_PREFIX)
      } catch (e) {
        failures.push({ seed, issue, reason: `issueToMarkdown threw: ${e instanceof Error ? e.message : String(e)}` })
        continue
      }

      let fm: Record<string, unknown>
      try {
        fm = extractFrontmatter(md)
      } catch (e) {
        failures.push({ seed, issue, reason: `extractFrontmatter threw: ${e instanceof Error ? e.message : String(e)}` })
        continue
      }

      // Identity field — always present. The canonical id may be a
      // path-form translation of the bd-form input (or the raw input
      // for orphan auto-ids); we just assert it exists.
      if (!fm.id || typeof fm.id !== "string") {
        failures.push({ seed, issue, reason: `frontmatter.id missing or non-string: ${JSON.stringify(fm.id)}` })
        continue
      }

      // Mandatory authorship.
      if (fm.created_at !== issue.created_at) {
        failures.push({ seed, issue, reason: `created_at drift: ${String(fm.created_at)} vs ${issue.created_at}` })
        continue
      }

      // Conditional verbatim fields.
      const eqOrAbsent = (
        key: keyof BeadsIssue & string,
        fmKey: string = key,
      ): { ok: boolean; reason?: string } => {
        const src = issue[key]
        const dst = fm[fmKey]
        if (src === undefined || src === "" || src === null) {
          if (dst !== undefined) return { ok: false, reason: `${fmKey} should be absent (source is empty) but got ${JSON.stringify(dst)}` }
          return { ok: true }
        }
        if (dst !== src) return { ok: false, reason: `${fmKey} drift: ${JSON.stringify(dst)} vs ${JSON.stringify(src)}` }
        return { ok: true }
      }

      let issueFailed = false
      for (const k of [
        "created_by",
        "started_at",
        "closed_at",
        "close_reason",
        "defer_until",
        "owner",
        "assignee",
        "work_type",
        "parent_id",
      ] as const) {
        const r = eqOrAbsent(k)
        if (!r.ok) {
          failures.push({ seed, issue, reason: r.reason ?? "unknown" })
          issueFailed = true
          break
        }
      }
      if (issueFailed) continue

      // Children — array, identity-preserving when non-empty.
      const expectChildren = issue.children && issue.children.length > 0 ? issue.children : undefined
      if (JSON.stringify(fm.children) !== JSON.stringify(expectChildren)) {
        failures.push({ seed, issue, reason: `children drift: ${JSON.stringify(fm.children)} vs ${JSON.stringify(expectChildren)}` })
        continue
      }

      // Dependencies — array of objects, preserved verbatim.
      const expectDeps = issue.dependencies && issue.dependencies.length > 0 ? issue.dependencies : undefined
      if (JSON.stringify(fm.dependencies) !== JSON.stringify(expectDeps)) {
        failures.push({ seed, issue, reason: `dependencies drift: ${JSON.stringify(fm.dependencies)} vs ${JSON.stringify(expectDeps)}` })
        continue
      }

      // legacy_deps — only present iff source had non-empty blocked_by or blocks.
      const expectLegacy: Record<string, string[]> = {}
      if (issue.blocked_by && issue.blocked_by.length > 0) expectLegacy.blocked_by = issue.blocked_by
      if (issue.blocks && issue.blocks.length > 0) expectLegacy.blocks = issue.blocks
      const expectLegacyOrUndef = Object.keys(expectLegacy).length > 0 ? expectLegacy : undefined
      if (JSON.stringify(fm.legacy_deps) !== JSON.stringify(expectLegacyOrUndef)) {
        failures.push({
          seed,
          issue,
          reason: `legacy_deps drift: ${JSON.stringify(fm.legacy_deps)} vs ${JSON.stringify(expectLegacyOrUndef)}`,
        })
        continue
      }

      // Metadata — verbatim iff non-empty and not "{}", else absent.
      const expectMeta = issue.metadata && issue.metadata !== "{}" ? issue.metadata : undefined
      if (fm.metadata !== expectMeta) {
        failures.push({ seed, issue, reason: `metadata drift: ${JSON.stringify(fm.metadata)} vs ${JSON.stringify(expectMeta)}` })
        continue
      }

      // Recomputable counts — must NEVER appear in frontmatter.
      for (const k of ["dependency_count", "dependent_count", "comment_count"] as const) {
        if (fm[k] !== undefined) {
          failures.push({ seed, issue, reason: `recomputable count leaked into frontmatter: ${k}=${JSON.stringify(fm[k])}` })
          issueFailed = true
          break
        }
      }
      if (issueFailed) continue
    }

    if (failures.length > 0) {
      const sample = failures.slice(0, 5).map((f) => `seed=${f.seed.toString(16)}: ${f.reason}\n  issue=${JSON.stringify(f.issue).slice(0, 400)}`).join("\n---\n")
      throw new Error(`${failures.length}/${ITERATIONS} fuzz cases failed:\n${sample}`)
    }
  })
})
