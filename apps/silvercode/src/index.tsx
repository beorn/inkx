import { existsSync } from "node:fs"
import { Command } from "@silvery/commander"
import React from "react"
import { run } from "silvery/runtime"
import { accountExists, resolveAccountDir } from "./accounts.ts"
import { App } from "./App.tsx"

function buildProgram(): Command {
  const program = new Command()
  program
    .name("silvercode")
    .description("silvery-native agent workspace (internal)")
    .option("--cwd <path>", "working directory for spawned sessions", process.cwd())
    .option("--model <name>", "override claude model")
    .option("--resume <id>", "resume a previous Claude session id")
    .option("--no-bare", "run Claude without --bare (hooks/plugins/skills fire)")
    .option("--layout <mode>", "layout: single | grid-2 | grid-4 (M5+)", "single")
    .option("--track <kind>", "agent track: claude | sdk | codex (M11/M12)", "claude")
    .option("--log-dir <path>", "event-log directory for replay", "")
    .option(
      "--account <name>",
      "Anthropic account name — reads creds from ~/.silvercode/accounts/<name>/ via CLAUDE_CONFIG_DIR (v1.1 multi-account)",
    )
    .action(async (opts: Record<string, unknown>) => {
      const account = typeof opts.account === "string" && opts.account.length > 0 ? opts.account : undefined
      if (account) {
        // Fail loudly at startup if the account dir isn't populated. An empty
        // dir would silently degrade to anonymous claude (worse than failing).
        // The user's copy step is one command — surface it in the error.
        if (!accountExists(account)) {
          const dir = resolveAccountDir(account)
          const exists = existsSync(dir)
          const body = [
            `silvercode: account "${account}" is not configured.`,
            "",
            `Expected settings.json or .credentials.json under:`,
            `  ${dir}`,
            exists ? "(directory exists but is empty or missing creds)" : "(directory does not exist)",
            "",
            "One-time setup (copy creds from your main Claude install):",
            `  mkdir -p ~/.silvercode/accounts/${account}`,
            `  cp -r ~/.claude/. ~/.silvercode/accounts/${account}/`,
            "",
            "Or omit --account to use ~/.claude/ (default).",
          ].join("\n")
          process.stderr.write(body + "\n")
          // Never process.exit — throw so silvery's TTY cleanup runs.
          throw new Error(`account "${account}" not configured`)
        }
      }

      const handle = await run(
        <App
          cwd={String(opts.cwd ?? process.cwd())}
          model={typeof opts.model === "string" ? opts.model : undefined}
          resume={typeof opts.resume === "string" ? opts.resume : undefined}
          bare={opts.bare !== false}
          layout={
            opts.layout === "grid-2" || opts.layout === "grid-4" || opts.layout === "single" ? opts.layout : "single"
          }
          track={opts.track === "sdk" || opts.track === "codex" || opts.track === "claude" ? opts.track : "claude"}
          logDir={typeof opts.logDir === "string" && opts.logDir.length > 0 ? opts.logDir : undefined}
          account={account}
        />,
        { mode: "fullscreen" },
      )
      await handle.waitUntilExit()
    })

  program.addHelpSection("Keybindings:", [
    ["Enter", "send message"],
    ["Tab", "focus next session card (grid mode)"],
    ["Ctrl+M", "cycle mode (plan/accept-edits/auto/bypass)"],
    ["Ctrl+I", "open permission inbox"],
    ["Ctrl+T", "toggle todo panel"],
    ["Ctrl+H", "open history view"],
    ["Esc", "dismiss popover / quit"],
  ])

  return program
}

export async function main(): Promise<void> {
  const program = buildProgram()
  await program.parseAsync(process.argv)
}
