---
mentions:
  - km
id: "@km/tools/bd-api/2-km-bd-tier-4-unified-query-interface-km-list-query"
aliases:
  - km-tools.bd-api.2
  - km-tools-bd-api-2
  - "@km/tools/bd-api/2"
created_by: claude:1d8b0fc3
created_at: 2026-02-15T15:26:51Z
closed_at: 2026-02-15T15:40:36Z
owner: bjorn@stabell.org
---

# [x] km bd tier 4: unified query interface — km list/query = km bd list/query with different defaults @km/tools #task #P2

km bd list/query and km list/query share the same interface (DSL, flags, output options). The only difference: km bd defaults to filtering @issue-tagged nodes and uses bd-style output format. Implementation: extract shared query flags and formatting into a common layer, then wire both km list and km bd list to it with different default presets.

