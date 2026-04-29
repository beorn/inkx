---
id: "@km/mdspec/tape"
aliases:
  - km-mdspec.tape
  - km-mdspec-tape
created_by: claude:4929065a
created_at: 2026-04-02T06:54:24Z
closed_at: 2026-04-02T07:16:58Z
close_reason: "Implemented: tape plugin with visual regression, plugin-aware
  language filter, SVG screenshot comparison. 21 tests."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] mdspec tape plugin: executable terminal demos with visual regression @km/mdspec #feature #P2 @claude:4929065a

mdspec plugin that executes tape code blocks via termless and verifies screenshots.

## What it looks like

````markdown
```tape
Type "bun km view ~/vault"
Enter
Sleep 1s
Type "j"
Sleep 300ms
Screenshot
```
![Terminal output](screenshots/demo-01.png)
````

````markdown
```tape {backends="vterm,ghostty,xtermjs" compare="side-by-side"}
Type "echo hello"
Enter
Screenshot
```
![Cross-terminal comparison](screenshots/hello-comparison.png)
````

## Behavior

- mdspec plugin handles `tape` fenced code blocks
- Executes tape via termless in-process (not subprocess)
- Screenshot command writes PNG to path relative to the markdown file
- First run: generates image, author adds ![](path) reference
- Subsequent runs: re-generates, compares with pixelmatch
- Fails if image differs beyond threshold (visual regression)
- `--update` flag regenerates reference images

## Fence options

```tape {backend="ghostty" cols=120 rows=30 theme="dracula"}
```

- backend: which termless backend (default: vterm)
- backends + compare: multi-backend comparison mode
- cols/rows: terminal size
- theme: SVG rendering theme
- fontSize/fontFamily: typography

## Image storage

- File references (not base64) — git-diffable, doesn't bloat markdown
- Default path: `__snapshots__/` next to the markdown file
- Configurable via frontmatter or fence options

## Plugin interface

Implements mdspec Plugin interface:
- block() handles type="tape", returns executor
- Executor parses tape DSL, drives termless, writes screenshots
- Returns stdout as text description of what happened (for mdspec output matching)

## Dependencies

- @termless/core (terminal emulation + screenshots)
- @km/termless/tape (tape DSL parser — shared between CLI and plugin)
- pixelmatch or similar (image comparison)

## Open questions

- Should this be @termless/mdspec or @mdspec/tape?
- Threshold for visual diff (exact match vs % tolerance)?
- Should Screenshot auto-name images or require explicit names?