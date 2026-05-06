---
mentions:
  - km
id: "@km/infra/recall-vector"
aliases:
  - km-infra.recall-vector
  - km-infra-recall-vector
created_by: Bjørn Stabell
created_at: 2026-04-12T20:12:53Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.recall-vector
    depends_on_id: km-infra.org-redesign
    type: parent-child
    created_at: 2026-04-12T13:13:01Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra.org-redesign
---

# [ ] Phase C: Upgrade recall with vector search @km/infra #task #P2

blocks:: [[@km/infra/org-redesign]]

Add embeddings + vector index + hybrid ranking to recall sqlite. Expand scope to docs/beads.

