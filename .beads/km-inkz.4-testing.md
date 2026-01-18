# InkZ: Test-Driven Development Strategy

## Philosophy

Since InkZ targets API compatibility with Ink and Chalk, we have a **golden specification**: their existing test suites. Rather than writing tests from scratch, we leverage their tests as our compatibility contract.

**Core principle**: If Ink's tests pass, we're compatible. If they don't, we know exactly what's broken.

---

## 1. Test Suite Architecture

```
inkz/
├── tests/
│   ├── compat/                 # Compatibility tests (from Ink/Chalk)
│   │   ├── ink/               # Ink test suite (adapted)
│   │   │   ├── flex.test.tsx
│   │   │   ├── render.test.tsx
│   │   │   ├── components.test.tsx
│   │   │   └── ... (31 test files)
│   │   └── chalk/             # Chalk test suite (adapted)
│   │       ├── chalk.test.ts
│   │       ├── level.test.ts
│   │       └── ... (6 test files)
│   │
│   ├── visual/                # Visual regression tests
│   │   ├── snapshots/         # Reference screenshots/outputs
│   │   ├── terminals/         # Terminal-specific tests
│   │   │   ├── xterm.test.ts
│   │   │   ├── iterm.test.ts
│   │   │   ├── kitty.test.ts
│   │   │   └── vscode.test.ts
│   │   └── visual.test.ts     # Cross-terminal visual tests
│   │
│   ├── perf/                  # Performance benchmarks
│   │   ├── render.bench.ts
│   │   ├── layout.bench.ts
│   │   ├── diff.bench.ts
│   │   └── memory.bench.ts
│   │
│   └── unit/                  # InkZ-specific unit tests
│       ├── layout-hook.test.ts
│       ├── two-phase.test.ts
│       └── ...
```

---

## 2. Compatibility Testing Strategy

### 2.1 Ink Test Suite Adoption

Ink uses AVA with 31 test files. Our approach:

**Step 1: Clone and Adapt**

```bash
# Fetch Ink's test suite
git clone --depth=1 https://github.com/vadimdemedes/ink.git /tmp/ink
cp -r /tmp/ink/test/* tests/compat/ink/

# Adapt imports
find tests/compat/ink -name "*.tsx" -exec sed -i '' \
  's/from '\''ink'\''/from '\''inkz'\''/g' {} \;
```

**Step 2: Track Compatibility Progress**

```typescript
// tests/compat/ink/compat-status.ts
export const COMPAT_STATUS = {
  // Phase 1 - Must pass for MVP
  "flex.test.tsx": "passing",
  "flex-direction.test.tsx": "passing",
  "flex-justify-content.test.tsx": "passing",
  "text.test.tsx": "passing",
  "render.test.tsx": "partial", // 12/15 passing

  // Phase 2 - Nice to have
  "focus.test.tsx": "skipped",
  "screen-reader.test.tsx": "skipped",
} as const;
```

**Step 3: CI Dashboard**

```yaml
# .github/workflows/compat.yml
- name: Run Ink compatibility tests
  run: |
    bun test tests/compat/ink --reporter=json > ink-compat.json
    node scripts/compat-report.js ink-compat.json
```

Output:

```
Ink Compatibility Report
========================
Flexbox Layout:    ████████████████████ 100% (6/6 files)
Components:        ████████████░░░░░░░░  60% (3/5 files)
Hooks:             ██████░░░░░░░░░░░░░░  30% (1/3 files)
Overall:           ████████████░░░░░░░░  65% (20/31 files)
```

### 2.2 Chalk Compatibility

Chalk tests are simpler - pure ANSI output assertions:

```typescript
// tests/compat/chalk/chalk.test.ts
import { test, expect } from 'bun:test';
import chalk from 'chalk';
import { Text, renderToString } from 'inkz';

test('chalk.red produces correct ANSI', () => {
  const output = renderToString(<Text>{chalk.red('foo')}</Text>);
  expect(output).toBe('\u001B[31mfoo\u001B[39m');
});

test('nested styles close correctly', () => {
  const output = renderToString(
    <Text>{chalk.red.bgGreen.underline('foo')}</Text>
  );
  expect(output).toBe('\u001B[4m\u001B[42m\u001B[31mfoo\u001B[39m\u001B[49m\u001B[24m');
});
```

### 2.3 Running Original Test Suites

For maximum confidence, run the **original** Ink/Chalk tests:

```bash
# Create test harness that aliases inkz → ink
mkdir -p node_modules/ink
echo 'export * from "inkz";' > node_modules/ink/index.js

# Run Ink's original tests
cd /tmp/ink && npm test

# Run Chalk's original tests
cd /tmp/chalk && npm test
```

---

## 3. Visual Testing Strategy

### 3.1 Snapshot-Based Visual Testing

Use `ink-testing-library` pattern with enhanced snapshots:

