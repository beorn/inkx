/**
 * Beads Memory Commands — bd remember / bd memories / bd prime
 *
 * Memories live as `mem/<slug>.md` files at vault root. Each file is a
 * single sectioned `## <Title> @memory` block whose body is the insight.
 * The `@memory` sigil makes them queryable via standard sigil sweep.
 *
 * Memories are insights (not prefix-tagged); they are NOT scoped under
 * `@<prefix>/`. Migrated bd memories land in `imports/<source>-<date>/mem/`
 * (paired with their bd db's `@<prefix>/` import); runtime `bd remember`
 * writes to `<repoRoot>/mem/`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { join, basename } from "node:path"
import { resolvePathArg } from "@km/fs-mount"

const term = createTerm(process)

/** Slugify text into a memory key — lowercase kebab, max 60 chars. */
function slugifyMemoryKey(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug || `memory-${Date.now().toString(36)}`
}

/** Resolve the memory directory for the current vault. */
function resolveMemDir(repoRoot: string): string {
  return join(repoRoot, "mem")
}

/** Read all `.md` files in `memDir`, returning `{key, title, body, mtime}` for each. */
interface MemoryRecord {
  key: string
  title: string
  body: string
  path: string
  mtime: number
}

function readMemories(memDir: string): MemoryRecord[] {
  if (!existsSync(memDir)) return []
  const out: MemoryRecord[] = []
  for (const name of readdirSync(memDir)) {
    if (!name.endsWith(".md")) continue
    const path = join(memDir, name)
    const content = readFileSync(path, "utf-8")
    const mtime = statSync(path).mtimeMs
    // Extract first `## <Title> @memory` heading and the paragraph(s) after it.
    const headingMatch = content.match(/^##\s+(.+?)\s*@memory\s*$/m)
    const title = headingMatch?.[1]?.trim() ?? name.replace(/\.md$/, "")
    const headingIdx = headingMatch ? content.indexOf(headingMatch[0]) + headingMatch[0].length : 0
    const body = content.slice(headingIdx).trim()
    out.push({
      key: name.replace(/\.md$/, ""),
      title,
      body,
      path,
      mtime,
    })
  }
  return out
}

// bd remember <text> — append a new memory
export const rememberCommand = new Command("remember")
  .argument("<text...>", "Memory content (insight, lesson, gotcha)")
  .description("Save a memory under mem/<slug>.md for later recall")
  .option("--title <title>", "Explicit title (default: derived from first line)")
  .option("--key <key>", "Explicit slug for the filename (default: derived from title)")
  .action(async (textArg, opts) => {
    const text = (textArg as string[]).join(" ").trim()
    if (!text) {
      console.error(term.red("Memory text is required."))
      process.exitCode = 1
      return
    }
    const resolved = resolvePathArg(undefined)
    const memDir = resolveMemDir(resolved.repoRoot)
    if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true })

    const firstLine = text.split("\n")[0] ?? text
    const title = (opts.title as string | undefined) ?? firstLine.slice(0, 80)
    const key = (opts.key as string | undefined) ?? slugifyMemoryKey(title)
    const filepath = join(memDir, `${key}.md`)

    if (existsSync(filepath)) {
      console.error(term.red(`Memory already exists: ${filepath}`))
      console.log(term.dim("Use a different --key, or edit the existing file directly."))
      process.exitCode = 1
      return
    }

    const content = `## ${title} @memory\n\n${text}\n`
    writeFileSync(filepath, content, "utf-8")
    console.log(term.green(`✓ Remembered: ${key}`))
    console.log(term.dim(`  ${filepath}`))
  })

// bd memories [keyword] — list / search memories
export const memoriesCommand = new Command("memories")
  .argument("[keyword]", "Filter to memories whose title or body contains this keyword")
  .description("List or search memories from mem/")
  .option("--json", "Output as JSON")
  .option("-n, --limit <n>", "Max results", "20")
  .action(async (keyword, opts) => {
    const resolved = resolvePathArg(undefined)
    const memDir = resolveMemDir(resolved.repoRoot)
    let memories = readMemories(memDir)

    if (keyword) {
      const needle = (keyword as string).toLowerCase()
      memories = memories.filter((m) => m.title.toLowerCase().includes(needle) || m.body.toLowerCase().includes(needle))
    }

    // Newest first.
    memories.sort((a, b) => b.mtime - a.mtime)
    const limit = Number.parseInt((opts.limit as string) ?? "20", 10)
    memories = memories.slice(0, limit)

    if (opts.json) {
      console.log(JSON.stringify(memories, null, 2))
      return
    }

    if (memories.length === 0) {
      console.log(term.dim(keyword ? `No memories match "${keyword}".` : "No memories yet."))
      return
    }

    console.log(term.bold(`Memories (${memories.length}):\n`))
    for (const m of memories) {
      console.log(`${term.cyan(m.key)} — ${m.title}`)
      const preview = m.body.replace(/\s+/g, " ").slice(0, 120)
      console.log(term.dim(`  ${preview}${m.body.length > 120 ? "…" : ""}`))
    }
  })

// bd prime — print workflow context (PRIME.md) + recent memories.
// Designed as a drop-in for the Go `bd prime` so SessionStart / PreCompact
// hooks emit equivalent priming text without requiring the bd binary.
export const primeCommand = new Command("prime")
  .description("Print workflow context + recent memories as session-priming context")
  .option("-n, --limit <n>", "Number of memories to include", "5")
  .action(async (opts) => {
    const resolved = resolvePathArg(undefined)
    let printedAnything = false

    // 1. Workflow context: prefer vault-root PRIME.md, then .beads/PRIME.md
    //    (bd binary maintains the latter; emit either for back-compat).
    const primeCandidates = [join(resolved.repoRoot, "PRIME.md"), join(resolved.repoRoot, ".beads", "PRIME.md")]
    for (const path of primeCandidates) {
      if (existsSync(path)) {
        console.log(readFileSync(path, "utf-8").trimEnd())
        console.log()
        printedAnything = true
        break
      }
    }

    // 2. Recent memories from mem/.
    const memDir = resolveMemDir(resolved.repoRoot)
    const memories = readMemories(memDir)
    if (memories.length > 0) {
      memories.sort((a, b) => b.mtime - a.mtime)
      const limit = Number.parseInt((opts.limit as string) ?? "5", 10)
      console.log("# Recent memories (priming context)\n")
      for (const m of memories.slice(0, limit)) {
        console.log(`## ${m.title} @memory`)
        console.log()
        console.log(m.body)
        console.log()
      }
      printedAnything = true
    }

    if (!printedAnything) {
      console.log(term.dim("No PRIME.md or memories to prime with."))
    }
  })

/** A small wrapper to attach all three commands to a parent. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Command's strongly-typed generics make uniform .addCommand variadics unergonomic; same exemption as bd.ts uses for shared-query. */
export function attachMemoryCommands(parent: { addCommand: (c: Command<any, any, any>) => unknown }): void {
  parent.addCommand(rememberCommand as Command<any, any, any>)
  parent.addCommand(memoriesCommand as Command<any, any, any>)
  parent.addCommand(primeCommand as Command<any, any, any>)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Helper: re-export the `basename` we used so it stays alive in barrel-import paths. */
export const _basename = basename
