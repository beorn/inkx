#!/usr/bin/env bun
/**
 * @beorn/tap CLI
 *
 * Minimal CLI for running TAP tests with parallel orchestration.
 * For advanced usage, use the library API directly.
 */

import { Command } from "commander"
import { colorizeHelp } from "@silvery/commander"
import { Glob } from "bun"
import { createConsumer } from "../consumer"
import { mergeStreams } from "../merge"
import { runBunTap } from "../producers/bun"
import { spawn } from "bun"
import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

async function getVersion(): Promise<string> {
  try {
    const pkgPath = join(__dirname, "../../package.json")
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      version?: string
    }
    return pkg.version || "0.0.0"
  } catch {
    return "0.0.0"
  }
}

async function findFiles(patterns: string[]): Promise<string[]> {
  const files: string[] = []
  for (const pattern of patterns) {
    // Check if pattern is an explicit file path
    if (existsSync(pattern)) {
      files.push(pattern)
    } else {
      // Treat as glob pattern
      const glob = new Glob(pattern)
      for await (const file of glob.scan({ cwd: ".", onlyFiles: true })) {
        if (!file.includes("node_modules")) {
          files.push(file)
        }
      }
    }
  }
  return files
}

interface Options {
  reporter: string
  jobs: number
  dots: boolean
  bail: boolean
  timeout?: number
  color?: boolean // undefined = auto-detect, true = force colors, false = no colors
}

async function runTests(patterns: string[], options: Options) {
  // Find test files
  const files = await findFiles(patterns)

  if (files.length === 0) {
    console.error("Error: No test files found matching patterns:", patterns)
    process.exit(2)
  }

  // For now, simple implementation: run bun test on all files
  // Future: split by jobs, run in parallel
  const consumer = createConsumer({
    dots: options.dots || options.reporter === "dots",
    // Only pass color if explicitly set via --no-color, otherwise let createConsumer auto-detect
    color: options.color === false ? false : undefined,
  })

  if (options.reporter === "spec" || options.reporter === "dots") {
    // Use consumer with dots
    const { stdout } = runBunTap({ args: files })

    for await (const chunk of stdout) {
      consumer.write(chunk.toString())
    }

    consumer.end()

    const results = consumer.getResults()
    process.exit(results.failed > 0 ? 1 : 0)
  } else if (options.reporter === "tap") {
    // Raw TAP output
    const { stdout, proc } = runBunTap({ args: files })

    for await (const chunk of stdout) {
      process.stdout.write(chunk.toString())
    }

    const exitCode = await proc.exited
    process.exit(exitCode)
  } else if (options.reporter === "json") {
    // JSON output
    const { stdout } = runBunTap({ args: files })

    for await (const chunk of stdout) {
      consumer.write(chunk.toString())
    }

    consumer.end()

    const results = consumer.getResults()
    console.log(JSON.stringify(results, null, 2))
    process.exit(results.failed > 0 ? 1 : 0)
  } else {
    console.error(`Error: Unknown reporter "${options.reporter}"`)
    console.error("Available reporters: tap, spec, dots, json")
    process.exit(2)
  }
}

const program = new Command()
  .name("tap")
  .description("TAP stream orchestration - run tests with parallel support")
  .version(await getVersion())
  .argument("[patterns...]", "Test file glob patterns", ["**/*.test.ts", "**/*.spec.ts"])
  .option("-R, --reporter <type>", "Output format (tap|spec|dots|json)", "spec")
  .option("-j, --jobs <n>", "Number of parallel workers", Number, 1)
  .option("--dots", "Show colored dots (alias for -R dots)")
  .option("-b, --bail", "Stop on first failure", false)
  .option("-t, --timeout <seconds>", "Test timeout in seconds", Number)
  .option("--no-color", "Disable colored output")
  .action(async (patterns: string[], options: Options) => {
    await runTests(patterns, options)
  })

colorizeHelp(program)
program.parse()
