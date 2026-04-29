---
id: "@km/silvercode/acp-adapter-gemini"
aliases:
  - km-silvercode.acp-adapter-gemini
  - km-silvercode-acp-adapter-gemini
created_by: claude:cd034ca4
created_at: 2026-04-26T08:11:37Z
closed_at: 2026-04-26T10:05:41Z
close_reason: "Resolved: silvercode consumes Gemini via @google/gemini-cli's
  first-party --experimental-acp mode (registry id gemini → npx -y
  @google/gemini-cli --experimental-acp). The flag is documented in upstream
  docs/cli/cli-reference.md and wired in packages/cli/src/config/config.ts.
  Auth: Sign in with Google (free tier, 60 req/min, 1000 req/day) or
  GEMINI_API_KEY. No silvercode-side stream-json adapter or HTTP path needed —
  connectAcpRegistry(scope, 'gemini', opts) is the entire integration surface.
  Documentation: apps/silvercode/packages/agent-harness/docs/adapter-gemini.md
  (auth, --model customisation via extraArgs, experimental-flag caveat).
  Registry spawn correctness asserted in tests/registry-adapters.test.ts.
  Stream-json adapter deferred to P4 — only relevant for users explicitly
  avoiding Google account login AND the experimental ACP flag."
---

# [x] ACP adapter — Gemini CLI stream-json → SessionUpdate @km/silvercode #feature #P4 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-adapter-claude]]

Stateless mapper for gemini-cli's output → ACP SessionUpdate. Gemini CLI uses Cloud Code Assist HTTP endpoint underneath; the CLI itself emits a different schema (closer to Vertex/Gemini API event shape). Subscription-plan auth: rides Google account login (Cloud Code Assist free tier). Refer to vibe-kanban's gemini.rs for prior art. Pi-mono's google-gemini-cli provider (HTTP, not subprocess) is a different approach worth comparing.