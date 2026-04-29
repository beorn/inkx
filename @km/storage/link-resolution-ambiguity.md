---
id: "@km/storage/link-resolution-ambiguity"
aliases:
  - km-storage.link-resolution-ambiguity
  - km-storage-link-resolution-ambiguity
created_by: Bjørn Stabell
created_at: 2026-04-16T00:16:10Z
closed_at: 2026-04-16T01:50:22Z
close_reason: Fixed by normalizeNodeName() in 4caab6f5b — both write paths now
  produce consistent node names. The broader to_ids[] cardinality work remains
  on km-storage.link-model-canonical but the acute @office bug is resolved.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.link-resolution-ambiguity
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-15T17:16:10Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-storage.link-resolution-ambiguity
    depends_on_id: km-storage.link-model-canonical
    type: blocks
    created_at: 2026-04-15T17:16:10Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Link resolution silently collapses ambiguous names to null @km/storage #bug #P2

blocks:: [[@km/storage]], [[@km/storage/link-model-canonical]]

Name index (smart-resolver.ts:47) sets map key to null when multiple nodes share a name, and resolveByName returns null on lookup. Rendering then treats the ref as unresolved — invisible to the user. Concrete case: folder @office at areas/@office has name='@office', and a TUI-created heading with title='@office' also stores name='@office' (TUI write path repo.ts:490 doesn't slugify, unlike ast2nodes.ts:376 which does). Name index collides, both silently unresolve, user sees plain text with no link styling and no indication two candidates exist. Root fix is the @km/storage/link-model-canonical epic: refs table with to_ids[] array, cardinality-as-state rendering, picker-on-click for N matches, plus normalizeLinkHref() to stop the write-path asymmetry. Narrow interim fix would be slugifying in repo.ts:490 as well — whack-a-mole, does not address the class.