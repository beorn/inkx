/**
 * Portable realistic-board fixture for benchmarks and TUI tests.
 *
 * Replaces the /tmp/vt dependency used by cursor-real-vault.bench.ts. Generates
 * a deterministic board with ~750 nodes across 10 columns, each with ~50 cards
 * containing 3-5 sub-items and a mix of inline content (broken wikilinks, tags,
 * projects, mentions, code spans, bare URLs, markdown links).
 *
 * The fixture is stored as JSON at `realistic-board.json` — any machine that
 * clones the repo can load the same board without needing a real vault.
 * Regenerate via:
 *
 *     bun apps/km-tui/tests/fixtures/realistic-board.ts --write
 *
 * Loader: `loadRealisticBoardFixture()` builds a FakeRepo from the JSON and
 * returns `{ repo, rootId }` ready to pass to `testEnvWithRepo`.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { KNode } from "@km/core"
import { createFakeRepo, type FakeRepo } from "@km/storage"

// =============================================================================
// Deterministic pseudo-random number generator (Mulberry32)
// =============================================================================

/**
 * Mulberry32: a tiny seeded PRNG. Deterministic across platforms so the
 * generated fixture is identical on every machine.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// =============================================================================
// Inline content generator
// =============================================================================

/**
 * Pools of atoms used to synthesize realistic card titles and sub-items.
 * These match the kind of content seen in a working knowledge vault: broken
 * wikilinks, tags, projects, mentions, code spans, bare URLs, markdown links.
 */
const VERBS = [
  "Fix",
  "Investigate",
  "Ship",
  "Review",
  "Refactor",
  "Document",
  "Test",
  "Land",
  "Polish",
  "Profile",
  "Debug",
  "Triage",
  "Close",
  "Draft",
  "Audit",
  "Benchmark",
]
const NOUNS = [
  "cursor movement",
  "column rendering",
  "flexbox layout",
  "storage sync",
  "parser edge case",
  "scroll region",
  "sticky header",
  "tab bar",
  "detail pane",
  "zoom transition",
  "keybinding map",
  "bead lifecycle",
  "markdown roundtrip",
  "watch queue",
  "fake repo",
  "fixture loader",
]
const TAGS = ["#bug", "#perf", "#refactor", "#docs", "#ui", "#infra", "#hot", "#P1", "#P2"]
const PROJECTS = ["+km", "+silvery", "+flexily", "+bearly", "+termless", "+bench"]
const MENTIONS = ["@beorn", "@claude", "@chief", "@mem-a", "@mem-b"]
const CODE_SPANS = [
  "`board.command()`",
  "`executeRender()`",
  "`createFakeRepo`",
  "`doRender`",
  "`silveryBenchStart`",
  "`layoutPhase`",
]
const WIKILINKS = [
  "[[rendering-diagnostics]]",
  "[[perf-budget]]",
  "[[cursor-stability]]",
  "[[broken-link-xyz]]",
  "[[scrollback-fragility]]",
]
const URLS = [
  "https://silvery.dev",
  "https://github.com/beorn/km",
  "https://bun.sh",
  "https://vitest.dev",
]
const MD_LINKS = [
  "[docs](https://silvery.dev/guide)",
  "[bead](bd://km-tui.bench-system)",
  "[RENDERING.md](./RENDERING.md)",
]

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!
}

/**
 * Compose a card title with 1-2 inline atoms mixed in. Keeps lines short
 * enough to fit in a standard kanban column width.
 */
function makeCardTitle(rng: () => number): string {
  const base = `${pick(rng, VERBS)} ${pick(rng, NOUNS)}`
  const atomCount = 1 + Math.floor(rng() * 2)
  const atoms: string[] = []
  for (let i = 0; i < atomCount; i++) {
    const roll = rng()
    if (roll < 0.25) atoms.push(pick(rng, TAGS))
    else if (roll < 0.45) atoms.push(pick(rng, PROJECTS))
    else if (roll < 0.6) atoms.push(pick(rng, MENTIONS))
    else if (roll < 0.75) atoms.push(pick(rng, CODE_SPANS))
    else if (roll < 0.9) atoms.push(pick(rng, WIKILINKS))
    else atoms.push(pick(rng, URLS))
  }
  return `${base} ${atoms.join(" ")}`
}

/**
 * Compose a sub-item (child card): shorter, usually a single inline atom.
 */
function makeSubItemTitle(rng: () => number, idx: number): string {
  const stem = `step ${idx + 1}`
  const roll = rng()
  if (roll < 0.2) return `${stem} ${pick(rng, WIKILINKS)}`
  if (roll < 0.4) return `${stem} ${pick(rng, MD_LINKS)}`
  if (roll < 0.6) return `${stem} ${pick(rng, TAGS)} ${pick(rng, CODE_SPANS)}`
  if (roll < 0.8) return `${stem} ${pick(rng, MENTIONS)} ${pick(rng, PROJECTS)}`
  return `${stem} — ${pick(rng, NOUNS)}`
}

// =============================================================================
// Fixture generation
// =============================================================================

export interface RealisticBoardOptions {
  /** Seed for the deterministic PRNG. Default: 0xbeef. */
  seed?: number
  /** Number of columns. Default: 10. */
  columns?: number
  /** Number of cards per column. Default: 15 (~750 total nodes). */
  cardsPerColumn?: number
  /** Min sub-items per card. Default: 3. */
  subItemsMin?: number
  /** Max sub-items per card. Default: 5. */
  subItemsMax?: number
}

