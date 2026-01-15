---
description: Visual capture methods for TUI testing in headless terminals
---

# Visual Testing Skill

Capture methods for visual testing of TUIs and CLI output running in a real terminal environment (via ttyd). This tests the actual terminal rendering, not just component output.

**Use case**: Testing how the TUI looks in a real terminal - colors, box drawing, layout, ANSI rendering.

**Activation keywords**: visual test, screenshot, capture TUI, terminal capture, ttyd, playwright, headless screenshot

**Related**: `/fix-tui` command uses these methods for debugging

## CRITICAL: Default to Headless Testing

**ALWAYS use headless methods (Storybook or ttyd + Playwright) by default.** These run in the background and don't interfere with the user's desktop.

**NEVER use Peekaboo/desktop capture unless the user EXPLICITLY asks** you to look at their Ghostty window, desktop, or a specific running application. Peekaboo takes over the user's screen and prevents them from using their computer.

## CRITICAL: Set Up for Success (Before Starting TUI)

**Do all preparation BEFORE starting ttyd.** Once the TUI is running, you can only capture - you cannot navigate or interact. Plan ahead to avoid restart cycles.

## Best Practice: Use Smaller Terminal Dimensions

**Prefer smaller viewport sizes** (e.g., `800,600` or `1000,700`) over large ones:

1. **Faster screenshots** - Smaller images = faster capture and analysis
2. **Tests overflow behavior** - Narrow terminals trigger truncation, wrapping, and clipping that wide terminals hide
3. **More realistic** - Many users have smaller terminal windows or splits

```bash
# Recommended sizes for different tests
--viewport-size=800,600   # Narrow - tests truncation, overflow, compact mode
--viewport-size=1000,700  # Medium - balanced view
--viewport-size=1400,900  # Wide - only when testing multi-column layout
```

Only use wide viewports (`1400,900`) when specifically testing multi-column layouts or when the bug only reproduces at larger sizes.

### Example 1: Testing Cards View Truncation

```bash
# 1. Prepare test data with long text that might truncate
rm -rf /tmp/test-vault && mkdir -p /tmp/test-vault
cat > /tmp/test-vault/test.md << 'EOF'
# Test
- [ ] This is a very long task name that should demonstrate truncation behavior in the cards view when the terminal is narrow
- [ ] Short task
- [ ] Another task with **bold** and `code` formatting to test rich text truncation
EOF

# 2. Start TUI in Cards view with narrow viewport
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/test-vault test.md --view cards &
sleep 3

# 3. Capture at small size (faster + tests overflow) - HEADLESS=true prevents browser window
HEADLESS=true bun x playwright screenshot --viewport-size=800,600 http://localhost:7681 /tmp/cards-truncation.png
```

### Example 2: Testing Columns View with Multiple Statuses

```bash
# 1. Prepare data with tasks in different columns
rm -rf /tmp/test-vault && mkdir -p /tmp/test-vault
cat > /tmp/test-vault/@next.md << 'EOF'
# Next Actions
- [ ] Todo task
- [/] In progress task
- [x] Done task
- [-] Dropped task
- [!] Blocked task
EOF

# 2. Start in Columns view (default)
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/test-vault @next.md --view columns &
sleep 3

# 3. Capture - use 1000,700 for balanced view (HEADLESS=true prevents browser window)
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:7681 /tmp/columns-statuses.png
```

### Example 3: Testing with Existing Fixtures

```bash
# 1. Copy the full test fixture vault (has varied content)
rm -rf /tmp/tui-test-vault
cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/tui-test-vault

# 2. Start at a specific file known to have the issue
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault Projects/api-redesign.md --view tabs &
sleep 3

# 3. Capture at medium size (HEADLESS=true prevents browser window)
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:7681 /tmp/tabs-view.png
```

### Key Flags

| Flag            | Purpose                  | Example                         |
| --------------- | ------------------------ | ------------------------------- |
| `-r <vault>`    | Set vault root directory | `-r /tmp/test-vault`            |
| `--view <mode>` | Start in specific view   | `--view cards`                  |
| `<file>`        | Open specific file       | `@next.md` or `Projects/foo.md` |

**Before capturing**, determine:

- What view mode shows the issue? → Use `--view` flag
- What content triggers it? → Create minimal test data or use fixtures
- What terminal size? → Set `--viewport-size` in Playwright

This avoids multiple capture-navigate-capture cycles.

## Method Overview

| Method                    | Speed   | Use When                                              |
| ------------------------- | ------- | ----------------------------------------------------- |
| 1. Storybook              | Fastest | Testing rendering code in isolation (DEFAULT)         |
| 2. Headless (Playwright)  | Fast    | Full TUI capture, CI, regression tests (DEFAULT)      |
| 3. Interactive (Peekaboo) | N/A     | ONLY when user explicitly requests desktop inspection |