```typescript
// tests/visual/visual.test.ts
import { render } from 'inkz/testing';
import { Box, Text } from 'inkz';

test('basic layout renders correctly', () => {
  const { lastFrame } = render(
    <Box flexDirection="column" width={40}>
      <Text color="green">Header</Text>
      <Box flexDirection="row">
        <Text>Left</Text>
        <Text>Right</Text>
      </Box>
    </Box>
  );

  expect(lastFrame()).toMatchSnapshot();
});
```

Snapshot format (with ANSI codes visible):

```
// __snapshots__/visual.test.ts.snap
exports[`basic layout renders correctly 1`] = `
"\u001B[32mHeader\u001B[39m
Left                Right               "
`;
```

### 3.2 Cross-Terminal Visual Testing

Different terminals render ANSI differently. Use PTY-based testing:

```typescript
// tests/visual/terminals/cross-terminal.test.ts
import { spawn } from "node-pty";
import { toMatchImageSnapshot } from "jest-image-snapshot";

const TERMINALS = [
  { name: "xterm", env: { TERM: "xterm-256color" } },
  { name: "vt100", env: { TERM: "vt100" } },
  { name: "dumb", env: { TERM: "dumb" } },
];

for (const terminal of TERMINALS) {
  test(`renders correctly in ${terminal.name}`, async () => {
    const pty = spawn("node", ["fixtures/test-app.js"], {
      env: { ...process.env, ...terminal.env },
      cols: 80,
      rows: 24,
    });

    const output = await captureOutput(pty, 1000);
    expect(output).toMatchSnapshot(`${terminal.name}`);
  });
}
```

### 3.3 tui-test Integration

Use Microsoft's tui-test for comprehensive E2E testing:

```typescript
// tests/visual/e2e.test.ts
import { Terminal } from "@anthropic-ai/tui-test";

test("interactive app works end-to-end", async () => {
  const terminal = new Terminal({
    command: "node",
    args: ["./fixtures/interactive-app.js"],
    cols: 80,
    rows: 24,
  });

  await terminal.waitForText("Select an option:");
  await terminal.write("j"); // Move down
  await terminal.write("\r"); // Enter

  await expect(terminal).toMatchSnapshot();
});
```

### 3.4 Visual Diff Tool

Create a visual diff utility for manual inspection:

```bash
# Compare InkZ output vs Ink output side-by-side
bun run visual-diff tests/fixtures/complex-layout.tsx

┌─────────────────────────────────────┬─────────────────────────────────────┐
│ Ink (reference)                     │ InkZ (current)                      │
├─────────────────────────────────────┼─────────────────────────────────────┤
│ ┌────────────────────────────────┐  │ ┌────────────────────────────────┐  │
│ │ Header                         │  │ │ Header                         │  │
│ ├────────────────────────────────┤  │ ├────────────────────────────────┤  │
│ │ Content here                   │  │ │ Content here                   │  │
│ └────────────────────────────────┘  │ └────────────────────────────────┘  │
└─────────────────────────────────────┴─────────────────────────────────────┘
                                        ✓ MATCH
```

---

## 4. Performance Testing Strategy

### 4.1 Benchmark Suite

```typescript
// tests/perf/render.bench.ts
import { bench, group, run } from 'mitata';
import { render as inkRender } from 'ink';
import { render as inkzRender } from 'inkz';
import { ComplexLayout } from './fixtures/complex-layout';

group('Initial render', () => {
  bench('Ink', () => inkRender(<ComplexLayout />));
  bench('InkZ', () => inkzRender(<ComplexLayout />));
});

group('Re-render (state change)', () => {
  // Setup: render once, then benchmark updates
  const { rerender } = inkzRender(<ComplexLayout count={0} />);

  bench('InkZ rerender', () => {
    rerender(<ComplexLayout count={Math.random()} />);
  });
});

group('Layout computation', () => {
  bench('Yoga layout (100 nodes)', () => {
    computeLayout(buildTree(100));
  });

  bench('Yoga layout (1000 nodes)', () => {
    computeLayout(buildTree(1000));
  });
});

await run({ avg: true, json: true });
```

### 4.2 Performance Targets

| Metric                   | Target | Ink Baseline |
| ------------------------ | ------ | ------------ |
| Initial render (simple)  | < 5ms  | 3ms          |
| Initial render (complex) | < 20ms | 15ms         |
| Re-render (diff)         | < 2ms  | 2ms          |
| Layout (100 nodes)       | < 1ms  | 0.5ms        |
| Memory (idle)            | < 10MB | 8MB          |
| Memory (1000 nodes)      | < 50MB | 40MB         |

### 4.3 Performance Regression Detection

```yaml
# .github/workflows/perf.yml
- name: Run benchmarks
  run: bun run bench --json > bench-results.json

- name: Compare with baseline
  run: |
    bun run scripts/compare-bench.js \
      bench-results.json \
      baseline/bench-results.json \
      --threshold=1.2  # 20% regression threshold
```

### 4.4 Continuous Performance Monitoring

