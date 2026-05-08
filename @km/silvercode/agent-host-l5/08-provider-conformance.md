---
aliases:
  - km-silvercode.agent-host-l5.08-provider-conformance
  - km-silvercode-agent-host-l5-08-provider-conformance
created_at: 2026-05-08T06:22:43.369Z
---

# [/] Provider conformance matrix #feature #P0 @agent/3

Turn the feature matrix into executable conformance for Claude wrapper, official Claude ACP, Codex ACP, Codex rollout, Gemini ACP, opencode/Kilo, Copilot, and fakes. Unsupported features must have explicit capability/fallback behavior.

## Ownership

This phase owns proof against providers:

- Feature support is executable, not prose-only.
- Each provider has a conformance profile for runtime, persistence, projection, mentions, controls, jobs/subagents, and replay.
- Unsupported or partial features are explicit capability facts.
- Provider trackers are evidence and parity work, not alternate domain designs. Embedded old type proposals are historical unless they match phase 01 vocabulary.

## Complete Criteria

- Provider matrix rows have fake-backed tests where feasible and live-smoke notes where not.
- Claude, Codex, ACP/opencode/Kilo, and fake providers all run through the same canonical model tests.
- Unsupported features produce stable UI and logs instead of silent best-effort behavior.
