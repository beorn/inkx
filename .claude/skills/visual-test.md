---
description: Visual capture methods for TUI testing in headless terminals
---

# Visual Testing Skill

Capture methods for visual testing of TUIs and CLI output running in a real terminal environment (via ttyd). This tests the actual terminal rendering, not just component output.

**Use case**: Testing how the TUI looks in a real terminal - colors, box drawing, layout, ANSI rendering.

**Activation keywords**: visual test, screenshot, capture TUI, terminal capture, ttyd, playwright, headless screenshot

**Related**: `/fix-tui` command uses these methods for debugging

---

## ⚠️ MANDATORY RULES ⚠️

### Rule 1: ALWAYS Use ttyd + Playwright First

**ttyd + Playwright is the ONLY approved method for visual testing.** Do not consider alternatives until you have:

1. Tried at least **10 different approaches** to make ttyd + Playwright work
2. Created a **bead/task** documenting what's broken and how to fix it
3. Actually **fixed the issue** so ttyd + Playwright works

If ttyd + Playwright isn't working, that's a bug to fix, not a reason to use Peekaboo.

### Rule 2: NEVER Use Peekaboo Without Explicit User Approval

**Before using ANY Peekaboo MCP tool, you MUST:**

1. **Ask the user explicitly** using AskUserQuestion
2. **Get a clear "yes"** response
3. **Only then** proceed with Peekaboo

```
AskUserQuestion: "I've tried ttyd+Playwright 10+ times and it's not working.
May I use Peekaboo to capture your desktop? This will interact with your screen."
Options: ["Yes, use Peekaboo", "No, keep trying headless"]
```

**If you haven't asked → Don't use Peekaboo**
**If the user said no → Don't use Peekaboo**
**If ttyd isn't working → Fix ttyd, don't use Peekaboo**

---

## Troubleshooting ttyd + Playwright (TRY THESE FIRST)

When headless capture fails, work through ALL of these before considering Peekaboo:

### 1. Timing Issues (Most Common)

```bash
# Problem: Screenshot shows blank/loading
# Solution: Increase wait times progressively

sleep 3   # Try this first
sleep 5   # If still blank
sleep 10  # For large vaults
sleep 15  # For very large vaults (21k+ files)
sleep 30  # Maximum reasonable wait

# Also use Playwright's wait flag:
--wait-for-timeout=2000   # Wait 2s after page load
--wait-for-timeout=5000   # Wait 5s for slow renders
```

### 2. Environment Variables

```bash
# Ensure terminal capabilities are set
FORCE_TTY=1 \
COLORTERM=truecolor \
TERM=xterm-256color \
ttyd -W -p $TTYD_PORT bun km view ...
```

### 3. Alternate Screen Buffer Issues

```bash
# If using OpenTUI, disable alternate screen
OTUI_USE_ALTERNATE_SCREEN=false ttyd ...
```

### 4. Port Conflicts (IMPORTANT for Parallel Agents)

**Multiple Claude agents may run concurrently.** Always use a unique random port:

```bash
# Generate random port in range 7700-7999 (avoid 7681 which other agents may use)
TTYD_PORT=$((7700 + RANDOM % 300))

# Verify port is free before using
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do
  TTYD_PORT=$((7700 + RANDOM % 300))
done

echo "Using port $TTYD_PORT"
ttyd -W -p $TTYD_PORT bun km view ...
```

**Never hardcode port 7681** - always use dynamic allocation.

### 5. Small Test Vault

```bash
# Use a tiny vault that loads instantly
rm -rf /tmp/test-vault && mkdir -p /tmp/test-vault
echo -e "# Test\n- [ ] Task 1\n- [x] Task 2" > /tmp/test-vault/test.md

# Use dynamic port (see "Port Conflicts" above)
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done
ttyd -W -p $TTYD_PORT bun km view -r /tmp/test-vault test.md &
```

### 6. Check ttyd Output

```bash
# Run ttyd in foreground to see errors (use dynamic port)
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done
ttyd -W -p $TTYD_PORT bun km view ... 2>&1 | head -50
```

### 7. Verify Playwright Installation

```bash
bun x playwright install chromium
```

### 8. Try Different Viewport Sizes

