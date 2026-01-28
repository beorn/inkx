#!/usr/bin/env bun
/**
 * Cross-platform test runner for km project
 *
 * Runs tests via Vitest with TAP output for streaming dots.
 * Uses centralized test patterns from test-patterns.ts.
 *
 * Usage:
 *   bun scripts/run-tests.ts --type=fast   # All tests except *.slow.*
 *   bun scripts/run-tests.ts --type=slow   # Only *.slow.* tests
 */

import { parseArgs } from "node:util"
import { runVitestTap } from "@beorn/tap/producers/vitest"
import { createConsumer } from "@beorn/tap/consumer"
import { discoverTests, type TestType } from "./test-patterns"

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    type: { type: "string" },
    all: { type: "boolean", default: false },
    update: { type: "boolean", default: false },
  },
  allowPositionals: false,
})

// Validate arguments
if (values.all) {
  console.error("Error: --all should use scripts/test-all.ts instead")
  console.error("Usage: bun run test:all")
  process.exit(2)
}

if (!values.type) {
  console.error("Error: --type required")
  console.error("Usage: bun scripts/run-tests.ts --type=<fast|slow>")
  process.exit(2)
}

const testType = values.type as TestType
if (!["fast", "slow"].includes(testType)) {
  console.error(`Error: Invalid test type "${testType}"`)
  console.error("Valid types: fast, slow")
  process.exit(2)
}

// Discover test files
const files = await discoverTests(testType)

if (files.length === 0) {
  console.error(`No ${testType} tests found`)
  process.exit(0)
}

// Run tests via Vitest with TAP output and dots
const { stdout, exited } = runVitestTap({ args: files })
const consumer = createConsumer({ dots: true, output: process.stdout })

// Stream TAP output through consumer for dot display
// Note: stdout chunks are Uint8Arrays from Bun subprocess, need decoding
for await (const chunk of stdout) {
  const text = new TextDecoder().decode(chunk)
  consumer.write(text)
}

consumer.end()
const results = consumer.getResults()
const exitCode = await exited

// Exit with test failure code if any tests failed
process.exit(results.failed > 0 ? 1 : exitCode)
