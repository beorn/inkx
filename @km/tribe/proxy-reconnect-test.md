---
mentions:
  - km
id: "@km/tribe/proxy-reconnect-test"
aliases:
  - km-tribe.proxy-reconnect-test
  - km-tribe-proxy-reconnect-test
created_by: Bjørn Stabell
created_at: 2026-04-19T04:29:02Z
closed_at: 2026-04-19T04:31:43Z
close_reason: "Shipped: tests/tribe-self-heal.slow.test.ts verifies all three
  README invariants. 5/5 tests pass. Bearly commit 0655dc4 (merged as 5e68a9a),
  km bump 5e1cb7d20. Documented gap: in-flight socket buffers at moment of crash
  NOT covered — tracked in km-tribe.message-durability."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.proxy-reconnect-test
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T21:29:01Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] tribe: integration test for proxy reconnect-on-disconnect @km/tribe #task #P2

blocks:: [[@km/tribe]]

createReconnectingClient is implemented in tools/lib/tribe/socket.ts and wired into tribe-proxy.ts (line 191). But there's no integration test verifying the proxy transparently reconnects after daemon death. Currently running in a worktree (dispatched 2026-04-18 during /big analysis of post-plateau gaps). Once the kill-and-recover slow test suite lands, close this.

