---
mentions:
  - km
id: "@km/tui2/19-add-env-var-to-bypass-tty-check-for-headless-testi"
aliases:
  - km-tui2.19
  - km-tui2-19
  - "@km/tui2/19"
created_at: 2026-01-16T22:08:41Z
closed_at: 2026-01-16T22:24:42Z
---

# [x] Add env var to bypass TTY check for headless testing @km/tui2 #task #P2

The TTY check at tui2.tsx:127 prevents headless testing via ttyd + Playwright.

Proposed: Add FORCE_TTY=1 or CI=true bypass for testing.

**Files**: apps/@km/_orphan/cli/src/tui2/tui2.tsx

