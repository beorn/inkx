---
aliases:
  - km-silvercode.expand-builtin-agents-acp-registry
  - km-silvercode-expand-builtin-agents-acp-registry
created_at: 2026-05-07T19:16:41.372Z
---

# [/] Expand BUILTIN_AGENTS with ACP-Registry agents (opencode, kilo, goose, auggie, qwen-code) #P1 @agent/3

Per the systematic provider review (chat 2026-05-07): the ACP Registry now ships 25+ agents (Amp, Auggie, Cline, Codebuddy, crow-cli, Cursor, DeepAgents, Factory Droid, goose, Junie, Kilo, Kimi, Mistral Vibe, Nova, OpenCode, Pi ACP, Qoder, Qwen Code, Stakpak, etc.). Most of these are one-line BUILTIN_AGENT entries — silvercode owns the cockpit, the Registry owns the wire.

Pick a tight first batch — agents that are widely used, have shipping ACP servers, and make sense for current silvercode dogfooding:

- **opencode** (sst/opencode) — substrate Kilo is built on; Registry id `opencode`, version 1.14.x
- **kilo** (Kilo-Org/kilocode) — Registry id `kilo`, version 7.2.x
- **goose** (Square) — Registry id `goose`, version 1.32.x
- **auggie** (Augment Code) — Registry id `auggie`, version 0.24.x
- **qwen-code** (Alibaba Qwen) — Registry id `qwen-code`, version 0.15.x

Acceptance:

- Each entry added to `apps/silvercode/src/config-schema.ts` BUILTIN_AGENTS map with: id, transport=acp, credEnv, defaultModel (where the agent has one), description.
- Capability descriptors in `apps/silvercode/src/agent-capabilities.ts` — at minimum the per-vendor brand color, default reasoning/permission row spec (or `hidden` if unknown). Best-effort mining from each Registry entry's docs.
- `silvercode doctor` output shows install state for each new entry (npm package presence + auth status).
- One smoke test per agent in `apps/silvercode/tests/builtin-agents-resolve.test.ts` — `silvercode --agent <id>` resolves to the registered entry without spawn-erroring (fake spawn ok).
- Out of scope: per-agent native vocabulary descriptors beyond brand color — those land per-agent as we dogfood.
- Cross-reference: hub/silvercode/future/ai-terminal/10-agent-router-landscape.md "Zed ACP Registry — 25 ACP-speaking agents" table.

