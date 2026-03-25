---
description: "Visual smoke test of silvery.dev — verify all live demos, embedded apps, and page rendering via Playwright"
argument-hint: "[full | demos | pages | <url>]"
user-invocable: true
---

# Test Site — silvery.dev Visual Smoke Test

**Keywords**: test site, smoke test, visual test, examples, demos, playwright, silvery.dev

Systematically tests silvery.dev using Playwright (via `bunx @playwright/cli@latest`). Opens pages, clicks through demos, takes screenshots, checks for errors.

## Modes

| Argument | What it tests |
|---|---|
| (none) / `full` | Everything: demos + all doc pages with embeds |
| `demos` | Showcase gallery demos only |
| `pages` | Doc pages with embedded viewers only |
| `<url>` | Single URL — navigate, screenshot, report |

## Workflow

### Step 1: Open Browser

```bash
bunx @playwright/cli@latest open https://silvery.dev/examples/
```

### Step 2: Test Showcase Demos

The showcase gallery is at `/examples/`. Each demo loads via `/examples/showcase.html?demo=<id>`.

Test each demo by navigating directly to its URL (faster than clicking gallery tabs):

```
Available demos (from ShowcaseGallery.vue):
- dashboard
- kanban
- components
- dev-tools
- textarea
```

For each demo:

1. **Navigate**: `bunx @playwright/cli@latest goto "https://silvery.dev/examples/showcase.html?demo=<id>"`
2. **Wait 2 seconds** for rendering: `sleep 2`
3. **Screenshot**: `bunx @playwright/cli@latest screenshot --filename=/tmp/site-test-<id>.png`
4. **Check for errors**: Read the screenshot — look for:
   - "Unknown demo" error text (wrong demo ID)
   - Blank/empty terminal (rendering failed)
   - Red error messages
   - Missing content
5. **Check console**: `bunx @playwright/cli@latest console` — note any errors beyond the known `xterm.css` 404

### Step 3: Test Gallery Interaction

Go back to the examples page and test the gallery UI:

1. Navigate to `https://silvery.dev/examples/`
2. Take a snapshot to find gallery tab buttons
3. Click each tab, wait 2s, screenshot
4. Verify: tab highlight updates, iframe content changes, no blank frames

### Step 4: Test Homepage Viewer

1. Navigate to `https://silvery.dev/`
2. Screenshot the page — verify the embedded viewer iframe renders
3. Check the viewer shows the default demo (dashboard)

### Step 5: Test Individual Example Pages

Navigate to each example page that has embedded content:

```
/examples/components
/examples/ai-chat
/examples/forms
/examples/tables
/examples/scrollback
/examples/terminal
/examples/testing
/examples/layout
```

For each: screenshot and verify the page renders (may have code blocks, iframes, or static content).

### Step 6: Check Page-Level Issues

For any page visited, check:
- **Padding**: Terminal content should have padding from the window border (8px minimum)
- **Console errors**: Note any 404s, JS errors, or failed resource loads
- **Broken links**: If visible navigation links lead to 404, note them
- **Dark/light theme**: Take one screenshot in each theme mode if time permits

## Report Format

```markdown
## Site Test: silvery.dev (YYYY-MM-DD)

### Demos
| Demo | Status | Screenshot | Issues |
|---|---|---|---|
| dashboard | OK | /tmp/site-test-dashboard.png | — |
| kanban | OK | /tmp/site-test-kanban.png | — |
| components | BROKEN | /tmp/site-test-components.png | Error: "..." |

### Pages
| Page | Status | Issues |
|---|---|---|
| / (homepage) | OK | — |
| /examples/ | OK | — |
| /examples/ai-chat | WARN | Missing embedded demo |

### Console Errors
- xterm.css 404 (known, cosmetic — fallback CSS loads)
- <any new errors>

### Visual Issues
- <padding, alignment, overflow, etc.>

### Summary
N demos tested, M working. N pages tested, M with issues.
```

## Cleanup

After testing, always clean up Playwright artifacts:

```bash
bunx @playwright/cli@latest close
rm -f /tmp/site-test-*.png
find .playwright-cli -type f -delete 2>/dev/null
find .playwright-cli -type d -empty -delete 2>/dev/null
```

## When to Run

- After any docs deployment (push to silvery main that touches docs/)
- After changing ShowcaseGallery.vue or showcase-app.tsx
- After rebuilding example bundles (examples/web/build.ts)
- Before releases
- When user reports broken examples

## Updating This Skill

When new demos are added to `ShowcaseGallery.vue` or new example pages are created, update the demo list and page list above.

The source of truth for available demos is:
- `vendor/silvery/examples/web/showcases/index.tsx` — SHOWCASES registry
- `vendor/silvery/docs/.vitepress/components/ShowcaseGallery.vue` — gallery UI
