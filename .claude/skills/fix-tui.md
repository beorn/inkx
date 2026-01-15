# Fix TUI Visual Issues

Systematically inspect and fix TUI rendering issues using Playwright and ttyd.

## Arguments

- `<repo>` - Path to vault/repo to test (default: uses fixtures from `apps/km-cli/tests/fixtures/tui-test-vault`)
- `--headed` - Run browser in headed mode (visible window) for debugging
- `--headless` - Run browser in headless mode (default)

## Prerequisites

- ttyd installed (`brew install ttyd` or `nix-install nixpkgs#ttyd`)
- Playwright installed (`bun add -d @playwright/test`)
- Chromium browser for Playwright (`bunx playwright install chromium`)

## Workflow

1. **Start ttyd server** with the TUI viewing a test vault
2. **Capture screenshots** (headless by default, or headed for debugging)
3. **Analyze screenshots** for rendering issues
4. **Compare** against source file contents
5. **Fix issues** found in rendering code
6. **Re-test** until no issues remain

## Quick Start

```bash
# Kill any existing ttyd
pkill -f ttyd 2>/dev/null

# Set repo path (use argument or default to fixtures)
REPO_PATH="${1:-}"
if [ -z "$REPO_PATH" ]; then
  # Default: copy fixtures to /tmp for testing (avoids modifying repo fixtures)
  rm -rf /tmp/tui-test-vault
  cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/tui-test-vault
  REPO_PATH="/tmp/tui-test-vault"
fi

# Start ttyd (from km repo as CWD)
cd /Users/beorn/Code/pim/km
ttyd -W -p 7681 bun km view -r "$REPO_PATH" @next.md &
sleep 3

# Create output directory
mkdir -p /tmp/tui-visual-test

# Capture screenshots using Playwright (headless by default)
HEADLESS="${HEADLESS:-true}"
bun run /tmp/capture-tui.ts
```

## Screenshot Capture Script

Save to `/tmp/capture-tui.ts`:

```typescript
import { chromium } from "playwright";

const headless = process.env.HEADLESS !== "false";

async function run() {
  console.log(`Launching browser (headless: ${headless})...`);
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  console.log("Navigating to ttyd...");
  await page.goto("http://localhost:7681");
  await page.waitForSelector(".xterm-screen", { timeout: 10000 });
  await page.waitForTimeout(2000);

  console.log("Taking screenshots...");

  // Cards view (initial)
  await page.screenshot({ path: "/tmp/tui-visual-test/01-cards-initial.png" });

  // Navigate columns
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: "/tmp/tui-visual-test/02-cards-col5.png" });

  // Columns view
  await page.keyboard.press("v");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/tui-visual-test/03-columns-view.png" });

  // List view
  await page.keyboard.press("v");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/tui-visual-test/04-list-view.png" });

  // Navigate down in list view
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: "/tmp/tui-visual-test/05-list-navigated.png" });

  // Scroll down more
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: "/tmp/tui-visual-test/06-list-scrolled.png" });

  if (!headless) {
    console.log("Headed mode: keeping browser open for 30s for inspection...");
    await page.waitForTimeout(30000);
  }

  await browser.close();
  console.log("Done! Screenshots in /tmp/tui-visual-test/");
}

run().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
```

## Running Modes

### Headless (default)

```bash
# Using fixtures (default)
HEADLESS=true bun run /tmp/capture-tui.ts

# Using custom repo
ttyd -W -p 7681 bun km view -r /path/to/repo @next.md &
```

### Headed (for debugging)

```bash
# Opens visible browser window, keeps open for 30s after screenshots
HEADLESS=false bun run /tmp/capture-tui.ts
```

## Key Bindings

| Key      | Action                                           |
| -------- | ------------------------------------------------ |
| `v`      | Cycle view modes (cards → columns → list → tabs) |
| `↑↓←→`   | Navigate selection                               |
| `Enter`  | Expand/focus item, show detail                   |
| `Escape` | Go back/collapse                                 |
| `q`      | Quit TUI                                         |
| `?`      | Show help                                        |
| `n`      | New item dialog                                  |
| `Tab`    | Switch focus between panes                       |

## Issues Checklist

### Text Rendering

- [ ] No text concatenation/overlap between items
- [ ] Wiki links rendered correctly (dim underline)
- [ ] Inline fields stripped (not showing `[field:: value]`)
- [ ] Long text truncated with ellipsis
- [ ] Multi-line content wraps properly
- [ ] Rich text: **bold**, _italic_, `code`, ~~strikethrough~~

### Layout

- [ ] Proper spacing between items
- [ ] Column borders aligned
- [ ] Selection highlighting visible (blue background)
- [ ] Status bar shows correct view mode
- [ ] No text overflow or clipping

### Icons

- [ ] Task status icons:
  - `○` gray = todo/open
  - `✓` green = done
  - `◐` yellow = wip/in_progress
  - `⊘` red = blocked
  - `∅` gray = dropped
- [ ] Fold indicators: `▶` (folded), `▼` (expanded)
- [ ] Type icons: `📁` folder, `📄` file, `#` section, `·` list item

### Colors

- [ ] Column headers yellow
- [ ] Selected item blue background
- [ ] Dimmed text for context/metadata
- [ ] Status icon colors visible

## Iteration Loop

1. Capture screenshots
2. Read and analyze each screenshot
3. Compare against source files in vault
4. Identify rendering issues
5. Fix the issue in code
6. Re-capture screenshots
7. Verify fix
8. Repeat until all issues resolved

## Verification

```bash
# Run lint and format checks
bun fix

# Run tests
bun test

# Clean up
pkill -f ttyd
```

## Key Files

- [render-text.ts](apps/km-cli/src/tui/render-text.ts) - Text rendering functions
- [render-icons.ts](apps/km-cli/src/tui/render-icons.ts) - Icon rendering
- [TreeNode.tsx](apps/km-cli/src/tui/views/TreeNode.tsx) - Node rendering component
- [ListView.tsx](apps/km-cli/src/tui/views/ListView.tsx) - List view component
- [Board.tsx](apps/km-cli/src/tui/views/Board.tsx) - Main board component

## Test Fixtures

The test vault at `apps/km-cli/tests/fixtures/tui-test-vault/` contains:

- `@next.md` - All tasks aggregated in one board
- `Inbox.md` - Rich formatting, wiki links, edge cases
- `Projects/*.md` - All task states, priorities, dates
- `Areas/*.md` - Tables, code blocks, nested content
- `Daily/*.md` - Mixed content with wiki links
- `Resources/*.md` - Cross-references, code examples

## Troubleshooting

### Port already in use

```bash
pkill -f ttyd
lsof -i :7681  # Check what's using the port
```

### Terminal not rendering

- Increase wait time after page load
- Check if TUI crashed (look for error messages)
- Verify test vault path is correct

### Screenshots blank

- Ensure `.xterm-screen` selector exists
- Wait for terminal to initialize
- Check browser console for errors

## CI Integration

For headless CI testing:

```yaml
# In GitHub Actions
- name: Install ttyd
  run: brew install ttyd

- name: Install Playwright
  run: bunx playwright install chromium

- name: Run TUI tests
  run: |
    cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/tui-test-vault
    ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault @next.md &
    sleep 3
    HEADLESS=true bunx playwright test --config=apps/km-cli/tests/tui/playwright.config.ts
```
