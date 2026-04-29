---
id: "@km/all/signal-handler-registry"
aliases:
  - km-all.signal-handler-registry
  - km-all-signal-handler-registry
created_by: claude:019d032d
created_at: 2026-04-22T20:41:38Z
---

# [ ] Signal handler dependency registry — order-safe SIGINT/TERM/exit cleanup @km/all #task #P2

blocks:: [[@km/all]], [[@km/silvery/term-sub-owners]]

Audit finding (2026-04-22, /tmp/shared-global-audit.md) — 78 process.on registrations across silvery + km, with 10+ SIGINT, 7+ SIGTERM, 6+ exit handlers. No documented cleanup order. Last handler to run wins; if an earlier handler crashes, later handlers' resources leak. Resource leaks observed: write streams (loggily file writers), timers, sync managers, terminal protocol disable sequences.

Same META-pattern as the stdin races: shared global state (process signal handler list) mutated by uncoordinated tenants. Polite tenants assume nobody else exists; under signal delivery, all run, but the order is registration-order which is implementation-detail not API.

Solution: a single SignalHandlerRegistry per process. Components register intent ('on SIGINT, do X — must run before/after Y'). Registry topologically sorts dependencies and runs cleanup in the correct order. Crash in one handler doesn't prevent others from running.

Audit report: /tmp/shared-global-audit.md (Suspect #2).