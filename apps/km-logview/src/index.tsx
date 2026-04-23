import { existsSync, statSync } from "node:fs"
import { Command } from "@silvery/commander"
import React from "react"
import { SearchProvider } from "silvery"
import { run } from "silvery/runtime"
import { App } from "./App.tsx"
import { detectConfig } from "./detect.ts"
import { loadRows } from "./parse-jsonl.ts"

function buildProgram(): Command {
  const program = new Command()
  program
    .name("km-logview")
    .description("silverized log viewer — JSONL / NDJSON")
    .argument("<path>", "path to the log file")
    .action(async (path: string) => {
      if (!existsSync(path)) {
        process.stderr.write(`km-logview: no such file: ${path}\n`)
        process.exit(1)
      }
      const st = statSync(path)
      if (!st.isFile()) {
        process.stderr.write(`km-logview: not a regular file: ${path}\n`)
        process.exit(1)
      }
      const config = detectConfig(path)
      const rows = loadRows(path, config)
      if (rows.length === 0) {
        process.stderr.write(`km-logview: no rows parsed from ${path}\n`)
        process.exit(1)
      }
      const handle = await run(
        <SearchProvider>
          <App path={path} config={config} rows={rows} />
        </SearchProvider>,
        { mode: "fullscreen" },
      )
      await handle.waitUntilExit()
    })

  program.addHelpSection("Keybindings:", [
    ["j/k, arrows", "Navigate rows"],
    ["/ or Ctrl+F", "Start find"],
    ["Enter (in find)", "Next match; Shift+Enter = prev match"],
    ["n / N", "Next / previous match (outside find bar)"],
    ["Click (row)", "Toggle expand/collapse multi-line body"],
    ["Hover (pill)", "Popover with full field value"],
    ["Esc", "Close find / quit"],
    ["q", "Quit"],
  ])

  program.addHelpSection("Auto-detected configs:", [
    ["claude-session", "for ~/.claude/projects/*/*.jsonl"],
    ["generic-jsonl", "for any other .jsonl/.ndjson/.log"],
  ])

  program.addHelpSection("Env:", [
    ["$ LOG_LEVEL=warn", "Re-enable silvery/loggily output (default: error, to keep UI clean)"],
  ])

  program.addHelpSection("Examples:", [
    ["$ km-logview /path/to/log.jsonl", "Open a JSONL log"],
    ["$ km-logview ~/.claude/projects/*/session.jsonl", "Open a Claude Code session"],
  ])

  return program
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram()
  await program.parseAsync(argv)
}

// Allow direct execution via `bun src/index.tsx` or via the bin wrapper.
if (import.meta.main) {
  await main()
}
