#!/usr/bin/env bun

/**
 * Complexity Analysis Report
 *
 * Runs oxlint with complexity rules and generates a sorted report.
 * Uses advisory thresholds (cyclomatic=50, cognitive=50, set in
 * packages/km-infra/oxlint/config.json) to flag functions that are
 * candidates for refactoring. Test/fuzz/bench files and helpers are
 * excluded — only production code is measured.
 *
 * Usage:
 *   bun lint:complexity              # Full report
 *   bun lint:complexity --json       # JSON for tooling
 *   bun lint:complexity --brief      # One-line per finding
 *   bun lint:complexity packages/km-storage  # Specific path
 */

import { spawn } from "bun"
import { parseArgs } from "util"

interface ComplexityFinding {
  file: string
  line: number
  column: number
  function: string
  rule: "cyclomatic" | "cognitive"
  complexity: number
  threshold: number
  breakdown: string
}

async function getFiles(paths: string[]): Promise<string[]> {
  const files: string[] = []
  for (const path of paths) {
    const stat = await Bun.file(path).exists()
    if (stat) {
      // It's a file
      files.push(path)
    } else {
      // It's a directory - use glob to find ts/tsx files.
      // Skip node_modules + dist + test/fuzz/bench artifacts; vendor IS scanned
      // (vendor packages are part of this project per the workspace policy).
      const glob = new Bun.Glob("**/*.{ts,tsx}")
      for await (const file of glob.scan({ cwd: path })) {
        if (
          !file.includes("node_modules") &&
          !file.includes("/dist/") &&
          !file.includes(".test.") &&
          !file.includes(".spec.") &&
          !file.includes(".fuzz.") &&
          !file.includes(".bench.") &&
          !file.includes("/tests/helpers/") &&
          !file.includes("/tests/profile-")
        ) {
          files.push(`${path}/${file}`)
        }
      }
    }
  }
  return files
}

async function runOxlint(paths: string[]): Promise<string> {
  // jsPlugins only work when passing individual files, not directories
  const files = await getFiles(paths)
  if (files.length === 0) {
    return ""
  }

  const proc = spawn({
    cmd: [
      "bunx",
      "oxlint",
      "-c",
      "packages/km-infra/oxlint/config.json",
      "--type-aware",
      ...files,
    ],
    stdout: "pipe",
    stderr: "pipe",
  })

  await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return stdout + stderr
}

function parseFindings(output: string): ComplexityFinding[] {
  const findings: ComplexityFinding[] = []

  // oxlint-plugin-complexity output format (v1.0 unified rule):
  //   ! complexity(complexity): Function 'funcName' has Cognitive Complexity of 17. Maximum allowed is 15. [breakdown]
  //   | Breakdown:
  //   |     Line 42: +1 for 'if'
  //   | Tips:
  //   |   ...
  //      ,-[file.ts:line:col]
  //
  // v1.0 diagnostics are multi-line with detailed breakdowns. Split on diagnostic
  // boundaries (each starts with "  ! complexity(") rather than blank lines.

  // Split output into diagnostic blocks starting at each "  ! complexity(" marker
  const blocks: string[] = []
  const lines = output.split("\n")
  let current: string[] = []
  for (const line of lines) {
    if (/^\s*!\s*complexity\(/.test(line) && current.length > 0) {
      blocks.push(current.join("\n"))
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) {
    blocks.push(current.join("\n"))
  }

  for (const block of blocks) {
    // Match the complexity warning/error line (both v1.0 unified and v0.x legacy formats)
    const ruleMatch = block.match(
      /!\s*complexity\((?:max-(cyclomatic|cognitive)|complexity)\):\s*Function '([^']+)' has (?:(cyclomatic|Cyclomatic|Cognitive)) [Cc]omplexity of (\d+)\.\s*Maximum allowed is (\d+)/,
    )
    if (!ruleMatch) continue

    // Match the file location line: ,-[file.ts:line:col]
    const locationMatch = block.match(/,-\[([^:]+):(\d+):(\d+)\]/)
    if (!locationMatch) continue

    // Extract breakdown summary from the first line (in brackets)
    const breakdownMatch = block.match(/Maximum allowed is \d+\.\s*\[([^\]]+)\]/)

    // Determine rule type from either capture group
    const typeStr = (ruleMatch[1] ?? ruleMatch[3] ?? "cognitive").toLowerCase()
    const ruleType = typeStr === "cyclomatic" ? "cyclomatic" : "cognitive" as "cyclomatic" | "cognitive"
    findings.push({
      file: locationMatch[1]!,
      line: parseInt(locationMatch[2]!, 10),
      column: parseInt(locationMatch[3]!, 10),
      function: ruleMatch[2]!,
      complexity: parseInt(ruleMatch[4]!, 10),
      threshold: parseInt(ruleMatch[5]!, 10),
      rule: ruleType,
      breakdown: breakdownMatch?.[1] ?? "",
    })
  }

  return findings
}

