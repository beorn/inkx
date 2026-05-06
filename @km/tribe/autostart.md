---
mentions:
  - km
id: "@km/tribe/autostart"
aliases:
  - km-tribe.autostart
  - km-tribe-autostart
created_by: Bjørn Stabell
created_at: 2026-04-18T17:28:44Z
closed_at: 2026-04-18T17:38:04Z
close_reason: "Fixed in bearly b53bc0a (km bump 17dc84f55): SessionStart hook
  now brings up both lore and tribe daemons via ensureAllDaemonsIfConfigured.
  New tests (22 pass) cover tribe and all-daemon paths. Runtime verified: lore
  socket spawns at ~/.local/share/lore/lore.sock, tribe socket at
  ~/.local/share/tribe/tribe.sock."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.autostart
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T10:29:05Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] Tribe daemon missing from SessionStart autostart @km/tribe #bug #P1

blocks:: [[@km/tribe]]

## Problem

`vendor/bearly/tools/lib/tribe/autostart.ts:191` calls only `resolveLoreSocketPath()` in `ensureDaemonIfConfigured`. There is no branch that brings the tribe daemon up. Combined with tribe's 30s idle auto-quit (tribe-daemon.ts), any quiet window leaves the tribe socket dead until a human runs `tribe start` or removes a stale pid.

## Symptoms observed 2026-04-18

- Lore daemon alive (autostarted by SessionStart hook via ensureDaemonIfConfigured).
- Tribe daemon dead. tribe.pid pointed at long-gone PID 37333. daemon.log ended with `Auto-quit: idle deadline reached` at 07:42:58.
- Inter-session coordination broken until manual `tribe start`.

## Root cause

One autostart function, one socket path (lore). Tribe was split from lore at package level on 2026-04-17 (vendor/bearly/CLAUDE.md) but still runs as two separate daemons with two separate sockets. The autostart helper was not updated to match.

Also: nothing reaps a stale tribe.pid on daemon exit/crash. A stale pid file silently blocks `tribe doctor` from reporting a usable state.

## Options

(a) Fold tribe into the lore daemon (single process, one socket, shared DB). Eliminates the problem class.
(b) Add tribe-socket branch to `ensureDaemonIfConfigured` so SessionStart brings both up. Smaller change, preserves current architecture.
(c) Remove the 30s idle auto-quit for the tribe daemon (keeps it up as long as any client ever connected). Simplest patch, accepts idle cost.

Likely (b) + a stale-pid reap in tribe-cli doctor/start.

## Acceptance

- Fresh SessionStart brings both lore AND tribe daemons to alive state without user intervention.
- `tribe doctor` reports healthy immediately on first check after any session starts.
- Stale pid file cannot block startup — tribe-cli detects dead PID and reclaims.
- Test coverage: autostart.test.ts exercises the tribe-socket path (currently only tests lore).

## Related

- @km/tribe/daemon (P1) — original daemon design, phases 1-3 shipped, phase 4 (hot-reload) shipped. Autostart gap was out of scope.
- @km/tribe/reliability-sweep-0415 (P1) — lists stale-socket GC but not autostart.

