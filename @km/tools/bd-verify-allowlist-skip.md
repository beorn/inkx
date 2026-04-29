---
id: "@km/tools/bd-verify-allowlist-skip"
aliases:
  - km-tools.bd-verify-allowlist-skip
  - km-tools-bd-verify-allowlist-skip
created_by: claude:cc081a9a
created_at: 2026-04-27T20:23:40Z
closed_at: 2026-04-27T20:42:00Z
close_reason: "184710af3 — replaced pass:boolean with
  status:'pass'|'fail'|'skipped'. Allowlist gate moved from parser to executor;
  lines with explicit separator AND non-allowlisted head emit status='skipped'
  with reason instead of being silently dropped. Module-scope ALLOWED_HEADS +
  GREP_FAMILY sets. Exit codes: any fail->1, any skipped (no fail)->2 advisory,
  all pass->0. Internals exported via __test for unit tests; main() gated by
  import.meta.main. Verified: 41/41 tests incl. exit-code matrix (all-pass=0,
  fail+skip=1, only-skipped=2, pass+skipped=2)."
---

# [x] bd-verify: cmd-head allowlist silently skips legitimate commands @km/tools #task #P3 @claude:cc081a9a

blocks:: [[@km/all/bd-verify-primitive]]

From dual-pro review (Kimi K2.6 winner, 2026-04-27): Current allowlist (grep/rg/git-grep) silently skips any acceptance criterion using a different tool (e.g. find, ls, jq, npm test). This makes Phase 2 (bd close integration) unsafe — closures could pass without their criteria actually running. Action: emit a 'skipped: <reason>' status distinct from 'pass'/'fail', and require Phase 2's bd-close gate to fail-closed on skipped criteria. Reference: /tmp/llm-cc081a9a-review-three-pieces-of-mjjw.txt lines 274-285.