```bash
--viewport-size=800,600    # Small
--viewport-size=1000,700   # Medium
--viewport-size=1400,900   # Large
```

### 9. Multiple Sequential Captures

```bash
# Capture multiple times with increasing delays (use your assigned $TTYD_PORT)
for delay in 3 5 10 15; do
  sleep $delay
  HEADLESS=true bun x playwright screenshot \
    --viewport-size=1000,700 \
    http://localhost:$TTYD_PORT \
    /tmp/capture-${delay}s.png
done
```

### 10. Check if TUI Actually Started

```bash
ps aux | grep -E "(km|bun)" | grep -v grep
# Should show the km view process running
```

### If All 10 Attempts Fail

1. **Create a bead**: `bd create --type=bug --title="ttyd+Playwright visual capture not working"`
2. **Document what you tried** in the bead description
3. **Fix the underlying issue** - this is a project bug, not a reason to switch tools
4. **Only then** ask the user about Peekaboo as a temporary workaround

---

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

# 2. Get a free port for this agent
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done

# 3. Start TUI in Cards view with narrow viewport
ttyd -W -p $TTYD_PORT bun km view -r /tmp/test-vault test.md --view cards &
sleep 3

# 4. Capture at small size (faster + tests overflow) - HEADLESS=true prevents browser window
HEADLESS=true bun x playwright screenshot --viewport-size=800,600 http://localhost:$TTYD_PORT /tmp/cards-truncation.png
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

# 2. Get a free port for this agent
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done

# 3. Start in Columns view (default)
ttyd -W -p $TTYD_PORT bun km view -r /tmp/test-vault @next.md --view columns &
sleep 3

# 4. Capture - use 1000,700 for balanced view (HEADLESS=true prevents browser window)
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:$TTYD_PORT /tmp/columns-statuses.png
```

### Example 3: Testing with Existing Fixtures

```bash
# 1. Copy the full test fixture vault (has varied content)
rm -rf /tmp/tui-test-vault
cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/tui-test-vault

# 2. Get a free port for this agent
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done

# 3. Start at a specific file known to have the issue
ttyd -W -p $TTYD_PORT bun km view -r /tmp/tui-test-vault Projects/api-redesign.md --view tabs &
sleep 3

# 4. Capture at medium size (HEADLESS=true prevents browser window)
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:$TTYD_PORT /tmp/tabs-view.png
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
mkdir -p /tmp/tui-visual-test

# Get a free port
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done

ttyd -W -p $TTYD_PORT bash -c 'bun storybook; sleep 120' &
sleep 5

# HEADLESS=true prevents browser window from appearing
HEADLESS=true bun x playwright screenshot \
  --viewport-size=1600,2400 \
  --full-page \
  http://localhost:$TTYD_PORT \
  /tmp/tui-visual-test/storybook.png

# View with Read tool
```

### Capture Full TUI

```bash
rm -rf /tmp/tui-test-vault
cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/tui-test-vault

# Get a free port
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done

ttyd -W -p $TTYD_PORT bun km view -r /tmp/tui-test-vault @next.md &
sleep 3

# HEADLESS=true prevents browser window from appearing
# Use 1000,700 for faster captures; 1400,900 only for multi-column layout testing
HEADLESS=true bun x playwright screenshot \
  --viewport-size=1000,700 \
  http://localhost:$TTYD_PORT \
  /tmp/tui-visual-test/tui.png
```

### Playwright Options

| Option               | Example    | Purpose                         |
| -------------------- | ---------- | ------------------------------- |
| `--viewport-size`    | `1400,900` | Set browser viewport            |
| `--full-page`        | (flag)     | Capture full scrollable content |
| `--wait-for-timeout` | `2000`     | Wait ms before capture          |

**Best for**: Testing actual terminal rendering, regression testing, before/after comparisons, CI pipelines.

## Method 3: Interactive (Peekaboo) - LAST RESORT ONLY

### ⛔ STOP - READ THIS FIRST ⛔

**DO NOT USE PEEKABOO** unless ALL of the following are true:

1. ✅ You have tried ttyd + Playwright at least **10 times** with different approaches
2. ✅ You have created a **bead** documenting what's broken
3. ✅ You have **asked the user explicitly** and received a clear **"yes"**

If ANY of these are false, go back to the troubleshooting section above.

### Why Peekaboo is Problematic

- Takes over the user's desktop
- Prevents them from doing other work
- Requires them to be actively watching
- Indicates a bug in our headless testing infrastructure (fix that instead!)

### Asking for Permission (MANDATORY)

```
AskUserQuestion:
  question: "I've tried ttyd+Playwright 10+ times without success.
            May I use Peekaboo to capture your Ghostty window?"
  options:
    - "Yes, go ahead"
    - "No, describe what you tried and I'll help debug"
