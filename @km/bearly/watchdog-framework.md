---
id: "@km/bearly/watchdog-framework"
aliases:
  - km-bearly.watchdog-framework
  - km-bearly-watchdog-framework
created_by: Bjørn Stabell
created_at: 2026-04-15T18:29:41Z
---

# [ ] Watchdog framework — defineWatchdog() + migrate qmd + add bd-dolt-server @km/bearly #task #P1

blocks:: [[@km/bearly]]

Extract a general-purpose watchdog framework in `vendor/bearly/tools/lib/watchdog/`, migrate the existing one-off (qmd-watchdog) to it, and add bd-dolt-server as the second consumer. Ship all three pieces together so the framework has two real callers from day one.

## Motivation

We already have `vendor/bearly/tools/qmd-watchdog.ts` (~266 LOC) doing this pattern: probe → detect failure → kill + restart → log structured incident → backoff. The 2026-04-15 bd migration from embedded-dolt to dolt_mode=server creates a second long-running helper process that needs the same supervision (see notes below). Writing a second 250-LOC script would just seed the "rule of three" refactor later — extract now.

## Scope (one PR, three phases)

### Phase 1: Framework
Create `vendor/bearly/tools/lib/watchdog/` with:
- `defineWatchdog(config)` factory — returns a `run()` handle
- Probe scheduler (interval + jitter, pause on process suspend)
- Exponential backoff with `max` cap + incident cap per window (e.g. max 5 restarts/hour → bail + loud log)
- Structured JSONL incident log (shared schema across all watchdogs)
- Optional publish to tribe health-monitor (`bearly/tools/lib/tribe/health-monitor-plugin.ts`) via a `healthMetric` field — key becomes `watchdog.<name>.up`
- SIGTERM/SIGHUP handling (flush incident log, graceful probe cancel)
- Unit tests: fake clock, probe returns fail → recover called → backoff applied → incident logged

Declaration shape:
```ts
defineWatchdog({
  name: "bd-dolt",
  probe: () => bash("bd dolt test"),
  recover: () => bash("bd dolt killall && bd dolt start"),
  interval: "5m",
  backoff: { type: "exponential", initial: "30s", max: "1h" },
  incidentCap: { max: 5, window: "1h" },
  incidentLog: ".beads/watchdog-incidents.jsonl",
  healthMetric: "bd.dolt.up",
})
```

### Phase 2: Migrate qmd-watchdog
- Port `vendor/bearly/tools/qmd-watchdog.ts` to use `defineWatchdog()`
- Keep behavior: no-progress timer, RSS ceiling, wall-clock cap → these become `probe` predicates combined via `anyOf(...)`
- Cut from ~266 LOC to a declaration + small qmd-specific helpers
- Incident log format stays backward-compatible (or migration script if schema changes)
- Regression test: kill stuck qmd child → verify restart + incident entry

### Phase 3: Add bd-dolt-server watchdog
- New file `vendor/bearly/tools/bd-dolt-watchdog.ts` using `defineWatchdog()`
- Runs via launchd user agent OR as a tribe-daemon plugin (decide during implementation — plugin is cheaper, launchd survives tribe-daemon crashes)
- Failure modes to cover:
  - Server crashes but `.beads/dolt-server.pid` lingers → `bd dolt test` fails → killall + start
  - Port collides after reboot → same path, `bd dolt start` picks a new port
  - Stale `dolt-server.lock` blocks auto-start → `killall` clears it
  - Server alive but queries time out → `bd dolt test` has timeout, recovery fires
- Reference: the 2026-04-15 bd migration already printed `Warning: Dolt server endpoint changed: port 51912 → 65376 (auto-start)` — bd itself handles "stale port, no server" recovery, so we mostly guard against "process exists but hung"

## Context

bd sql-server mode provides 5.6× per-call speedup (730ms → 130ms) but introduces a long-running process dependency. Vault beads has been running server mode 3d+ without issue, so failure rate is low — this is a "known unknown" risk buffer, not an active fire. Upstream bd ships `bd dolt killall` + `bd dolt start` + `bd dolt test` specifically because orphan/stale-server situations happen — we should assume we'll hit them.

## Candidates for future adoption
- silvery dev-server (if it becomes long-running)
- tribe-daemon itself (meta-watchdog — launchd-level)
- @km/_orphan/cli sync daemon (if it ever splits out)

Each of these should become a 5-LOC `defineWatchdog()` declaration, not a new 250-LOC script.

## Acceptance
- [ ] `vendor/bearly/tools/lib/watchdog/index.ts` exports `defineWatchdog`
- [ ] Unit tests cover: fake-clock scheduling, backoff, incident cap, SIGTERM flush
- [ ] `qmd-watchdog.ts` rewritten via `defineWatchdog`; old behavior preserved
- [ ] `bd-dolt-watchdog.ts` new, runs via chosen mechanism (launchd/plugin)
- [ ] Tribe health-monitor shows `watchdog.bd-dolt.up` + `watchdog.qmd.up` metrics
- [ ] Both watchdogs survive a forced kill of their target and recover within one interval