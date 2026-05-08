---
id: "@km/silvercode/backend-fakes-codex"
aliases:
  - km-silvercode.backend-fakes-codex
  - km-silvercode-backend-fakes-codex
created_at: 2026-05-06T02:00:00Z
dependencies:
  - issue_id: km-silvercode.backend-fakes-codex
    depends_on_id: km-silvercode.backend-fakes
    type: parent-child
    created_at: 2026-05-06T02:00:00Z
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: "@km/silvercode/agent-host-l5/09-test-system-and-quality-gates/backend-\
      fakes"
---

# [/] Codex fake backend profile #task #P1 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/09-test-system-and-quality-gates/backend-fakes]]

Add a Codex profile for the shared fake backend and use it to test Codex-specific config options and turn behavior.

## Scope

- Model Codex ACP defaults and session ids.
- Expose `thought_level` config with `low`, `medium`, `high`, `xhigh`.
- Expose model/mode config options when Codex surfaces them.
- Support `session/set_config_option` for reasoning and return full updated `configOptions`.
- Emit Codex-style plan updates, exec permission requests, shell/apply_patch tool calls, and cancellation/close behavior.
- Include resume/load scenarios with replayed config state.

## Acceptance

- `Option+.` and `Option+,` tests run against the Codex fake and assert `session/set_config_option` is called.
- Contract test verifies Codex reasoning values match fake profile and live backend when live mode is enabled.
- Rejected reasoning value returns a protocol error that Silvercode surfaces cleanly.

blocks:: [[@km/silvercode/backend-fakes]]

