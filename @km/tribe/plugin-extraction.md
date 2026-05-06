---
mentions:
  - km
  - Bjørn
id: "@km/tribe/plugin-extraction"
aliases:
  - km-tribe.plugin-extraction
  - km-tribe-plugin-extraction
created_by: Bjørn Stabell
created_at: 2026-04-19T05:51:28Z
closed_at: 2026-04-19T06:54:04Z
close_reason: "extracted: TribePluginApi + TribeClientApi boundary landed;
  daemon core purged of PluginContext (TRIBE_NO_PLUGINS=1 now boots
  zero-plugin-aware); all 5 plugins (git/beads/github/health/accountly)
  migrated; test coverage in tests/tribe-plugin-boundary.test.ts (4 tests).
  Commits: km e8a1a70dc; bearly f2c0db5, 0889321, d382721, d3a01dc, d761fbb.
  Gates: PluginContext/pluginCtx refs in tools/ = 0; km tsc = 156/326; vendor
  tests = 199/199 pass in touched files; slow tribe tests = 20/20 pass; bundle
  rebuilds cleanly."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tribe.plugin-extraction
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T22:51:28Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] tribe: extract git/github/health/beads/accountly plugins from daemon core @km/tribe #feature #P3 @Bjørn Stabell

blocks:: [[@km/tribe]]

Tribe daemon currently embeds 5 plugins: gitPlugin, beadsPlugin, githubPlugin, healthMonitorPlugin, accountlyPlugin. These observe the repo, GitHub API, system health, beads DB, and accountly quota respectively, and emit messages into the tribe wire. Useful — but they make tribe's core responsibility (coordination) blurry, contribute to the process-count/CPU alerts seen all session, and couple deployability (you can't run tribe without running health probes). Design: plugins become external observer processes that connect to tribe as regular clients with role='watch' and emit messages via the normal tribe.broadcast API. Or at minimum: extract plugin code into a separate package with a clear hook interface, so the daemon process can opt in/out. Depends on: @km/bear/unified-daemon + @km/tribe/event-bus (plugins emit messages — event bus is the natural fit). Effort: 1-2 days. Full design in /big analysis 2026-04-18.

