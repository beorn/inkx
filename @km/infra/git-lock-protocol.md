---
id: "@km/infra/git-lock-protocol"
aliases:
  - km-infra.git-lock-protocol
  - km-infra-git-lock-protocol
created_by: Bjørn Stabell
created_at: 2026-04-09T06:44:57Z
closed_at: 2026-04-09T06:57:04Z
owner: bjorn@stabell.org
---

# [x] Tribe git lock mediation — detect, attribute, coordinate @km/infra #feature #P2

Git index.lock conflicts are a recurring issue with concurrent agents on the same worktree.

## Problem
Agents hit index.lock, retry blindly or fail. No communication about who holds the lock or why. Health monitor detects locks but doesn't mediate.

## Proposed protocol
1. Health monitor detects lock via lsof, identifies owning PID/session
2. Broadcasts: "git lock held by <session> (PID <pid>) for <duration>"
3. Conflicting session gets a DM: "git lock held by <owner> — wait or ask them"
4. Owner session gets a DM: "your git lock is blocking <requester>"
5. Long-held locks (>30s) get escalated as warnings

## Implementation
- Extend health-monitor-plugin.ts git lock detection (already exists)
- Add lsof-based owner attribution
- Add tribe messaging on conflict detection
- Optional: agents announce "starting git operation" before long git commands