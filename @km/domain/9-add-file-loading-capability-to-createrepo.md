---
id: "@km/domain/9-add-file-loading-capability-to-createrepo"
aliases:
  - km-domain.9
  - km-domain-9
  - "@km/domain/9"
created_at: 2026-01-26T08:28:46Z
closed_at: 2026-01-26T08:33:25Z
---

# [x] Add file loading capability to createRepo @km/domain #task #P1 @beorn

createRepo currently doesn't parse markdown files during initialization. Add loadFiles option to CreateRepoOptions that triggers file parsing into DataStore. This is required for createVault→createRepo migration.