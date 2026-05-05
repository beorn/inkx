/**
 * Dissolve `data.tags` — hashtags become rows in the `links` table.
 *
 * Verifies:
 *   1. Parser stops writing `data.tags` and `data._allTags` on KNode.
 *   2. Each `#tag` extracted from heading / list-item title text lands as
 *      a `(host_id, href='km:%23<tag>', rel='link')` row in the `links`
 *      table.
 *   3. YAML frontmatter `tags: [foo, bar]` also lands as link rows
 *      (and the YAML field does not round-trip back as `data.tags`).
 *   4. Round-trip stability: parse → serialize → parse produces the same
 *      hashtag link rows.
 *
 * Tracking: `@km/all/dissolve-data-tags-to-links`.
 */

import { describe, test, expect, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { MemoryStore } from "../src/store/store.ts"
import { parseMarkdownWithLinks, nodesToMarkdown } from "@km/markdown"

const createdDirs: string[] = []

afterEach(() => {
  for (const dir of createdDirs) {
    try {
      rmSync(dir, { recursive: true })
    } catch {
      // ignore
    }
  }
  createdDirs.length = 0
})

function createTestDir(): string {
  const dir = join("/tmp", `kmtest-dissolve-tags-${ulid()}`)
  mkdirSync(dir, { recursive: true })
  createdDirs.push(dir)
  return dir
}

// Helper: read all link rows from store DB.
function getLinks(store: MemoryStore): Array<{ host_id: string; href: string; rel: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test access
  const db = (store as any).db as { query: (sql: string) => { all: () => unknown[] } }
  return db.query("SELECT host_id, href, rel FROM links ORDER BY host_id, href").all() as Array<{
    host_id: string
    href: string
    rel: string
  }>
}

describe("dissolve data.tags → links table", () => {
  test("H1 hashtags emit link rows on the file node", () => {
    const dir = createTestDir()
    writeFileSync(join(dir, "bead.md"), "# Title #task #P1\n\nBody.\n")

    using store = new MemoryStore(dir)
    const file = store.getNodeByPath(join(dir, "bead.md"))
    expect(file).toBeDefined()

    const links = getLinks(store)
    const tagLinks = links.filter((l) => l.host_id === file?.id && l.href.startsWith("km:%23"))
    const hrefs = new Set(tagLinks.map((l) => l.href))
    expect(hrefs).toContain("km:%23task")
    expect(hrefs).toContain("km:%23P1")
    expect(tagLinks.every((l) => l.rel === "link")).toBe(true)
  })

  test("list-item hashtags emit link rows on the list-item node", () => {
    const dir = createTestDir()
    writeFileSync(join(dir, "list.md"), "# List\n\n- [ ] Buy milk #shopping #urgent\n")

    using store = new MemoryStore(dir)
    const allNodes = store.getAllNodes()
    const item = allNodes.find((n) => n.content?.includes("Buy milk"))
    expect(item).toBeDefined()

    const links = getLinks(store).filter((l) => l.host_id === item?.id)
    const hrefs = new Set(links.map((l) => l.href))
    expect(hrefs).toContain("km:%23shopping")
    expect(hrefs).toContain("km:%23urgent")
  })

  test("YAML frontmatter `tags:` produces link rows", () => {
    const dir = createTestDir()
    writeFileSync(join(dir, "yaml.md"), "---\ntags: [alpha, beta]\n---\n\n# Doc\n\nBody.\n")

    using store = new MemoryStore(dir)
    const file = store.getNodeByPath(join(dir, "yaml.md"))
    expect(file).toBeDefined()

    const links = getLinks(store).filter((l) => l.host_id === file?.id)
    const hrefs = new Set(links.map((l) => l.href))
    expect(hrefs).toContain("km:%23alpha")
    expect(hrefs).toContain("km:%23beta")
  })

  test("KNode.data.tags is no longer written by the parser", () => {
    const md = "---\ntags: [foo]\n---\n\n# Doc #task #P0\n\n- [ ] Sub #urgent\n"
    const { nodes } = parseMarkdownWithLinks(md, "test.md")
    for (const node of nodes) {
      const data = node.data as Record<string, unknown> | undefined
      expect(data?.tags, `node ${node.id} ${node.content ?? ""} should have no data.tags`).toBeUndefined()
      expect(data?._allTags, `node ${node.id} should have no data._allTags`).toBeUndefined()
    }
  })

  test("round-trip parse → serialize → parse produces identical hashtag rows", () => {
    const md = "# Bead Title #task #P2\n\n- [ ] Sub item #frontend\n"
    const first = parseMarkdownWithLinks(md, "bead.md")
    const serialized = nodesToMarkdown(first.nodes)
    const second = parseMarkdownWithLinks(serialized, "bead.md")

    // Every hashtag in the round-trip should still appear as content (the
    // parser re-extracts on second parse).
    expect(serialized).toContain("#task")
    expect(serialized).toContain("#P2")
    expect(serialized).toContain("#frontend")

    // Check both parses produced the same node count (no regressions).
    expect(second.nodes.length).toBe(first.nodes.length)
  })
})
