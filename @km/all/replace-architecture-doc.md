---
mentions:
  - km
id: "@km/all/replace-architecture-doc"
aliases:
  - km-all.replace-architecture-doc
  - km-all-replace-architecture-doc
created_by: Bjørn Stabell
created_at: 2026-04-02T01:35:21Z
closed_at: 2026-04-02T03:49:22Z
close_reason: architecture.md replaced with v2 content in commit 53c127e6.
  Cross-references updated in docs/README.md.
owner: bjorn@stabell.org
---

# [x] Replace architecture.md with architecture-v2.md — update all 15+ cross-references @km/all #task #P2

Once @km/tui/view-tree migration is complete and architecture-v2.md no longer has 'Legacy' labels or 'migration in progress' notes:

1. Remove 'Legacy View Models' label from ColumnView/CardView section (or delete section if they're gone)
2. Remove 'migration in progress' from ViewNode section
3. Replace docs/architecture.md with architecture-v2.md (mv or copy content)
4. Update all cross-references (15+ docs link to architecture.md):
- docs/dev/debugging.md, docs/dev/testing.md, docs/README.md
- docs/principles.md, docs/concepts.md, docs/storage.md
- docs/design/tea-state-machines.md, docs/ref/ui.md, docs/ref/pipelines.md, docs/ref/commands.md
- docs/architecture/brain.md (3 references), docs/lessons/filetree-as-peer.md
- docs/adr/archive/002-domain-objects-refactor.md
14. Remove architecture-v2.md (content is now in architecture.md)
15. Update docs/README.md to remove the v2 line

DEPENDS ON: @km/tui/view-tree (all phases), @km/tui/unify-columns
DO LAST in the simplification epic — this is the victory lap.

