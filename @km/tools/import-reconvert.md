---
id: "@km/tools/import-reconvert"
aliases:
  - km-tools.import-reconvert
  - km-tools-import-reconvert
created_by: claude:8f007ba9
created_at: 2026-02-20T09:43:04Z
closed_at: 2026-02-20T09:46:53Z
owner: bjorn@stabell.org
---

# [x] Re-convert all Asana data and verify output quality @km/tools #task #P2

After converter fixes (dedup-tags + user-naming), delete imports/asana/*.md and re-run: bun km import asana --from .km/imports/asana-stabell-2026-02-18T19-43-26 --force. Verify: no duplicate files, user files are @slug.md, tag files are #slug.md, no empty files, all content correct. Run diff against previous output to confirm improvements.