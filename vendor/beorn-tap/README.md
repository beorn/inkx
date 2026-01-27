# @beorn/tap

**Orchestrate parallel test runners with TAP.**

Merge multiple TAP streams, convert non-TAP formats (Bun JUnit, Playwright), and get beautiful terminal output with colored dots, timing, and failure summaries.

## The Problem

Running tests in parallel is fast. Merging their output is hard.

**Before @beorn/tap:**
```
Terminal 1: bun test tests/fast/**  → 142 tests passed
Terminal 2: bun test tests/slow/**  → 23 tests passed
Terminal 3: mdtest tests/**/*.md    → 18 tests passed
───────────────────────────────────────────────────────
Result: 3 separate outputs, manual aggregation, no unified summary
```

**After @beorn/tap:**
```
$ bun run test:all
···········X·······································
✗ 183 tests: 182 passed, 1 failed, 0 skipped
Timing: bun:fast: 1.2s, bun:slow: 3.4s, mdtest: 0.8s
Total: 3.5s
```

Single TAP stream, unified summary, parallel execution with accurate timing.

## Features

- **Stream merging** - Aggregate multiple TAP streams into one unified output
- **Format adapters** - Convert JUnit XML (Bun), Playwright to TAP
- **Beautiful output** - Colored dots (green ·, red X, yellow -), timing, failure details
- **Type-safe** - Full TypeScript with ESM-only imports
- **Zero config** - Works out of the box, sensible defaults

## Installation

```bash
bun add -d @beorn/tap
```

## CLI Usage

Run tests directly from the command line:

```bash
# Run all tests with default patterns
tap

# Run specific patterns
tap "tests/**/*.test.ts"

# Colored dots reporter (default)
tap --dots tests/**

# TAP format output
tap -R tap tests/**

# JSON output
tap -R json tests/**

# Parallel execution (future)
tap -j 4 tests/**

# See all options
tap --help
```

**Available Options:**
- `-R, --reporter <type>` - Output format: `tap`, `spec`, `dots`, `json` (default: `spec`)
- `-j, --jobs <n>` - Number of parallel workers (default: 1)
- `--dots` - Show colored dots (alias for `-R dots`)
- `-b, --bail` - Stop on first failure
- `-t, --timeout <seconds>` - Test timeout
- `--no-color` - Disable colored output

**In package.json:**
```json
{
  "scripts": {
    "test": "tap tests/**/*.test.ts",
    "test:watch": "tap --dots tests/**"
  }
}
```

### Multi-Suite Orchestration

Run multiple test suites in parallel with automatic TTY detection:

```typescript
import { createOrchestrator } from "@beorn/tap"

const orchestrator = createOrchestrator({
  mode: "auto", // TTY detection (default)
  suites: [
    { name: "unit", runner: "bun", files: ["tests/unit/**/*.test.ts"] },
    { name: "integration", runner: "bun", files: ["tests/integration/**/*.test.ts"] },
    {
      name: "e2e",
      runner: "custom",
      command: ["playwright", "test", "--reporter=tap"],
      files: ["tests/e2e/**/*.spec.ts"],
    },
  ],
})

const exitCode = await orchestrator.run()
process.exit(exitCode)
```

**Display modes** (automatic based on TTY):

- **TTY (terminal)**: Parallel TUI with inkx - 3 separate streams updating in real-time
- **Non-TTY (CI/pipes)**: Unified TAP stream with interleaved dots

**Parallel TUI mode** (requires `inkx` and `react` peer dependencies):

```typescript
import { createOrchestrator } from "@beorn/tap"
import { renderParallel } from "@beorn/tap/parallel-tui"

const orchestrator = createOrchestrator({
  mode: "parallel", // Force parallel TUI
  suites: [/* ... */],
  renderParallel, // Inject inkx renderer
})
```

Output:
```
unit         .....X.................  1.2s
integration  .....................  3.4s
e2e          .......              5.1s

✓ 183 tests: 182 passed, 1 failed, 0 skipped
```

**In package.json:**
```json
{
  "scripts": {
    "test:all": "bun scripts/test-all.ts"
  }
}
```

Where `scripts/test-all.ts`:
```typescript
import { createOrchestrator } from "@beorn/tap"

const orchestrator = createOrchestrator({
  suites: [
    { name: "fast", runner: "bun", files: await findTests("fast") },
    { name: "slow", runner: "bun", files: await findTests("slow") },
  ],
})

process.exit(await orchestrator.run())
```

