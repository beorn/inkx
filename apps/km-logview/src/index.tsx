import { existsSync, statSync } from "node:fs"
import React from "react"
import { SearchProvider } from "silvery"
import { run } from "silvery/runtime"
import { App } from "./App.tsx"
import { detectConfig } from "./detect.ts"
import { loadRows } from "./parse-jsonl.ts"

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
  process.stdout.write(`km-logview — silverized log viewer

Usage:
  km-logview <path>           View a JSONL log file
  km-logview --help           Show this help

Keybindings:
  j/k, arrows   Navigate rows
  /   or Ctrl+F Start find
  Enter (in find) Next match;  Shift+Enter = prev match
  n / N         Next / previous match (outside find bar)
  Enter (row)   Open detail view
  Esc           Close find / close detail / quit
  q             Quit

Auto-detected configs:
  - claude-session   for ~/.claude/projects/*/*.jsonl
  - generic-jsonl    for any other .jsonl/.ndjson/.log

Env:
  LOG_LEVEL=warn   Re-enable silvery/loggily output (default: error, to keep UI clean)
`)
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  if (args.help || !args.path) {
    printHelp()
    process.exit(args.help ? 0 : 2)
  }
  if (!existsSync(args.path)) {
    process.stderr.write(`km-logview: no such file: ${args.path}\n`)
    process.exit(1)
  }
  const st = statSync(args.path)
  if (!st.isFile()) {
    process.stderr.write(`km-logview: not a regular file: ${args.path}\n`)
    process.exit(1)
  }
  const config = detectConfig(args.path)
  const rows = loadRows(args.path, config)
  if (rows.length === 0) {
    process.stderr.write(`km-logview: no rows parsed from ${args.path}\n`)
    process.exit(1)
  }
  const handle = await run(
    <SearchProvider>
      <App path={args.path} config={config} rows={rows} />
    </SearchProvider>,
    { mode: "fullscreen" },
  )
  await handle.waitUntilExit()
}

// Allow direct execution via `bun src/index.tsx` or via the bin wrapper.
if (import.meta.main) {
  await main()
}
