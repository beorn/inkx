---
id: "@km/inbox/9mle8"
aliases:
  - km-9mle8
  - "@km/_orphan/9mle8"
created_by: Bjørn Stabell
created_at: 2026-04-16T04:44:26Z
closed_at: 2026-04-16T05:34:30Z
close_reason: "Fixed: multi-line wikilinks (3+ lines) caused micromark
  subtokenizer RangeError. Root cause: km-wikilink tokenizer didn't reject
  newlines (micromark codes -5/-4/-3), consuming content across line boundaries.
  Fix: added newline rejection to all 5 tokenizer state functions. Test: 3
  regression tests + vault sync verified. File: ref/Tech/km-user-guide.md
  contained ![[...]] transclusions spanning 5+ lines with embedded git diffs."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] km sync crashes on vault after Asana integration @km/_orphan #task #P2 @Bjørn Stabell

km sync crashes during parseMarkdownWithLinks (@km/markdown/src/ast2nodes.ts:149). Triggered after adding blockquote breadcrumbs to 6 Asana archive files and creating new files with @ids sigil mentions + start::/end:: inline props. Stack: applyReconcileOps → handleUpdate → processMarkdownFile → parseMarkdownWithLinks. Files modified: archive/Asana/stabell/family/*.md (breadcrumbs), areas/@office/Immigration/index.md, areas/@office/Insurance/index.md, @ids.md. Likely a markdown edge case in the blockquote parsing or inline props.