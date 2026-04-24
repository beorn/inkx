#!/usr/bin/env bun
/**
 * silvercode bootstrap — the single entry point for the binary.
 *
 * Guarantees (structural, not "please remember to"):
 *
 *   1. LOG_LEVEL defaults to `error` so loggily doesn't leak info/debug
 *      output into the alt-screen UI.
 *
 *   2. If DEBUG is set (any form: DEBUG=* / DEBUG=foo / DEBUG=1), DEBUG_LOG
 *      is AUTO-SET to /tmp/silvercode-<pid>.log if the user didn't provide
 *      one. That path is announced on stderr BEFORE entering the alt
 *      screen so the user knows where to tail. Impossible to turn on
 *      DEBUG and accidentally flood the TUI.
 *
 *   3. console.log / console.debug / console.info / console.warn /
 *      console.error are redirected to the log file when DEBUG_LOG is set
 *      — any stray console call anywhere in the dependency graph ends up
 *      in the file instead of bleeding through silvery's output phase.
 *      The `debug` npm package's default writer is redirected too.
 *
 * silvery's own terminal control (escape sequences) goes via term.output
 * which writes to the real process.stdout directly — unaffected by the
 * console rebinding above.
 */

import { closeSync, openSync, writeSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "error"

if (process.env.DEBUG && !process.env.DEBUG_LOG) {
  process.env.DEBUG_LOG = join(tmpdir(), `silvercode-${process.pid}.log`)
}

if (process.env.DEBUG_LOG) {
  const logFd = openSync(process.env.DEBUG_LOG, "a")
  const write = (level: string, args: unknown[]): void => {
    try {
      const line = `[${level}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`
      writeSync(logFd, line)
    } catch {
      /* best-effort */
    }
  }
  const origError = console.error
  console.log = (...a): void => write("log", a)
  console.debug = (...a): void => write("debug", a)
  console.info = (...a): void => write("info", a)
  console.warn = (...a): void => write("warn", a)
  console.error = (...a): void => write("error", a)

  // `debug` npm package: its default log writer goes through the module's
  // `.log` property. Redirect at load time so any dep using debug() flows
  // to the same file.
  try {
    const debugMod = await import("debug")
    const dbg = (debugMod as { default?: { log?: (...args: unknown[]) => void } }).default
    if (dbg) dbg.log = (...a) => write("debug-pkg", a)
  } catch {
    /* package not installed — that's fine */
  }

  // Loud announcement on stderr BEFORE alt screen so the user sees where
  // to tail. Uses the saved stderr writer in case console.error was
  // rebound to the file.
  origError.call(console, `[silvercode] DEBUG_LOG = ${process.env.DEBUG_LOG}`)
  process.on("exit", () => {
    try {
      closeSync(logFd)
    } catch {
      /* fd may already be closed */
    }
  })
}

const { main } = await import("./index.tsx")
await main()
