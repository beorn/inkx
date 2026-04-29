/**
 * Beads Comment Commands — bd comment add / bd comment list
 *
 * Comments live as list items under a `## Comments @comments` section
 * within the bead's markdown body. The `@comments` sigil makes the
 * section queryable via standard sigil sweep, analogous to `@memory`.
 *
 * Format: one comment per line, `- @<user> (<ISO timestamp>): <text>`.
 * Inner newlines in <text> are escaped to ` ↵ ` to keep one-line-per-item.
 *
 * Source of truth is the bead's .md file body. The migrate path doesn't
 * yet ship comments (Yegge bd export change pending) — this is a
 * runtime-only feature that augments existing markdown.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { resolvePathArg } from "@km/fs-mount"
import { COMMENTS_SECTION_HEADING } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"

const term = createTerm(process)

/**
 * Anchor heading for the bead's comment timeline. Re-exported from
 * `@km/beads` so write side (migrate) and runtime side (this module)
 * agree on the exact string.
 */
export const COMMENTS_HEADING = COMMENTS_SECTION_HEADING

/** Get the commenting user — git config user.name, with `bjorn` fallback. */
export function resolveCommentUser(): string {
  try {
    const name = execSync("git config user.name", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    if (name) return name.replace(/\s+/g, "-").toLowerCase()
  } catch {
    // ignored — fall through to default
  }
  return "bjorn"
}

/** Encode user-supplied comment text into a one-line list item value. */
export function encodeCommentText(text: string): string {
  return text.replace(/\r?\n/g, " ↵ ")
}

/** Format a comment line. Includes the `- ` list marker. */
export function formatCommentLine(user: string, timestamp: string, text: string): string {
  return `- @${user} (${timestamp}): ${encodeCommentText(text)}`
}

/**
 * Parse the `## Comments @comments` section from a markdown body.
 * Returns the list of raw comment lines (with `- ` marker stripped).
 * Returns an empty array if the section is absent.
 */
export function parseComments(body: string): string[] {
  const lines = body.split(/\r?\n/)
  const headingIdx = lines.findIndex((l) => l.trim() === COMMENTS_HEADING)
  if (headingIdx < 0) return []

  const out: string[] = []
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ""
    // Stop at the next heading (any level).
    if (/^#{1,6}\s/.test(line)) break
    const m = line.match(/^-\s+(.+)$/)
    if (m) out.push(m[1] ?? "")
  }
  return out
}

/**
 * Append a comment line to the body. Creates the `## Comments @comments`
 * section at the end of the body if absent. Existing section header is
 * never duplicated.
 */
export function appendCommentToBody(body: string, line: string): string {
  const lines = body.split(/\r?\n/)
  const headingIdx = lines.findIndex((l) => l.trim() === COMMENTS_HEADING)

  if (headingIdx < 0) {
    // Section absent — append a blank line, the heading, a blank line, then the item.
    let trimmed = body.replace(/\s+$/, "")
    if (trimmed.length > 0) trimmed += "\n\n"
    return `${trimmed}${COMMENTS_HEADING}\n\n${line}\n`
  }

  // Section exists — find the last comment line (or the line right after
  // the heading) and append after it. Stop scanning at the next heading.
  let insertAt = lines.length
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i] ?? "")) {
      insertAt = i
      break
    }
  }

  // Walk back from insertAt to skip trailing blank lines so the new
  // comment lands directly under the previous one.
  let appendIdx = insertAt
  while (appendIdx > headingIdx + 1 && (lines[appendIdx - 1] ?? "").trim() === "") {
    appendIdx--
  }

  const before = lines.slice(0, appendIdx)
  const after = lines.slice(appendIdx)
  // Ensure a blank line follows the heading the first time.
  const needsBlank = appendIdx === headingIdx + 1
  const insertion = needsBlank ? ["", line] : [line]
  return [...before, ...insertion, ...after].join("\n")
}

/**
 * Resolve the .md file that holds a bead's body.
 *
 * Walks from the resolved node up the parent chain looking for the
 * nearest ancestor whose `fs_path` points at an actual `.md` file on
 * disk. Standalone migrated beads (`@km/beads/foo.md`) resolve to
 * themselves; embedded beads bubble up to their containing board file.
 */
