---
id: "@km/tui/strip-known-mentions-overreach"
aliases:
  - km-tui.strip-known-mentions-overreach
  - km-tui-strip-known-mentions-overreach
created_by: Bjørn Stabell
created_at: 2026-04-06T20:44:39Z
closed_at: 2026-04-07T01:16:19Z
close_reason: "Fixed in 2e42f18ed: stripKnownMentions now strips ONLY known
  person @mentions; preserves #tags, +projects, **bold**, *italic*, ~~strike~~
  verbatim. Code/links/bareurls fall through to inlineNodesToPlainText
  (unchanged correct behavior). 8-test TDD suite in inline-rendering.test.ts."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] stripKnownMentions silently strips ALL tags/projects/formatting from card titles @km/tui #bug #P1 @Bjørn Stabell

stripKnownFromNodes() in apps/@km/tui/src/views/detail-pane-helpers.ts:182 blanket-removes #tags, +projects, bold/italic/code, and prettifies URLs (https://x.com → x.com which then loses link styling).

Three bugs in one function:
1. #tags and +projects deleted from card titles (not just 'known mentions')
2. Bold/italic/code formatting lost
3. URL autolinks stripped of protocol → no longer recognized as links

Repro:
- Title with '#urgent' → tag invisible
- Title with '**bold**' → plain text
- Title with 'https://example.com' → 'example.com' as plain text

Fix: split function — card title should preserve tags/projects/formatting and only strip already-displayed metadata. Or run InlineText on the parsed AST directly without re-serialize-and-reparse.