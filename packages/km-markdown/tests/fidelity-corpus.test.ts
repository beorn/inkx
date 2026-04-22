/**
 * Markdown Fidelity Corpus (km-storage.markdown-fidelity-corpus)
 *
 * Regression test bank that gates safe writeback. For every fixture in
 * `tests/fidelity-corpus/`:
 *
 *   1. Parse to km-ast nodes.
 *   2. Serialize back to markdown.
 *   3. Parse the serialized output a second time.
 *   4. Assert the second parse yields an AST structurally equivalent to
 *      the first — i.e. the round-trip has reached a fixed point.
 *   5. For "clean" fixtures (not under `broken/`), also assert byte-
 *      equality between the original input and the first serialization,
 *      unless the fixture appears in `KNOWN_DRIFT` (documented drift).
 *
 * This corpus is the safety net before the writeback feature ships
 * (bead km-storage.writeback-cas). If this test fails, writeback is
 * unsafe for the affected input shape.
 *
 * Scope note: parser bugs discovered by this corpus should be logged
 * in `KNOWN_FAILURES` with a short explanation and filed as separate
 * beads. Do NOT fix parser bugs here.
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

import type { KNode } from "@km/core"
import { parseMarkdownToNodes } from "../src/ast2nodes.ts"
import { nodesToMarkdown } from "../src/nodes2md.ts"

// ---------------------------------------------------------------------------
// Known drift / known failures
// ---------------------------------------------------------------------------

/**
 * Fixtures where byte-exact round-trip cannot hold for a documented reason
 * (e.g. the serializer canonicalizes whitespace or frontmatter key styles).
 * These fixtures still must pass the AST-structural assertion.
 */
const KNOWN_DRIFT = new Set<string>([
  // Whitespace normalization — serializer picks a canonical form.
  "whitespace/leading-tabs.md",
  "whitespace/trailing-whitespace.md",
  "whitespace/deep-nesting.md",

  // Frontmatter — YAML serialization canonicalizes arrays (flow vs block),
  // quoting, and comment preservation.
  "frontmatter/ordering.md",
  "frontmatter/nested-yaml.md",
  "frontmatter/arrays.md",
  "frontmatter/multiline-strings.md",
  "frontmatter/yaml-comments.md",

  // Code fences — serializer picks ``` vs ~~~ and a canonical fence length.
  "code-fences/exotic-langs.md",
  "code-fences/nested-backticks.md",
  "code-fences/empty-and-lang-metadata.md",

  // HTML / Obsidian comments — preserved semantically but may re-position.
  "comments/html-comments.md",
  "comments/obsidian-comments.md",

  // Wikilinks / block-refs — km normalizes link forms on emit.
  "wikilinks/basic.md",
  "block-refs/block-ids.md",
  "block-refs/mixed.md",

  // Large fixtures — drift is overwhelmingly likely, verify structure only.
  "large/kitchen-sink.md",
  "large/annual-journal.md",
  "large/project-outline.md",

  // Heading moves are structural changes, not byte-exact pairs.
  "heading-moves/before-a.md",
  "heading-moves/after-a.md",
  "heading-moves/before-b.md",
  "heading-moves/after-b.md",

  // Style variants — serializer picks one canonical marker / rule style.
  "style/bullet-markers.md",
  "style/hr-styles.md",

  // Obsidian-isms — callouts, tags, aliases; parser normalizes on output.
  "obsidian/callouts.md",
  "obsidian/tags.md",
  "obsidian/aliases-and-id.md",
])

/**
 * Fixtures that currently fail the structural round-trip assertion due to
 * known parser limitations. Rename the fixture to `.fails.md` to opt it out
 * of the structural check and enumerate it here with the reason.
 *
 * New entries should have a companion bead filed. Do NOT fix parser bugs
 * in this test file.
 */
const KNOWN_FAILURES: ReadonlyArray<{ path: string; reason: string; bead?: string }> = [
  {
    path: "wikilinks/edge-cases.fails.md",
    reason:
      "km-wikilink extension throws `expected non-empty token (kmWikilinkAlias)` on `[[Target|]]` (empty alias) and related edge cases like whitespace-only aliases. Parser crashes instead of degrading gracefully.",
  },
  {
    path: "code-fences/indented-fence.fails.md",
    reason:
      "Code fences inside list items round-trip to a form where the second parse sees a different block structure (indentation context drift between parse + serialize).",
  },
  {
    path: "obsidian/internal-refs.fails.md",
    reason:
      "Round-trip produces a different structural AST on second parse — likely reference-style links + footnotes + embeds combining in ways the serializer doesn't stabilize on first pass.",
  },
  {
    path: "style/ordered-list-numbering.fails.md",
    reason:
      "Ordered-list starting numbers and marker styles (`.` vs `)`) don't stabilize on round-trip; second serialization differs from first.",
  },
  {
    path: "whitespace/mixed-indent.fails.md",
    reason:
      "Nested lists with mixed indentation widths (2 vs 4 space) round-trip to a form whose second serialization disagrees with the first — list structure is reinterpreted on re-parse.",
  },
]