export function resolveBeadFilePath(repoRoot: string, fsPath: string | undefined): string | null {
  if (!fsPath) return null
  // Try as-is, then with `.md` suffix appended (some fs_paths drop it).
  const candidates = fsPath.endsWith(".md") ? [fsPath] : [`${fsPath}.md`, fsPath]
  for (const rel of candidates) {
    const abs = join(repoRoot, rel)
    if (existsSync(abs)) return abs
  }
  return null
}

// Action body for `bd comment add` — exposed for unit tests too.
export async function addCommentAction(idArg: string, text: string): Promise<number> {
  if (!text.trim()) {
    console.error(term.red("Comment text is required."))
    return 1
  }

  const resolved = resolvePathArg(undefined)
  using repo = await loadRepo(resolved.repoRoot)
  const issue = resolveIssueArg(repo, idArg)
  if (!issue) {
    console.error(term.red(`Issue not found: ${idArg}`))
    return 1
  }

  const filepath = resolveBeadFilePath(resolved.repoRoot, issue.path)
  if (!filepath) {
    console.error(term.red(`Cannot locate markdown file for ${issue.shortId} (path: ${issue.path ?? "?"}).`))
    return 1
  }

  const user = resolveCommentUser()
  const timestamp = new Date().toISOString()
  const line = formatCommentLine(user, timestamp, text)

  const body = readFileSync(filepath, "utf-8")
  const next = appendCommentToBody(body, line)
  writeFileSync(filepath, next, "utf-8")

  console.log(term.green(`✓ Comment added to ${issue.shortId}`))
  console.log(term.dim(`  ${filepath}`))
  return 0
}

// Action body for `bd comment list`.
export async function listCommentAction(idArg: string): Promise<number> {
  const resolved = resolvePathArg(undefined)
  using repo = await loadRepo(resolved.repoRoot)
  const issue = resolveIssueArg(repo, idArg)
  if (!issue) {
    console.error(term.red(`Issue not found: ${idArg}`))
    return 1
  }

  const filepath = resolveBeadFilePath(resolved.repoRoot, issue.path)
  if (!filepath) {
    console.error(term.red(`Cannot locate markdown file for ${issue.shortId} (path: ${issue.path ?? "?"}).`))
    return 1
  }

  const body = readFileSync(filepath, "utf-8")
  const comments = parseComments(body)
  if (comments.length === 0) {
    console.log("No comments.")
    return 0
  }

  for (const c of comments) {
    console.log(`- ${c}`)
  }
  return 0
}

const addCmd = new Command("add")
  .argument("<id>", "Bead id (km-xxxx, @<prefix>/<scope>/<slug>, or path-form)")
  .argument("<text...>", "Comment text")
  .description("Append a comment to the bead's `## Comments @comments` section")
  .action(async (idArg, textArg) => {
    const text = (textArg as string[]).join(" ")
    process.exitCode = await addCommentAction(idArg as string, text)
  })

const listCmd = new Command("list")
  .argument("<id>", "Bead id (km-xxxx, @<prefix>/<scope>/<slug>, or path-form)")
  .description("List comments stored under the bead's `## Comments @comments` section")
  .action(async (idArg) => {
    process.exitCode = await listCommentAction(idArg as string)
  })

export const commentCommand = new Command("comment")
  .description("Add or list comments on a bead (markdown body)")
  .addCommand(addCmd)
  .addCommand(listCmd)

/** Wire the `comment` subgroup onto a parent (mirrors attachMemoryCommands shape). */
/* eslint-disable @typescript-eslint/no-explicit-any -- Command's strongly-typed generics make uniform .addCommand variadics unergonomic; same exemption as bd.ts uses for shared-query. */
export function attachCommentCommands(parent: { addCommand: (c: Command<any, any, any>) => unknown }): void {
  parent.addCommand(commentCommand as Command<any, any, any>)
}
/* eslint-enable @typescript-eslint/no-explicit-any */
