---
id: "@km/storage/op-vocabulary-audit"
aliases:
  - km-storage.op-vocabulary-audit
  - km-storage-op-vocabulary-audit
created_by: claude:8b5b9e1c
created_at: 2026-04-22T05:22:52Z
closed_at: 2026-04-22T06:36:50Z
close_reason: "Audit complete:
  hub/km/research/op-vocabulary-audit-2026-04-22.md. Verdict: Phase B is persist
  + replay + ~2-3 person-weeks of normalization. 11 gaps found (1 high severity:
  folder rename bypasses emitter.apply — follow-up beads suggested)."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.op-vocabulary-audit
    depends_on_id: km-storage.pathway-db-crdt
    type: parent-child
    created_at: 2026-04-21T22:23:07Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Phase B prereq: map the scope of serializable ops (content changes only, exclude UI/app state) @km/storage #task #P0 @claude:8b5b9e1c

blocks:: [[@km/storage/pathway-db-crdt]]

Refined scope per user clarification 2026-04-22: km DOES have serializable op types (time-travel undo/redo is evidence). The audit question is not 'do ops exist' — it's 'do ops cover the right scope, and only the right scope.'

Scope boundary:
- **IN scope for the oplog**: content changes — edits to files, headings, blocks, tags, links, frontmatter. Anything that changes persisted state.
- **OUT of scope**: UI / app state — fold state, cursor, selection, hover, scroll, view mode, overlay open/closed, tab focus. These belong in the app layer, not the content oplog.

Audit deliverables:
1. Enumerate every action that currently flows through apply() — classify each as content vs. UI
2. For content actions: verify they are serializable (JSON-clean, no in-memory pointers), reference only stable NodeIds, and replay deterministically
3. Flag content changes that happen OUTSIDE apply() (direct DB writes, scanner-driven mutations, migration code) — those must move to apply() to be oplog-recordable, OR we accept that FS-ingested changes are inferred as ops at reconcile time (which is its own design question)
4. Flag any content action that currently depends on UI state (e.g., 'delete selection' — what's the op shape when selection is an app concept?)

Outcome: either (a) 'ops cover content with minor normalization — Phase B is persist + replay' or (b) 'these N gaps need filling before Phase B can ship' with the gaps named.

This is P0 because the answer reshapes Phase B cost estimates. Do the audit before scheduling Phase B.