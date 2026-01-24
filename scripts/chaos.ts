#!/usr/bin/env bun
/**
 * Chaos Testing CLI
 *
 * CLI wrapper for the chaos fuzzer to test sync system robustness.
 *
 * Commands:
 *   fuzz [-n iterations] [-s seed] [-v]  - Run fuzzer
 *   reproduce -s <seed>                   - Reproduce a specific failure
 *   report -s <seed> [-o <file>]          - Generate bug report
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { stringify as stringifyYaml } from "yaml";
import {
  runFuzzer,
  runFuzzerParallel,
  createDefaultFuzzConfig,
  printFuzzResults,
  generateBugReport,
  formatBugReport,
  generateScenarioFromSeed,
  type FuzzConfig,
  type ParallelFuzzConfig,
  type FuzzResult,
} from "../packages/km-storage/tests/sync/chaos/fuzzer.ts";
import { CHAOS_SCENARIOS } from "../packages/km-storage/tests/sync/chaos/scenarios.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CLI Argument Parsing
// ─────────────────────────────────────────────────────────────────────────────

interface FuzzOptions {
  iterations: number;
  seed: number;
  verbose: boolean;
  timeout: number;
  useMockFs: boolean;
  parallel: boolean;
}

interface ReproduceOptions {
  seed: number;
  verbose: boolean;
}

interface ReportOptions {
  seed: number;
  output?: string;
}

interface SaveRegressionOptions {
  seed: number;
  beadId: string;
  description?: string;
}

function parseArgs(args: string[]): {
  command: string;
  options: Record<string, string | number | boolean>;
} {
  const command = args[0] || "help";
  const options: Record<string, string | number | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-n" && args[i + 1]) {
      options.iterations = parseInt(args[++i]!, 10);
    } else if (arg === "-s" && args[i + 1]) {
      options.seed = parseInt(args[++i]!, 10);
    } else if (arg === "-o" && args[i + 1]) {
      options.output = args[++i]!;
    } else if (arg === "-b" && args[i + 1]) {
      options.beadId = args[++i]!;
    } else if (arg === "-d" && args[i + 1]) {
      options.description = args[++i]!;
    } else if (arg === "-v" || arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "-t" && args[i + 1]) {
      options.timeout = parseInt(args[++i]!, 10);
    } else if (arg === "--real-fs" || arg === "-r") {
      options.useMockFs = false;
    } else if (arg === "--parallel" || arg === "-p") {
      options.parallel = true;
    } else if (arg === "--sequential" || arg === "--no-parallel") {
      options.parallel = false;
    }
  }

  return { command, options };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

async function cmdFuzz(options: FuzzOptions): Promise<void> {
  const { iterations, seed, verbose, timeout, useMockFs, parallel } = options;

  console.log(`Chaos Fuzzer`);
  console.log(`============`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Seed: ${seed}`);
  console.log(`Timeout: ${timeout}ms per test`);
  console.log(`MockFS: ${useMockFs ? "yes (fast mode)" : "no (real fs)"}`);
  console.log(`Parallel: ${parallel ? "yes" : "no"}`);
  console.log(`Scenarios: ${Object.keys(CHAOS_SCENARIOS).length}`);
  console.log();

  const config: ParallelFuzzConfig = {
    seed,
    iterations,
    maxFiles: 10,
    maxEvents: 20,
    scenarios: Object.values(CHAOS_SCENARIOS),
    maxCombinedScenarios: 2,
    timeout,
    useMockFs,
    parallel,
  };

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;
  const failures: Array<{ seed: number; invariants: string[] }> = [];

  // Run with progress reporting
  if (verbose) {
    const result = parallel
      ? await runFuzzerParallel(config)
      : await runFuzzer(config);
    printFuzzResults(result);
    return;
  }

  // Run with progress callback for parallel mode
  const result = parallel
    ? await runFuzzerParallel({
        ...config,
        onIterationComplete: (_i, r, progress) => {
          process.stdout.write(
            `\r[${progress.completed}/${progress.total}] ${r.passed ? "✓" : "✗"}`,
          );
        },
      })
    : await runFuzzer(config);

  if (parallel) {
    process.stdout.write("\r"); // Clear progress line
  }

  passed = result.passed;
  failed = result.failed;

  for (const f of result.failures) {
    failures.push({
      seed: f.seed,
      invariants: f.violations.map((v) => v.invariant),
    });
  }

  const duration = Date.now() - startTime;

  // Summary output
  console.log();
  if (failed === 0) {
    console.log(
      `✓ ${passed}/${iterations} passed in ${formatDuration(duration)}`,
    );
  } else {
    console.log(
      `✗ ${passed}/${iterations} passed, ${failed} failed in ${formatDuration(duration)}`,
    );
    console.log();
    console.log("Failed seeds:");

    // Group by invariant
    const byInvariant = new Map<string, number[]>();
    for (const f of failures) {
      for (const inv of f.invariants) {
        const seeds = byInvariant.get(inv) || [];
        seeds.push(f.seed);
        byInvariant.set(inv, seeds);
      }
    }

    for (const [invariant, seeds] of byInvariant) {
      console.log(
        `  ${invariant}: ${seeds.slice(0, 5).join(", ")}${seeds.length > 5 ? ` (+${seeds.length - 5} more)` : ""}`,
      );
    }

    console.log();
    console.log("To reproduce:");
    console.log(`  bun ./scripts/chaos.ts reproduce -s ${failures[0]!.seed}`);
    console.log();
    console.log("To generate report:");
    console.log(
      `  bun ./scripts/chaos.ts report -s ${failures[0]!.seed} -o /tmp/chaos-bug.md`,
    );
  }
}

async function cmdReproduce(options: ReproduceOptions): Promise<void> {
  const { seed, verbose } = options;

  console.log(`Reproducing failure with seed: ${seed}`);
  console.log();

  const config: FuzzConfig = {
    seed,
    iterations: 1,
    maxFiles: 10,
    maxEvents: 20,
    scenarios: Object.values(CHAOS_SCENARIOS),
    maxCombinedScenarios: 2,
    timeout: 2000, // Longer timeout for debugging
  };

  const result = await runFuzzer(config);

  if (result.failed === 0) {
    console.log(`✓ Seed ${seed} passed (could not reproduce failure)`);
    console.log();
    console.log("The failure may have been due to:");
    console.log("  - Timing-dependent race condition");
    console.log("  - Already fixed in current code");
    console.log("  - Different environment/state");
  } else {
    const failure = result.failures[0]!;
    console.log(`✗ Reproduced failure with seed ${seed}`);
    console.log();
    console.log("Violations:");
    for (const v of failure.violations) {
      console.log(`  - ${v.invariant}: ${v.message}`);
      if (verbose && v.details) {
        console.log(`    Details: ${JSON.stringify(v.details, null, 2)}`);
      }
    }
    console.log();
    console.log("Scenario:");
    console.log(`  Files: ${failure.scenario.setup.length}`);
    console.log(`  Events: ${failure.scenario.events.length}`);
    console.log(
      `  Chaos: ${failure.scenario.scenarios.map((s) => s.type).join(", ")}`,
    );

    if (verbose) {
      console.log();
      console.log("File setup:");
      for (const f of failure.scenario.setup) {
        console.log(`  ${f.path}`);
      }
      console.log();
      console.log("Events:");
      for (const e of failure.scenario.events.slice(0, 10)) {
        console.log(`  ${e.type}: ${e.path}`);
      }
      if (failure.scenario.events.length > 10) {
        console.log(`  ... and ${failure.scenario.events.length - 10} more`);
      }
    }
  }
}

async function cmdReport(options: ReportOptions): Promise<void> {
  const { seed, output } = options;

  console.log(`Generating bug report for seed: ${seed}`);

  // First reproduce to get the failure
  const config: FuzzConfig = {
    seed,
    iterations: 1,
    maxFiles: 10,
    maxEvents: 20,
    scenarios: Object.values(CHAOS_SCENARIOS),
    maxCombinedScenarios: 2,
    timeout: 2000,
  };

  const result = await runFuzzer(config);

  if (result.failed === 0) {
    console.error(`Error: Could not reproduce failure with seed ${seed}`);
    process.exit(1);
  }

  const failure = result.failures[0]!;
  const report = generateBugReport(failure);
  const markdown = formatBugReport(report);

  if (output) {
    writeFileSync(output, markdown);
    console.log(`Report written to: ${output}`);
  } else {
    console.log();
    console.log(markdown);
  }
}

async function cmdSaveRegression(
  options: SaveRegressionOptions,
): Promise<void> {
  const { seed, beadId, description } = options;

  console.log(`Saving regression scenario for seed: ${seed}`);
  console.log(`Bead ID: ${beadId}`);

  // First verify the failure still reproduces
  const config: FuzzConfig = {
    seed,
    iterations: 1,
    maxFiles: 10,
    maxEvents: 20,
    scenarios: Object.values(CHAOS_SCENARIOS),
    maxCombinedScenarios: 2,
    timeout: 2000,
  };

  const result = await runFuzzer(config);

  if (result.failed === 0) {
    console.log();
    console.log(`⚠ Warning: Seed ${seed} passed (no failure to save)`);
    console.log("Saving anyway - this may be for a timing-dependent bug.");
    console.log();
  }

  // Generate the scenario from seed
  const scenario = generateScenarioFromSeed(seed, config);

  // Get invariants violated (if any)
  const failure = result.failures[0];
  const invariantsViolated = failure
    ? failure.violations.map((v) => v.invariant)
    : [];

  // Build YAML frontmatter data
  const frontmatter = {
    type: "chaos-test",
    beadId,
    createdAt: new Date().toISOString(),
    invariantsViolated,
    // Scenario data
    seed: scenario.seed,
    index: scenario.index,
    setup: scenario.setup,
    scenarios: scenario.scenarios,
    events: scenario.events,
  };

  // Build markdown content
  const title = description ?? `Regression test for ${beadId}`;
  const markdownContent = `---
${stringifyYaml(frontmatter).trim()}
---

# ${title}

<!-- Add description of the bug and root cause here -->

## Trigger Conditions

- Chaos scenarios: ${scenario.scenarios.map((s) => s.type).join(", ")}
- Files: ${scenario.setup.length}
- Events: ${scenario.events.length}

## Root Cause

<!-- Describe why this bug occurred -->
`;

  // Write to regressions directory
  const regressionsDir = join(
    dirname(import.meta.dir),
    "packages/km-storage/tests/sync/chaos/regressions",
  );
  if (!existsSync(regressionsDir)) {
    mkdirSync(regressionsDir, { recursive: true });
  }

  const outputPath = join(regressionsDir, `${beadId}.md`);
  writeFileSync(outputPath, markdownContent);

  console.log();
  console.log(`✓ Saved regression scenario to:`);
  console.log(`  ${outputPath}`);
  console.log();
  console.log("Scenario summary:");
  console.log(`  Seed: ${scenario.seed}`);
  console.log(`  Files: ${scenario.setup.length}`);
  console.log(`  Events: ${scenario.events.length}`);
  console.log(`  Chaos: ${scenario.scenarios.map((s) => s.type).join(", ")}`);
  console.log();
  console.log("Next steps:");
  console.log(`  1. Edit the description in ${outputPath}`);
  console.log("  2. Fix the bug");
  console.log(
    "  3. Run: bun test packages/km-storage/tests/sync/chaos/regression.test.ts",
  );
  console.log("  4. Commit the fix and the regression file");
}

function printHelp(): void {
  console.log(`
Chaos Testing CLI - Test sync system robustness

Usage: bun ./scripts/chaos.ts <command> [options]

Commands:
  fuzz                    Run chaos fuzzer
  reproduce -s <seed>     Reproduce a specific failure
  report -s <seed>        Generate bug report for a failure
  save-regression         Save a failing scenario as a regression test

Options:
  -n <iterations>         Number of test iterations (default: 100)
  -s <seed>               Random seed for reproducibility
  -t <ms>                 Timeout per test in milliseconds (default: 10, 500 with -r)
  -r, --real-fs           Use real filesystem instead of MockFS (slower)
  -p, --parallel          Run iterations in parallel (default with MockFS)
  --sequential            Run iterations sequentially (disable parallel)
  -v, --verbose           Verbose output with full details
  -o <file>               Output file for report command
  -b <bead-id>            Bead ID for save-regression (e.g., km-91vy)
  -d <description>        Description for save-regression

Examples:
  bun ./scripts/chaos.ts fuzz -n 100
  bun ./scripts/chaos.ts fuzz -n 1000 -s 12345 -v
  bun ./scripts/chaos.ts reproduce -s 12345 -v
  bun ./scripts/chaos.ts report -s 12345 -o /tmp/bug-report.md
  bun ./scripts/chaos.ts save-regression -s 12345 -b km-91vy

npm scripts:
  bun run chaos:fuzz      Quick 100 iteration run
  bun run chaos:stress    1000 iteration stress test
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  switch (command) {
    case "fuzz": {
      // MockFS is default; use --real-fs to disable
      const useMockFs = options.useMockFs !== false;
      // Parallel is default when using MockFS
      const parallel = options.parallel !== false && useMockFs;
      const fuzzOpts: FuzzOptions = {
        iterations: (options.iterations as number) || 100,
        seed: (options.seed as number) || Date.now(),
        verbose: (options.verbose as boolean) || false,
        timeout: (options.timeout as number) || (useMockFs ? 10 : 500),
        useMockFs,
        parallel,
      };
      await cmdFuzz(fuzzOpts);
      break;
    }

    case "reproduce": {
      if (!options.seed) {
        console.error("Error: -s <seed> is required for reproduce command");
        process.exit(1);
      }
      const reproduceOpts: ReproduceOptions = {
        seed: options.seed as number,
        verbose: (options.verbose as boolean) || false,
      };
      await cmdReproduce(reproduceOpts);
      break;
    }

    case "report": {
      if (!options.seed) {
        console.error("Error: -s <seed> is required for report command");
        process.exit(1);
      }
      const reportOpts: ReportOptions = {
        seed: options.seed as number,
        output: options.output as string | undefined,
      };
      await cmdReport(reportOpts);
      break;
    }

    case "save-regression": {
      if (!options.seed) {
        console.error(
          "Error: -s <seed> is required for save-regression command",
        );
        process.exit(1);
      }
      if (!options.beadId) {
        console.error(
          "Error: -b <bead-id> is required for save-regression command",
        );
        process.exit(1);
      }
      const saveOpts: SaveRegressionOptions = {
        seed: options.seed as number,
        beadId: options.beadId as string,
        description: options.description as string | undefined,
      };
      await cmdSaveRegression(saveOpts);
      break;
    }

    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}
