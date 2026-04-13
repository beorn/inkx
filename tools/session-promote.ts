#!/usr/bin/env bun
/**
 * session-promote.ts — Bridge between recall (session history) and gbrain (knowledge brain)
 *
 * Extracts durable knowledge from Claude Code session summaries and promotes
 * it as gbrain pages. Uses recall daily summaries as the evidence spine.
 *
 * Commands:
 *   scan     — scan recent sessions for promotable knowledge
 *   promote  — extract and write gbrain pages (--dry-run for preview)
 *   status   — show what's been promoted vs pending
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Command } from "@silvery/commander"
import { createLogger } from "loggily"

// ─── Logging ────────────────────────────────────────────────────────────────

const log = createLogger("session-promote", [
  { level: "debug" },
  { file: "/tmp/session-promote.log", format: "json" },
])

// ─── Paths ──────────────────────────────────────────────────────────────────

const REPO_ROOT = join(import.meta.dir, "..")
const STATE_DIR = join(REPO_ROOT, ".claude/skills/sop")
const STATE_PATH = join(STATE_DIR, "promote-state.json")
const DEFAULT_DAYS = 7

// ─── Types ──────────────────────────────────────────────────────────────────

type KnowledgeType = "fact" | "instruction" | "event"

interface Extraction {
  title: string
  type: KnowledgeType
  content: string
  tags: string[]
  confidence: number
  sourceDate: string
  sourceSection: string
}

interface PromotionRecord {
  title: string
  slug: string
  date: string
  type: KnowledgeType
}

interface PromoteState {
  lastScan: string
  promoted: PromotionRecord[]
}

// ─── State management ───────────────────────────────────────────────────────

function loadState(): PromoteState {
  if (existsSync(STATE_PATH)) {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as PromoteState
  }
  return { lastScan: "", promoted: [] }
}

function saveState(state: PromoteState): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n")
}

// ─── Shell helpers ──────────────────────────────────────────────────────────

function run(cmd: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(cmd, {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

function recallShow(date: string): string | null {
  const r = run(["bun", "recall", "show", date])
  if (r.exitCode !== 0 || r.stdout.includes("No summary for")) return null
  return r.stdout
}

function gbrainSearch(query: string): string {
  const r = run(["gbrain", "search", query])
  return r.exitCode === 0 ? r.stdout : ""
}

function gbrainPut(slug: string, content: string): boolean {
  const r = run(["gbrain", "put", slug, "--content", content])
  if (r.exitCode !== 0) {
    log.error?.(new Error(r.stderr.trim()), "gbrain put failed", { slug })
    return false
  }
  return true
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function recentDates(days: number): string[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

// ─── Extraction — pattern-based knowledge mining from recall summaries ──────

function parseSections(summary: string): Map<string, string[]> {
  const sections = new Map<string, string[]>()
  let currentSection = ""
  for (const line of summary.split("\n")) {
    const heading = line.match(/^## (.+)/)
    if (heading) {
      currentSection = heading[1]!
      sections.set(currentSection, [])
      continue
    }
    if (currentSection && line.trim().startsWith("- ") && !isNoneEntry(line)) {
      sections.get(currentSection)!.push(line.trim().replace(/^- /, ""))
    }
  }
  return sections
}

function isNoneEntry(line: string): boolean {
  const lower = line.toLowerCase().trim()
  return (
    lower.includes("(none") ||
    lower.includes("none documented") ||
    lower.includes("no entries") ||
    lower.includes("(no ") ||
    lower.includes("no prior-day") ||
    lower.includes("no repeated") ||
    lower === "- none" ||
    lower === "- none." ||
    lower.startsWith("- none ")
  )
}

/** Filter out low-quality extractions (too short, generic, etc.) */
function isSubstantive(ext: Extraction): boolean {
  if (ext.title.length < 10) return false
  if (ext.content.length < 20) return false
  const lower = ext.content.toLowerCase()
  if (lower === "none" || lower === "none." || lower.startsWith("none ")) return false
  return true
}

function inferTags(text: string): string[] {
  const tags = new Set<string>()
  const keywords: Record<string, string> = {
    silvery: "silvery",
    flexily: "flexily",
    termless: "termless",
    loggily: "loggily",
    "km-tui": "km-tui",
    sqlite: "sqlite",
    bead: "beads",
    tribe: "tribe",
    gbrain: "gbrain",
    recall: "recall",
    "terminfo.dev": "terminfo",
    vitest: "testing",
    typescript: "typescript",
    react: "react",
    ink: "ink",
    "git submodule": "git",
    release: "release",
    npm: "npm",
    "ci/cd": "ci",
    "github action": "ci",
    cloudflare: "cloudflare",
  }
  const lower = text.toLowerCase()
  for (const [pattern, tag] of Object.entries(keywords)) {
    if (lower.includes(pattern)) tags.add(tag)
  }
  if (tags.size === 0) tags.add("km")
  return [...tags]
}

