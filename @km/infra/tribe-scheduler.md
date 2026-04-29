---
id: "@km/infra/tribe-scheduler"
aliases:
  - km-infra.tribe-scheduler
  - km-infra-tribe-scheduler
created_by: Bjørn Stabell
created_at: 2026-04-09T06:09:56Z
closed_at: 2026-04-09T06:16:37Z
owner: bjorn@stabell.org
---

# [x] Tribe scheduler — deferred task queue in daemon @km/infra #feature #P3

Add a task scheduler to the tribe daemon for deferred/recurring local work.

## Motivation
Remote agents (CCR) can't run local benchmarks — hardware-specific results need local execution. Currently we use `nohup sleep && cmd` which is fragile (no retries, no reporting, lost on reboot). Tribe daemon already runs continuously and has messaging infra.

## API sketch
```
tribe schedule "bun bench" --in 3h --cwd ~/Code/pim/km
tribe schedule "bun run test:ci" --at 02:00
tribe schedule "bun bench" --every 24h --if-stale benchmarks/results/.last-bench
tribe schedule --list
tribe schedule --cancel <id>
```

## Features
- One-shot and recurring tasks
- Conditional execution (--if-stale: only run if marker file is older than interval)
- Results broadcast to tribe on completion
- Optional: spawn a Claude Code session for the task (not just bare shell)
- Persistent across daemon restarts (store in .beads or a simple JSON file)

## Non-goals
- Not a full cron replacement — just tribe-integrated deferred tasks
- Not remote execution — this is local-only (use CCR triggers for cloud)