import { existsSync, statSync } from "node:fs"
import { basename } from "node:path"
import React from "react"
import { run } from "silvery/runtime"
import { claudeSessionConfig } from "@km/logview/configs/claude-session"
import { loadRows } from "@km/logview/parse-jsonl"
import { App } from "./App.tsx"

/**
 * km-agent-view — v0 entry point.
 *
 * Static load, one session, iMessage-style chat layout. Accepts a single path
 * to a Claude Code session JSONL file. Always uses the claude-session parser
 * (no detection — this viewer is claude-shaped by design).
 *
 * See bead km-agent-view.mvp-design for the full v0..v3 roadmap.
 */

interface Args {
  path: string
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { path: "", help: false }
  for (const a of argv) {
    if (a === "-h" || a === "--help") args.help = true
    else if (!a.startsWith("-")) args.path = a
  }
  return args
}

function printHelp(): void {
  process.stdout.write(`km-agent-view — chat-style Claude Code session viewer

Usage:
  km-agent-view <path.jsonl>    Render a Claude Code session as a chat
  km-agent-view --help          Show this help

Keybindings:
  j / k / ↓ / ↑     Navigate messages
  gg / G            Jump to top / bottom
  Space / b         Page forward / back
  Enter             Open detail overlay (raw JSON) — also expands hook clusters
  q / Esc           Close overlay / quit

Env:
  LOG_LEVEL=warn    Re-enable silvery/loggily output (default: error, UI stays clean)
`)
}

/**
 * Derive a short, human-friendly session title from the file path.
 * For Claude Code sessions (~/.claude/projects/-dir/<uuid>.jsonl), a uuid is
 * not informative — fall back to "<project> · <uuid7>".
 */
function deriveSessionTitle(path: string): string {
  const base = basename(path).replace(/\.jsonl$/, "")
  const m = path.match(/\/projects\/([^/]+)\//)
  if (m) {
    const project = m[1]!.replace(/^-/, "").replace(/-/g, "/")
    const short = base.length > 8 ? base.slice(0, 8) : base
    return `${project} · ${short}`
  }
  return base
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  if (args.help || !args.path) {
    printHelp()
    process.exit(args.help ? 0 : 2)
  }
  if (!existsSync(args.path)) {
    process.stderr.write(`km-agent-view: no such file: ${args.path}\n`)
    process.exit(1)
  }
  const st = statSync(args.path)
  if (!st.isFile()) {
    process.stderr.write(`km-agent-view: not a regular file: ${args.path}\n`)
    process.exit(1)
  }
  const rows = loadRows(args.path, claudeSessionConfig)
  if (rows.length === 0) {
    process.stderr.write(`km-agent-view: no rows parsed from ${args.path}\n`)
    process.exit(1)
  }
  const title = deriveSessionTitle(args.path)
  const handle = await run(<App path={args.path} title={title} rows={rows} />, {
    mode: "fullscreen",
  })
  await handle.waitUntilExit()
}

// Allow direct execution via `bun src/index.tsx` or via the bin wrapper.
if (import.meta.main) {
  await main()
}
