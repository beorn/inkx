---
id: "@km/termless/pro-review-4"
aliases:
  - km-termless.pro-review-4
  - km-termless-pro-review-4
created_by: claude:65d845d9
created_at: 2026-03-14T02:12:49Z
owner: bjorn@stabell.org
---

# [ ] Pro Review 4: termless docs & positioning @km/termless #task #P3

GPT 5.4 Pro docs & positioning review for termless. Key findings:

IMPORTANT:
1. Create package chooser / start-here matrix — 'If you want X, install Y' guide
2. Adopt Playwright-like docs structure — Get started, Locators, Assertions, Screenshots, PTYs, Cross-backend, Best practices, API
3. Add caveats around '~1ms per test' claim — qualify (in-memory? single backend? no PTY?)
4. Add backend capability matrix — users need to know which backends support which features
5. Ensure @termless/test (the actual installable package) carries the useful metadata, not just monorepo root
6. Add keywords: 'terminal testing', 'vitest', 'pty', 'ansi', 'emulator', 'playwright-style'

NICE-TO-HAVE:
7. De-emphasize MCP/CLI on main landing — keep it but lower on page, not core wedge
8. More screenshot-heavy examples

OVERALL SCORE: 9/10 clarity, 7.5/10 trust — best immediate product story. 'Like Playwright but for terminal apps' is memorable.

Output: /tmp/llm-65d845d9-gpt-54-pro-docs-m3ys.txt