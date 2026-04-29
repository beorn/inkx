---
id: "@km/_orphan/nuy0"
aliases:
  - km-nuy0
created_at: 2026-01-26T13:56:03Z
closed_at: 2026-01-26T14:23:03Z
---

# [x] batch-refactor: file.rename should auto-update import paths @km/_orphan #feature #P2

Currently file.rename only renames files. The findImportEdits function is a stub that logs but returns empty array. Should generate import path updates as part of the file editset so one command handles both.