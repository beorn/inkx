#!/usr/bin/env bun
/**
 * Test Performance Tracker
 *
 * Reads vitest HTML metadata, tracks test performance over time, and shows
 * performance summary including slowest files and regression warnings.
 *
 * Usage: bun packages/km-infra/scripts/test-perf/track.ts
 *
 * Reads from: test-results/html.meta.json.gz
 * Writes to: .test-results/test-perf-history.jsonl
 */

import { gunzipSync } from "bun"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"

// ============================================================================
// Types
// ============================================================================

interface FileMetadata {
  name: string
  duration: number
  testCount: number
}

interface PerformanceData {
  timestamp: string
  totalTime: number
  testCount: number
  fileCount: number
  slowestFiles: Array<{
    path: string
    time: number
    tests: number
  }>
  candidatesForSlow: Array<{
    path: string
    time: number
    tests: number
  }>
  avgTimePerTest: number
  avgTimePerFile: number
}

/** Vitest metadata indexed object with string indices pointing to other array elements */
interface MetadataObject {
  name?: string | number
  files?: string | number
  result?: string | number
  tasks?: string | number
  duration?: number
}

// ============================================================================
// Configuration
// ============================================================================

const METADATA_PATH = "test-results/html.meta.json.gz"
const HISTORY_PATH = ".test-results/test-perf-history.jsonl"
const SLOW_FILE_THRESHOLD_MS = 1000 // Files taking >1s should be .slow.test.ts
const REGRESSION_THRESHOLD = 1.1 // 10% slower is a regression
const TOP_N_SLOWEST = 10

// ============================================================================
// Main
// ============================================================================

function main() {
  // Check if metadata file exists
  if (!existsSync(METADATA_PATH)) {
    console.error(`❌ Metadata file not found: ${METADATA_PATH}`)
    console.error("   Make sure tests were run with HTML reporter enabled")
    process.exit(1)
  }

  // Read and parse metadata
  console.log(`📊 Reading test metadata from ${METADATA_PATH}...`)
  const metadata = readMetadata()

  // Extract performance data
  const perfData = extractPerformanceData(metadata)

  // Store in history
  storeHistory(perfData)

  // Load history for comparison
  const history = loadHistory()

  // Show summary
  showSummary(perfData, history)
}

// ============================================================================
// Metadata Reading
// ============================================================================

function readMetadata(): unknown {
  try {
    const compressed = readFileSync(METADATA_PATH)
    const decompressed = gunzipSync(compressed)
    const text = new TextDecoder().decode(decompressed)
    return JSON.parse(text) as unknown
  } catch (error) {
    console.error(`❌ Failed to read metadata: ${String(error)}`)
    process.exit(1)
  }
}

// ============================================================================
// Performance Data Extraction
// ============================================================================

/**
 * Dereference a string index to get the actual value from the metadata array
 */
function deref(metadata: unknown[], idx: string | number | undefined): unknown {
  if (idx === undefined) return undefined
  const index = typeof idx === "string" ? parseInt(idx) : idx
  return metadata[index]
}

function extractPerformanceData(metadata: unknown): PerformanceData {
  // The vitest metadata uses an indexed array structure where string indices
  // reference other elements in the array
  const files: FileMetadata[] = []
  let totalTime = 0
  let testCount = 0

  if (!Array.isArray(metadata) || metadata.length === 0) {
    throw new Error("Invalid metadata structure")
  }

  // Root object at index 0
  const root = metadata[0] as MetadataObject | undefined
  if (!root || typeof root !== "object") {
    throw new Error("Invalid root object")
  }

  // Get files array
  const filesArray = deref(metadata, root.files)
  if (!Array.isArray(filesArray)) {
    throw new Error("Files array not found")
  }

  // Process each file
  for (const fileIdxStr of filesArray as (string | number)[]) {
    const file = deref(metadata, fileIdxStr) as MetadataObject | undefined
    if (!file || typeof file !== "object") continue

    // Dereference file name
    const name = (deref(metadata, file.name) as string | undefined) || "unknown"

    // Get duration from result object
    const result = deref(metadata, file.result) as MetadataObject | undefined
    const duration = result?.duration || 0

    // Get task count
    const tasksArray = deref(metadata, file.tasks)
    const taskCount = Array.isArray(tasksArray) ? tasksArray.length : 0

    files.push({
      name,
      duration,
      testCount: taskCount,
    })

    totalTime += duration
    testCount += taskCount
  }

  // Sort files by duration
  const sortedFiles = [...files].sort((a, b) => b.duration - a.duration)

  // Find candidates for .slow.test.ts (files taking >1s that aren't already .slow)
  const candidatesForSlow = sortedFiles.filter((f) => f.duration > SLOW_FILE_THRESHOLD_MS && !f.name.includes(".slow."))

  return {
    timestamp: new Date().toISOString(),
    totalTime,
    testCount,
    fileCount: files.length,
    slowestFiles: sortedFiles.slice(0, TOP_N_SLOWEST).map((f) => ({
      path: f.name,
      time: f.duration,
      tests: f.testCount,
    })),
    candidatesForSlow: candidatesForSlow.slice(0, 5).map((f) => ({
      path: f.name,
      time: f.duration,
      tests: f.testCount,
    })),
    avgTimePerTest: testCount > 0 ? totalTime / testCount : 0,
    avgTimePerFile: files.length > 0 ? totalTime / files.length : 0,
  }
}

