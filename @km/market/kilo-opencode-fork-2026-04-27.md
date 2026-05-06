---
mentions:
  - km
id: "@km/market/kilo-opencode-fork-2026-04-27"
aliases:
  - "@km/all/kilo-opencode-fork-2026-04-27"
  - km-all.kilo-opencode-fork-2026-04-27
  - km-all-kilo-opencode-fork-2026-04-27
created_by: claude:618d206c
created_at: 2026-04-28T01:30:46Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.kilo-opencode-fork-2026-04-27
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-27T18:31:03Z
    created_by: claude:618d206c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] Doc updates: Kilo Code is now an opencode fork (April 2026) @km/all #task #P3

blocks:: [[@km/all]]

Update docs reflecting Kilo's April-2026 architectural shift: dropped Cline-fork runtime, soft-forked opencode (packages/opencode/ in their repo, kilocode_change marker discipline, upstream-sync CI). Files to update: hub/silvery/research/coding-agent-landscape.md (§16 kilocode); hub/silvercode/future/ai-terminal/09-agent-host-landscape.md + 10-agent-router-landscape.md (Kilo placement, opencode OEM note); ~/Bear/Journal/ref/coding-agents/README.md (line 47 footnote); write missing ~/Bear/Journal/ref/coding-agents/kilo-code.md. Also note Sid Sijbrandij (GitLab co-founder) leadership and 8M USD seed (Cota Capital lead, Dec 2025).

