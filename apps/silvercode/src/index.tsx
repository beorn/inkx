import { existsSync } from "node:fs"
import { Command } from "@silvery/commander"
import React from "react"
import { run } from "silvery/runtime"
import { accountExists, resolveAccountDir } from "./accounts.ts"
import { App } from "./App.tsx"
import { runDoctor, severityToExitCode, CHECKER_NAMES } from "./doctor/index.ts"
import { renderReport } from "./doctor/render.ts"

function buildProgram(): Command {
  const program = new Command()
  program
    .name("silvercode")
    .description("silvery-native agent workspace (internal)")
    .option("--cwd <path>", "working directory for spawned sessions", process.cwd())
    .option("--model <name>", "override claude model")
    .option("--resume <id>", "resume a previous Claude session id")
    .option(
      "--bare",
      "spawn Claude with --bare for deterministic / stripped-down sessions (no hooks/plugins/skills/CLAUDE.md)",
    )
    .option("--layout <mode>", "layout: single | grid-2 | grid-4 (M5+)", "single")
    .option("--track <kind>", "agent track: claude | sdk | codex (M11/M12)", "claude")
    .option("--log-dir <path>", "event-log directory for replay", "")
    .option(
      "--account <name>",
      "Anthropic account name — reads creds from ~/.km/accounts/<name>/ via CLAUDE_CONFIG_DIR (v1.1 multi-account)",
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
            `  mkdir -p ~/.km/accounts/${account}`,
            `  cp -r ~/.claude/. ~/.km/accounts/${account}/`,
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
          model={typeof opts.model === "string" ? opts.model : "claude-opus-4-7[1m]"}
          resume={typeof opts.resume === "string" ? opts.resume : undefined}
          bare={opts.bare === true}
          layout={
            opts.layout === "grid-2" || opts.layout === "grid-4" || opts.layout === "single" ? opts.layout : "single"
          }
          track={opts.track === "sdk" || opts.track === "codex" || opts.track === "claude" ? opts.track : "claude"}
          logDir={typeof opts.logDir === "string" && opts.logDir.length > 0 ? opts.logDir : undefined}
          account={account}
        />,
        // handleTabCycling: false so Shift+Tab reaches our useInput for the
        // permission-mode cycle binding (Claude Code convention). Silvercode
        // has a single TextInput — focus navigation via Tab isn't useful.
        { mode: "fullscreen", handleTabCycling: false },
      )
      await handle.waitUntilExit()
    })

  program.addHelpSection("Keybindings:", [
    ["enter", "send message"],
    ["ctrl-o", "toggle side panel (todos + agents)"],
    ["ctrl-e", "open permission inbox"],
    ["ctrl-r", "history view"],
    ["ctrl-n", "next session (multi-session)"],
    ["esc", "dismiss overlays"],
    ["ctrl-c / ctrl-d ctrl-d", "exit silvercode"],
  ])

  // `silvercode doctor [checker]` — config + integration health check.
  // Exits before any TUI mounts. CLI-only for v1; the in-TUI `/doctor`
  // slash command is deferred (tracked by bead km-silvercode.doctor).
  const doctor = program
    .command("doctor")
    .description("Health-check silvercode config + integrations (autolinks, …)")
    .argument("[checker]", `restrict to one checker (${CHECKER_NAMES.join(", ")})`)
    .option("--cwd <path>", "directory whose .km/config.yaml to inspect", process.cwd())
    .option("--json", "emit the structured DoctorReport as JSON instead of the ANSI report")
    .action((arg: string | undefined, opts: Record<string, unknown>) => {
      const cwd = String(opts.cwd ?? process.cwd())
      const only = arg ? [arg] : undefined
      if (only && !CHECKER_NAMES.includes(only[0]! as (typeof CHECKER_NAMES)[number])) {
        process.stderr.write(`silvercode doctor: unknown checker "${only[0]}". Known: ${CHECKER_NAMES.join(", ")}\n`)
        process.exitCode = 2
        return
      }
      const report = runDoctor({ cwd, only })
      if (opts["json"]) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      } else {
        process.stdout.write(renderReport(report))
      }
      process.exitCode = severityToExitCode(report.severity)
    })
  // Per-checker subcommand: `silvercode doctor autolinks`. Same outcome as
  // passing `autolinks` as a positional, kept around because users typing
  // `silvercode doctor autolinks` (the `gh extension doctor <name>` shape)
  // should just work without re-reading help.
  for (const name of CHECKER_NAMES) {
    doctor
      .command(name)
      .description(`Health-check the ${name} subsystem`)
      .option("--cwd <path>", "directory whose .km/config.yaml to inspect", process.cwd())
      .option("--json", "emit the structured DoctorReport as JSON instead of the ANSI report")
      .action((opts: Record<string, unknown>) => {
        const cwd = String(opts.cwd ?? process.cwd())
        const report = runDoctor({ cwd, only: [name] })
        if (opts["json"]) {
          process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
        } else {
          process.stdout.write(renderReport(report))
        }
        process.exitCode = severityToExitCode(report.severity)
      })
  }

  return program
}

export async function main(): Promise<void> {
  const program = buildProgram()
  await program.parseAsync(process.argv)
}
