---
mentions:
  - km
id: "@km/tribe/daemon-authority"
aliases:
  - km-tribe.daemon-authority
  - km-tribe-daemon-authority
created_by: Bjørn Stabell
created_at: 2026-04-19T17:54:50Z
closed_at: 2026-04-20T18:46:25Z
close_reason: Dissolved. No custom tribe daemon under the new model
  (hub/km/design/tribe-matrix.md); Matrix homeserver + @km/connector-matrix
  replaces the daemon entirely.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.daemon-authority
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-19T10:54:50Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] tribe: delete P2P direct-send; gate pre-register connections @km/tribe #feature #P1

blocks:: [[@km/tribe]]

Pro review 2026-04-19: three defects where connections bypass daemon guarantees.

- P0.2: tribe-proxy.ts startPeerServer + trySendDirect lets proxies send directly to other proxies' peer sockets, bypassing the journal, dedup, authorization, and event-bus fanout. Breaks durability, breaks 'chief can send assign' guard, breaks retro accounting.
- P0.3: A connection in pending/unregistered state can invoke RPCs including tribe.send and internal methods. No auth gate between socket-accept and first register; pending should only be allowed to call register.
- P1.6: tribe.reload had a clear owner when plugins managed their own lifecycle; after plugin extraction its ownership (is this a daemon op? a plugin op?) is unclear.

Design: delete the P2P direct-send path. All messages go through daemon → journal → fanout. Add a pre-register auth state where only 'register' is accepted. Give tribe.reload to the daemon core with an explicit restart-plugins-only flag.

Effort: ~1 day (mostly deletions).

