---
tags:
  - epic
  - P2
mentions:
  - bearly
  - km
id: "@km/bearly"
aliases:
  - km-bearly
  - "@km/_orphan/bearly"
created_by: claude:19080504
created_at: 2026-03-25T17:58:20Z
owner: bjorn@stabell.org
---

# [ ] bearly: reusable Claude Code tools monorepo (@bearly/*) @km/bearly #epic #P2

Unified monorepo for reusable Claude Code tools at github.com/beorn/bearly. Merges beorn/tools + beorn/bearlymade. npm scope @bearly/*, Claude marketplace 'bearly'. Packages: tribe, tty, llm, recall, refactor, worktree (as @bearly/*) + alien-projections, alien-resources, vitest-silvery-dots (bare names).

- [ ] vendor/bearly: collapse two InjectSkipReason definitions into one canonical export #bug #2 @issue priority:: 2

  ## Problem
  
  Two separate definitions of InjectSkipReason in vendor/bearly:
  
  1. vendor/bearly/plugins/tribe/lore/lib/rpc.ts:257 (older, narrower set)
  2. vendor/bearly/plugins/recall/src/lib/prompt-filter.ts:9 (newer, includes 'no_anchor_overlap')
  
  Drift caused TS2322 in vendor/bearly/tools/lib/tribe/lore-handlers.ts when the recall version added a new member. Just patched: added 'no_anchor_overlap' to the rpc.ts version. Real fix: one canonical definition.
  
  ## Reframe
  
  Either:
  A) rpc.ts re-exports from prompt-filter.ts (recall is canonical owner)
  B) Both import from a shared types module
  
  ## Acceptance
  
  - Single source of truth for InjectSkipReason
  - Future additions to the union update both call sites by virtue of one import
  - typecheck baseline doesn't regress

