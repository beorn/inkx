---
aliases:
  - km-storage.sync-architecture.materialization-safety-invariants
  - km-storage-sync-architecture-materialization-safety-invariants
created_at: 2026-05-08T20:45:36.206Z
---

# km.add materialization safety invariants @km/storage #task @agent/3 #P1

Raise rule materialization from tested examples to a safety contract. Acceptance: tests prove materialization is opt-in via km.add, item-only by default, bounded, deduped, and does not materialize body/prose/doc bullets; km.default controls initial placement without dragging user-moved embeds back; broad self-rules are documented as dangerous unless constrained; code comments list future km.add options without implementing them.