### Programmatic Usage

For single-suite usage, use the library API directly:

```typescript
import { createConsumer, runBunTap } from "@beorn/tap"

// Create a consumer with colored dots
const consumer = createConsumer({ dots: true })

// Run Bun tests and convert JUnit XML → TAP
const { stdout } = runBunTap({ args: ["tests/**/*.test.ts"] })

// Pipe to consumer
for await (const chunk of stdout) {
  consumer.write(chunk.toString())
}

// Display summary
consumer.end()
```

## Usage

### Basic Consumer

Parse and display TAP with colored output:

```typescript
import { createConsumer } from "@beorn/tap"
import { spawn } from "bun"

const consumer = createConsumer({ dots: true })

// Run any TAP producer
const proc = spawn(["node", "tests/runner.js"], { stdout: "pipe" })

for await (const chunk of proc.stdout) {
  consumer.write(chunk.toString())
}

consumer.end()
```

**Output:**
```
·······X········
✗ my failing test
  Expected: 42
  Actual: 43
  at test.js:15

✗ 15 tests: 14 passed, 1 failed, 0 skipped
Total: 142ms
```

### Parallel Orchestration

Merge multiple test runners into a single TAP stream:

```typescript
import { createConsumer, mergeStreams, runBunTap } from "@beorn/tap"
import { spawn } from "bun"

const consumer = createConsumer({ dots: true })

// Start multiple test runners in parallel
const { stdout: fastStdout } = runBunTap({ args: ["tests/fast/**/*.test.ts"] })
const { stdout: slowStdout } = runBunTap({ args: ["tests/slow/**/*.test.ts"] })
const mdProc = spawn(["mdtest", "tests/**/*.md", "--tap"], { stdout: "pipe" })

// Merge streams (auto-converts Bun ReadableStreams to Node streams)
const merged = mergeStreams([
  { name: "fast", stream: fastStdout },
  { name: "slow", stream: slowStdout },
  { name: "mdtest", stream: mdProc.stdout },
])

// Pipe merged stream to consumer
for await (const chunk of merged) {
  consumer.write(chunk)
}

consumer.end()

// Check results
const results = consumer.getResults()
process.exit(results.failed > 0 ? 1 : 0)
```

**Output:**
```
·································································
✓ 183 tests: 183 passed, 0 failed, 0 skipped
Total: 3.5s
```

### Bun Test Adapter

Convert Bun's JUnit XML output to TAP:

```typescript
import { runBunTap, createConsumer } from "@beorn/tap"

const { stdout, proc } = runBunTap({
  args: ["tests/**/*.test.ts"],
  // Optional: Bun flags
  bunArgs: ["--timeout", "5000"]
})

const consumer = createConsumer({ dots: true })
for await (const chunk of stdout) {
  consumer.write(chunk.toString())
}
consumer.end()

await proc.exited
```

**Why?** Bun's test runner outputs JUnit XML by default. This adapter converts it to TAP for unified orchestration.

### Playwright Reporter

Configure Playwright to output TAP:

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test"
import PlaywrightReporter from "@beorn/tap/producers/playwright"

export default defineConfig({
  reporter: [["@beorn/tap/producers/playwright"]],
  testDir: "./tests",
})
```

Run tests:
```bash
$ playwright test
TAP version 14
1..42
ok 1 - Homepage loads # 142ms
ok 2 - Login succeeds # 318ms
not ok 3 - Checkout fails # 523ms
  ---
  message: Expected "Success" but got "Error"
  at: tests/checkout.spec.ts:42
  ---
```

## API Reference

### `createOrchestrator(options)`

Creates a multi-suite test orchestrator with automatic TTY detection.

**Type:**
```typescript
function createOrchestrator(options: OrchestratorOptions): {
  run(): Promise<number>
}

interface OrchestratorOptions {
  suites: Suite[]
  mode?: "unified" | "parallel" | "auto"  // Default: "auto"
  output?: Writable  // Default: process.stdout
  renderParallel?: (suites: Suite[]) => Promise<number>  // For parallel mode
}

