---
id: "@km/silvercode/model-capability"
aliases:
  - km-silvercode.model-capability
  - km-silvercode-model-capability
created_by: claude:4de4a3ab
created_at: 2026-04-27T18:47:01Z
---

# [ ] [feature] Add 'models' capability to AgentCapabilities — descriptor-driven model picker per agent @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Extend the per-agent CapabilityOption pattern (apps/silvercode/src/agent-capabilities.ts) with a third field 'models' alongside 'thinking' and 'planning'. Same descriptor-driven UI shape as the existing rows.

Rationale: today the SidePanel cycles thinking + planning per-agent from CapabilityOption[] descriptors; model selection is the obvious third knob. Codex supports mid-session /model swap; Claude requires session restart; UI handles both.

Spec sketch (full type in agent-capabilities.ts when implemented):
  - ModelOption = CapabilityOption + { modelId, contextWindow?, inputCostPerMTokens?, outputCostPerMTokens?, notes? }
  - capabilities.models?: ReadonlyArray<ModelOption>
  - SidePanel adds a third row reading from descriptor; falls back to defaultModel.
  - Activation: agent's native model-switch path (slash command for codex; state-only with toast for claude).

Top-N popular per agent (refine via research):
  - claude:  opus-4.7 (default) / sonnet-4.6 / haiku-4.5
  - codex:   gpt-5-codex (default) / gpt-5-mini / gpt-5-pro
  - gemini:  2.5-pro (default) / 2.5-flash
  - copilot: TBD (research)

Acceptance:
  - 3 model options per agent shipped; SidePanel descriptor-driven; cycle works per-agent activation path; storybook stories per agent; assertCapabilities validates.

Sister bead: @km/silvercode/cross-agent-replay (model-switch is a strict subset of agent-replay if the latter works).