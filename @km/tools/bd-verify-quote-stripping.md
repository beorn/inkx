---
id: "@km/tools/bd-verify-quote-stripping"
aliases:
  - km-tools.bd-verify-quote-stripping
  - km-tools-bd-verify-quote-stripping
created_by: claude:cc081a9a
created_at: 2026-04-27T20:23:39Z
closed_at: 2026-04-27T20:41:50Z
close_reason: "84c36a0af — replaced hand-rolled regex (/^\"(.*)\"$/, /^`(.*)`$/)
  with shell-quote.parse + stripOuterQuotes helper that peels exactly one
  matching outer pair (` ' \") only when inner has no unescaped same-quote.
  commandHead() recognizes 'git grep' as compound. Added shell-quote@^1.8.3 +
  @types/shell-quote@^1.7.5. Verified: 41/41 tests incl. nested-quote cases
  (grep \"foo bar\", grep 'a \"b\" c', git grep -n \"ab\\\\\"cd\")."
started_at: 2026-04-27T20:32:54Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-tools.bd-verify-quote-stripping
    depends_on_id: km-all.bd-verify-primitive
    type: parent-child
    created_at: 2026-04-27T13:23:39Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] bd-verify: complete quote stripping in command parser @km/tools #task #P3 @claude:cc081a9a

blocks:: [[@km/all/bd-verify-primitive]]

From dual-pro review (Kimi K2.6 winner, 2026-04-27): Quote stripping is incomplete — handles only some cases of single/double quotes, leaks quote chars into argv when commands include nested quotes. Action: use a real shell-tokenizer (shell-quote npm or equivalent) instead of hand-rolled regex. Reference: /tmp/llm-cc081a9a-review-three-pieces-of-mjjw.txt lines 262-273.