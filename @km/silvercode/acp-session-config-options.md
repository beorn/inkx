---
mentions:
  - km
id: "@km/silvercode/acp-session-config-options"
aliases:
  - km-silvercode.acp-session-config-options
  - km-silvercode-acp-session-config-options
created_at: 2026-05-06T01:31:58.007Z
dependencies:
  - issue_id: km-silvercode.acp-session-config-options
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-05-06T01:31:58.007Z
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
_stub: true
---

# Wire ACP session config options through Silvercode #feature #P1

blocks:: [[@km/silvercode]]

Silvercode currently models some agent capabilities locally, but it does not project ACP session config options end to end. Codex reasoning selection is the immediate visible bug: the UI can expose `low`, `medium`, `high`, `xhigh`, but changing it must call the ACP session config mutation instead of remaining UI-only.

Testing dependency: use the backend-fakes plan in [[docs/dev/silvercode-backend-fakes.md]], especially the Codex fake profile and fake/live config contract. Config-option integration tests should exercise the ACP boundary through a fake backend process/server, not by mocking `SessionState`.

## Background

ACP 0.20 exposes a typed session config mutation on the wire:

- Method: `session/set_config_option`
- Request shape: `{ sessionId, configId, value }`
- Response: full updated `configOptions`

Config categories include at least:

- `mode`
- `model`
- `thought_level`
- arbitrary provider-specific categories

Silvercode already receives or parses config option updates in the ACP adapter, but the session facade does not expose a typed config surface or setter to the app.

## Scope

- Read `configOptions` from ACP `newSession`, `loadSession`, `resumeSession`, and `config_option_update`.
- Store the current session config options in the agent/session state with typed enough data for UI use.
- Expose a session facade method that sends `session/set_config_option` with `{ sessionId, configId, value }`.
- Update local state from the returned full `configOptions`.
- Drive model/mode/thought-level controls from ACP config options when available.
- Keep descriptor fallback behavior for agents or adapters that do not expose ACP config options.
- Wire Codex `Option+.` / `Option+,` reasoning cycling to the ACP `thought_level` option, not only local capability state.

## Acceptance

- A test proves the ACP adapter sends `session/set_config_option` and applies the returned `configOptions`.
- A reducer/session-state test proves `config_option_update` refreshes the visible config state.
- A Silvercode UI/keybinding test proves Codex reasoning cycling calls the config setter when a `thought_level` option is present.
- A fallback test proves existing descriptor-driven controls still work when ACP config options are absent.
- Manual/fixture verification covers Codex values `low`, `medium`, `high`, `xhigh`.
- Fake/live contract coverage proves Codex config behavior does not drift between the fake profile and the real backend when live mode is enabled.
