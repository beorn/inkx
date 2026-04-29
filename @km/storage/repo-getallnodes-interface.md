---
id: "@km/storage/repo-getallnodes-interface"
aliases:
  - km-storage.repo-getallnodes-interface
  - km-storage-repo-getallnodes-interface
created_by: Bjørn Stabell
created_at: 2026-04-19T04:10:41Z
closed_at: 2026-04-19T04:24:56Z
close_reason: "Shipped in parallel /max run. sigil-registry: 20ada24b3
  (parser+projection+ranker → SigilSpec registry, 10 new tests).
  repo-getallnodes: 0b77848f3 (Repo interface widened, type hole closed).
  termless-repair: 4a8ae3279 (dispose ordering, cascade eliminated; individual
  test readiness follow-up orthogonal). 2354 km-tui tests pass."
---

# [x] Widen Repo interface to expose getAllNodes (eliminate FakeRepo-only type hole) @km/storage #task #P3

blocks:: [[@km/storage]]

FakeRepo has getAllNodes(). Repo does not. persistence.spec.ts calls app.repo.getAllNodes() — works at runtime because app.repo is actually FakeRepo, but tsc flags it (2 errors). Pre-existing; discovered during spec-ergonomics audit.

Fix: add getAllNodes(): KNode[] to Repo interface, implement for the real Repo (wraps data.getAllNodes()). FakeRepo already satisfies via existing implementation.