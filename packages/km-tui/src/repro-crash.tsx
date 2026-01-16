/**
 * Minimal reproduction of borderStyle segfault bug
 *
 * Bug: Using an invalid borderStyle value (e.g., "round" instead of "rounded")
 * causes a segmentation fault on macOS Apple Silicon.
 *
 * Run with: bun run packages/km-tui-opentui/src/repro-crash.tsx [test-number]
 *
 * Environment:
 * - macOS (Apple Silicon) - Darwin arm64
 * - Bun 1.3.5
 * - @opentui/core 0.1.73
 * - @opentui/react 0.1.73
 *
 * Tests:
 *   bun run packages/km-tui-opentui/src/repro-crash.tsx 1  # "single" - works
 *   bun run packages/km-tui-opentui/src/repro-crash.tsx 2  # "rounded" - works or crashes?
 *   bun run packages/km-tui-opentui/src/repro-crash.tsx 3  # "round" (invalid) - crashes
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

if (!process.stdout.isTTY) {
  console.error("This example requires a TTY");
  process.exit(1);
}

const test = process.argv[2] || "3";
const renderer = await createCliRenderer();

switch (test) {
  case "1":
    // This works fine
    createRoot(renderer).render(
      <box border borderStyle="single" width={30} height={5}>
        <text>Test 1: single - works</text>
      </box>,
    );
    break;

  case "2":
    // Valid "rounded" - does this work?
    createRoot(renderer).render(
      <box border borderStyle="rounded" width={30} height={5}>
        <text>Test 2: rounded - valid</text>
      </box>,
    );
    break;

  case "3":
  default:
    // Invalid "round" - crashes with segfault
    createRoot(renderer).render(
      // @ts-expect-error - intentionally using invalid value to reproduce crash
      <box border borderStyle="round" width={30} height={5}>
        <text>Test 3: round (invalid) - crashes</text>
      </box>,
    );
    break;
}
