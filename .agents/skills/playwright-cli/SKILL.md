---
name: playwright-cli
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
argument-hint: <url> [action]
allowed-tools: Bash(bunx @playwright/cli*)
---

# Browser Automation with playwright-cli (via bunx)

## Quick start

```bash
# open new browser
bunx @playwright/cli@latest open
# navigate to a page
bunx @playwright/cli@latest goto https://playwright.dev
# interact with the page using refs from the snapshot
bunx @playwright/cli@latest click e15
bunx @playwright/cli@latest type "page.click"
bunx @playwright/cli@latest press Enter
# take a screenshot (rarely used, as snapshot is more common)
bunx @playwright/cli@latest screenshot
# close the browser
bunx @playwright/cli@latest close
```

## Commands

### Core

```bash
bunx @playwright/cli@latest open
# open and navigate right away
bunx @playwright/cli@latest open https://example.com/
bunx @playwright/cli@latest goto https://playwright.dev
bunx @playwright/cli@latest type "search query"
bunx @playwright/cli@latest click e3
bunx @playwright/cli@latest dblclick e7
bunx @playwright/cli@latest fill e5 "user@example.com"
bunx @playwright/cli@latest drag e2 e8
bunx @playwright/cli@latest hover e4
bunx @playwright/cli@latest select e9 "option-value"
bunx @playwright/cli@latest upload ./document.pdf
bunx @playwright/cli@latest check e12
bunx @playwright/cli@latest uncheck e12
bunx @playwright/cli@latest snapshot
bunx @playwright/cli@latest snapshot --filename=after-click.yaml
bunx @playwright/cli@latest eval "document.title"
bunx @playwright/cli@latest eval "el => el.textContent" e5
bunx @playwright/cli@latest dialog-accept
bunx @playwright/cli@latest dialog-accept "confirmation text"
bunx @playwright/cli@latest dialog-dismiss
bunx @playwright/cli@latest resize 1920 1080
bunx @playwright/cli@latest close
```

### Navigation

```bash
bunx @playwright/cli@latest go-back
bunx @playwright/cli@latest go-forward
bunx @playwright/cli@latest reload
```

### Keyboard

```bash
bunx @playwright/cli@latest press Enter
bunx @playwright/cli@latest press ArrowDown
bunx @playwright/cli@latest keydown Shift
bunx @playwright/cli@latest keyup Shift
```

### Mouse

```bash
bunx @playwright/cli@latest mousemove 150 300
bunx @playwright/cli@latest mousedown
bunx @playwright/cli@latest mousedown right
bunx @playwright/cli@latest mouseup
bunx @playwright/cli@latest mouseup right
bunx @playwright/cli@latest mousewheel 0 100
```

### Save as

```bash
bunx @playwright/cli@latest screenshot
bunx @playwright/cli@latest screenshot e5
bunx @playwright/cli@latest screenshot --filename=page.png
bunx @playwright/cli@latest pdf --filename=page.pdf
```

### Tabs

```bash
bunx @playwright/cli@latest tab-list
bunx @playwright/cli@latest tab-new
bunx @playwright/cli@latest tab-new https://example.com/page
bunx @playwright/cli@latest tab-close
bunx @playwright/cli@latest tab-close 2
bunx @playwright/cli@latest tab-select 0
```

### Storage

```bash
bunx @playwright/cli@latest state-save
bunx @playwright/cli@latest state-save auth.json
bunx @playwright/cli@latest state-load auth.json

# Cookies
bunx @playwright/cli@latest cookie-list
bunx @playwright/cli@latest cookie-list --domain=example.com
bunx @playwright/cli@latest cookie-get session_id
bunx @playwright/cli@latest cookie-set session_id abc123
bunx @playwright/cli@latest cookie-set session_id abc123 --domain=example.com --httpOnly --secure
bunx @playwright/cli@latest cookie-delete session_id
bunx @playwright/cli@latest cookie-clear

# LocalStorage
bunx @playwright/cli@latest localstorage-list
bunx @playwright/cli@latest localstorage-get theme
bunx @playwright/cli@latest localstorage-set theme dark
bunx @playwright/cli@latest localstorage-delete theme
bunx @playwright/cli@latest localstorage-clear

# SessionStorage
bunx @playwright/cli@latest sessionstorage-list
bunx @playwright/cli@latest sessionstorage-get step
bunx @playwright/cli@latest sessionstorage-set step 3
bunx @playwright/cli@latest sessionstorage-delete step
bunx @playwright/cli@latest sessionstorage-clear
```

### Network

```bash
bunx @playwright/cli@latest route "**/*.jpg" --status=404
bunx @playwright/cli@latest route "https://api.example.com/**" --body='{"mock": true}'
bunx @playwright/cli@latest route-list
bunx @playwright/cli@latest unroute "**/*.jpg"
bunx @playwright/cli@latest unroute
```

### DevTools