// ============================================================================
// History Management
// ============================================================================

function storeHistory(perfData: PerformanceData): void {
  // Ensure directory exists
  const dir = join(".test-results")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Append to history file
  const line = JSON.stringify(perfData) + "\n"

  try {
    // Append to file
    if (existsSync(HISTORY_PATH)) {
      const existing = readFileSync(HISTORY_PATH, "utf8")
      writeFileSync(HISTORY_PATH, existing + line)
    } else {
      writeFileSync(HISTORY_PATH, line)
    }
  } catch (error) {
    console.error(`⚠️  Failed to write history: ${String(error)}`)
  }
}

function loadHistory(): PerformanceData[] {
  if (!existsSync(HISTORY_PATH)) {
    return []
  }

  try {
    const content = readFileSync(HISTORY_PATH, "utf8")
    return content
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as PerformanceData)
  } catch (error) {
    console.error(`⚠️  Failed to load history: ${String(error)}`)
    return []
  }
}

// ============================================================================
// Summary Display
// ============================================================================

function showSummary(current: PerformanceData, history: PerformanceData[]): void {
  console.log("\n" + "=".repeat(60))
  console.log("📊 Test Performance Summary")
  console.log("=".repeat(60))

  // Overall stats
  console.log(`\n⏱️  Total: ${formatTime(current.totalTime)} (${current.testCount} tests, ${current.fileCount} files)`)
  console.log(`   Avg per test: ${formatTime(current.avgTimePerTest)}`)
  console.log(`   Avg per file: ${formatTime(current.avgTimePerFile)}`)

  // Compare against previous run
  const previous = history.length > 1 ? history[history.length - 2] : undefined
  if (previous) {
    const timeDiff = current.totalTime - previous.totalTime
    const percentDiff = (timeDiff / previous.totalTime) * 100

    if (Math.abs(percentDiff) > 1) {
      const icon = timeDiff > 0 ? "📈" : "📉"
      const direction = timeDiff > 0 ? "slower" : "faster"
      const color = timeDiff > 0 ? "\x1b[33m" : "\x1b[32m" // yellow or green
      const reset = "\x1b[0m"

      console.log(
        `   ${icon} ${color}${Math.abs(percentDiff).toFixed(1)}% ${direction}${reset} than previous run (${formatTime(previous.totalTime)})`,
      )

      if (percentDiff > REGRESSION_THRESHOLD * 100 - 100) {
        console.log(`   \x1b[31m⚠️  WARNING: Test suite is ${percentDiff.toFixed(1)}% slower!\x1b[0m`)
      }
    }
  }

  // Slowest files
  if (current.slowestFiles.length > 0) {
    console.log(`\n🐌 Slowest Files (top ${Math.min(5, current.slowestFiles.length)}):`)
    current.slowestFiles.slice(0, 5).forEach((f, i) => {
      console.log(`   ${i + 1}. ${f.path}`)
      console.log(`      ${formatTime(f.time)} (${f.tests} tests)`)
    })
  }

  // Candidates for .slow.test.ts
  if (current.candidatesForSlow.length > 0) {
    console.log(
      `\n⚠️  ${current.candidatesForSlow.length} file(s) taking >${SLOW_FILE_THRESHOLD_MS}ms should be .slow.test.ts:`,
    )
    current.candidatesForSlow.forEach((f) => {
      console.log(`   - ${f.path}`)
      console.log(`     ${formatTime(f.time)} (${f.tests} tests)`)
    })
  }

  // Historical trend (last 5 runs)
  if (history.length > 1) {
    console.log(`\n📈 Historical Trend (last ${Math.min(5, history.length)} runs):`)
    const recent = history.slice(-5)
    recent.forEach((h, i) => {
      const date = new Date(h.timestamp).toLocaleString()
      const isCurrent = i === recent.length - 1
      const marker = isCurrent ? "→" : " "
      console.log(`   ${marker} ${date}: ${formatTime(h.totalTime)} (${h.testCount} tests)`)
    })
  }

  console.log("\n" + "=".repeat(60) + "\n")
}

// ============================================================================
// Utilities
// ============================================================================

function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

// ============================================================================
// Entry Point
// ============================================================================

main()
