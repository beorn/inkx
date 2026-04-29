---
id: "@km/tribe/machine-health"
aliases:
  - km-tribe.machine-health
  - km-tribe-machine-health
created_by: Bjørn Stabell
created_at: 2026-04-06T09:53:51Z
closed_at: 2026-04-06T10:01:01Z
close_reason: "Health monitor plugin: 10s sampling, sustained CPU/memory alerts,
  process count tracking, top offenders, on-demand snapshot via tribe_health.
  Wired into daemon. 24 tests. Bearly commit b196b45."
owner: bjorn@stabell.org
---

# [x] Machine health monitoring — detect CPU/memory pressure and report to tribe @km/tribe #feature #P2

Auto-detect and report machine health metrics to the tribe so sessions can collaboratively fix runaway processes.

## Problem
When agents spawn many parallel workers (worktree agents, background tasks), processes can consume excessive CPU/memory. Currently no visibility — user has to manually check ps/htop.

## Proposed Design
A tribe plugin (or daemon extension) that:
1. Periodically samples CPU load, memory pressure, disk I/O
2. Reports to tribe when thresholds exceeded (e.g., >90% CPU for >30s, >85% memory)
3. Identifies the offending process (PID, command, session association)
4. Broadcasts alert so sessions can self-regulate (pause agents, reduce parallelism)
5. Optionally auto-kills runaway processes after configurable grace period

## Key Metrics
- CPU: load average, per-process CPU %
- Memory: system pressure, per-process RSS, swap usage
- Process count: total bun/node processes, per-session count
- Disk: I/O wait (if measurable)

## Open Questions
- Plugin vs daemon extension vs standalone monitor?
  - Plugin: runs per-session (duplicated work, but simple)
  - Daemon extension: single monitor, broadcasts to all (better, but more complex)
  - Standalone: separate process, writes to tribe socket
- How to associate PIDs with sessions? (worktree agents share parent PID)
- Should it auto-kill or just alert?
- macOS-specific APIs (Activity Monitor data) vs cross-platform (ps, /proc)?

## Prior Art
- /cpu skill already finds rogue processes — could share detection logic
- tribe daemon already has broadcast capability