# Visual Testing

This document covers visual testing approaches for the km TUI.

## Quick Reference

| Method             | Speed         | Use Case                           |
| ------------------ | ------------- | ---------------------------------- |
| `km screenshot`    | Fast (<1s)    | Debug current view, snapshot tests |
| inkx test renderer | Fast (<100ms) | Unit tests, component testing      |
| ttyd + Playwright  | Slow (~5s)    | Actual terminal rendering, CI      |

## Method 1: `km screenshot` Command (Recommended for Debugging)

The `km screenshot` command renders the TUI to a buffer and outputs plain text or ANSI.

```bash
# Basic usage - output to stdout
km screenshot /path/to/vault

# Specify file to focus on
km screenshot /path/to/vault/file.md

# Customize dimensions
km screenshot /path/to/file.md --width 80 --height 24

# Save to file
km screenshot /path/to/file.md -o /tmp/output.txt

# Output formats
km screenshot ... --format text   # Plain text (default)
km screenshot ... --format ansi   # With ANSI color codes
km screenshot ... --format debug  # With metadata header
```

### Example: Debugging a Visual Bug

```bash
# Create a test vault
mkdir -p /tmp/test && cat > /tmp/test/tasks.md << 'EOF'
# Tasks
- [ ] First task
- [/] In progress
- [x] Done
EOF

# Capture current state
km screenshot /tmp/test/tasks.md --width 60 --height 15 --format debug
```

Output:

```
# TUI Screenshot
# Dimensions: 60x15
# View: cards
# Root: /tmp/test
# Node: /tmp/test/tasks.md

📁 / Tasks

 · Description (3)
 · ☐ First task
 · ◐ In progress
 · ✓ Done

 BOARD
```

## Method 2: inkx Test Renderer (For Unit Tests)

Use the inkx testing library for component-level tests without external processes.

```typescript
import { createTestRenderer, bufferToText } from "inkx/testing";
import { InkBoardTestable } from "@km/tui";

describe("Board rendering", () => {
  const render = createTestRenderer();

  test("renders tasks", () => {
    const { lastFrameText, lastBuffer } = render(
      <InkBoardTestable
        initialState={state}
        testWidth={80}
        testHeight={24}
      />
    );

    // Plain text assertions
    expect(lastFrameText()).toContain("First task");

    // Or access the buffer directly
    const buffer = lastBuffer();
    const text = bufferToText(buffer);
    expect(text).toMatchSnapshot();
  });
});
```

### Buffer Utilities

```typescript
import { bufferToText, bufferToStyledText } from "inkx/testing";

// Plain text (no ANSI)
const plainText = bufferToText(buffer);

// Styled text (with ANSI color codes, no cursor control)
const styledText = bufferToStyledText(buffer);

// Options
const text = bufferToText(buffer, {
  trimTrailingWhitespace: true, // default
  trimEmptyLines: true, // default
});
```

## Method 3: ttyd + Playwright (For Terminal Rendering)

When you need to test actual terminal rendering (ANSI codes, box drawing, colors):

```bash
# Get a free port
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do
  TTYD_PORT=$((7700 + RANDOM % 300))
done

# Start TUI in ttyd
FORCE_TTY=1 ttyd -W -p $TTYD_PORT bun km view /tmp/test &
sleep 3

# Capture screenshot
HEADLESS=true bun x playwright screenshot \
  --viewport-size=1000,700 \
  http://localhost:$TTYD_PORT \
  /tmp/screenshot.png

# Cleanup
pkill -f ttyd
```

See [.claude/skills/visual-test.md](../../.claude/skills/visual-test.md) for detailed ttyd troubleshooting.

## Snapshot Testing

For regression testing, combine `km screenshot` with snapshot files:

```bash
# Generate baseline
km screenshot /tmp/test/tasks.md --width 60 --height 20 -o tests/snapshots/tasks.txt

# Compare during test
diff tests/snapshots/tasks.txt <(km screenshot /tmp/test/tasks.md --width 60 --height 20)
```

Or use bun's snapshot testing:

```typescript
import { createTestRenderer } from "inkx/testing";

test("board snapshot", () => {
  const { lastFrameText } = render(<InkBoardTestable {...props} />);
  expect(lastFrameText()).toMatchSnapshot();
});
```

## When to Use Each Method

### Use `km screenshot` when:

- Debugging a visual bug
- Quick verification during development
- Generating documentation screenshots
- CI snapshot testing

### Use inkx test renderer when:

- Writing unit tests for components
- Testing rendering logic in isolation
- Need fast test execution (<100ms per test)

### Use ttyd + Playwright when:

- Testing actual ANSI rendering
- Verifying colors and styling
- Visual regression testing against images
- CI visual validation

## Troubleshooting

### Empty or partial output with `km screenshot`

- Ensure vault is fully loaded (not using `--discover-only`)
- Check that the file path is valid

### Unexpected characters in output

- ANSI escape codes may appear as `]8;;...` (OSC hyperlinks)
- Use `--format text` to strip most ANSI codes

### Different output between runs

- UIDs are generated fresh each run
- Use stable test fixtures for consistent snapshots
