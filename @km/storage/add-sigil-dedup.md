---
id: "@km/storage/add-sigil-dedup"
aliases:
  - km-storage.add-sigil-dedup
  - km-storage-add-sigil-dedup
created_by: claude:e7ea0892
created_at: 2026-02-11T18:33:55Z
closed_at: 2026-02-11T18:34:01Z
owner: bjorn@stabell.org
assignee: claude:e7ea0892
---

# [x] km add: sigil tags + four-way dedup + Removed section rule @km/storage #feature #P2 @claude:e7ea0892

Phase 1 of board membership via sigil tags. km add @next/+project/#tag now: (1) detects sigil targets, (2) four-way dedup matrix (link vs sigil presence), (3) appends sigil to source task content with dedup, (4) syncs source files. GTD templates get Removed sections with removed=true rule. NodeRules and parser updated for removed flag.