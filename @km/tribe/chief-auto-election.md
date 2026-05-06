---
mentions:
  - km
id: "@km/tribe/chief-auto-election"
aliases:
  - km-tribe.chief-auto-election
  - km-tribe-chief-auto-election
created_by: Bjørn Stabell
created_at: 2026-04-15T07:44:16Z
closed_at: 2026-04-18T18:11:39Z
close_reason: >-
  All three layers shipped across 2026-04-18 session.

  - Layer 1 (health plugin alert): bearly a77d619

  - Layer 2 (daemon auto-promotion): bearly 52563cb (km bump e59247719)

  - Layer 3 (dead-letter routing): bearly a77d619


  Layer 2 impl: tools/lib/tribe/chief-promotion.ts — pure decision function +
  side-effect wrapper. Picks longest-running eligible member (excludes watch-*,
  pending-*, daemon) after 5 min grace, calls acquireLease on their behalf,
  broadcasts chief:auto-promoted. Daemon runs check every 60s + one-shot at 10s
  after boot. Tie-breaking: started_at then alphabetical name. Race-safe via
  acquireLease granted-check.


  12 new tests (9 pure + 3 integration). 545 bearly tests pass. Daemon PID 80740
  running new code.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.chief-auto-election
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T11:00:13Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] Chief auto-election: promote longest-running member when lease expires @km/tribe #task #P2

blocks:: [[@km/tribe]]

The current chief election is opt-in: a session must explicitly join with role='chief'. If that session dies, the lease expires and nothing takes over — the throne sits empty. Today I found the lease had been expired since 2026-04-03, 12 days. This bead covers three layered fixes:

Layer 1 (health plugin alarm, ~30 LOC): in vendor/bearly/tools/lib/tribe/health-monitor-plugin.ts, add a periodic check via getLeaseInfo(db). When lease_until < now - 5min, emit a 'health:chief:expired' warning broadcast to '*'. Rate-limit to once per hour per daemon.

Layer 2 (daemon auto-promotion, ~80 LOC + test): in vendor/bearly/tools/tribe-daemon.ts, add a periodic task that after 5-minute grace of an expired lease, picks the longest-running active member and promotes them to chief by calling acquireLease() on their behalf. Broadcast 'promoted: $name → chief (auto, lease was expired $n min)'. Closes the structural gap — the tribe becomes self-healing.

Layer 3 (dead-letter broadcast, small): wrap ctx.sendMessage so messages addressed to 'chief' fall through to '*' when no chief holds the lease. Drains the dead-letter queue (found 23 unread messages to 'chief' this session). See health-monitor-plugin.ts:1076-1081 for the current 'sendMessage(chief, ...)' call sites.

Parent: @km/tribe/reliability-sweep-0415. Non-blocking — the tracking bead can close without this.

