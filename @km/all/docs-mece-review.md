---
mentions:
  - km
  - Bjørn
id: "@km/all/docs-mece-review"
aliases:
  - km-all.docs-mece-review
  - km-all-docs-mece-review
created_by: Bjørn Stabell
created_at: 2026-04-16T22:29:59Z
closed_at: 2026-04-17T04:57:49Z
close_reason: "Shipped 2026-04-16. Full-tree MECE audit: 92 docs + 6 package
  CLAUDE.mds inventoried via background Explore agent. Deliverables:
  docs/dev/doc-map.md (canonical concept map, W2 primary artifact). Archived 3
  stale docs (keybindings-v1, ink-patterns-pre-silvery, inkx-vs-ink-research).
  Fixed glossary ViewRole/ViewType inconsistency. Fixed 4 broken cross-doc
  links. 4 orphan concepts (TreeMutator ops, Repo API, effect catalog, change
  taxonomy) + 2 code renames (resolvedSymlink, ViewRole) tracked in
  docs/backlog.md W2 follow-ups section for pickup between phases. Commit:
  6c79c4db6."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-all.docs-mece-review
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-16T15:30:16Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-all.docs-mece-review
    depends_on_id: km-storage.link-model-canonical
    type: blocks
    created_at: 2026-04-16T15:30:17Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-all
      - type: link
        target: km-storage.link-model-canonical
---

# [x] Docs MECE review: one canonical source per concept @km/all #task #P2 @Bjørn Stabell

blocks:: [[@km/all]], [[@km/storage/link-model-canonical]]

Audit the full design / reference / concept doc set for MECE structure — every concept has exactly one canonical source; everything else references it. The links v1 bead does a mini-MECE pass across 8 docs; this bead generalizes that across the whole docs tree.

## Scope

In scope:

- docs/design/* — design docs (owns concepts)
- docs/glossary.md — terminology index
- docs/architecture.md, docs/concepts.md, docs/kmast.md, docs/storage.md, docs/inline-ast.md — overview / user-facing
- docs/ref/* — API references
- docs/dev/*, docs/guides/* — dev and user guides
- docs/lessons/* — audit for stale claims or terminology drift only
- README files within packages (package.json docs)

Out of scope:

- docs/archive/* — frozen history
- docs/future/* — speculative / aspirational
- Changelog / release notes

## Method

1. Inventory every doc; tag by role: canonical (owns), overview (summarizes), reference (lists), guide (instructs), lesson (records).
2. Extract the concept list from canonical docs. For each concept, identify the single owner.
3. Grep cross-doc mentions of each concept; where an overview / reference / guide duplicates canonical content, cut and replace with a reference.
4. Check glossary entries against canonical sources — each glossary entry points to the owner doc.
5. Flag orphan concepts (referenced nowhere canonical) for new canonical coverage.
6. Flag stale concepts (owned docs describe abandoned approaches) for retire-to-archive.
7. Terminology drift audit — names that shifted (Ref → KLink, embed/symlink, host_id, etc.) must be consistent everywhere; no legacy name left in active docs.

## Acceptance

- Doc inventory table exists (docs/dev/doc-map.md or similar) — each doc has role + owned concepts.
- Glossary is an index: every entry links to its canonical source; no entry duplicates content from its owner.
- No concept has two canonical sources. Overviews reference; they don't redefine.
- No legacy terminology in active docs (Ref, refs table, embed_of column, symlink outside TUI history notes).
- Every concept in code (searchable symbol) has a doc home.
- Retired / superseded docs moved to docs/archive/ with a pointer to the new canonical.
- Stale / broken cross-links fixed.
- One commit per docs domain (design, ref, guide) for reviewability.

