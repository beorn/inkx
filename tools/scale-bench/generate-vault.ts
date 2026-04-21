#!/usr/bin/env bun
/**
 * Synthetic vault generator for the km-storage scale benchmark.
 *
 * Produces an Obsidian-style tree of markdown files with:
 *  - Deep folder nesting (3-5 levels)
 *  - Headings (columns), task lists (cards)
 *  - Wiki-links ([[refs]]) — 10% of lines on average, weighted to hit
 *    a handful of "popular" targets so backlink queries have a signal
 *  - Block-ref anchors (^blockid) — ~5% per heading
 *  - Mixed file sizes: most ~500 bytes, ~10% "journal" files ~50KB
 *
 * Deterministic: seeded PRNG. Same `fileCount` → identical bytes.
 *
 * USAGE:
 *   bun tools/scale-bench/generate-vault.ts <outDir> <fileCount> [seed]
 *
 * Scope-guard: not touched by CI. One-shot harness for
 * bead km-storage.scale-benchmarks.
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"

// ----------------------------------------------------------------------------
// Deterministic PRNG (mulberry32 — 32-bit state, fine for test data)
// ----------------------------------------------------------------------------
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pickInt = (rng: () => number, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1))

const pickOne = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!

// ----------------------------------------------------------------------------
// Content vocabulary
// ----------------------------------------------------------------------------
const TOPICS = [
  "design",
  "research",
  "product",
  "engineering",
  "marketing",
  "journal",
  "meeting",
  "review",
  "plan",
  "spec",
  "draft",
  "outline",
  "reference",
  "notes",
  "project",
  "task",
] as const

const WORDS = [
  "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog", "pack", "my",
  "box", "with", "five", "dozen", "liquor", "jugs", "sphinx", "judge", "vow",
  "zebra", "yacht", "whale", "vector", "pipeline", "signal", "cache", "layer",
  "render", "parse", "index", "query", "node", "edge", "ref", "link", "anchor",
  "block", "heading", "task", "note", "vault", "markdown", "sync", "board",
  "kanban", "column", "card", "cursor", "scroll", "view", "mode",
] as const

function makeSentence(rng: () => number, words = 12): string {
  const out: string[] = []
  for (let i = 0; i < words; i++) out.push(pickOne(rng, WORDS))
  out[0] = out[0]!.charAt(0).toUpperCase() + out[0]!.slice(1)
  return out.join(" ") + "."
}

function makePopularTargets(rng: () => number, count: number): string[] {
  // Short set of "hub" pages; every vault gets at least these
  const base = [
    "Project Alpha",
    "Product Roadmap",
    "Engineering Handbook",
    "Daily Dashboard",
    "Research Index",
    "Meeting Notes",
    "Open Questions",
    "Reading List",
  ]
  const extra: string[] = []
  for (let i = 0; i < count; i++) extra.push(`Hub ${pickOne(rng, TOPICS)} ${i}`)
  return [...base, ...extra]
}

// ----------------------------------------------------------------------------
// File content generator
// ----------------------------------------------------------------------------
interface GenOptions {
  rng: () => number
  fileIndex: number
  popularTargets: string[]
  allFileStems: string[]
  isJournal: boolean
}

function generateMarkdown(opts: GenOptions): string {
  const { rng, fileIndex, popularTargets, allFileStems, isJournal } = opts
  const lines: string[] = []

  // Title
  const topic = pickOne(rng, TOPICS)
  lines.push(`# ${topic} ${fileIndex}`)
  lines.push("")

  // Body: N sections, each with a heading + list of tasks/bullets
  const sectionCount = isJournal ? pickInt(rng, 8, 16) : pickInt(rng, 2, 5)

  for (let s = 0; s < sectionCount; s++) {
    const section = `${pickOne(rng, TOPICS)} section ${s}`
    lines.push(`## ${section}`)

    // ~5% of headings get a block-ref anchor
    if (rng() < 0.05) {
      lines.push(`  ^blk-${fileIndex}-${s}`)
    }
    lines.push("")

    // Items: mix of bullets and tasks
    const itemCount = isJournal ? pickInt(rng, 10, 30) : pickInt(rng, 3, 8)
    for (let i = 0; i < itemCount; i++) {
      const isTask = rng() < 0.6
      const marker = isTask ? (rng() < 0.3 ? "- [x] " : "- [ ] ") : "- "
      let line = marker + makeSentence(rng, pickInt(rng, 6, 14))

      // ~10% of lines get a wiki-link. 70% point at a popular target,
      // 30% at some other file in the vault.
      if (rng() < 0.1) {
        const target =
          rng() < 0.7
            ? pickOne(rng, popularTargets)
            : allFileStems.length > 0
              ? pickOne(rng, allFileStems)
              : pickOne(rng, popularTargets)
        line += ` see [[${target}]]`
      }
      lines.push(line)
    }
    lines.push("")
  }

  // Optional nested sub-section
  if (!isJournal && rng() < 0.3) {
    lines.push(`### Subsection details`)
    lines.push("")
    for (let i = 0; i < pickInt(rng, 3, 6); i++) {
      lines.push(`- ${makeSentence(rng, 8)}`)
    }
    lines.push("")
  }

  // Pad journal files toward ~50KB
  if (isJournal) {
    let body = lines.join("\n")
    while (body.length < 45_000) {
      body += "\n" + makeSentence(rng, 20) + "\n"
    }
    return body
  }

  return lines.join("\n")
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
export interface VaultSpec {
  outDir: string
  fileCount: number
  seed?: number
  /** Fraction of files that become ~50KB journal files. Default 0.1. */
  journalRatio?: number
  /** Additional "hub" target pages beyond the hardcoded 8. Default 16. */
  extraPopularTargets?: number
  /** Folder depth range (min..max). Default 3..5. */
  depthRange?: [number, number]
}

