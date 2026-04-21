/**
 * Memory-mode startup prompt
 *
 * When `km view <path>` runs against a directory that doesn't contain a
 * `.km/` folder (and no ancestor does either), the CLI would otherwise
 * silently fall into memory mode: edits render fine, but nothing persists.
 * This has bitten users — they think they're saving work.
 *
 * This helper runs BEFORE the TUI enters the alt-screen buffer so the
 * warning is actually visible. Three outcomes:
 *
 *   - `init`   — user accepted; caller should create `.km/` (and GTD) and
 *                launch the TUI in disk mode.
 *   - `memory` — user explicitly chose memory mode. Caller should launch
 *                the TUI with a prominent "MEMORY MODE" banner (the status
 *                counter's tiny "MEM" dot isn't enough).
 *   - `cancel` — user aborted; caller should exit cleanly.
 *
 * Bead: km-tui.memory-mode-silent-loss
 */

import * as readline from "readline"
import { createTerm } from "@silvery/ag-react"

export type MemoryModeChoice = "init" | "memory" | "cancel"

export interface PromptOptions {
  /** stdin — defaults to process.stdin. Injected for testing. */
  stdin?: NodeJS.ReadableStream
  /** stdout — defaults to process.stdout. Injected for testing. */
  stdout?: NodeJS.WritableStream
}

/**
 * Ask the user whether to initialize `.km/`, view in memory, or cancel.
 *
 * @param targetPath  Absolute path the user asked to view.
 * @param options     Optional stdin/stdout overrides (tests).
 * @returns           User's choice — see `MemoryModeChoice`.
 */
export async function promptMemoryModeInit(
  targetPath: string,
  options: PromptOptions = {},
): Promise<MemoryModeChoice> {
  const stdin = options.stdin ?? process.stdin
  const stdout = options.stdout ?? process.stdout
  const term = createTerm(process)

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: false, // don't try to raw-mode an injected stream
  })

  function ask(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(prompt, resolve)
    })
  }

  try {
    stdout.write("\n")
    stdout.write(term.yellow(`⚠  This directory has no .km/ — km would run in memory mode.\n`))
    stdout.write(term.dim(`   Path: ${targetPath}\n`))
    stdout.write(term.dim(`   In memory mode, edits render but are NOT saved to disk.\n\n`))
    stdout.write(`   ${term.bold("Y")} — initialize .km/ here (recommended)\n`)
    stdout.write(`   ${term.bold("m")} — view in memory (edits will NOT persist)\n`)
    stdout.write(`   ${term.bold("n")} — cancel\n\n`)

    // Allow up to 3 passes before giving up (matches interactive prompts elsewhere)
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = (await ask("Initialize? [Y/m/n]: ")).trim().toLowerCase()
      if (answer === "" || answer === "y" || answer === "yes") return "init"
      if (answer === "m" || answer === "memory") return "memory"
      if (answer === "n" || answer === "no" || answer === "cancel") return "cancel"
      stdout.write(term.yellow(`   Please answer Y (initialize), m (memory), or n (cancel).\n`))
    }
    // Safety fallback: if the user's managed three unrecognized answers in a
    // row, cancel rather than fall through to a destructive default.
    return "cancel"
  } finally {
    rl.close()
  }
}