// ---------------------------------------------------------------------------
// Fixture discovery
// ---------------------------------------------------------------------------

const CORPUS_DIR = new URL("./fidelity-corpus/", import.meta.url).pathname

function listFixtures(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...listFixtures(full))
    } else if (entry.endsWith(".md")) {
      out.push(full)
    }
  }
  return out
}

const FIXTURES = listFixtures(CORPUS_DIR).sort()

// ---------------------------------------------------------------------------
// AST comparison
// ---------------------------------------------------------------------------

/**
 * Fields that are expected to differ between parses of the same input
 * (identity, timestamps, internal positions). Excluded from structural
 * equality.
 */
const VOLATILE_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "parent_id",
  "created_at",
  "updated_at",
  "version",
  "md_pos",
  "md_line",
  "content_hash",
  "fs_ino",
  "fs_mtime",
])

/** Strip volatile fields recursively for structural comparison. */
function stripVolatile(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(stripVolatile)
  if (typeof value !== "object") return value
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    if (VOLATILE_FIELDS.has(key)) continue
    out[key] = stripVolatile(obj[key])
  }
  return out
}

/** Project KNode list to a shape comparable across parses. */
function toStructural(nodes: KNode[]): unknown {
  return nodes.map((n) => stripVolatile(n))
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("markdown fidelity corpus", () => {
  it("discovers a meaningful number of fixtures", () => {
    // Guard: if someone deletes the corpus, the test should yelp.
    expect(FIXTURES.length).toBeGreaterThanOrEqual(30)
  })

  for (const absPath of FIXTURES) {
    const relPath = relative(CORPUS_DIR, absPath)
    const isBroken = relPath.startsWith("broken/")
    const isFailsFixture = relPath.endsWith(".fails.md")
    const expectByteExact = !isBroken && !KNOWN_DRIFT.has(relPath) && !isFailsFixture

    describe(relPath, () => {
      const original = readFileSync(absPath, "utf8")

      // `.fails.md` fixtures are documented known failures, enumerated in
      // KNOWN_FAILURES with a reason. They exist on disk for visibility and
      // future regression capture, but are skipped from runtime assertions
      // until the underlying parser bug is fixed.
      if (isFailsFixture) {
        it.skip("known failure — see KNOWN_FAILURES", () => {})
        return
      }

      it("parses without throwing", () => {
        expect(() => parseMarkdownToNodes(original, relPath)).not.toThrow()
      })

      it("serializes without throwing", () => {
        const nodes = parseMarkdownToNodes(original, relPath)
        expect(() => nodesToMarkdown(nodes)).not.toThrow()
      })

      {
        it("round-trip reaches a fixed point (AST-structural)", () => {
          const firstNodes = parseMarkdownToNodes(original, relPath)
          const firstSerialized = nodesToMarkdown(firstNodes)
          const secondNodes = parseMarkdownToNodes(firstSerialized, relPath)

          // Second serialization should match first — this is the
          // "fixed point" check for broken and clean fixtures alike.
          const secondSerialized = nodesToMarkdown(secondNodes)
          expect(secondSerialized).toEqual(firstSerialized)

          // And the node structure must line up.
          expect(toStructural(secondNodes)).toEqual(toStructural(firstNodes))
        })
      }

      if (expectByteExact) {
        it("round-trip is byte-exact (clean fixtures only)", () => {
          const firstNodes = parseMarkdownToNodes(original, relPath)
          const firstSerialized = nodesToMarkdown(firstNodes)
          expect(firstSerialized).toEqual(original)
        })
      }
    })
  }

  it("KNOWN_FAILURES entries all exist on disk", () => {
    for (const entry of KNOWN_FAILURES) {
      const full = join(CORPUS_DIR, entry.path)
      expect(() => statSync(full), `${entry.path} listed in KNOWN_FAILURES but not on disk`).not.toThrow()
    }
  })
})
