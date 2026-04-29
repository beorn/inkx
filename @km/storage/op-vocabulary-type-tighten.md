---
id: "@km/storage/op-vocabulary-type-tighten"
aliases:
  - km-storage.op-vocabulary-type-tighten
  - km-storage-op-vocabulary-type-tighten
created_by: claude:8b5b9e1c
created_at: 2026-04-22T17:30:52Z
---

# [ ] Tighten NodeUpdatedData to closed union (audit recommendation) @km/storage #task #P3

blocks:: [[@km/storage]]

Audit §'Serializability audit' item 1: NodeUpdatedData = { [key: string]: unknown } is serializable but unconstrained. Replace with a discriminated union over KNode fields + validated data blob shape.

## Scope
- @km/core: replace NodeUpdatedData's index signature with a closed union of valid field sets
- Validate emitter.apply({ type: 'node_updated', data }) at compile time — typecheck error for any unknown field
- Migration: every emitter call site that passes { [arbitrary-key]: value } must switch to one of the recognized update shapes

## /complete
- NodeUpdatedData is a closed union
- Every emitter.apply site typechecks against it
- 0 'as unknown' casts in emit call sites

## Priority
P3 — nice-to-have before Phase B. Not blocking. Catches shape mismatches at compile time, which protects replay.