---
id: "@km/storage/sigil-embed-duplicates"
aliases:
  - km-storage.sigil-embed-duplicates
  - km-storage-sigil-embed-duplicates
created_by: claude:adeac868
created_at: 2026-04-25T06:00:08Z
closed_at: 2026-04-25T06:02:15Z
close_reason: Reverted — keeping all content/data-model issues consolidated on
  km-storage.content-issues for now (per Bjørn 2026-04-25). Spin-outs were
  premature; one running list is the chosen model.
---

# [x] Sigil-aggregated tasks appear as embedded copies — schema doesn't flag dedupe intent @km/storage #chore #P3

Spun out from @km/storage/content-issues (vault session, 2026-04-24).

Tasks under km.add:: headings appear as **embedded copies** alongside the canonical task. Same task surfaces 2-3× in raw queries. /due works around this by GROUP BY (content, date).

## Design question
Should the schema flag embedded copies (is_embed: true, or a distinct node kind) so consumers can opt in/out of dedupe explicitly?