function formatReport(findings: ComplexityFinding[], brief: boolean): string {
  if (findings.length === 0) {
    return "No complexity issues found."
  }

  // Sort by complexity score (highest first)
  const sorted = [...findings].sort((a, b) => {
    // Normalize scores: cognitive threshold is lower, so weight it more
    const scoreA =
      a.rule === "cognitive" ? a.complexity * 1.33 : a.complexity
    const scoreB =
      b.rule === "cognitive" ? b.complexity * 1.33 : b.complexity
    return scoreB - scoreA
  })

  if (brief) {
    return sorted
      .map(
        (f) =>
          `${f.file}:${f.line} ${f.function}() ${f.rule}=${f.complexity}/${f.threshold}`,
      )
      .join("\n")
  }

  const lines: string[] = []
  lines.push(`Found ${findings.length} high-complexity functions:\n`)

  // Group by file
  const byFile = new Map<string, ComplexityFinding[]>()
  for (const f of sorted) {
    const list = byFile.get(f.file) || []
    list.push(f)
    byFile.set(f.file, list)
  }

  for (const [file, fileFunctions] of byFile) {
    lines.push(`\n${file}`)
    for (const f of fileFunctions) {
      const over = f.complexity - f.threshold
      const label =
        f.rule === "cognitive" ? "cognitive" : "cyclomatic"
      lines.push(
        `  :${f.line} ${f.function}() - ${label}: ${f.complexity} (+${over} over limit)`,
      )
      if (f.breakdown) {
        lines.push(`         ${f.breakdown}`)
      }
    }
  }

  lines.push(`\n\nSummary:`)
  const cognitiveCount = findings.filter((f) => f.rule === "cognitive").length
  const cyclomaticCount = findings.filter(
    (f) => f.rule === "cyclomatic",
  ).length
  lines.push(`  ${cognitiveCount} cognitive complexity issues`)
  lines.push(`  ${cyclomaticCount} cyclomatic complexity issues`)

  return lines.join("\n")
}

function formatJson(findings: ComplexityFinding[]): string {
  return JSON.stringify(findings, null, 2)
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      json: { type: "boolean", default: false },
      brief: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(`
Complexity Analysis Report

Usage:
  bun lint:complexity [options] [path]

Options:
  --json     Output as JSON (for tooling integration)
  --brief    One-line per finding (for pattern detection script)
  -h, --help Show this help

Examples:
  bun lint:complexity                    # Analyze entire codebase
  bun lint:complexity packages/km-storage  # Analyze specific package
  bun lint:complexity --json             # JSON output for CI
  bun lint:complexity --brief            # Brief output for review script
`)
    process.exit(0)
  }

  const paths = positionals.length > 0 ? positionals : ["apps", "packages", "vendor"]
  const output = await runOxlint(paths)
  const findings = parseFindings(output)

  if (values.json) {
    console.log(formatJson(findings))
  } else {
    console.log(formatReport(findings, values.brief ?? false))
  }

  // Exit with 1 if any findings (for CI purposes)
  process.exit(findings.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
