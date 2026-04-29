---
id: "@km/mdtest/command-extraction-drift"
aliases:
  - km-mdtest.command-extraction-drift
  - km-mdtest-command-extraction-drift
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:50Z
closed_at: 2026-03-14T01:29:26Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] mdtest: command extraction diverged from Cram syntax @km/mdtest #bug #P1

plugin-executor.ts treats any line starting with $ or > as command/continuation instead of requiring '  $ ' and '  > '. Expected-output lines like $HOME or >prompt can be executed as commands. Also trimStart() removes significant indentation from continuation lines, breaking heredocs. Diverges from parseBlock(). Fix: use parseBlock() as single source of truth, require exact '  $ '/'  > ' prefixes. plugin-executor.ts:168-194. Found by GPT 5.4 Pro review.