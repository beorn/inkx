import { Parser, type Result } from "tap-parser"
import type { Writable } from "node:stream"
import { formatMs } from "./utils"

export interface Failure {
  name: string
  id: number
  ok: boolean
  diag?: {
    message?: string
    at?: { file?: string; line?: number }
    [key: string]: unknown
  }
}

export interface ConsumerOptions {
  dots?: boolean
  output?: Writable
  color?: boolean // Auto-detects TTY if not specified
}

export interface ConsumerResult {
  passed: number
  failed: number
  skipped: number
  total: number
  failures: Failure[]
  wallTimeMs: number
}

/**
 * Creates a TAP consumer that parses TAP input and displays formatted output.
 *
 * @param options - Configuration options
 * @param options.dots - Show colored dots during test execution (green middle dot for pass, red X for fail, yellow dash for skip)
 * @param options.output - Output stream for writing results (defaults to process.stdout)
 * @param options.color - Enable colored output (auto-detects TTY if not specified)
 * @returns Extended tap-parser instance with getResults() method
 */
export function createConsumer(options: ConsumerOptions = {}) {
  const output = options.output ?? process.stdout

  // Auto-detect color support following standard conventions:
  // 1. Explicit option takes precedence
  // 2. FORCE_COLOR env var forces colors on
  // 3. NO_COLOR env var forces colors off
  // 4. Fall back to TTY detection
  const supportsColor =
    options.color !== undefined
      ? options.color
      : process.env.FORCE_COLOR
        ? true
        : process.env.NO_COLOR
          ? false
          : "isTTY" in output && output.isTTY === true

  const parser = new Parser()
  const failures: Failure[] = []
  const startTime = performance.now()

  let passed = 0
  let failed = 0
  let skipped = 0

  parser.on("assert", (assert: Result) => {
    if (assert.skip) {
      skipped++
      if (options.dots) {
        output.write(supportsColor ? "\x1b[33m-\x1b[0m" : "-")
      }
    } else if (assert.ok) {
      passed++
      if (options.dots) {
        output.write(supportsColor ? "\x1b[32m·\x1b[0m" : "·")
      }
    } else {
      failed++
      if (options.dots) {
        output.write(supportsColor ? "\x1b[31mX\x1b[0m" : "X")
      }
      failures.push({
        name: assert.name ?? "unnamed test",
        id: assert.id,
        ok: assert.ok,
        diag: assert.diag as Failure["diag"],
      })
    }
  })

  parser.on("complete", (results) => {
    const wallTimeMs = performance.now() - startTime

    if (options.dots) {
      output.write("\n\n")
    }

    // Print failures
    if (failures.length > 0) {
      const failureHeader = supportsColor
        ? "\x1b[31m--- Failures ---\x1b[0m\n\n"
        : "--- Failures ---\n\n"
      output.write(failureHeader)
      for (const f of failures) {
        const failMark = supportsColor ? "\x1b[31m✗\x1b[0m" : "✗"
        output.write(`${failMark} ${f.name}\n`)
        if (f.diag?.message) {
          output.write(`  ${f.diag.message}\n`)
        }
        if (f.diag?.at?.file) {
          output.write(`  at ${f.diag.at.file}:${f.diag.at.line ?? "?"}\n`)
        }
        output.write("\n")
      }
    }

    // Print summary
    const total = passed + failed + skipped
    const status = supportsColor
      ? failed > 0
        ? "\x1b[31m✗\x1b[0m"
        : "\x1b[32m✓\x1b[0m"
      : failed > 0
        ? "✗"
        : "✓"
    output.write(
      `${status} ${total} tests: ${passed} passed, ${failed} failed, ${skipped} skipped\n`,
    )

    // Print total time
    const timeOutput = supportsColor
      ? `\x1b[2mTotal: ${formatMs(wallTimeMs)}\x1b[0m\n`
      : `Total: ${formatMs(wallTimeMs)}\n`
    output.write(timeOutput)
  })

  return Object.assign(parser, {
    getResults(): ConsumerResult {
      return {
        passed,
        failed,
        skipped,
        total: passed + failed + skipped,
        failures,
        wallTimeMs: performance.now() - startTime,
      }
    },
  })
}
