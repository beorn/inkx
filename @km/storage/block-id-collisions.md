---
mentions:
  - km
id: "@km/storage/block-id-collisions"
aliases:
  - km-storage.block-id-collisions
  - km-storage-block-id-collisions
created_by: claude:adeac868
created_at: 2026-04-25T06:00:19Z
closed_at: 2026-04-25T06:02:15Z
close_reason: Reverted — keeping all content/data-model issues consolidated on
  km-storage.content-issues for now (per Bjørn 2026-04-25). Spin-outs were
  premature; one running list is the chosen model.
owner: bjorn@stabell.org
---

# [x] Block ID collisions across files corrupt km show resolution @km/storage #bug #P2

Spun out from @km/storage/content-issues (vault session, 2026-04-24).

Block ID ^apr15-ca-ftb was defined in both ref/Tech/@km/user-guide/md (doc example) and projects/+taxes/workstreams.md (real task). Corrupts `km show '^id'` resolution.

## Mitigation

Bead @km/_orphan/q5hji partly mitigates by making inactive files lose their block IDs (active-wins).

## Open questions

- Should km warn at parse time on collision between **active** files?
- Should block IDs be file-scoped by default, with global IDs opt-in?

