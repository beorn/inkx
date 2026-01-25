#!/usr/bin/env bun

/**
 * Test Performance Measurement Tool
 *
 * Analyzes test suite performance to optimize test:fast (<5s total target).
 * - Measures individual file execution time
 * - Counts test cases per file
 * - Identifies slowest contributors to test:fast
 * - Recommends files to move to/from .slow.test
 */

import { spawn } from "bun";
import { parseArgs } from "util";

interface TestResult {
  file: string;
  duration: number;
  testCount: number;
  passed: boolean;
  error?: string;
}

const FAST_TARGET = 5000; // 5 seconds total target for test:fast
const SLOW_FILE_THRESHOLD = 1000; // Individual file threshold to consider moving

async function runTest(file: string): Promise<TestResult> {
  const start = performance.now();

  try {
    const proc = spawn({
      cmd: ["bun", "test", file],
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const duration = performance.now() - start;

    // Parse test output to count tests (check both stdout and stderr)
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const output = stdout + stderr;
    const testCount = parseTestCount(output);

    return {
      file,
      duration,
      testCount,
      passed: exitCode === 0,
    };
  } catch (error) {
    const duration = performance.now() - start;
    return {
      file,
      duration,
      testCount: 0,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseTestCount(output: string): number {
  // Parse "Ran 123 tests across 5 files" or "7 pass"
  const match = output.match(/Ran (\d+) test/) || output.match(/(\d+) pass/);
  return match ? parseInt(match[1], 10) : 0;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      pattern: { type: "string", short: "p", default: "**/*.test.ts" },
      target: { type: "string", short: "t", default: "5000" },
      analyze: { type: "string", short: "a" }, // 'fast' or 'slow'
    },
    allowPositionals: true,
  });

  const targetTime = parseInt(values.target as string, 10);
  const pattern = values.pattern as string;
  const analyze = values.analyze;

  // Determine which test set to analyze
  let files: string[];
  if (positionals.length > 0) {
    files = positionals;
  } else if (analyze === "fast") {
    // Replicate test:fast pattern
    files = Array.from(new Bun.Glob("**/*.test.ts").scanSync(".")).filter(
      (f) => !f.includes(".slow.test.ts") && !f.includes("node_modules"),
    );
  } else if (analyze === "slow") {
    files = Array.from(new Bun.Glob("**/*.slow.test.ts").scanSync("."));
  } else {
    files = Array.from(new Bun.Glob(pattern).scanSync(".")).filter(
      (f) => !f.includes("node_modules"),
    );
  }

  if (files.length === 0) {
    console.error("No test files found matching pattern:", pattern);
    process.exit(1);
  }

  console.log(`\n📊 Analyzing ${files.length} test file(s)...\n`);

  const results: TestResult[] = [];

  for (const file of files) {
    process.stdout.write(`Testing ${file}... `);
    const result = await runTest(file);
    results.push(result);

    const durationSec = (result.duration / 1000).toFixed(2);
    const tests = result.testCount > 0 ? ` (${result.testCount} tests)` : "";
    const status = result.passed ? "✅" : "❌";

    console.log(`${status} ${durationSec}s${tests}`);
  }

  // Analysis
  console.log("\n" + "=".repeat(80) + "\n");

  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);
  const totalDuration = passed.reduce((sum, r) => sum + r.duration, 0);
  const totalTests = passed.reduce((sum, r) => sum + r.testCount, 0);

  // Sort by duration descending to find biggest contributors
  const sortedByDuration = [...passed].sort((a, b) => b.duration - a.duration);

  console.log(`📈 Performance Analysis\n`);
  console.log(
    `Target: ${(targetTime / 1000).toFixed(1)}s | Actual: ${(totalDuration / 1000).toFixed(2)}s | Status: ${totalDuration <= targetTime ? "✅ PASS" : "❌ OVER"}\n`,
  );

  if (totalDuration > targetTime) {
    const overBy = totalDuration - targetTime;
    console.log(`⚠️  Over target by ${(overBy / 1000).toFixed(2)}s\n`);
  }

  // Show slowest contributors
  console.log(`🐌 Slowest files (top 10):\n`);
  sortedByDuration.slice(0, 10).forEach((r, i) => {
    const durationSec = (r.duration / 1000).toFixed(2);
    const pct = ((r.duration / totalDuration) * 100).toFixed(1);
    const avgPerTest =
      r.testCount > 0 ? (r.duration / r.testCount).toFixed(0) : "N/A";
    console.log(
      `   ${i + 1}. ${durationSec}s (${pct}%) - ${avgPerTest}ms/test - ${r.file}`,
    );
  });
  console.log();

  // Identify candidates to move to .slow.test
  if (analyze === "fast") {
    const candidates = passed
      .filter((r) => r.duration > SLOW_FILE_THRESHOLD)
      .sort((a, b) => b.duration - a.duration);

    if (candidates.length > 0) {
      console.log(
        `💡 Candidates to move to .slow.test (>${SLOW_FILE_THRESHOLD}ms):\n`,
      );
      let savings = 0;
      for (const r of candidates) {
        const durationSec = (r.duration / 1000).toFixed(2);
        const newName = r.file.replace(".test.", ".slow.test.");
        console.log(`   ${durationSec}s - mv ${r.file} ${newName}`);
        savings += r.duration;

        if (totalDuration - savings <= targetTime) {
          console.log(
            `   ↑ Moving these would bring total under ${(targetTime / 1000).toFixed(1)}s`,
          );
          break;
        }
      }
      console.log();
    }
  }

  // Identify candidates to move FROM .slow.test
  if (analyze === "slow") {
    const candidates = passed
      .filter((r) => r.duration < SLOW_FILE_THRESHOLD)
      .sort((a, b) => a.duration - b.duration);

    if (candidates.length > 0) {
      console.log(
        `💡 Candidates to move FROM .slow.test (<${SLOW_FILE_THRESHOLD}ms):\n`,
      );
      candidates.forEach((r) => {
        const durationSec = (r.duration / 1000).toFixed(2);
        const newName = r.file.replace(".slow.test.", ".test.");
        console.log(`   ${durationSec}s - mv ${r.file} ${newName}`);
      });
      console.log(
        `\n   Note: Verify test:fast remains under ${(targetTime / 1000).toFixed(1)}s after moving!\n`,
      );
    }
  }

  // Summary stats
  console.log("Summary:");
  console.log(`  Total files: ${results.length}`);
  console.log(`  Passed: ${passed.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log(`  Total tests: ${totalTests}`);
  console.log(`  Total time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(
    `  Avg per file: ${(totalDuration / passed.length / 1000).toFixed(2)}s`,
  );
  if (totalTests > 0) {
    console.log(`  Avg per test: ${(totalDuration / totalTests).toFixed(0)}ms`);
  }
  console.log();

  if (failed.length > 0) {
    console.log(`❌ Failed tests:\n`);
    failed.forEach((r) => {
      const durationSec = (r.duration / 1000).toFixed(2);
      console.log(`   ${durationSec}s  ${r.file}`);
      if (r.error) {
        console.log(`          ${r.error}`);
      }
    });
    console.log();
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
