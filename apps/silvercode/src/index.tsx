import { Command } from "@silvery/commander"
import React from "react"
import { run } from "silvery/runtime"
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
    .option(
      "--layout <mode>",
      "layout: single | grid-2 | grid-4 (M5+)",
      "single",
    )
    .option(
      "--track <kind>",
      "agent track: claude | sdk | codex (M11/M12)",
      "claude",
    )
    .option("--log-dir <path>", "event-log directory for replay", "")
    .action(async (opts: Record<string, unknown>) => {
      const handle = await run(
        <App
          cwd={String(opts.cwd ?? process.cwd())}
          model={typeof opts.model === "string" ? opts.model : undefined}
          resume={typeof opts.resume === "string" ? opts.resume : undefined}
          bare={opts.bare !== false}
          layout={
            opts.layout === "grid-2" || opts.layout === "grid-4" || opts.layout === "single"
              ? opts.layout
              : "single"
          }
          track={
            opts.track === "sdk" || opts.track === "codex" || opts.track === "claude"
              ? opts.track
              : "claude"
          }
          logDir={typeof opts.logDir === "string" && opts.logDir.length > 0 ? opts.logDir : undefined}
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