```

**You MUST receive "Yes, go ahead" before proceeding.**

### Via MCP Tools (only after explicit user approval)

```json
{
  "app_target": "Ghostty",
  "path": "/tmp/tui-visual-test/capture.png",
  "format": "png"
}
```

### Via CLI (only after explicit user approval)

```bash
peekaboo image --app "Ghostty" --path /tmp/capture.png
```

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

### Port in use

```bash
# Find who's using your port
lsof -i :$TTYD_PORT
# Get a new port
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done
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

## OpenTUI + ttyd/xterm.js Compatibility

**OpenTUI works with ttyd/xterm.js** but requires specific configuration.

### The Problem

By default, OpenTUI uses the terminal's alternate screen buffer, which xterm.js (ttyd's terminal emulator) handles differently than native terminals. This causes blank screenshots.

### The Solution

Set `OTUI_USE_ALTERNATE_SCREEN=false` to render in the main screen buffer:

```bash
# Working configuration for OpenTUI + ttyd (use dynamic $TTYD_PORT)
COLORTERM=truecolor \
TERM=xterm-256color \
OTUI_USE_ALTERNATE_SCREEN=false \
ttyd -W -p $TTYD_PORT bun km view -r /tmp/test-vault @next.md &
```

### Full Capture Example

```bash
# 1. Prepare test data
rm -rf /tmp/test-vault && mkdir -p /tmp/test-vault
cat > /tmp/test-vault/@next.md << 'EOF'
# Next
- [ ] Test task 1
- [/] In progress
- [x] Completed
EOF

# 2. Get a free port
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done

# 3. Start ttyd with OpenTUI-compatible settings
COLORTERM=truecolor \
TERM=xterm-256color \
OTUI_USE_ALTERNATE_SCREEN=false \
ttyd -W -p $TTYD_PORT bun km view -r /tmp/test-vault @next.md &
sleep 5  # OpenTUI needs more startup time than Ink

# 4. Capture with proper wait for xterm.js rendering
HEADLESS=true bun x playwright screenshot \
  --viewport-size=1000,700 \
  --wait-for-timeout=2000 \
  http://localhost:$TTYD_PORT \
  /tmp/opentui-capture.png

# 5. View the screenshot
# Use Read tool on /tmp/opentui-capture.png
```

### Key Environment Variables

| Variable                    | Value            | Purpose                               |
| --------------------------- | ---------------- | ------------------------------------- |
| `OTUI_USE_ALTERNATE_SCREEN` | `false`          | **Required** - Renders in main buffer |
| `COLORTERM`                 | `truecolor`      | Signals 24-bit color support          |
| `TERM`                      | `xterm-256color` | Standard terminal type (default)      |

### Other OpenTUI Variables (optional)

| Variable                | Default | Purpose                                |
| ----------------------- | ------- | -------------------------------------- |
| `OPENTUI_FORCE_UNICODE` | `false` | Force Mode 2026 Unicode                |
| `OPENTUI_FORCE_WCWIDTH` | `false` | Use wcwidth for char width             |
| `OPENTUI_NO_GRAPHICS`   | `false` | Disable Kitty graphics                 |
| `OTUI_DEBUG`            | `false` | Enable debug logging                   |
| `OTUI_NO_NATIVE_RENDER` | `false` | Disable Zig rendering (debugging only) |

### Timing Considerations

OpenTUI takes longer to initialize than Ink-based TUIs:

- **Startup**: Use `sleep 5` after launching ttyd (vs `sleep 3` for Ink)
- **Rendering**: Use `--wait-for-timeout=2000` in Playwright
- **Capability detection**: OpenTUI queries terminal capabilities on startup (5s timeout)

### xterm.js True Color Support

xterm.js **fully supports 24-bit true color** (since v3.13.0). The blank screen issue is NOT a color limitation - it's the alternate screen buffer handling.

