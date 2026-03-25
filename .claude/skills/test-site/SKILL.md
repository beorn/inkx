---
description: "AI-driven visual smoke test — explore any website via Playwright, find interactive elements, verify they work"
argument-hint: "<url> [depth]"
user-invocable: true
---

# Test Site — AI-Driven Visual Smoke Test

**Keywords**: test site, smoke test, visual test, examples, demos, playwright, website, QA

AI-driven website testing via Playwright. Discovers pages, finds interactive elements, tests them, and reports issues. Works on any site — no hardcoded selectors or test scripts.

## How It Works

Unlike traditional test scripts, this skill uses AI judgment:
1. **Explore** — navigate the site, read the page structure
2. **Discover** — find interactive elements (tabs, buttons, demos, forms, iframes)
3. **Test** — interact with each element, screenshot before/after, check for errors
4. **Report** — structured findings with screenshots and console errors

No hardcoded selectors. The AI reads the page snapshot and decides what to test.

## Usage

```
/test-site https://silvery.dev
/test-site https://silvery.dev deep       # follow internal links
/test-site https://silvery.dev/examples/  # test specific page
```

## Workflow

### Phase 1: Discover

```bash
bunx @playwright/cli@latest open <url>
bunx @playwright/cli@latest snapshot
```

Read the snapshot. Identify:
- **Navigation** — sidebar links, nav menus, tabs
- **Interactive elements** — buttons, inputs, selects, iframes, embedded apps
- **Live demos** — terminal emulators, code playgrounds, interactive widgets
- **Sub-pages** — internal links worth following (for `deep` mode)

### Phase 2: Test Current Page

For each interactive element found:

1. **Screenshot before**: `bunx @playwright/cli@latest screenshot --filename=/tmp/test-site-before-<name>.png`
2. **Interact**: click, type, press keys as appropriate
3. **Wait**: `sleep 2` for rendering
4. **Screenshot after**: `bunx @playwright/cli@latest screenshot --filename=/tmp/test-site-after-<name>.png`
5. **Read both screenshots** — compare visually:
   - Did the UI respond? (not frozen/broken)
   - Is content rendering? (not blank/error)
   - Any visual glitches? (overflow, misalignment, missing padding)
6. **Check console**: `bunx @playwright/cli@latest console` — note errors

#### Testing interactive elements by type

**Tabs/buttons**: Click each one. Verify content changes. Check for error states.

**Embedded terminals (xterm iframes)**: Click to focus, verify terminal content renders (not blank). Look for error messages in the terminal output.

**Forms/inputs**: Type test data, verify it appears. Submit if possible, check response.

**Navigation links**: Click, verify page loads without 404. Go back.

**Dropdown menus**: Open, verify options render, select one, verify change.

### Phase 3: Follow Links (deep mode only)

If `deep` is specified, follow internal links:

1. Collect all internal links from the page
2. Group by section (avoid testing every blog post — sample 1-2 per section)
3. Navigate to each, run Phase 2
4. Go back, continue

**Depth limit**: 2 levels from the starting URL. Don't crawl the entire internet.

### Phase 4: Report

```markdown
## Site Test: <url> (YYYY-MM-DD)

### Pages Tested
| Page | Status | Issues |
|---|---|---|
| / | OK | — |
| /examples/ | WARN | 2 demos show error text |
| /api/ | OK | — |

### Interactive Elements
| Page | Element | Action | Result |
|---|---|---|---|
| /examples/ | Tab "Dashboard" | click | OK — terminal renders |
| /examples/ | Tab "Task List" | click | BROKEN — "Unknown demo" error |
| /api/box | Code block | — | OK — syntax highlighted |

### Visual Issues
- /examples/: Terminal content has no padding from container border
- /api/text: Code example overflows on mobile width

### Console Errors
| Page | Error | Severity |
|---|---|---|
| /examples/ | 404 xterm.css (node_modules path) | Low — fallback CSS loads |
| /api/ | None | — |

### Screenshots
Saved to /tmp/test-site-*.png

### Summary
N pages tested, M interactive elements checked. X issues found (Y blocking, Z cosmetic).
```

## Best Practices

**Adapt to what you see.** Don't follow a rigid script. If the page has a search bar, search something. If it has a theme toggle, toggle it. If it has a code example with a "copy" button, click it.

**Test the happy path first.** Click the obvious buttons, fill the obvious forms. Then try edge cases (empty input, rapid clicks, resize).

**Screenshot strategically.** Don't screenshot every page — screenshot state changes (before/after click, error states, different tabs).

**Check iframes separately.** If the page embeds an iframe, navigate to the iframe URL directly for better inspection. Gallery/showcase patterns often load demos via iframe.

**Note what you CAN'T test.** Some things need real user interaction (drag-and-drop, long-press, complex gestures). Flag these as "manual test needed" rather than skipping silently.

**Be exhaustive, not sampled.** Click EVERY tab, EVERY nav item, EVERY demo. Don't sample — test them all. The goal is 100% coverage of interactive elements on each page.

**Write ad-hoc Playwright scripts for complex interactions.** When `bunx @playwright/cli@latest` CLI commands aren't sufficient (e.g., testing iframe content, waiting for animations, or running multi-step sequences), write and execute a Playwright script:

```bash
bunx @playwright/cli@latest run-code "async page => {
  // Navigate into iframe
  const frame = page.frameLocator('iframe.gallery-iframe')

  // Wait for terminal to render
  await frame.locator('.xterm-screen').waitFor({ timeout: 5000 })

  // Check terminal has content (not blank)
  const text = await frame.locator('.xterm-screen').textContent()
  if (!text || text.trim().length < 10) {
    console.log('BROKEN: terminal is blank or near-empty')
  } else {
    console.log('OK: terminal has content')
  }
}"
```

Use this for:
- **iframe content inspection** — Playwright CLI snapshots don't see inside iframes
- **Waiting for async rendering** — demos that take time to initialize
- **Multi-step interaction sequences** — type → wait → verify → type more
- **Extracting specific DOM state** — checking attributes, computed styles, element counts
- **Batch testing** — loop through all links/tabs in one script

## Cleanup

```bash
bunx @playwright/cli@latest close
rm -f /tmp/test-site-*.png
find .playwright-cli -type f -delete 2>/dev/null
find .playwright-cli -type d -empty -delete 2>/dev/null
```

## When to Run

- After docs deployments
- After changing embedded demos or interactive components
- Before releases
- When users report broken pages
- Periodically as a health check