export interface VaultResult {
  outDir: string
  fileCount: number
  totalBytes: number
  durationMs: number
}

export function generateVault(spec: VaultSpec): VaultResult {
  const t0 = performance.now()
  const seed = spec.seed ?? 0x5ca1e
  const journalRatio = spec.journalRatio ?? 0.1
  const [minDepth, maxDepth] = spec.depthRange ?? [3, 5]
  const rng = createRng(seed)

  if (existsSync(spec.outDir)) {
    rmSync(spec.outDir, { recursive: true, force: true })
  }
  mkdirSync(spec.outDir, { recursive: true })

  // Pre-generate file paths (stem + dir) so wiki-links can point at
  // real files.
  const stems: string[] = []
  const dirs: string[] = []
  for (let i = 0; i < spec.fileCount; i++) {
    const depth = pickInt(rng, minDepth, maxDepth)
    const segs: string[] = []
    for (let d = 0; d < depth; d++) {
      const t = pickOne(rng, TOPICS)
      // bucket by first letter of topic + shard id to keep each dir < ~200 files
      segs.push(`${t}-${pickInt(rng, 0, 9)}`)
    }
    const dir = segs.join("/")
    const stem = `${pickOne(rng, TOPICS)}-${i}`
    stems.push(stem)
    dirs.push(dir)
  }

  const popularTargets = makePopularTargets(rng, spec.extraPopularTargets ?? 16)

  // Write files. Keep per-level dirs created lazily.
  const createdDirs = new Set<string>()
  let totalBytes = 0

  for (let i = 0; i < spec.fileCount; i++) {
    const dir = dirs[i]!
    const stem = stems[i]!
    const fullDir = join(spec.outDir, dir)
    if (!createdDirs.has(fullDir)) {
      mkdirSync(fullDir, { recursive: true })
      createdDirs.add(fullDir)
    }

    const isJournal = rng() < journalRatio
    const md = generateMarkdown({
      rng,
      fileIndex: i,
      popularTargets,
      allFileStems: stems,
      isJournal,
    })
    writeFileSync(join(fullDir, `${stem}.md`), md)
    totalBytes += md.length
  }

  // Write the popular-target stub files at the root so wiki-links resolve.
  for (const target of popularTargets) {
    const p = join(spec.outDir, `${target}.md`)
    if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true })
    const body = `# ${target}\n\nHub page for ${target}.\n`
    writeFileSync(p, body)
    totalBytes += body.length
  }

  return {
    outDir: spec.outDir,
    fileCount: spec.fileCount + popularTargets.length,
    totalBytes,
    durationMs: performance.now() - t0,
  }
}

// CLI
if (import.meta.main) {
  const outDir = process.argv[2]
  const fileCount = Number(process.argv[3])
  const seed = process.argv[4] ? Number(process.argv[4]) : undefined

  if (!outDir || !Number.isFinite(fileCount) || fileCount <= 0) {
    console.error("usage: bun tools/scale-bench/generate-vault.ts <outDir> <fileCount> [seed]")
    process.exit(2)
  }

  console.log(`generating ${fileCount} files into ${outDir}...`)
  const r = generateVault({ outDir, fileCount, seed })
  console.log(
    `done: ${r.fileCount} files, ${(r.totalBytes / 1024 / 1024).toFixed(1)} MB, ${r.durationMs.toFixed(0)}ms`,
  )
}