### No Compatibility Mode

OpenTUI has **no built-in compatibility mode** that restricts to standard ANSI sequences. However, `OTUI_USE_ALTERNATE_SCREEN=false` is sufficient for xterm.js compatibility.

---

## Rendering Specifications

Reference for what to verify in screenshots.

### Architecture Layers

```
Layer 1: Text Rendering
├── rich.ts      → renderRich(), stripInlineFields(), styleWikiLinks()
└── icons.ts     → getStatusIcon(), getTypeIcon(), colorize()

Layer 2: Layout
├── truncate.ts  → truncateText(), displayLength()
├── wrap.ts      → wrapText()
├── constrain.ts → constrainText(), padText()
└── path.ts      → renderPath(), renderParentPath()

Layer 3: Components
├── TreeNode.tsx    → Task rendering, selection, fold state
├── ListView.tsx    → Full-width hierarchical view
├── ColumnsView.tsx → Multi-column tree view
├── TabsView.tsx    → Tabbed single-column view
└── Board.tsx       → Main board container, top bar
```

### Status Icons

| Marker | Status  | Icon | Color  |
| ------ | ------- | ---- | ------ |
| `[ ]`  | todo    | ○    | gray   |
| `[x]`  | done    | ✓    | green  |
| `[/]`  | wip     | ◐    | yellow |
| `[!]`  | blocked | ⊘    | red    |
| `[-]`  | dropped | ∅    | gray   |

### Rich Text Rendering

| Input                     | Output                 |
| ------------------------- | ---------------------- |
| `[field:: value]`         | (removed)              |
| `[[note]]`                | dim underlined "note"  |
| `[[path/to/note\|Title]]` | dim underlined "Title" |
| `**bold**`                | **bold**               |
| `*italic*`                | _italic_               |
| `` `code` ``              | cyan monospace         |
| `~~strike~~`              | ~~strikethrough~~      |

### Selection & States

| State          | Visual                       |
| -------------- | ---------------------------- |
| Normal         | Default colors               |
| Selected       | Cyan background + black text |
| Multi-selected | Cyan background + black text |
| Done           | Strikethrough + dim          |
| Dropped        | Strikethrough + dim          |
| Folded         | ▶ prefix                     |
| Expanded       | ▼ prefix                     |

### Views

| View    | Key | Layout                     |
| ------- | --- | -------------------------- |
| Cards   | `1` | Kanban cards in columns    |
| Columns | `2` | Tree outline in columns    |
| Tabs    | `3` | Single column with tab bar |
| List    | `4` | Full-width hierarchical    |

## Verification Checklist

Quick checklist for visual testing:

- [ ] Status icons: correct shape and color for each marker
- [ ] Rich text: bold, italic, code, strikethrough rendered
- [ ] Wiki links: dim + underlined, aliases show title only
- [ ] Inline fields: `[key:: value]` stripped (not visible)
- [ ] Selection: cyan background + black text
- [ ] Done/dropped: strikethrough + dim
- [ ] Column headers: yellow (selected) / yellowBright+dim (unselected)
- [ ] No text overlap between columns
- [ ] Text truncates with `…` when too long

## Test Fixtures

Location: `apps/km-cli/tests/fixtures/tui-test-vault/`

The `@next.md` file includes all status types, wiki links, inline fields, nested tasks, and rich text for comprehensive testing.

## Bug Diagnosis

| Symptom                       | Layer | Files to Check               |
| ----------------------------- | ----- | ---------------------------- |
| Text not styled (bold/italic) | 1     | `src/text/rich.ts`           |
| Wiki links not dim/underlined | 1     | `src/text/rich.ts`           |
| Inline fields visible         | 1     | `src/text/rich.ts`           |
| Wrong status icon/color       | 1     | `src/text/icons.ts`          |
| Text overlap                  | 2     | `src/tui/layout/truncate.ts` |
| Bad truncation                | 2     | `src/tui/layout/truncate.ts` |
| Selection not visible         | 3     | `src/tui/views/TreeNode.tsx` |
| Done not strikethrough        | 3     | `src/tui/views/TreeNode.tsx` |
| View layout broken            | 3     | `src/tui/views/*.tsx`        |
