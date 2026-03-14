/**
 * Multi-suite test orchestration API
 *
 * Composable factory function for running multiple test suites in parallel
 * with two display modes:
 *
 * - **Unified mode** (non-TTY): Interleaved dots from all suites, merged TAP stream
 *   - CI-friendly, no labels/blocks
 *   - Single summary at end with per-runner timing
 *
 * - **Parallel mode** (TTY): 3 separate streams with silvery TUI
 *   - Pre-filled with dimmed dots (progress bars)
 *   - Real-time updates as tests complete
 *   - Different symbols for slow tests
 *
 * Mode selection:
 * - `auto` (default): TTY detection - parallel for terminal, unified for pipes/CI
 * - `unified`: Force interleaved dots (merged TAP)
 * - `parallel`: Force silvery TUI (requires renderParallel function)
 */

import { spawn } from "bun"
import { createConsumer } from "./consumer"
import { mergeStreams } from "./merge"
import { runBunTap } from "./producers/bun"
import { runVitestTap } from "./producers/vitest"
import type { Writable } from "node:stream"

export interface Suite {
  name: string
  runner: "bun" | "vitest" | "custom"
  command?: string[] // For custom runners like mdspec
  files: string[]
}

export interface OrchestratorOptions {
  suites: Suite[]
  mode?: "unified" | "parallel" | "auto" // Auto-detect based on TTY
  output?: Writable
  renderParallel?: (suites: Suite[]) => Promise<number> // Inject silvery renderer
}

export function createOrchestrator(options: OrchestratorOptions) {
  const { suites, output = process.stdout } = options
  const mode = resolveMode(options.mode, output)

  return {
    async run(): Promise<number> {
      if (mode === "unified") {
        return runUnified(suites, output)
      } else {
        return runParallel(suites, options.renderParallel)
      }
    },
  }
}

// Resolve mode based on TTY detection
function resolveMode(mode: "unified" | "parallel" | "auto" | undefined, output: Writable): "unified" | "parallel" {
  if (mode === "auto" || mode === undefined) {
    // Auto-detect: use parallel (silvery) for TTY, unified (interleaved) for non-TTY
    return isTTY(output) ? "parallel" : "unified"
  }
  return mode
}

function isTTY(output: Writable): boolean {
  return "isTTY" in output && output.isTTY === true
}

// Unified mode - reuse existing TAP merge logic
async function runUnified(suites: Suite[], output: Writable): Promise<number> {
  const streams = []

  for (const suite of suites) {
    if (suite.files.length === 0) continue

    let stdout
    if (suite.runner === "bun") {
      stdout = runBunTap({ args: suite.files }).stdout
    } else if (suite.runner === "vitest") {
      stdout = runVitestTap({ args: suite.files }).stdout
    } else {
      // custom runner
      stdout = spawn([...suite.command!, ...suite.files], {
        stdout: "pipe",
      }).stdout
    }

    streams.push({ name: suite.name, stream: stdout })
  }

  // If no streams, exit successfully
  if (streams.length === 0) {
    return 0
  }

  const merged = mergeStreams(streams)
  const consumer = createConsumer({ dots: true, output })

  for await (const chunk of merged) {
    consumer.write(chunk)
  }

  consumer.end()
  const results = consumer.getResults()
  return results.failed > 0 ? 1 : 0
}

// Parallel mode - delegate to injected renderer
async function runParallel(suites: Suite[], renderParallel?: (suites: Suite[]) => Promise<number>): Promise<number> {
  if (!renderParallel) {
    throw new Error("Parallel mode requires renderParallel function")
  }
  return renderParallel(suites)
}
