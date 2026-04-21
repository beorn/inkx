#!/usr/bin/env bun
/**
 * Minimal cold-start measurement harness for km-tui.
 *
 * Measures interactive `bun km view <vault>` from spawn → first rendered board
 * ("CARDS VIEW" anchor). Uses the bearly tty.ts capture tool for PTY handling.
 *
 * USAGE:
 *   bun tools/measure-cold-start.ts <vault> <label>
 *
 * Sets TRACE=1 so loggily spans (startup:import-modules, repo-load, build-state,
 * sync-manager-init, render-setup) write to DEBUG_LOG. Writes phase timings to
 * /tmp/km-cold-<label>.log and wall-clock to stdout.
 *
 * Scope-guard: this is a measurement harness, not a perf tool. Not run by CI.
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

const vault = process.argv[2] ?? join(process.env.HOME ?? "", "Bear", "Vault")
const label = process.argv[3] ?? "run"
const cols = Number(process.argv[4] ?? 160)
const rows = Number(process.argv[5] ?? 48)

if (!existsSync(vault)) {
  console.error(`vault not found: ${vault}`)
  process.exit(2)
}

const logPath = `/tmp/km-cold-${label}.log`
const ttyTool = join(process.cwd(), "vendor", "bearly", "tools", "tty.ts")

const t0 = performance.now()
const result = spawnSync(
  "bun",
  [
    ttyTool,
    "capture",
    "--command",
    `bun km view ${vault}`,
    "--cols",
    String(cols),
    "--rows",
    String(rows),
    "--wait-for",
    "CARDS VIEW",
    "--timeout",
    "120000",
    "--text",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf-8",
    timeout: 150_000,
    env: {
      ...process.env,
      TRACE: "1",
      DEBUG: "km:*",
      DEBUG_LOG: logPath,
      KM_SKIP_INIT_PROMPT: "1",
    },
  },
)
const dtWall = performance.now() - t0

console.log(`[${label}] wall-clock (spawn → CARDS VIEW): ${dtWall.toFixed(0)}ms`)
console.log(`[${label}] capture exit: ${result.status}`)
if (result.status !== 0) {
  console.log(`[${label}] stderr: ${result.stderr.slice(0, 400)}`)
}
console.log(`[${label}] debug log: ${logPath}`)
