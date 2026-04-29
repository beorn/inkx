---
id: "@km/silvercode/agent-verification-matrix"
aliases:
  - km-silvercode.agent-verification-matrix
  - km-silvercode-agent-verification-matrix
created_by: claude:4de4a3ab
created_at: 2026-04-27T17:59:03Z
---

# [ ] Verify all 7 agents end-to-end + research missing capability configs (gemini, copilot) @km/silvercode #task #P2

blocks:: [[@km/silvercode]]

Smoke-test every BUILTIN_AGENT through the silvercode UI + config + basic features. Research and fill capability descriptors for gemini and github-copilot-cli (both currently undefined → SidePanel hides their thinking/planning rows).

Backends (BUILTIN_AGENTS in apps/silvercode/src/config-schema.ts):
  - claude-code (ACP)        / claude-code-spawn / claude-code-sdk
  - codex (ACP)              / codex-spawn
  - gemini (ACP)             ← needs capability research
  - github-copilot-cli (ACP) ← needs capability research

Per-agent acceptance (10-point checklist):
  1. silvercode --agent <id> launches, SidePanel shows agent + model.
  2. SidePanel renders thinking + planning rows from descriptors (or correctly hides if undefined).
  3. Cycle button works on thinking row; popover shows descriptor options (not Claude defaults).
  4. Cycle button works on mode row; popover shows descriptor options.
  5. Basic prompt round-trips through ACP / spawn / sdk transport.
  6. silvercode --resume <id>:<sid> reattaches (or clear stderr error if loadSession unsupported).
  7. silvercode doctor connections smoke passes.
  8. Quit (Ctrl+C / 'q') closes subprocess within 10s graceful-kill window.
  9. Storybook stories for the agent's surface render in the runner.
 10. tests/slow/all-backends.slow.test.tsx covers spawn → close.

Capability research (gemini + github-copilot-cli):
  - Read upstream CLI source / README / CHANGELOG for any reasoning-effort, plan, or approval-mode toggles.
  - Write tests/eval/capability-discovery.slow.test.ts that prints negotiated agentCapabilities + sessionModes from session-init for each backend.
  - If exposed: add CapabilityOption[] entries mirroring CLAUDE/CODEX shape, wire defaults, add storybook stories.
  - If nothing exposed: leave undefined, document why with version stamp in agent-capabilities.ts footer.

Out of scope (separate beads): cross-agent resume (@km/silvercode/cross-agent-replay); pi-acp registry promotion to BUILTIN_AGENTS.