/** Clean markdown refs from extraction text */
function cleanRefs(text: string): string {
  return text.replace(/\[session-ref:\w+\]/g, "").replace(/\[\w+\]/g, "").trim()
}

/** Create an extraction from a summary section item */
function createExtraction(
  item: string,
  date: string,
  section: string,
  type: KnowledgeType,
  confidence: number,
  extraTags: string[] = [],
): Extraction {
  return {
    title: summarizeTitle(item, 60),
    type,
    content: cleanRefs(item),
    tags: [...inferTags(item), ...extraTags],
    confidence,
    sourceDate: date,
    sourceSection: section,
  }
}

function extractFromSummary(date: string, summary: string): Extraction[] {
  const sections = parseSections(summary)
  const extractions: Extraction[] = []

  // Key Decisions → event (dated decisions)
  for (const item of sections.get("Key Decisions") ?? []) {
    extractions.push(createExtraction(item, date, "Key Decisions", "event", 0.8))
  }

  // Lessons Learned → instruction (standing procedures)
  for (const item of sections.get("Lessons Learned") ?? []) {
    extractions.push(createExtraction(item, date, "Lessons Learned", "instruction", 0.85))
  }

  // Architecture Changes → fact (stable knowledge about the system)
  for (const item of sections.get("Architecture Changes") ?? []) {
    extractions.push(createExtraction(item, date, "Architecture Changes", "fact", 0.9))
  }

  // Bugs Found → event
  for (const item of sections.get("Bugs Found") ?? []) {
    extractions.push(createExtraction(item, date, "Bugs Found", "event", 0.75, ["bug"]))
  }

  // Memory Updates → instruction or fact
  for (const item of sections.get("Memory Updates") ?? []) {
    const isNew = item.startsWith("NEW:")
    const cleaned = item.replace(/^NEW:\s*/, "")
    extractions.push({
      title: summarizeTitle(cleaned, 60),
      type: isNew ? "instruction" : "fact",
      content: cleanRefs(cleaned).replace(/\(.*?\)/g, "").trim(),
      tags: inferTags(item),
      confidence: 0.9,
      sourceDate: date,
      sourceSection: "Memory Updates",
    })
  }

  return extractions.filter(isSubstantive)
}

/** Generate a short title from content — first sentence, capped at maxLen chars */
function summarizeTitle(text: string, maxLen: number): string {
  let clean = cleanRefs(text)
  const sentenceEnd = clean.search(/[.;!?]/)
  if (sentenceEnd > 0 && sentenceEnd < maxLen) {
    clean = clean.slice(0, sentenceEnd + 1)
  }
  if (clean.length > maxLen) {
    clean = clean.slice(0, maxLen - 3) + "..."
  }
  return clean
}

/** Convert title to a gbrain-friendly slug */
function slugify(title: string, date: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
  return `sessions/${date}/${base}`
}

// ─── Dedup — check gbrain for existing similar content ──────────────────────

function isDuplicate(extraction: Extraction, state: PromoteState): boolean {
  // Check local state first
  if (state.promoted.some((p) => p.title === extraction.title && p.date === extraction.sourceDate)) {
    return true
  }
  // Check gbrain
  const keywords = extraction.title.split(/\s+/).slice(0, 4).join(" ")
  const results = gbrainSearch(keywords)
  if (!results) return false
  // Simple heuristic: if the top result has a score > 0.7, likely duplicate
  const firstLine = results.split("\n")[0] ?? ""
  const scoreMatch = firstLine.match(/^\[([0-9.]+)\]/)
  if (scoreMatch && parseFloat(scoreMatch[1]!) > 0.7) {
    return true
  }
  return false
}

// ─── Format — build gbrain page content ─────────────────────────────────────

function formatGbrainPage(ext: Extraction): string {
  const tags = ext.tags.map((t) => `"${t}"`).join(", ")
  return `---
title: "${ext.title.replace(/"/g, '\\"')}"
type: ${ext.type}
source: claude-session
session_date: "${ext.sourceDate}"
confidence: ${ext.confidence}
tags: [${tags}]
---

## Compiled Truth

${ext.content}

---

## Timeline

- ${ext.sourceDate}: Extracted from Claude Code session (${ext.sourceSection}).
`
}

// ─── Commands ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<KnowledgeType, string> = {
  fact: "FACT",
  instruction: "INSTR",
  event: "EVENT",
}

async function cmdScan(days: number): Promise<Extraction[]> {
  using _span = log.span!("scan", { days })
  const dates = recentDates(days)
  const allExtractions: Extraction[] = []

  console.error(`Scanning ${days} days of session history...\n`)

  for (const date of dates) {
    const summary = recallShow(date)
    if (!summary) continue

    const extractions = extractFromSummary(date, summary)
    if (extractions.length > 0) {
      console.error(`  ${date}: ${extractions.length} item(s) found`)
      allExtractions.push(...extractions)
    }
  }

  if (allExtractions.length === 0) {
    console.log("No promotable knowledge found in recent sessions.")
    console.log("Tip: Run `bun recall summarize` first to generate daily summaries.")
    return []
  }

  console.log(`Found ${allExtractions.length} total extraction(s):\n`)
  for (const ext of allExtractions) {
    console.log(`  [${TYPE_LABELS[ext.type]}] ${ext.title}`)
    console.log(`         date=${ext.sourceDate}  tags=[${ext.tags.join(", ")}]  confidence=${ext.confidence}`)
  }

  log.debug?.("scan complete", { days, count: allExtractions.length })
  return allExtractions
}

