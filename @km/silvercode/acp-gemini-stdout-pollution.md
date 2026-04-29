---
id: "@km/silvercode/acp-gemini-stdout-pollution"
aliases:
  - km-silvercode.acp-gemini-stdout-pollution
  - km-silvercode-acp-gemini-stdout-pollution
created_by: claude:cd034ca4
created_at: 2026-04-26T16:09:43Z
closed_at: 2026-04-26T22:13:13Z
close_reason: Closed
---

# [x] [bug] gemini-cli ACP mode emits non-JSON on stdout, breaks ACP stream parser @km/silvercode #bug #P3 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]]

`bun x @google/gemini-cli --experimental-acp` produces stdout output that is not valid ACP ndJSON-RPC. Specifically observed: lines starting with 'Skipping' (likely a config-file skip notice) leak into the JSON-RPC stream, causing a SyntaxError in the ACP SDK's stream.js parser:

```
SyntaxError: JSON Parse error: Unexpected identifier 'Skipping'
  at @agentclientprotocol/sdk/dist/stream.js:47:46
```

## Repro
```
bun apps/silvercode/tests/probe-acp.ts gemini 'say hi'
```

The probe connects (initialize + newSession succeed), but the prompt response stream is corrupted. Some non-JSON lines slip through, others survive.

## Likely cause
Gemini CLI writes warnings/info to stdout when it should write to stderr. Possibly a bug upstream, possibly a missing flag (e.g., `--quiet` or `--no-banner`).

## Workaround candidates
- Add a flag to suppress info output (research `--experimental-acp` companion flags)
- Wrap with a stdout filter that drops non-JSON lines (fragile but effective)
- File upstream issue with google-gemini/gemini-cli

## Acceptance
- bun apps/silvercode/tests/probe-acp.ts gemini 'hi' completes with stop_reason=end_turn
- No JSON parse errors in any version of gemini-cli we support