/**
 * renderInboxCapture: pure-function file-renderer for fresh `km bd create`
 * (no --parent, no --id) — `@km/beads/create-orphan-must-materialize`.
 *
 * The CLI command path in `apps/km-cli/src/commands/bd.ts` joins
 * `<roots[0]>/<default_scope>/<filename>` from this output and writes the
 * file. The contract is intentionally minimal: aliases hold every form a
 * caller might reference, the file path IS the canonical id (no redundant
 * frontmatter `id:` line), and the title is a `# heading` body row.
 *
 * Pinning the contract here so the renderer can't silently drift the
 * frontmatter shape — which would break the round-trip with
 * `nodeToBead` / `resolveShortId` (alias resolution depends on the
 * `aliases:` array carrying both forms).
 */

import { describe, expect, test } from "vitest"
import { parse as parseYaml } from "yaml"
import { renderInboxCapture } from "../src/mutations.ts"

describe("renderInboxCapture", () => {
  test("filename is <short-id>.md", () => {
    const { filename } = renderInboxCapture("abc12", "anything", { prefix: "km" })
    expect(filename).toBe("abc12.md")
  })

  test("frontmatter aliases include bare short-id and bd-form", () => {
    const { content } = renderInboxCapture("abc12", "Fix the thing", { prefix: "km" })
    const fm = parseYaml(extractFrontmatter(content))
    expect(fm.aliases).toEqual(["abc12", "km-abc12"])
  })

  test("dynamic prefix produces correct bd-form alias", () => {
    const { content } = renderInboxCapture("xyz9", "title", { prefix: "pim" })
    const fm = parseYaml(extractFrontmatter(content))
    expect(fm.aliases).toEqual(["xyz9", "pim-xyz9"])
  })

  test("frontmatter has NO redundant id field — the file path IS the canonical id", () => {
    const { content } = renderInboxCapture("abc12", "title", { prefix: "km" })
    const fm = parseYaml(extractFrontmatter(content))
    expect(fm).not.toHaveProperty("id")
  })

  test("title becomes a `# heading` body row", () => {
    const { content } = renderInboxCapture("abc12", "Fix the broken thing", { prefix: "km" })
    expect(extractBody(content)).toContain("# Fix the broken thing")
  })

  test("description and notes appear as separate body sections", () => {
    const { content } = renderInboxCapture("abc12", "Title", {
      prefix: "km",
      description: "Reproduces on macOS only.",
      notes: "Workaround: pin to 1.4.x.",
    })
    const body = extractBody(content)
    expect(body).toContain("# Title")
    expect(body).toContain("Reproduces on macOS only.")
    expect(body).toContain("Workaround: pin to 1.4.x.")
  })

  test("created_at is ISO-8601 (the createdAt parameter, when supplied, is honored)", () => {
    const fixed = new Date("2026-04-29T12:34:56.000Z")
    const { content } = renderInboxCapture("abc12", "T", { prefix: "km", createdAt: fixed })
    const fm = parseYaml(extractFrontmatter(content))
    expect(fm.created_at).toBe("2026-04-29T12:34:56.000Z")
  })

  test("type and priority hints land in frontmatter when provided, omitted when absent", () => {
    const { content: bare } = renderInboxCapture("abc12", "T", { prefix: "km" })
    const fmBare = parseYaml(extractFrontmatter(bare))
    expect(fmBare).not.toHaveProperty("type")
    expect(fmBare).not.toHaveProperty("priority")

    const { content: withHints } = renderInboxCapture("abc12", "T", {
      prefix: "km",
      type: "bug",
      priority: "P1",
    })
    const fmHints = parseYaml(extractFrontmatter(withHints))
    expect(fmHints.type).toBe("bug")
    expect(fmHints.priority).toBe("P1")
  })

  test("output is valid YAML frontmatter + body — round-trips cleanly", () => {
    const { content } = renderInboxCapture("abc12", "Title with: weird *chars*", {
      prefix: "km",
      description: "Includes 'quotes' and \"double quotes\" and a colon: see?",
    })
    // If frontmatter serialization escaping is broken, parseYaml throws.
    expect(() => parseYaml(extractFrontmatter(content))).not.toThrow()
    expect(extractBody(content)).toContain("Title with: weird *chars*")
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
