---
id: "@km/tribe/plateau"
aliases:
  - km-tribe.plateau
  - km-tribe-plateau
created_by: Bjørn Stabell
created_at: 2026-04-18T18:20:28Z
closed_at: 2026-04-19T04:12:08Z
close_reason: "All 4 phases shipped. ~429 LOC net deletion in bearly. Sessions:
  325 passing. Deleted: lease.ts, chief-promotion.ts, leadership table, aliases
  table, events table, pidfile machinery, heartbeat machinery. Extracted:
  deriveChief helpers to lib/tribe/chief.ts. Bug classes extinct: chief lease
  expiry, stale aliases, pidfile confusion, heartbeat dead-row blocking rename,
  events table spurious cleanup. Phase 5 (km-bear merge) tracked separately
  under km-bear epic."
---

# [x] Tribe quality plateau — delete the redundant state machines @km/tribe #task #P2 @Bjørn Stabell

blocks:: [[@km/tribe]]

Gap analysis from /big 2026-04-18, refined 2026-04-18 (revised plan).

Tribe maintains five+ independent state machines for state derivable from socket connectivity and connection order. Each extra machine creates a lifecycle boundary where bugs live. The quality plateau is ~400 LOC net-negative deletion plus a few small additions (claim override, proxy reconnect), not a rewrite.

## Redundant state → primary signal

| Redundant machine                                     | Primary signal                          | Est. net LOC |
| ----------------------------------------------------- | --------------------------------------- | ------------ |
| leadership table + lease + expiry + auto-promotion    | connection order (first = chief)        | -300 (lease.ts + chief-promotion.ts + tests + alert) |
| heartbeat + 30s threshold + pruning                   | socket connectivity (clients Map)       | -80          |
| pidfile + readDaemonPid kill(pid, 0)                  | socket file existence                   | -30          |
| 30s idle auto-quit                                    | keep daemon resident (~5MB)             | -20 (KEEP -- already at 30 min, not 30 sec) |
| aliases table                                         | messages use sender by id               | -30          |
| events table                                          | messages WHERE type LIKE 'event.%'      | -30          |
| dual daemon (lore + tribe)                            | one bear daemon                         | tracked in @km/bear |

## Bugs this session that disappear

- @km/tribe/autostart: tribe daemon died because autostart only covered lore. With one daemon, no "died silently" class.
- @km/tribe/chief-auto-election (3 layers, 150 LOC + 12 tests): derived chief ~ 10 LOC. All three layers become moot.
- Stale-socket GC twice (7 + 33 sockets): process exit deletes its own socket. No leak class.
- Pidfile confused doctor: no pidfile, no confusion.

## Revised phased plan (each phase independently shippable)

### Phase 1 -- derive chief + claim override (~300 LOC net deletion)
Add `deriveChiefFrom(clients)` -- earliest registeredAt, excluding watch-* / pending-* / daemon. Add `tribe.claim-chief` / `tribe.release-chief` tools that set/clear an explicit `chiefClaim` map field; resolution: claim > derived. Delete `lease.ts`, `chief-promotion.ts`, `chief-promotion.test.ts`, leadership table, auto-promotion intervals + boot one-shot, chief-expired health alert. Pass `getChiefId()` through handler opts so `assign`/`verdict` permission and dead-letter routing both use derived chief.

/complete: `rg -l "leadership|getLeaseInfo|acquireLease|isLeaseHolder|tryAutoPromote|pickPromotionCandidate|chief-promotion|LEASE_DURATION"` (vendor/bearly only) -> 0.

### Phase 3 -- delete pidfile (~30 LOC deletion, keep idle quit)
Remove `tribe.pid` write/read; `tribe doctor` uses socket connectability. Keep idle-quit (already 30 min) -- daemon is resident but can release if truly idle.

/complete: `rg "readDaemonPid|tribe\.pid|writePidfile"` (vendor/bearly) -> 0.

### Phase 4 -- delete aliases + collapse events into messages (~60 LOC deletion)
Rename uses session_id internally; old-name lookup is a thin convenience query, not a table. Delete `events` table; `retro` and downstream readers go through `messages WHERE type LIKE 'event.%' OR type LIKE 'message.%'`. Migrate existing event rows to messages on db open if any survive.

/complete: `rg "aliases|insertEvent|FROM events|events\."` (vendor/bearly tribe code) -> 0.

### Phase 2 -- delete heartbeat (~80 LOC deletion, keep minimal sessions table)
Sessions table SURVIVES because cursor recovery on reconnect needs `claude_session_id`/`pid` lookup; deleting it means message-stream replay every reconnect. Delete `sendHeartbeat`, heartbeat interval, `pruned_at`, `cleanupOldPrunedSessions`, 30s "live vs all" filter. `clients: Map` is the truth for who-is-online; sessions table is just persistent identity.

/complete: `rg "sendHeartbeat|pruned_at|cleanupOldPrunedSessions|heartbeat\b"` (vendor/bearly tribe) -> 0.

### Out of this bead's scope
- Phase 1.5 stable session identity across reconnects (separate bead)
- Phase 1.6 message durability across restart (separate bead)
- Phase 1.7 proxy reconnect-on-disconnect (separate bead)
- Phase 5 @km/bear unified daemon merge (tracked under @km/bear)

## Acceptance

- All 4 phases shipped OR explicit skip-with-reason on each.
- 317+ bearly tests still pass (tests deleted along with the code they cover; net test count drops).
- /complete grep commands return expected zero-counts.
- Bug classes from this session verifiably extinct (no auto-promotion to break, no stale pidfiles).

## Source of analysis

`/big` reframing 2026-04-18, revised after systematic plan review same day. Five REFRAME hypotheses converged on "delete the redundant state machines."