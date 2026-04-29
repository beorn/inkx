---
id: "@km/storage/source-of-truth-contract"
aliases:
  - km-storage.source-of-truth-contract
  - km-storage-source-of-truth-contract
created_by: claude:8b5b9e1c
created_at: 2026-04-21T08:37:22Z
closed_at: 2026-04-21T09:05:59Z
close_reason: "RFC committed at hub/km/source-of-truth-rfc.md (2026-04-21).
  Chose Family A — markdown files are authoritative. changes.jsonl + state.db +
  in-memory projections are rebuildable caches. Filesystem wins on conflict.
  CRDT deferred with concrete reopen trigger filed as km-storage.crdt-trigger.
  Deviations (sibling-order, hidden filter, workspaces, session/tool-call log,
  collapsed_file_links) documented as accepted scoped exceptions. Constraint
  contract for derived stores spelled out: rebuild <500ms first frame at 1x
  post-lazy-hydration, full rebuild <5s at 1x, log replay <1s at 1x, filesystem
  wins conflict priority."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.source-of-truth-contract
    depends_on_id: km-all.plateau
    type: parent-child
    created_at: 2026-04-21T01:37:22Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Source-of-truth contract — markdown vs log vs DB @km/storage #feature #P1 @claude:8b5b9e1c

blocks:: [[@km/all/plateau]]

Primary question identified by dual-pro review 2026-04-21 as the REAL first-decision for scale-architecture. Everything downstream depends on this.

## The question

For any piece of content in km, which store is authoritative?

Candidates:
- (A) Markdown files authoritative. DB + indexes are derived, fully rebuildable from .md. External edits are truth.
- (B) Markdown authoritative for text, append-only op log as audit/replay. DB = log projection.
- (C) Log-first canonical state. Markdown is an export projection. Loses plain-text portability as a hard guarantee.

## Current state (pre-decision)

km operates as (A) with caveats: .md files are authoritative; SQLite caches + indexes are derived; external edits trigger re-parse. But several subsystems (selection, session state, fold state) are NOT backed by .md. Undo stack is memory-only. Unclear if these are acceptable or latent architecture debt.

## Decision criteria

Answering this question bounds:
- Event-sourcing viability (only valid under B or C)
- CRDT direction (which layer carries the CRDT — log, markdown, or DB?)
- External-edit reconciliation semantics
- Crash-recovery guarantee
- Export / backup story
- Obsidian interop contract

## Deliverables

- hub/km/source-of-truth-rfc.md — one-pager naming the chosen layer with reasoning
- Explicit list of which subsystems deviate from the answer (selection, session state, undo, etc) and whether the deviation is acceptable
- Constraint on derived stores: rebuild time budget, invalidation contract, external-edit handling

## Prerequisite

None. Can and should be answered BEFORE scale-architecture commits to a family.