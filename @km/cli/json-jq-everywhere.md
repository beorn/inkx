---
aliases:
  - km-cli.json-jq-everywhere
  - km-cli-json-jq-everywhere
created_at: 2026-05-06T06:27:52.590Z
_stub: true
closed_at: 2026-05-06T07:58:13.697Z
closeReason: "Shipped: 4 commits 0d236de54+29c009983+3fc37f083+210b8e277. New
  utils/jq.ts (emitJson + normalizeJsonJq) — --jq implies --json; subprocess jq
  fallback if not in PATH errors clearly. Threaded through
  list/show/children/stale/query (top-level) + task
  list/ready/blocked/orphans/stale/dep ls (task surface). 12 new tests:
  source-grep coverage gate, normalizeJsonJq unit, live e2e jq pipes. Bonus fix:
  task ready/orphans/dep ls were silently masking subcommand --json via parent's
  --json; switched to cmd.optsWithGlobals (same pattern task stale already
  used)."
---

