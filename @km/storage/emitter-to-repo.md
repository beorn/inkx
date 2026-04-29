---
id: "@km/storage/emitter-to-repo"
aliases:
  - km-storage.emitter-to-repo
  - km-storage-emitter-to-repo
created_by: Bjørn Stabell
created_at: 2026-04-02T23:25:52Z
closed_at: 2026-04-03T00:40:24Z
close_reason: Partially done — repo.apply/commit added. Full Emitter merge deferred to era2.
owner: bjorn@stabell.org
---

# [x] Merge Emitter into Repo — repo.apply(event) as the unified interface @km/storage #task #P3

Emitter is an infrastructure name, not a domain name. It applies events, journals, broadcasts, saves.
Fold into Repo: repo.apply(event) becomes the single entry point for mutations.

Current: emitter.apply(event) + repo.getNode/getChildren/mutate (two objects)
Target: repo.apply(event) + repo.getNode/getChildren (one object)

Also: collapse commit/save into apply with origin-based loop prevention.
event.origin === "fs" → skip save. Eliminates wrapEmitterForReconcile.