#!/usr/bin/env bun
/**
 * claude-log — list or open Claude Code session logs.
 *
 * Usage:
 *   bun claude-log                    # list latest sessions across all projects
 *   bun claude-log <session-id>       # open the session whose UUID starts with this prefix
 *   bun claude-log <path>             # open a specific .jsonl file
 *
 * Session files live at `~/.claude/projects/<encoded-project-dir>/<uuid>.jsonl`.
 * Each file's "name" is inferred from its first user message; the UUID prefix
 * is the handy short identifier.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { spawn } from "node:child_process"

interface SessionInfo {
  path: string
  sessionId: string
  shortId: string
  project: string
  mtime: number
  firstUserMessage: string
}

/** Scan ~/.claude/projects for all .jsonl session files. */
function findSessions(): SessionInfo[] {
  const root = join(homedir(), ".claude", "projects")
  if (!existsSync(root)) return []
  const out: SessionInfo[] = []
  for (const projectDir of readdirSync(root)) {
    const projectPath = join(root, projectDir)
    try {
      const st = statSync(projectPath)
      if (!st.isDirectory()) continue
    } catch {
      continue
    }
    for (const entry of readdirSync(projectPath)) {
      if (!entry.endsWith(".jsonl")) continue
      const filePath = join(projectPath, entry)
      try {
        const mtime = statSync(filePath).mtimeMs
        const sessionId = entry.replace(/\.jsonl$/, "")
        out.push({
          path: filePath,
          sessionId,
          shortId: sessionId.slice(0, 8),
          project: projectDir.replace(/^-/, "").replace(/-/g, "/"),
          mtime,
          firstUserMessage: firstUserMessage(filePath),
        })
      } catch {
        // skip unreadable
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

/** Extract the first user-role message from a session file. */
function firstUserMessage(path: string): string {
  try {
    const content = readFileSync(path, "utf8")
    for (const line of content.split("\n")) {
      if (line.length === 0) continue
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        if (obj.type !== "user") continue
        const message = obj.message as Record<string, unknown> | undefined
        const content = message?.content
        if (typeof content === "string") return content
        if (Array.isArray(content)) {
          for (const part of content) {
            const p = part as Record<string, unknown>
            if (typeof p.text === "string") return p.text
          }
        }
      } catch {
        // skip bad line
      }
    }
  } catch {
    // skip unreadable
  }
  return ""
}

/** Human-friendly relative time — seconds/minutes/hours/days. */
function formatAge(mtime: number): string {
  const seconds = Math.max(0, (Date.now() - mtime) / 1000)
  if (seconds < 60) return `${Math.floor(seconds)}s`
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.floor(minutes)}m`
  const hours = minutes / 60
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = hours / 24
  return `${Math.floor(days)}d`
}

/** Truncate to `max` chars with ellipsis, collapsing whitespace. */
function trim(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1)}…`
}

function listSessions(limit = 30): void {
  const sessions = findSessions().slice(0, limit)
  if (sessions.length === 0) {
    process.stderr.write("claude-log: no sessions found under ~/.claude/projects\n")
    process.exit(0)
  }
  for (const s of sessions) {
    const age = formatAge(s.mtime).padStart(4)
    const line = `${s.shortId}  ${age}  ${trim(s.firstUserMessage, 80)}`
    process.stdout.write(`${line}\n`)
  }
}

function resolveArgToPath(arg: string): string | null {
  const abs = resolve(arg)
  if (existsSync(abs)) {
    try {
      const st = statSync(abs)
      if (st.isFile()) return abs
    } catch {
      // fall through
    }
  }
  const query = arg.toLowerCase()
  const matches = findSessions().filter(
    (s) =>
      s.sessionId.toLowerCase().startsWith(query) ||
      s.shortId.toLowerCase() === query ||
      s.firstUserMessage.toLowerCase().includes(query),
  )
  if (matches.length === 0) return null
  return matches[0]!.path
}

function openSession(path: string): void {
  // Delegate to the same bootstrap the km-logview script uses. This keeps
  // claude-log a thin wrapper — all the viewer logic stays in one place.
  const bootstrap = resolve(
    import.meta.dir,
    "..",
    "..",
    "..",
    "apps",
    "km-logview",
    "src",
    "bootstrap.ts",
  )
  const child = spawn("bun", ["run", bootstrap, path], { stdio: "inherit" })
  child.on("exit", (code) => {
    process.exit(code ?? 0)
  })
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    listSessions()
    return
  }
  const [arg] = args
  if (arg === "-h" || arg === "--help") {
    process.stdout.write(`claude-log — list or open Claude Code session logs

Usage:
  bun claude-log                    List latest sessions
  bun claude-log <session-id>       Open session whose UUID starts with this prefix
  bun claude-log <substring>        Open the most recent session whose first
                                    user message contains <substring>
  bun claude-log <path>             Open a specific .jsonl file
  bun claude-log --help             Show this help
`)
    return
  }
  const path = resolveArgToPath(arg!)
  if (path === null) {
    process.stderr.write(`claude-log: no session matches: ${arg}\n`)
    process.exit(1)
  }
  openSession(path)
}

if (import.meta.main) main()
