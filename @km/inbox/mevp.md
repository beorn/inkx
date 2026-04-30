---
id: "@km/inbox/mevp"
aliases:
  - km-mevp
  - "@km/_orphan/mevp"
created_at: 2026-01-15T16:31:08Z
closed_at: 2026-01-15T22:46:23Z
---

# [x] TUI2: [Pnull] prefix shown on all tasks @km/_orphan #bug #P1

TUI2 shows '[Pnull] [ ] Task name' instead of properly formatted task markers. The priority/project indicator is rendering 'null' instead of being hidden when not set. Compare TUI1 (shows '○ Short task') vs TUI2 (shows '[Pnull] [ ] Short task').