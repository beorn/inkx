---
id: "@km/domain/3-phase-3-filetree-interface-factories"
aliases:
  - km-domain.3
  - km-domain-3
  - "@km/domain/3"
created_at: 2026-01-25T23:36:36Z
closed_at: 2026-01-26T08:13:04Z
---

# [x] Phase 3: FileTree interface + factories @km/domain #task #P2 @km

Create FileTree interface for simple file I/O:
- FileTree interface with read, write, watch methods (NOT DataStore methods)
- Factories: createDiskFileTree (real node:fs), createMemFileTree (in-memory memfs)
- Update sync layer to use FileTree instead of direct fs calls