interface Suite {
  name: string
  runner: "bun" | "custom"
  command?: string[]  // For custom runners (e.g., ["playwright", "test"])
  files: string[]
}
```

**Returns:** Orchestrator object with `run()` method that returns exit code (0 = pass, 1 = fail).

**Mode selection:**
- `"auto"` (default) - TTY detection: parallel for terminals, unified for CI/pipes
- `"unified"` - Force merged TAP stream with interleaved dots
- `"parallel"` - Force inkx TUI with separate streams (requires renderParallel)

**Example:**
```typescript
import { createOrchestrator } from "@beorn/tap"

const orchestrator = createOrchestrator({
  mode: "auto",
  suites: [
    { name: "unit", runner: "bun", files: ["tests/unit/**/*.test.ts"] },
    { name: "e2e", runner: "custom", command: ["playwright", "test", "--reporter=tap"], files: ["tests/e2e/**/*.spec.ts"] },
  ],
})

const exitCode = await orchestrator.run()
process.exit(exitCode)
```

---

### `createConsumer(options?)`

Creates a TAP consumer that parses TAP input and displays formatted output.

**Type:**
```typescript
function createConsumer(options?: ConsumerOptions): Parser & {
  addTiming(runner: string, ms: number): void
  getResults(): ConsumerResult
}

interface ConsumerOptions {
  dots?: boolean        // Show colored dots during test execution (default: false)
  output?: Writable     // Output stream (default: process.stdout)
}

interface ConsumerResult {
  passed: number
  failed: number
  skipped: number
  total: number
  failures: Failure[]
  timing: TimingEntry[]
  wallTimeMs: number
}
```

**Returns:** Extended `tap-parser` instance with:
- `.write(chunk)` - Write TAP input
- `.end()` - Finish parsing and display summary
- `.addTiming(name, ms)` - Add runner timing info
- `.getResults()` - Get test results programmatically

**Example:**
```typescript
const consumer = createConsumer({ dots: true })
consumer.write("TAP version 14\n")
consumer.write("1..2\n")
consumer.write("ok 1 - test passes\n")
consumer.write("not ok 2 - test fails\n")
consumer.end()
// Output:
// ·X
// ✗ 2 tests: 1 passed, 1 failed, 0 skipped
```

### `mergeStreams(streams)`

Merges multiple TAP streams into a single unified TAP stream.

**Type:**
```typescript
function mergeStreams(
  streams: NamedStream[]
): Readable

interface NamedStream {
  name: string
  stream: Readable | ReadableStream<Uint8Array>  // Node or Bun streams
}
```

**Returns:** Node.js `Readable` that outputs unified TAP with:
- Single TAP version header
- Renumbered assertions (1..N)
- Runner names in test descriptions (`[runner] test name`)
- Timing comments per runner
- Single final plan line

**Stream Auto-Conversion:** Automatically converts Bun's `ReadableStream<Uint8Array>` to Node.js `Readable` streams internally, so you can pass either type.

**Example:**
```typescript
import { runBunTap, mergeStreams } from "@beorn/tap"

const { stdout: fast } = runBunTap({ args: ["tests/fast/**"] })
const { stdout: slow } = runBunTap({ args: ["tests/slow/**"] })

const merged = mergeStreams([
  { name: "fast", stream: fast },   // Node.js Readable
  { name: "slow", stream: slow },   // Auto-converted
])

for await (const chunk of merged) {
  process.stdout.write(chunk)
}
```

### `runBunTap(options)`

Runs Bun tests and converts JUnit XML output to TAP.

**Type:**
```typescript
function runBunTap(options: BunTapOptions): BunTapResult

interface BunTapOptions {
  args: string[]          // Test file patterns or paths
  bunArgs?: string[]      // Additional Bun flags (--timeout, --bail, etc.)
}

interface BunTapResult {
  stdout: NodeJS.ReadableStream  // TAP output stream
  proc: Subprocess               // Bun process
}
```

**Returns:** Object with TAP stdout and process handle.

**Example:**
```typescript
const { stdout, proc } = runBunTap({
  args: ["tests/**/*.test.ts"],
  bunArgs: ["--timeout", "10000"]
})

// stdout is now a TAP stream
for await (const chunk of stdout) {
  console.log(chunk.toString())
}

