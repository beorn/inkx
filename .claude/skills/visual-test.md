---
description: Visual capture methods for TUI and terminal output testing
---

# Visual Testing Skill

Capture methods for visual testing of terminal UIs, CLI output, and Ink components.

**Activation keywords**: visual test, screenshot, capture TUI, terminal capture, ttyd, playwright, peekaboo, headless screenshot

**Related**: `/fix-tui` command uses these methods for debugging

## Method Overview

| Method                    | Speed   | Use When                                |
| ------------------------- | ------- | --------------------------------------- |
| 1. Storybook              | Fastest | Testing rendering code in isolation     |
| 2. Headless (Playwright)  | Fast    | Automated capture, CI, regression tests |
| 3. Interactive (Peekaboo) | Medium  | Debugging, exploring live TUI           |

## Method 1: Storybook (Fastest)

Direct terminal output, no browser needed:

```bash
bun storybook
```

Renders all TUI layers via ink-testing-library:

- Layer 1: Rich text (`renderRich`), status/type icons
- Layer 2: Layout functions (wrap, truncate, constrain, path)
- Layer 3: TreeNode component, view components

**Best for**: Isolated component testing, quick iteration on Layer 1-2 bugs.

## Method 2: Headless Screenshot (Playwright)

Automated headless capture via ttyd + Playwright:

### Capture Storybook Output

```bash
pkill -f ttyd 2>/dev/null || true
mkdir -p /tmp/tui-visual-test

ttyd -W -p 7681 bash -c 'bun storybook; sleep 120' &
sleep 5

bun x playwright screenshot \
  --viewport-size=1600,2400 \
  --full-page \
  http://localhost:7681 \
  /tmp/tui-visual-test/storybook.png

# View with Read tool
```

### Capture Full TUI

```bash
pkill -f ttyd 2>/dev/null || true
rm -rf /tmp/tui-test-vault
cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/tui-test-vault

ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault @next.md &
sleep 3

bun x playwright screenshot \
  --viewport-size=1400,900 \
  http://localhost:7681 \
  /tmp/tui-visual-test/tui.png
```

### Playwright Options

| Option               | Example    | Purpose                         |
| -------------------- | ---------- | ------------------------------- |
| `--viewport-size`    | `1400,900` | Set browser viewport            |
| `--full-page`        | (flag)     | Capture full scrollable content |
| `--wait-for-timeout` | `2000`     | Wait ms before capture          |

**Best for**: Regression testing, before/after comparisons, CI pipelines.

## Method 3: Interactive (Peekaboo)

For live debugging with running terminal:

### Via MCP Tools

Use the `mcp__peekaboo__image` tool:

```json
{
  "app_target": "Ghostty",
  "path": "/tmp/tui-visual-test/capture.png",
  "format": "png"
}
```

Or capture frontmost window:

```json
{
  "path": "/tmp/tui-visual-test/capture.png",
  "format": "png"
}
```

### Via CLI

```bash
# Capture specific app
peekaboo image --app "Ghostty" --path /tmp/capture.png

# Capture frontmost window
peekaboo image --path /tmp/capture.png

# Capture full screen
peekaboo image --target screen --path /tmp/capture.png
```

**Best for**: Interactive debugging, inspecting specific UI states.

## Viewing Screenshots

After capturing, use the Read tool to view:

```
Read /tmp/tui-visual-test/storybook.png
Read /tmp/tui-visual-test/tui.png
```

Claude can analyze the screenshot visually and identify rendering issues.

## Cleanup

Always clean up after testing:

```bash
pkill -f ttyd 2>/dev/null || true
rm -rf /tmp/tui-test-vault
rm -rf /tmp/tui-visual-test
```

## Troubleshooting

### Port 7681 in use

```bash
pkill -f ttyd
lsof -i :7681
```

### Playwright not installed

```bash
bun x playwright install chromium
```

### ttyd not found

```bash
brew install ttyd
# or
nix-install nixpkgs#ttyd
```

### No content in screenshot

- Increase sleep time before capture
- Check ttyd stderr: `ttyd ... 2>&1 | head`
- Verify command works directly: `bun storybook`

### Colors missing

- Ensure `chalk.level = 3` in code
- ttyd preserves colors by default
