---
id: "@km/domain/5-phase-5-signature-audit-datastore-vs-repo"
aliases:
  - km-domain.5
  - km-domain-5
  - "@km/domain/5"
created_at: 2026-01-25T23:36:36Z
closed_at: 2026-01-26T08:13:18Z
assignee: km
---

# [x] Phase 5: Signature audit (DataStore vs Repo) @km/domain #task #P3 @km

Simplify signatures - use DataStore when Repo isn't needed:
- Audit tests: which create Repo but only need DataStore?
- Audit components: which take Repo but only use DataStore methods?
- Change repo: Repo to data: DataStore where possible