```typescript
// scripts/perf-monitor.ts
// Run nightly, track trends over time

const METRICS = [
  "render_simple_p50",
  "render_complex_p50",
  "memory_peak",
  "layout_100_nodes",
];

async function recordMetrics() {
  const results = await runBenchmarks();

  // Store in SQLite or JSON for trending
  await db.insert("perf_metrics", {
    timestamp: new Date(),
    commit: process.env.GITHUB_SHA,
    ...results,
  });

  // Alert if regression detected
  const baseline = await db.getBaseline();
  for (const metric of METRICS) {
    if (results[metric] > baseline[metric] * 1.2) {
      console.error(
        `REGRESSION: ${metric} is ${results[metric]}ms (was ${baseline[metric]}ms)`,
      );
      process.exit(1);
    }
  }
}
```

---

## 5. Test Infrastructure

### 5.1 inkz-testing-library

Provide a testing library compatible with ink-testing-library:

```typescript
// packages/inkz-testing/src/index.ts
import { createRenderer } from "inkz";

export function render(element: React.ReactElement) {
  const frames: string[] = [];
  const stdout = new MockStdout();

  const { rerender, unmount } = createRenderer().render(element, {
    stdout,
    onRender: (output) => frames.push(output),
  });

  return {
    lastFrame: () => frames[frames.length - 1],
    frames,
    rerender,
    unmount,
    stdout,
    stdin: new MockStdin(),
  };
}

// Compatible with ink-testing-library API
export { render as createInkTester };
```

### 5.2 Test Fixtures

```typescript
// tests/fixtures/index.ts
export { SimpleBox } from "./simple-box";
export { ComplexLayout } from "./complex-layout";
export { NestedFlex } from "./nested-flex";
export { InteractiveForm } from "./interactive-form";
export { LargeList } from "./large-list"; // 1000+ items
export { UnicodeContent } from "./unicode-content";
export { ChalkStyledContent } from "./chalk-styled";
```

### 5.3 CI Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test tests/unit

  compat-ink:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test tests/compat/ink
      - run: bun run scripts/compat-report.js

  compat-chalk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test tests/compat/chalk

  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test tests/visual
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diff
          path: tests/visual/__diff__/

  perf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run bench --json > bench.json
      - run: bun run scripts/compare-bench.js bench.json

  # Matrix test across Node versions and OS
  cross-platform:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm install
      - run: npm test
```

---

## 6. Development Workflow

### 6.1 TDD Cycle

```bash
# 1. Pick a failing Ink test
bun test tests/compat/ink/flex.test.tsx --watch

# 2. Implement until it passes
# ... edit src/components/Box.tsx ...

# 3. Check for regressions
bun test tests/compat/ink

# 4. Update compatibility status
bun run scripts/update-compat-status.js
```

### 6.2 Visual Development Mode

```bash
# Live preview of test fixtures
bun run dev:visual

# Opens split-pane terminal:
# Left: Ink rendering
# Right: InkZ rendering
# Bottom: Diff status
```

### 6.3 Quick Verification Commands

```bash
# Fast feedback loop
bun test:fast           # Unit tests only (~2s)
bun test:compat         # Ink/Chalk compat (~10s)
bun test:visual         # Visual snapshots (~5s)
bun bench               # Performance (~30s)
bun test:all            # Everything (~60s)

# Check specific compatibility
bun test:ink-flex       # Just flexbox tests
bun test:chalk          # Just Chalk tests
```

---

## 7. Compatibility Dashboard

Create a live dashboard showing test status:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  InkZ Compatibility Dashboard                                       v0.1.0  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Ink API Compatibility                                                      │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Components        [████████████████████] 100%  Box, Text, Newline, Spacer  │
│  Flexbox Layout    [████████████████░░░░]  80%  Missing: flex-wrap         │
│  Hooks             [████████████░░░░░░░░]  60%  useInput, useStdout ✓      │
│  Focus System      [░░░░░░░░░░░░░░░░░░░░]   0%  Not started                │
│                                                                             │
│  Chalk Compatibility                                                        │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Basic Styles      [████████████████████] 100%  All modifiers work         │
│  Colors            [████████████████████] 100%  16, 256, RGB               │
│  Nesting           [████████████████████] 100%  Proper reset codes         │
│                                                                             │
│  Performance vs Ink                                                         │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Initial Render    [█████████░░░░░░░░░░░]  0.9x  (InkZ: 4.5ms, Ink: 5ms)   │
│  Re-render         [████████████████████]  1.2x  (InkZ: 1.5ms, Ink: 1.8ms) │
│  Memory            [██████████████░░░░░░]  1.1x  (InkZ: 11MB, Ink: 10MB)   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. References

- [Ink Test Suite](https://github.com/vadimdemedes/ink/tree/master/test) - 31 test files
- [Ink Testing Library](https://github.com/vadimdemedes/ink-testing-library) - Test utilities
- [Chalk Test Suite](https://github.com/chalk/chalk/tree/main/test) - 6 test files
- [Microsoft tui-test](https://github.com/microsoft/tui-test) - E2E terminal testing
- [xterm-benchmark](https://github.com/xtermjs/xterm-benchmark) - Performance benchmarking
- [AVA](https://github.com/avajs/ava) - Test framework used by Ink/Chalk
- [mitata](https://github.com/evanwashere/mitata) - Benchmarking library
