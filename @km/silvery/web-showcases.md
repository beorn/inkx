---
mentions:
  - km
  - claude
id: "@km/silvery/web-showcases"
aliases:
  - km-silvery.web-showcases
  - km-silvery-web-showcases
created_by: claude:fed8de9e
created_at: 2026-03-24T00:09:57Z
closed_at: 2026-03-24T14:56:03Z
close_reason: "Fixed: Dev Tools/Kanban contrast (-fg), Components keyboard
  scrolling. Colors were already working. Scrolling in iframes has fundamental
  limits but keyboard scrolling now works."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Fix web showcases — broken examples, duplicates, missing source tabs @km/silvery #bug #P1 @claude:fed8de9e

The silvery.dev showcases are in bad shape after era2 renames. Many don't work, are duplicated, or have rendering issues.

## Broken (disable for now)

- AI Coding Agent — rendering issues, listed twice
- Gallery — blank
- Explorer — doesn't look good
- Terminal — no events show up
- Theme Explorer — shows nothing
- Data Explorer — broken layout
- Scroll — doesn't work
- Search Filter — screen not re-rendered after typing
- Transform — rendering issues, broken borders

## Fix now

- Many showcases listed 2-3 times (duplicate registry entries)
- No showcases show SOURCE code in right tab
- Components — scrolling doesn't work on web, @silvery/ag-react should be silvery
- Dev Tools — selected line shows no indicator
- CLI Wizard — has comma-separated commands (,cd ,bun) — might be fixable

## Improvements needed

- Examples requiring full terminal should show bunx command to run locally
- Overall: strip down to what works, disable the rest, make remaining showcases excellent