await proc.exited
```

### `PlaywrightReporter`

Playwright reporter that outputs TAP format.

**Type:**
```typescript
class PlaywrightReporter implements Reporter {
  onBegin(config: FullConfig, suite: Suite): void
  onTestEnd(test: TestCase, result: TestResult): void
  onEnd(result: FullResult): void
}
```

**Usage:** See [Playwright Reporter](#playwright-reporter) section above.

## Comparison

| Tool                                                        | Purpose         | Stream Merging | Format Conversion    | Terminal Output | Test Framework Integration |
| ----------------------------------------------------------- | --------------- | -------------- | -------------------- | --------------- | -------------------------- |
| **@beorn/tap**                                              | Orchestration   | ✅ Parallel     | ✅ Bun, Playwright    | ✅ Colored dots  | Bun, Playwright            |
| [tap](https://www.npmjs.com/package/tap)                    | Producer        | ❌              | ❌                    | ✅ Fancy output  | Node.js (own framework)    |
| [tap-parser](https://www.npmjs.com/package/tap-parser)      | Parsing         | ❌              | ❌                    | ❌               | None (library)             |
| [tap-mocha-reporter](https://www.npmjs.com/package/tap-mocha-reporter) | Formatting      | ❌              | ❌                    | ✅ Various styles | None (formatting only)     |
| [tape](https://www.npmjs.com/package/tape)                  | Producer        | ❌              | ❌                    | ✅ Basic          | Node.js (own framework)    |
| [node:test](https://nodejs.org/api/test.html)               | Producer        | ❌              | ❌                    | ✅ TAP or spec    | Node.js (built-in)         |

### When to Use Each

**Use @beorn/tap when:**
- Running multiple test suites in parallel (unit, integration, e2e)
- Converting non-TAP formats to TAP (Bun JUnit, Playwright)
- Need unified timing across parallel runners
- Want beautiful colored terminal output with dots

**Use tap/tape when:**
- Writing Node.js tests from scratch
- Need a TAP producer, not orchestration
- Want an all-in-one test framework

**Use tap-parser when:**
- Just need TAP parsing, not formatting
- Building your own custom TAP consumer

**Use tap-mocha-reporter when:**
- Already have TAP output
- Want different formatting styles (spec, dot, nyan, etc.)
- Don't need stream merging

**Use node:test when:**
- Using Node.js 18+ built-in test runner
- Don't need parallel orchestration across different runners

### Why @beorn/tap Exists

Most TAP tools are either **producers** (generate TAP) or **formatters** (display TAP). Very few handle **parallel orchestration** and **format conversion** together.

**The gap:** When you run multiple test runners in parallel (Bun fast tests, Bun slow tests, markdown tests, Playwright e2e), you get 4 separate outputs. Manually aggregating results is tedious and loses timing information.

**@beorn/tap fills this gap** by:
1. Converting non-TAP formats (Bun JUnit, Playwright) to TAP
2. Merging parallel TAP streams with accurate timing
3. Providing beautiful unified output

## Architecture

```
┌─────────────┐
│  Consumer   │ ← Parses TAP, displays dots/failures/summary
└─────────────┘
       ↑
       │ Unified TAP stream
       │
┌─────────────┐
│    Merge    │ ← Combines multiple TAP streams, rewrites IDs
└─────────────┘
       ↑
       │ Individual TAP streams
       │
┌──────┬──────┬───────┐
│ Bun  │ MD   │ Raw   │ ← Producers (adapters or native TAP)
└──────┴──────┴───────┘
```

**Components:**

1. **consumer.ts** - TAP parser with colored output
   - Wraps `tap-parser` from npm
   - Adds colored dots, failure formatting, timing display
   - Accumulates results for programmatic access

2. **merge.ts** - Stream merger
   - Combines multiple TAP streams into one
   - Strips individual TAP headers
   - Rewrites assertion IDs sequentially
   - Adds runner comments for timing

3. **producers/** - Format adapters
   - **bun.ts** - Converts Bun's JUnit XML → TAP
   - **playwright.ts** - Native Playwright reporter → TAP

## Limitations

- **Bun XML parsing** - Uses regex (works for Bun's stable format, not general XML)
- **TAP version** - Only supports TAP v14 (not v12)
- **ID rewriting** - Stream merging assumes non-overlapping test IDs (automatically renumbered)
- **Serial display** - While tests run in parallel, dots display serially as streams arrive

## Development

```bash
# Run tests
bun test tests/

# Type check
bun run typecheck

# Run examples
bun run example:basic
bun run example:parallel
```

## License

MIT © Beorn
