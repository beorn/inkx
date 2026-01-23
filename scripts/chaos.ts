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

import { writeFileSync } from "fs";
import {
  runFuzzer,
  createDefaultFuzzConfig,
  printFuzzResults,
  generateBugReport,
  formatBugReport,
  type FuzzConfig,
  type FuzzResult,
} from "../packages/km-storage/tests/watch/chaos/fuzzer.ts";
import { CHAOS_SCENARIOS } from "../packages/km-storage/tests/watch/chaos/scenarios.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CLI Argument Parsing
// ─────────────────────────────────────────────────────────────────────────────

interface FuzzOptions {
  iterations: number;
  seed: number;
  verbose: boolean;
  timeout: number;
}

interface ReproduceOptions {
  seed: number;
  verbose: boolean;
}

interface ReportOptions {
  seed: number;
  output?: string;
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
      options.iterations = parseInt(args[++i], 10);
    } else if (arg === "-s" && args[i + 1]) {
      options.seed = parseInt(args[++i], 10);
    } else if (arg === "-o" && args[i + 1]) {
      options.output = args[++i];
    } else if (arg === "-v" || arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "-t" && args[i + 1]) {
      options.timeout = parseInt(args[++i], 10);
    }
  }

  return { command, options };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

async function cmdFuzz(options: FuzzOptions): Promise<void> {
  const { iterations, seed, verbose, timeout } = options;

  console.log(`Chaos Fuzzer`);
  console.log(`============`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Seed: ${seed}`);
  console.log(`Timeout: ${timeout}ms per test`);
  console.log(`Scenarios: ${Object.keys(CHAOS_SCENARIOS).length}`);
  console.log();

  const config: FuzzConfig = {
    seed,
    iterations,
    maxFiles: 10,
    maxEvents: 20,
    scenarios: Object.values(CHAOS_SCENARIOS),
    maxCombinedScenarios: 2,
    timeout,
  };

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;
  const failures: Array<{ seed: number; invariants: string[] }> = [];

  // Run with progress reporting
  if (verbose) {
    const result = await runFuzzer(config);
    printFuzzResults(result);
    return;
  }

  // Simple progress mode
  const result = await runFuzzer(config);
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
    console.log(`✓ ${passed}/${iterations} passed in ${formatDuration(duration)}`);
  } else {
    console.log(`✗ ${passed}/${iterations} passed, ${failed} failed in ${formatDuration(duration)}`);
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
      console.log(`  ${invariant}: ${seeds.slice(0, 5).join(", ")}${seeds.length > 5 ? ` (+${seeds.length - 5} more)` : ""}`);
    }

    console.log();
    console.log("To reproduce:");
    console.log(`  bun ./scripts/chaos.ts reproduce -s ${failures[0].seed}`);
    console.log();
    console.log("To generate report:");
    console.log(`  bun ./scripts/chaos.ts report -s ${failures[0].seed} -o /tmp/chaos-bug.md`);
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
    const failure = result.failures[0];
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
    console.log(`  Chaos: ${failure.scenario.scenarios.map((s) => s.type).join(", ")}`);

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

  const failure = result.failures[0];
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

function printHelp(): void {
  console.log(`
Chaos Testing CLI - Test sync system robustness

Usage: bun ./scripts/chaos.ts <command> [options]

Commands:
  fuzz                    Run chaos fuzzer
  reproduce -s <seed>     Reproduce a specific failure
  report -s <seed>        Generate bug report for a failure

Options:
  -n <iterations>         Number of test iterations (default: 100)
  -s <seed>               Random seed for reproducibility
  -t <ms>                 Timeout per test in milliseconds (default: 500)
  -v, --verbose           Verbose output with full details
  -o <file>               Output file for report command

Examples:
  bun ./scripts/chaos.ts fuzz -n 100
  bun ./scripts/chaos.ts fuzz -n 1000 -s 12345 -v
  bun ./scripts/chaos.ts reproduce -s 12345 -v
  bun ./scripts/chaos.ts report -s 12345 -o /tmp/bug-report.md

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
      const fuzzOpts: FuzzOptions = {
        iterations: (options.iterations as number) || 100,
        seed: (options.seed as number) || Date.now(),
        verbose: (options.verbose as boolean) || false,
        timeout: (options.timeout as number) || 500,
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
