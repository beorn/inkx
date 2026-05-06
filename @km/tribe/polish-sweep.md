---
mentions:
  - km
id: "@km/tribe/polish-sweep"
aliases:
  - km-tribe.polish-sweep
  - km-tribe-polish-sweep
created_by: Bjørn Stabell
created_at: 2026-04-19T05:51:48Z
closed_at: 2026-04-19T06:37:32Z
close_reason: "3 of 9 items shipped (safe subset that didn't conflict with
  event-bus): (1) tribe.leadership → tribe.chief MCP tool rename; (4)
  tribe.debug introspection tool added; (7) migration v1 uses PRAGMA table_info
  instead of try/catch ALTER soup. Item 8 (delete sessions.domains) CORRECTLY
  skipped — grep found active READERS in
  session.ts/handlers.ts/retro.ts/tribe-cli.ts. Items 2, 3, 5, 6, 9 deferred to
  a follow-up sweep (schema-risky or conflicted with event-bus work)."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.polish-sweep
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T22:51:48Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] tribe: polish sweep — 8 narrow cleanups post-plateau @km/tribe #task #P4

blocks:: [[@km/tribe]]

Batch of small polish items from /big 2026-04-18 (Round 2). All 10-40 LOC each, no behavior risk. Execute as one worktree session.

1. Rename MCP tool tribe.leadership -> tribe.chief — the old name reflected the deleted lease concept. Add both for one cycle with a deprecation note, then drop tribe.leadership.
2. Typed role field — replace name-prefix magic (watch-*, pending-*, member-N) with a proper role column: enum("member", "watch", "pending", "daemon"). Code currently does string-prefix checks that are typo-prone.
3. Replace string sentinel recipient="log" for events with typed field messages.kind ("direct"|"broadcast"|"event"), drop the magic recipient.
4. Add tribe.debug MCP tool that dumps { clients, chief, chiefClaim, activeCursors } as JSON. Debugging today requires reading code + SQL; a tool would be much better.
5. Unify contexts — PluginContext, TribeContext, HandlerOpts are 3 interfaces for overlapping concerns (db + clients + sendMessage). Collapse to one DaemonCtx.
6. Refactor register handler (tribe-daemon.ts case "register") from 100 LOC into composed small functions: resolveName(), adoptIdentity(), attachClient(), announceJoin(). Same behavior, readable.
7. Migration v1 uses try/catch ALTER per column — switch to PRAGMA table_info to check column presence, then ALTER only if missing. Cleaner, no exception abuse.
8. Delete unused sessions.domains field if no callers reference it (grep first; if used, document purpose).
9. Merge event_log table with messages WHERE kind="event" — two activity logs, should be one.

Each item independently testable. No dependencies beyond @km/bear/unified-daemon (Phase 5) landing first — items 4/6/7 are safe even during Phase 5. Effort: 4-6 hours batched.

