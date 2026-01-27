#!/usr/bin/env bun
/**
 * Cross-platform test runner for km project
 *
 * Replaces shell-based `find` commands in package.json with portable TypeScript.
 * Uses centralized test patterns from test-patterns.ts.
 *
 * Usage:
 *   bun scripts/run-tests.ts --type=fast
 *   bun scripts/run-tests.ts --type=slow
 *   bun scripts/run-tests.ts --type=mdtest
 *   bun scripts/run-tests.ts --all
 */

import { spawn } from "bun"
import { parseArgs } from "node:util"
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
  console.error("Usage: bun scripts/run-tests.ts --type=<fast|slow|mdtest>")
  process.exit(2)
}

const testType = values.type as TestType
if (!["fast", "slow", "mdtest"].includes(testType)) {
  console.error(`Error: Invalid test type "${testType}"`)
  console.error("Valid types: fast, slow, mdtest")
  process.exit(2)
}

// Discover test files
const files = await discoverTests(testType)

if (files.length === 0) {
  console.error(`No ${testType} tests found`)
  process.exit(0)
}

// Run tests based on type
if (testType === "mdtest") {
  const args = ["run", "vendor/beorn-mdtest/src/index.ts", "--dots"]
  if (values.update) {
    args.push("--update")
  }
  args.push(...files)

  const proc = spawn(["bun", ...args], {
    stdout: "inherit",
    stderr: "inherit",
  })

  const exitCode = await proc.exited
  process.exit(exitCode)
} else {
  // Fast or slow Bun tests
  const proc = spawn(["bun", "test", "--dots", ...files], {
    stdout: "inherit",
    stderr: "inherit",
  })

  const exitCode = await proc.exited
  process.exit(exitCode)
}
