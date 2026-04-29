---
id: "@km/all/docs-mece-phase-6"
aliases:
  - km-all.docs-mece-phase-6
  - km-all-docs-mece-phase-6
created_by: Bjørn Stabell
created_at: 2026-04-17T04:08:25Z
closed_at: 2026-04-17T04:21:18Z
close_reason: "Phase 6 shipped in merge ca998ec91. 8 canonical docs aligned with
  KLink model. 9 commits from agent a69559c4 + merge. Acceptance: grep
  'normalizeRefHref|symlink|source_id|target_name|target_id' in active docs = 0.
  Active doc violations noted in agent report (visibility-model, guides/tasks)
  fixed in same sweep."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.docs-mece-phase-6
    depends_on_id: km-storage.link-model-canonical
    type: parent-child
    created_at: 2026-04-16T21:08:25Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Phase 6 of W1: mini-MECE sweep on link/sigil docs @km/all #task #P2

blocks:: [[@km/storage/link-model-canonical]]

Update 8 canonical link/sigil docs to match docs/design/links.md: glossary, storage.md, data-model.md, @km/ast/model.md, kmast.md, concepts.md, architecture.md. Remove legacy Ref/refs terminology from active docs (archive ok). Gate: grep 'Ref\|normalizeRefHref' docs/ = 0 in active docs; all linked from docs/design/links.md are current.