## Method 1: Storybook (Fastest)

Direct terminal output for component testing:

```bash
bun storybook
```

Renders TUI components via ink-testing-library (not a real terminal):

- Layer 1: Rich text (`renderRich`), status/type icons
- Layer 2: Layout functions (wrap, truncate, constrain, path)
- Layer 3: TreeNode component, view components

**Best for**: Isolated component testing, quick iteration on rendering logic.

**Limitation**: Does not test actual terminal rendering (ANSI codes, colors, box drawing).

## Method 2: Headless Terminal Screenshot (ttyd + Playwright)

Runs the TUI in a real terminal (ttyd) and captures via Playwright. This tests actual terminal rendering including ANSI colors, box drawing characters, and terminal-specific behavior.

### Capture Storybook Output

```bash
pkill -f ttyd 2>/dev/null || true
mkdir -p /tmp/tui-visual-test

ttyd -W -p 7681 bash -c 'bun storybook; sleep 120' &
sleep 5

# HEADLESS=true prevents browser window from appearing
HEADLESS=true bun x playwright screenshot \
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

# HEADLESS=true prevents browser window from appearing
# Use 1000,700 for faster captures; 1400,900 only for multi-column layout testing
HEADLESS=true bun x playwright screenshot \
  --viewport-size=1000,700 \
  http://localhost:7681 \
  /tmp/tui-visual-test/tui.png
```

### Playwright Options

| Option               | Example    | Purpose                         |
| -------------------- | ---------- | ------------------------------- |
| `--viewport-size`    | `1400,900` | Set browser viewport            |
| `--full-page`        | (flag)     | Capture full scrollable content |
| `--wait-for-timeout` | `2000`     | Wait ms before capture          |

**Best for**: Testing actual terminal rendering, regression testing, before/after comparisons, CI pipelines.

## Method 3: Interactive (Peekaboo) - USER REQUEST ONLY

⚠️ **DO NOT USE THIS METHOD UNLESS THE USER EXPLICITLY ASKS** ⚠️

Peekaboo captures the user's actual desktop/screen, which:

- Takes over their display
- Prevents them from using their computer
- Should ONLY be used when the user says something like:
  - "Check my Ghostty window"
  - "Look at what's on my screen"
  - "Capture my desktop"

If the user hasn't explicitly asked for desktop inspection, **use headless methods instead**.

### Via MCP Tools (only when explicitly requested)

Use the `mcp__peekaboo__image` tool:

```json
{
  "app_target": "Ghostty",
  "path": "/tmp/tui-visual-test/capture.png",
  "format": "png"
}
```

### Via CLI (only when explicitly requested)

```bash
# Capture specific app
peekaboo image --app "Ghostty" --path /tmp/capture.png

# Capture frontmost window
peekaboo image --path /tmp/capture.png
```

**When to use**: ONLY when user explicitly requests you to check their desktop/running app.

## Viewing Screenshots

After capturing, use the Read tool to view:

```
Read /tmp/tui-visual-test/storybook.png
Read /tmp/tui-visual-test/tui.png
```

## Known Limitation: Visual Bug Detection

**Claude is not good at detecting subtle visual discrepancies in TUI screenshots.**

While Claude can see images and describe their contents, it struggles with:

- **Subtle alignment issues** - Off-by-one spacing, slight misalignment
- **Intuitive "wrongness"** - When something looks "off" but is hard to articulate
- **Comparing expected vs actual** - Unless the difference is obvious (missing content, wrong colors)
- **Terminal rendering artifacts** - Flickering, partial updates, overlapping content
- **Layout proportions** - Whether columns are "balanced" or spacing "feels right"

### What Claude CAN do:

- Verify text content is present/absent
- Check obvious structural issues (missing borders, completely wrong layout)
- Confirm colors are applied
- Count visible items

### What Claude CANNOT reliably do:

- Spot that text is clipped by 1-2 characters
- Notice content is showing from the wrong end (bottom instead of top)
- Detect subtle overflow/clipping issues
- Judge whether spacing "looks right"

### Implications for debugging:

1. **Trust the user's visual assessment** - If they say something looks wrong, it is
2. **Ask for specific descriptions** - "What exactly looks wrong?" helps focus fixes
3. **Use before/after comparisons** - Capture before changes, then after, compare side-by-side
4. **Try harder** - Don't dismiss visual issues; examine screenshots carefully even knowing this limitation
5. **Don't claim fixes work** - Until the user confirms visually, assume the bug persists

This limitation is a key reason we're exploring OpenTUI (bead km-oicw) - reducing manual layout calculations means fewer visual bugs to debug in the first place.

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