async function cmdPromote(days: number, dryRun: boolean): Promise<void> {
  using _span = log.span!("promote", { days, dryRun })
  const extractions = await cmdScan(days)
  if (extractions.length === 0) return

  const state = loadState()
  let promoted = 0
  let skipped = 0

  console.log(`\n${dryRun ? "[DRY RUN] " : ""}Promoting to gbrain...\n`)

  for (const ext of extractions) {
    const slug = slugify(ext.title, ext.sourceDate)

    if (isDuplicate(ext, state)) {
      console.log(`  SKIP (dup): ${ext.title}`)
      skipped++
      continue
    }

    const page = formatGbrainPage(ext)

    if (dryRun) {
      console.log(`  WOULD WRITE: gbrain put ${slug}`)
      console.log(`    type=${ext.type}, tags=[${ext.tags.join(", ")}]`)
      promoted++
      continue
    }

    const ok = gbrainPut(slug, page)
    if (ok) {
      console.log(`  WROTE: ${slug}`)
      state.promoted.push({
        title: ext.title,
        slug,
        date: ext.sourceDate,
        type: ext.type,
      })
      promoted++
    }
  }

  if (!dryRun) {
    state.lastScan = new Date().toISOString()
    saveState(state)
  }

  log.debug?.("promote complete", { promoted, skipped, dryRun })
  console.log(`\nDone: ${promoted} promoted, ${skipped} skipped (duplicates).`)
}

async function cmdStatus(): Promise<void> {
  const state = loadState()

  console.log("Session Promotion Pipeline Status\n")
  console.log(`  Last scan: ${state.lastScan || "never"}`)
  console.log(`  Total promoted: ${state.promoted.length}`)

  if (state.promoted.length > 0) {
    console.log(`\n  Recent promotions:`)
    const recent = state.promoted.slice(-10)
    for (const p of recent) {
      console.log(`    [${TYPE_LABELS[p.type]}] ${p.date} — ${p.title}`)
      console.log(`           slug: ${p.slug}`)
    }
    if (state.promoted.length > 10) {
      console.log(`    ... and ${state.promoted.length - 10} more`)
    }
  }

  // Show pending dates (summaries that exist but haven't been scanned since)
  const dates = recentDates(DEFAULT_DAYS)
  const lastScanDate = state.lastScan ? state.lastScan.slice(0, 10) : ""
  const pending = dates.filter((d) => d > lastScanDate || !lastScanDate)
  if (pending.length > 0) {
    console.log(`\n  Pending scan: ${pending.length} day(s) since last scan`)
    console.log(`    ${pending.join(", ")}`)
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const program = new Command()
program
  .name("session-promote")
  .description("Session promotion pipeline — extract knowledge from sessions into gbrain")
  .addHelpSection("Knowledge Types:", "fact (stable knowledge), instruction (standing procedures), event (dated occurrences)")
  .addHelpSection("Examples:", [
    ["$ bun tools/session-promote.ts scan", "Scan last 7 days"],
    ["$ bun tools/session-promote.ts scan --days 30", "Scan last 30 days"],
    ["$ bun tools/session-promote.ts promote --dry-run", "Preview promotions"],
    ["$ bun tools/session-promote.ts promote", "Write gbrain pages"],
    ["$ bun tools/session-promote.ts status", "Show pipeline state"],
  ])

program
  .command("scan")
  .description("Scan recent sessions for promotable knowledge")
  .option("--days <n>", "Days to scan", String(DEFAULT_DAYS))
  .action(async (opts: { days?: string }) => {
    await cmdScan(parseInt(opts.days ?? String(DEFAULT_DAYS), 10) || DEFAULT_DAYS)
  })

program
  .command("promote")
  .description("Extract and write gbrain pages")
  .option("--days <n>", "Days to scan", String(DEFAULT_DAYS))
  .option("--dry-run", "Preview what would be promoted without writing")
  .action(async (opts: { days?: string; dryRun?: boolean }) => {
    await cmdPromote(parseInt(opts.days ?? String(DEFAULT_DAYS), 10) || DEFAULT_DAYS, opts.dryRun ?? false)
  })

program
  .command("status")
  .description("Show promotion pipeline state")
  .action(async () => {
    await cmdStatus()
  })

program.parseAsync().catch((err: unknown) => {
  log.error?.(err instanceof Error ? err : new Error(String(err)), "fatal error")
  process.exitCode = 1
})
