---
mentions:
  - km
  - claude
id: "@km/silvery/examples-audit"
aliases:
  - km-silvery.examples-audit
  - km-silvery-examples-audit
created_by: claude:491faf6c
created_at: 2026-03-25T19:17:03Z
closed_at: 2026-03-25T23:56:05Z
close_reason: Fixed 9 hardcoded color issues across example apps (semantic
  tokens). Fixed inline-bench.tsx import.meta.main guard. Added padding to
  scroll.tsx.
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] silvery.dev examples: broken demos, missing padding, visual polish @km/silvery #bug #P2 @claude:19080504

## Showcase Demo Visual Quality Tracker

### Iteration Loop (tight)

1. Edit demo → 2. `bun examples/web/build.ts` → 3. `bun run scripts/generate-screenshots.ts --demo <id>` → 4. `Read screenshot.png` → 5. `bun llm --image screenshot.png --model gpt-4o -y "Rate 1-10, top 3 issues"` → repeat

### Current Ratings (GPT-4o with actual images, 2026-03-25)

| Demo       | Rating | Twitter? | Top Issues                                                              |
| ---------- | ------ | -------- | ----------------------------------------------------------------------- |
| dashboard  | 5-7/10 | No       | Truncated "Fre", network overflow, empty History, manual bar width calc |
| kanban     | 7/10   | No       | Right gap (xterm), card spacing                                         |
| components | 8/10   | Almost   | Minor spacing                                                           |
| dev-tools  | 7/10   | No       | Dense, small text                                                       |
| textarea   | 7/10   | No       | Right gap, Notes pane narrow                                            |

### Issues Found by Model (dashboard)

**Claude Sonnet 4.6 (5/10 — harshest, most thorough):**

- CRITICAL: "Fre" truncated mid-word in Memory legend
- CRITICAL: Network "Packets In: 10_" cut off at panel edge
- Empty "History" section = dead space
- Process table only 2 rows visible
- Inconsistent inner padding across panels
- "Tick #16" exposed implementation detail
- Crosshatch bar pattern noisy
- No terminal chrome/bezel
- Manual barWidth calculation = anti-Silvery-Way
- "Top Consumers" is prose, not a table
- Low resolution (770x496)

**GPT-5.4 (6.5/10):**

- Screenshot visibly cropped at bottom
- Heading hierarchy only moderately clear

**v0.dev (most rendering bugs):**

- "21030pustgres" — data running into PID column
- "2 M91" in Network section appears corrupted
- Inconsistent bar colors (82% magenta but 72% green)
- Mixed bar styles (solid vs hatched)

### Root Cause

Manual dimension calculations (`barWidth = width - 20`) instead of flexbox. Content overflow instead of truncation. These violate The Silvery Way principles.

### Target

- All demos 8+/10
- All pass Twitter test
- Zero truncation/overflow bugs
- All using flexbox, no manual width calcs

