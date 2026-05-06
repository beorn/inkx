---
mentions:
  - km
id: "@km/storage/content-role-first-class"
aliases:
  - km-storage.content-role-first-class
  - km-storage-content-role-first-class
created_by: claude:adeac868
created_at: 2026-04-25T06:00:35Z
closed_at: 2026-04-25T06:02:15Z
close_reason: Reverted — keeping all content/data-model issues consolidated on
  km-storage.content-issues for now (per Bjørn 2026-04-25). Spin-outs were
  premature; one running list is the chosen model.
owner: bjorn@stabell.org
---

# [x] First-class 'content role' (active/reference/inactive/archived) in node schema @km/storage #feature #P4

Spun out from @km/storage/content-issues (vault session, 2026-04-24).

The vault's archive/Asana/ (27K Asana export tasks from 2013–2024) and raw/chats/ (Claude session transcripts that echo workstream content) are **semantically different from active vault content** — they're reference, not action. Currently parsed homogeneously, requiring inactive globs as opt-in.

## Design question

Should km's data model have a first-class concept of **content role** (active / reference / inactive / archived) — derivable from path conventions but explicit in the node schema, so queries can filter without per-vault config?

P4 = longer-term model question, post-Quality-Plateau review territory.

