---
id: "@km/bearly/tribe-chief-runbook"
aliases:
  - km-bearly.tribe-chief-runbook
  - km-bearly-tribe-chief-runbook
created_by: claude:19080504
created_at: 2026-03-26T16:43:39Z
closed_at: 2026-03-26T16:48:16Z
close_reason: Runbook created, noise fix landed (dedup + cursor recovery),
  message format rules in MCP instructions, sync protocol updated, all committed
  and pushed
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Tribe chief runbook: noise, readability, health checks, auto-reload @km/bearly #feature #P1 @claude:19080504

Comprehensive improvements to tribe coordination quality:

1. MESSAGE NOISE: Fix N-way commit duplication (all sessions report same commit), message replay after compaction, broadcast storms from overlapping sync requests
2. READABILITY: Messages must be short plain text (1-3 lines), no markdown (renders as ugly escaped \n and **)
3. HEALTH CHECKS: Chief must ensure all sessions have correct names, are on latest code, are connected to tribe, and are unblocked
4. AUTO-RELOAD: After any tribe code change, broadcast reload instruction. If reload won't fix it, tell user to restart session
5. tribe_join HANG: All tribe_* MCP calls hang — likely SQLite contention from 16+ orphan MCP processes
6. UserPromptSubmit HOOK ERROR: Investigate hook that fires on every message
7. RUNBOOK: Create formal chief runbook (not playbook) with all responsibilities
8. ORPHAN CLEANUP: Dead tribe MCP processes accumulate, need aggressive pruning