export interface RealisticBoardFixture {
  rootId: string
  nodes: KNode[]
  meta: {
    seed: number
    columns: number
    cardsPerColumn: number
    subItemsMin: number
    subItemsMax: number
    nodeCount: number
    generatedAt: string
  }
}

/**
 * Build a deterministic realistic board fixture.
 *
 * Tree shape:
 *   board
 *   ├── col-0 (folder)
 *   │   ├── card-0-0 (leaf task with title)
 *   │   │   ├── step-1 (sub-item)
 *   │   │   ├── step-2
 *   │   │   └── ...
 *   │   ├── card-0-1
 *   │   └── ...
 *   ├── col-1
 *   └── ...
 *
 * Note: in the board-test `item()` helper, nodes with children are
 * automatically marked as folders (columns) and leaf nodes as tasks.
 * The fixture preserves the same shape by only giving sub-items to cards.
 */
export function generateRealisticBoard(options: RealisticBoardOptions = {}): RealisticBoardFixture {
  const seed = options.seed ?? 0xbeef
  const columns = options.columns ?? 10
  const cardsPerColumn = options.cardsPerColumn ?? 15
  const subItemsMin = options.subItemsMin ?? 3
  const subItemsMax = options.subItemsMax ?? 5

  const rng = mulberry32(seed)
  const now = 1_712_515_200_000 // 2026-04-07 fixed timestamp for reproducibility

  const nodes: KNode[] = []
  const rootId = "board"

  nodes.push({
    id: rootId,
    type: "h",
    item: {},
    fstype: "folder",
    content: undefined,
    data: { name: "Realistic Board" },
    parent_id: null,
    parent_idx: 0,
    symlink_to: null,
    created_at: now,
    updated_at: now,
    version: "v1",
  } as KNode)

  for (let c = 0; c < columns; c++) {
    const colId = `col-${c}`
    const colName = `Column ${c + 1}`
    nodes.push({
      id: colId,
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: colName },
      parent_id: rootId,
      parent_idx: c,
      symlink_to: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    } as KNode)

    for (let k = 0; k < cardsPerColumn; k++) {
      const cardId = `c${c}-${k}`
      const title = makeCardTitle(rng)
      const subCount = subItemsMin + Math.floor(rng() * (subItemsMax - subItemsMin + 1))
      const hasChildren = subCount > 0

      nodes.push({
        id: cardId,
        type: hasChildren ? "h" : "p",
        item: hasChildren ? {} : { list: "-", task: { marker: "[ ]", status: "todo" as const } },
        fstype: hasChildren ? "folder" : undefined,
        content: hasChildren ? undefined : title,
        data: hasChildren ? { name: title } : {},
        parent_id: colId,
        parent_idx: k,
        symlink_to: null,
        created_at: now,
        updated_at: now,
        version: "v1",
      } as KNode)

      for (let s = 0; s < subCount; s++) {
        const subId = `c${c}-${k}-s${s}`
        const subTitle = makeSubItemTitle(rng, s)
        nodes.push({
          id: subId,
          type: "p",
          item: { list: "-", task: { marker: "[ ]", status: "todo" as const } },
          content: subTitle,
          data: {},
          parent_id: cardId,
          parent_idx: s,
          symlink_to: null,
          created_at: now,
          updated_at: now,
          version: "v1",
        } as KNode)
      }
    }
  }

  return {
    rootId,
    nodes,
    meta: {
      seed,
      columns,
      cardsPerColumn,
      subItemsMin,
      subItemsMax,
      nodeCount: nodes.length,
      generatedAt: "2026-04-07T00:00:00Z",
    },
  }
}

// =============================================================================
// JSON load / write
// =============================================================================

const FIXTURE_PATH = resolve(import.meta.dirname, "realistic-board.json")

/**
 * Load the realistic-board fixture from its JSON file and wrap it in a
 * `FakeRepo`. If the JSON doesn't exist yet, fall back to generating on the
 * fly so tests can run immediately after checkout (the written JSON is for
 * apples-to-apples bench comparisons across commits — not a hard requirement).
 */
export function loadRealisticBoardFixture(): { repo: FakeRepo; rootId: string; nodeCount: number } {
  let fixture: RealisticBoardFixture
  try {
    const raw = readFileSync(FIXTURE_PATH, "utf8")
    fixture = JSON.parse(raw) as RealisticBoardFixture
  } catch {
    fixture = generateRealisticBoard()
  }
  const repo = createFakeRepo({ nodes: fixture.nodes })
  return { repo, rootId: fixture.rootId, nodeCount: fixture.nodes.length }
}

/**
 * Write the fixture JSON to disk. Called by the CLI entrypoint below. Keeping
 * this as a separate export means tests can also regenerate in-memory and
 * compare against the on-disk copy (future use).
 */
export function writeRealisticBoardFixture(fixture: RealisticBoardFixture): void {
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`, "utf8")
}

// =============================================================================
// CLI entrypoint — regenerate the JSON
// =============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2)
  const write = args.includes("--write") || args.includes("-w")
  const fixture = generateRealisticBoard()
  if (write) {
    writeRealisticBoardFixture(fixture)
    console.log(
      `wrote ${fixture.nodes.length} nodes to ${FIXTURE_PATH} ` +
        `(${fixture.meta.columns} cols × ${fixture.meta.cardsPerColumn} cards)`,
    )
  } else {
    console.log(JSON.stringify(fixture, null, 2))
  }
}
