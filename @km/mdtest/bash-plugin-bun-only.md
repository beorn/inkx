---
id: "@km/mdtest/bash-plugin-bun-only"
aliases:
  - km-mdtest.bash-plugin-bun-only
  - km-mdtest-bash-plugin-bun-only
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:48Z
closed_at: 2026-03-14T01:29:26Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] mdtest: bash plugin hard-wired to Bun, breaks Vitest @km/mdtest #bug #P1

Built-in bash plugin imports and calls bunShell() which depends on Bun.spawn. Vitest integration runs under Node where Bun is not available. vitestShell() exists but is never injected into the plugin path. Fix: make shell execution an injected dependency via ShellAdapter. plugins/bash.ts:8,68-71,114-118. Found by GPT 5.4 Pro review.