---
id: "@km/silvery/pro-review-p1"
aliases:
  - km-silvery.pro-review-p1
  - km-silvery-pro-review-p1
created_by: claude:019d032d
created_at: 2026-04-23T00:26:34Z
closed_at: 2026-04-23T01:08:12Z
close_reason: "Phase D shipped silvery 47245067 + km 960ce5d15. Console exposes
  count: ReadSignal<number> (cheap notification) + entriesSnapshot() (lazy O(n)
  copy); entries ReadSignal dropped. useConsole + Board + tui all migrated. 39
  console/output tests + 2511 km-tui pass. Closes the P1-9 perf item;
  pro-review-p1 (4/4 items done: A1 name-uniqueness, A2 backendTerm signals, A3
  symbol hiding, D console perf); parent epic term-sub-owners done (all 4 phases
  A/B/C/D + Phase 9b shipped)."
---

# [x] Pro-review P1 hygiene: hide streams, freeze snapshots, perf-decouple console, createBackendTerm signals @km/silvery #task #P2

blocks:: [[@km/silvery/term-sub-owners]]

## Items from 2026-04-22 Pro review not covered by 135f5f74

### 1. stdin/stdout leak at runtime (P1-8)

Removed from the public `Term` interface but still present on the underlying `termBase` object. Any `as any` cast reaches them. If this is an ownership boundary, hide them under a symbol-keyed private accessor — `getInternalStreams(term)` can continue to resolve the symbol, user code gets nothing.

### 2. Console perf — decouple notification from snapshot copy (P1-9)

Current createConsole publishes `Object.freeze(buffer.slice())` on every log → O(n²) over the session for heavy-logging apps. Expose `entries: ReadSignal<readonly ConsoleEntry[]>` only when a consumer explicitly subscribes (expensive copy on demand) OR split into:
- `count: ReadSignal<number>` (cheap, notification-only)
- `entriesSnapshot(): readonly ConsoleEntry[]` (explicit method that slices)

Consumers (useConsole) watch the cheap signal, copy on debounce flush.

### 3. createBackendTerm missing signals (P1-13)

Node term has `signals`, headless term has `signals`, `createBackendTerm()` does not. Either plumb one in or document why it's omitted.

### 4. term.signals name uniqueness (P1-14)

`ordered()` keys the topological graph by `name` but doesn't reject duplicate registrations. Two handlers with the same name cause undefined before/after ordering. Enforce uniqueness in `on()` or document a deterministic tiebreaker.

## Acceptance
- [ ] stdin/stdout hidden under symbol; getInternalStreams still works
- [ ] Console exposes both `count` (or similar) signal and `entries()` snapshot method; heavy-logging benchmark shows linear (not O(n²)) behavior
- [ ] createBackendTerm has `signals` wired and its test covers it
- [ ] term.signals.on() rejects duplicate names (or docs clarify handler-name semantics)