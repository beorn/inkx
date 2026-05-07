---
mentions:
  - km
id: "@km/tools/import-structured"
aliases:
  - km-tools.import-structured
  - km-tools-import-structured
created_by: claude:fcaad2fa
created_at: 2026-02-18T11:35:15Z
closed_at: 2026-02-18T12:20:42Z
owner: bjorn@stabell.org
---

# [x] Import: task body content runs together — need structured KNode parsing from html_notes @km/tools #bug #P2

Current pipeline converts Asana html_notes to flat string, losing structure. Adjacent elements (IDs, links, text) run together. Fix: parse html_notes directly into child KNodes (p, li, h, code, quote) instead of string blob.

