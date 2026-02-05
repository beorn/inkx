#!/usr/bin/env bun
/**
 * TUI Exploration - DEPRECATED
 *
 * Instead of using this CLI script, write ad-hoc test files:
 *
 * ```bash
 * # Create a fuzz test for your scenario
 * bun vitest run apps/km-tui/tests/my-scenario.fuzz.ts
 *
 * # Or run the standard fuzz suite
 * bun vitest run apps/km-tui/tests/navigation-fuzz.fuzz.ts
 * ```
 *
 * The vitest infrastructure gives you:
 * - Seeded random (FUZZ_SEED=12345)
 * - Auto-shrinking of failing sequences
 * - Regression case storage (__fuzz_cases__/)
 * - Integration with CI
 *
 * See .claude/skills/explore/random.md for patterns.
 */

console.log(`
This script is deprecated. Use vitest fuzz tests instead:

  # Run navigation fuzz tests
  bun vitest run apps/km-tui/tests/navigation-fuzz.fuzz.ts

  # With specific seed
  FUZZ_SEED=12345 bun vitest run apps/km-tui/tests/navigation-fuzz.fuzz.ts

  # Write your own ad-hoc fuzz test
  # See apps/km-tui/tests/navigation-fuzz.fuzz.ts for patterns

Benefits of vitest fuzz tests:
- Auto-shrinking finds minimal failing sequence
- Regression cases saved to __fuzz_cases__/
- Runs in CI with other tests
- Uses same primitives (createBoardDriver, gen, take)
`)
