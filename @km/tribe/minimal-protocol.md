---
id: "@km/tribe/minimal-protocol"
aliases:
  - km-tribe.minimal-protocol
  - km-tribe-minimal-protocol
created_by: Bjørn Stabell
created_at: 2026-04-19T18:02:06Z
closed_at: 2026-04-20T18:46:07Z
close_reason: Superseded by hub/km/design/tribe-matrix.md (simplified model).
  Matrix connector + chatlog nodes + tree-based threads + sigil-routing via
  transclusion. No custom wire protocol. See DR for full details.
---

# [x] Reframe: tribe as journal + fanout, everything else derived @km/tribe #task #P3

blocks:: [[@km/tribe]]

The real problem: tribe daemon is simultaneously five things (bus, registry, plugin host, memory, monitor). Each added responsibility creates a consistency surface with the others. Pro review's 19 findings are all 'the 5 responsibilities disagree about state.'

Reframe: shrink the daemon to journal + fanout. Every participant (Claude session, git observer, beads observer, lore) uses the same wire. Journal is the ONLY source of truth. Sessions/chief/retro/memory all become derivations or peer participants.

DISSOLVES most open pro-review beads:
- @km/tribe/stable-identity — stable sessionId is just the hello token; name is metadata
- @km/tribe/daemon-authority — no dual paths: all writes go via 'post' message; daemon rejects others
- @km/tribe/scope-model — journal is per-scope-file; daemon is stateless multiplexer
- @km/tribe/role-register-cleanup — no register RPC; hello message is the only join
- @km/tribe/plugin-boundary-tightening — plugins are peer sessions with narrow client API
- @km/tribe/polish-v2 — mostly dissolves

SURVIVES the reframe:
- @km/tribe/delivery-correctness — still real bugs (cursor advance, replay truncation); fix FIRST
- @km/tribe/testing — simulated multi-session env still needed

Effort: 3-5 days in a worktree. Touches every file in vendor/bearly/tools/lib/tribe/. Accept criteria = existing self-heal + durability + identity + role + plugin-boundary suites keep passing.

First step: write docs/design/tribe-minimal.md — hello shape, message kinds, journal semantics, how each current feature maps to the minimal protocol. /pro-review the spec BEFORE touching code.