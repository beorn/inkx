---
id: "@km/all/runtime-portability"
aliases:
  - km-all.runtime-portability
  - km-all-runtime-portability
created_by: claude:65d845d9
created_at: 2026-03-15T16:12:15Z
closed_at: 2026-03-15T16:24:06Z
owner: bjorn@stabell.org
assignee: claude:65d845d9
---

# [x] Runtime portability: Bun + Node.js support across vendor packages @km/all #task #P2 @claude:65d845d9

Make all vendor packages work on Node.js (not just Bun). Inline spawn abstractions per-package (no cross-deps). Replace Bun.spawn/Bun.sleep with runtime-detecting helpers. Update docs/engines/READMEs to clarify supported runtimes.

Packages:
- loggily: already portable, docs only
- flexily: already portable, docs only  
- silvery: core already portable, docs only
- mdspec: replace Bun.spawn in CmdSession/PtySession/bash-plugin, replace Bun.sleep
- termless: replace Bun.spawn in pty.ts, update peekaboo