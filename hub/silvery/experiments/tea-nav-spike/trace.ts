/**
 * Shared trace logger for the TEA nav spike.
 *
 * Every plugin in the spike records:
 *  - the op it received
 *  - its decision: "handled" (Effect[]) or "passed" (false)
 *  - emitted effects
 *
 * Logs go to /tmp/tea-spike-trace.log so Bjørn can read them after each
 * test run to see exactly what the apply chain did — in order, with
 * plugin names, op types, and effect types.
 *
 * Usage inside a plugin:
 *
 *   const t = getTracer("withBoardSpike")
 *   if (op.type === "cursor_down") {
 *     const effects = [...]
 *     return t.handled(op, effects)
 *   }
 *   return t.passed(op, prev(op))
 */

import { appendFileSync, writeFileSync } from "node:fs"

import type { ApplyResult, Effect, Op } from "@silvery/create/types"

const TRACE_PATH = "/tmp/tea-spike-trace.log"

export function resetTrace(label: string): void {
  writeFileSync(TRACE_PATH, `=== ${label} === ${new Date().toISOString()}\n`)
}

export interface Tracer {
  handled(op: Op, effects: Effect[]): Effect[]
  passed(op: Op, downstream: ApplyResult): ApplyResult
  note(message: string): void
}

export function getTracer(plugin: string): Tracer {
  return {
    handled(op, effects) {
      const effectSummary =
        effects.length === 0 ? "[] (consumed, no effects)" : effects.map((e) => e.type).join(", ")
      appendFileSync(
        TRACE_PATH,
        `[${plugin}] op=${op.type} decision=handled effects=${effectSummary}\n`,
      )
      return effects
    },
    passed(op, downstream) {
      const verdict = downstream === false ? "false (nobody handled)" : `handled-downstream(${downstream.length} fx)`
      appendFileSync(
        TRACE_PATH,
        `[${plugin}] op=${op.type} decision=passed downstream=${verdict}\n`,
      )
      return downstream
    },
    note(message) {
      appendFileSync(TRACE_PATH, `[${plugin}] note: ${message}\n`)
    },
  }
}

export function readTrace(): string {
  // Separate export so tests can assert what the chain did.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync(TRACE_PATH, "utf-8") as string
}