```bash
bunx @playwright/cli@latest console
bunx @playwright/cli@latest console warning
bunx @playwright/cli@latest network
bunx @playwright/cli@latest run-code "async page => await page.context().grantPermissions(['geolocation'])"
bunx @playwright/cli@latest tracing-start
bunx @playwright/cli@latest tracing-stop
bunx @playwright/cli@latest video-start
bunx @playwright/cli@latest video-stop video.webm
```

## Open parameters
```bash
# Use specific browser when creating session
bunx @playwright/cli@latest open --browser=chrome
bunx @playwright/cli@latest open --browser=firefox
bunx @playwright/cli@latest open --browser=webkit
bunx @playwright/cli@latest open --browser=msedge
# Connect to browser via extension
bunx @playwright/cli@latest open --extension

# Use persistent profile (by default profile is in-memory)
bunx @playwright/cli@latest open --persistent
# Use persistent profile with custom directory
bunx @playwright/cli@latest open --profile=/path/to/profile

# Start with config file
bunx @playwright/cli@latest open --config=my-config.json

# Close the browser
bunx @playwright/cli@latest close
# Delete user data for the default session
bunx @playwright/cli@latest delete-data
```

## Snapshots

After each command, bunx @playwright/cli@latest provides a snapshot of the current browser state.

```bash
> bunx @playwright/cli@latest goto https://example.com
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
[Snapshot](.bunx @playwright/cli@latest/page-2026-02-14T19-22-42-679Z.yml)
```

You can also take a snapshot on demand using `bunx @playwright/cli@latest snapshot` command.

If `--filename` is not provided, a new snapshot file is created with a timestamp. Default to automatic file naming, use `--filename=` when artifact is a part of the workflow result.

## Browser Sessions

```bash
# create new browser session named "mysession" with persistent profile
bunx @playwright/cli@latest -s=mysession open example.com --persistent
# same with manually specified profile directory (use when requested explicitly)
bunx @playwright/cli@latest -s=mysession open example.com --profile=/path/to/profile
bunx @playwright/cli@latest -s=mysession click e6
bunx @playwright/cli@latest -s=mysession close  # stop a named browser
bunx @playwright/cli@latest -s=mysession delete-data  # delete user data for persistent session

bunx @playwright/cli@latest list
# Close all browsers
bunx @playwright/cli@latest close-all
# Forcefully kill all browser processes
bunx @playwright/cli@latest kill-all
```

## Local installation

In some cases user might want to install bunx @playwright/cli@latest locally. If running globally available `bunx @playwright/cli@latest` binary fails, use `npx bunx @playwright/cli@latest` to run the commands. For example:

```bash
npx bunx @playwright/cli@latest open https://example.com
npx bunx @playwright/cli@latest click e1
```

## Example: Form submission

```bash
bunx @playwright/cli@latest open https://example.com/form
bunx @playwright/cli@latest snapshot

bunx @playwright/cli@latest fill e1 "user@example.com"
bunx @playwright/cli@latest fill e2 "password123"
bunx @playwright/cli@latest click e3
bunx @playwright/cli@latest snapshot
bunx @playwright/cli@latest close
```

## Example: Multi-tab workflow

```bash
bunx @playwright/cli@latest open https://example.com
bunx @playwright/cli@latest tab-new https://example.com/other
bunx @playwright/cli@latest tab-list
bunx @playwright/cli@latest tab-select 0
bunx @playwright/cli@latest snapshot
bunx @playwright/cli@latest close
```

## Example: Debugging with DevTools

```bash
bunx @playwright/cli@latest open https://example.com
bunx @playwright/cli@latest click e4
bunx @playwright/cli@latest fill e7 "test"
bunx @playwright/cli@latest console
bunx @playwright/cli@latest network
bunx @playwright/cli@latest close
```

```bash
bunx @playwright/cli@latest open https://example.com
bunx @playwright/cli@latest tracing-start
bunx @playwright/cli@latest click e4
bunx @playwright/cli@latest fill e7 "test"
bunx @playwright/cli@latest tracing-stop
bunx @playwright/cli@latest close
```

## Cleanup

playwright-cli leaves artifacts in the working directory after sessions:

- `.playwright-cli/` — logs and page snapshots (YAML)
- `*.png` — screenshots from `screenshot` command
- `*.yaml` — snapshots from `snapshot` command

**After finishing a playwright-cli session**, clean up:

```bash
rm -f *.png *.yaml          # screenshots and snapshots
find .playwright-cli -type f -delete 2>/dev/null
find .playwright-cli -type d -empty -delete 2>/dev/null
```

Most vendor packages already gitignore these patterns, but clean up anyway to avoid disk bloat.

## Specific tasks

* **Request mocking** [references/request-mocking.md](references/request-mocking.md)
* **Running Playwright code** [references/running-code.md](references/running-code.md)
* **Browser session management** [references/session-management.md](references/session-management.md)
* **Storage state (cookies, localStorage)** [references/storage-state.md](references/storage-state.md)
* **Test generation** [references/test-generation.md](references/test-generation.md)
* **Tracing** [references/tracing.md](references/tracing.md)
* **Video recording** [references/video-recording.md](references/video-recording.md)
