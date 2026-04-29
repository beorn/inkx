---
id: "@km/tools/import-user-naming"
aliases:
  - km-tools.import-user-naming
  - km-tools-import-user-naming
created_by: claude:8f007ba9
created_at: 2026-02-20T09:43:01Z
closed_at: 2026-02-20T09:45:50Z
owner: bjorn@stabell.org
---

# [x] Use @slug naming for user My Tasks files @km/tools #task #P2

Change user project filenames from user-GID-slug.md to @slug.md in buildPrimaryMap(). Currently sourceId=user-346577585145 + title=@Bjørn Stabell → user-346577585145-bj-rn-stabell.md. Should become @bj-rn-stabell.md. Detect sourceId.startsWith('user-') and use @slug.md format.