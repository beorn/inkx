# silvercode-agent — own ACP-compatible agent runtime (ACP++)

**Status:** futures / vision. NOT actionable today. Quarterly review.
**Tracking bead:** `km-silvercode.silvercode-agent-future` (thin pointer back here).
**Companion docs:** [09-agent-host-landscape.md](09-agent-host-landscape.md), [10-agent-router-landscape.md](10-agent-router-landscape.md), [05-cap-protocol.md](05-cap-protocol.md).

## Vision

Today silvercode delegates to underlying agents (Claude Code, Codex, Gemini, Copilot, pi-acp). The agent loop, tool execution, model calls, prompt-cache management, context compaction — all live in the underlying CLI. We're a workspace + UX layer on top of someone else's agent.

The long-horizon move: build **silvercode-agent** — our own agent runtime that:

- Speaks plain ACP on the wire (interoperable with any ACP client, including Zed, future editors).
- Adds silvercode-specific extensions ("ACP++") for primitives ACP doesn't natively model: cross-agent state, swarm awareness, branch/fork session graph, native ambient-context typing, persistent agent memory across sessions, per-session model routing.
- Talks to LLM APIs directly (Anthropic, OpenAI, Google, OpenRouter) so silvercode owns the prompt, the tool surface, the context-window strategy.
- Becomes a peer agent in the registry: `silvercode --agent silvercode-agent` runs our agent against any user-chosen model, alongside `claude-code` / `codex` / `gemini` / `github-copilot-cli` / `pi-acp`.

When that ships, silvercode is no longer "a workspace on top of agents" — it's "a workspace + an agent + a workspace on top of agents." Users pick which combination fits.

## What we already have (pre-built foundations)

The host-side scaffolding for silvercode-agent is mostly in place. We didn't plan it that way; the discipline of "host-side everything" produced the components we'd need anyway.

| Component                       | What it does                                              | Reusable for silvercode-agent? |
| ------------------------------- | --------------------------------------------------------- | ------------------------------ |
| `controller.ts`                 | Session lifecycle, SID prefix, dispatch                  | Yes — manages silvercode-agent sessions like any other |
| `prompt-assembly.ts`            | `assembleAcpPrompt()` boundary                            | Yes — silvercode-agent reads ContentBlock[] like any agent |
| `channel-queue.ts`              | Typed ambient pipeline                                    | Yes — silvercode-agent honors ambient framing natively |
| `coordinator-mcp.ts`            | In-process MCP for cross-agent state                      | Yes — silvercode-agent participates as another peer |
| `tribe-mcp` (UDS bus)            | Cross-host swarm                                          | Yes — silvercode-agent broadcasts like any silvercode session |
| `agent-capabilities.ts`         | Declarative knob descriptors                              | Yes — silvercode-agent declares its own descriptors |
| `@km/agent-harness`             | ACP boundary, per-agent spawners                          | Partially — we'd add an in-process backend |
| `claude-acp/`                   | Wire-format adapter pattern                               | Yes — same pattern, but client-side instead of server-side |
| `km-mcp-server`                 | Vault, beads, LSP-future tools                             | Yes — silvercode-agent uses these tools too |

## What's missing (the agent loop itself)

This is the engineering surface that doesn't exist yet:

### 1. Model-call orchestration

Per-vendor backend wrapping `messages.create` / `responses.create` / `models.generateContent`:

- **Anthropic** — `@anthropic-ai/sdk`, message-style API with prompt caching, extended thinking, tool use, vision.
- **OpenAI** — Responses API stateful sessions, `reasoning_effort` parameter, function calling.
- **Google** — `@google/genai` with native tool use, vision, large context.
- **OpenRouter** — pass-through, normalized model routing.

Wrap each in a uniform `AgentBackend` interface that silvercode-agent calls. The interface is small (start turn, stream output, supply tool result, end turn) but the per-vendor wrapping carries vendor specifics.

### 2. Prompt-cache strategy

- Anthropic prompt-caching cache breakpoints — set them at session boundaries, before ambient blocks, before tool results.
- OpenAI Responses API stateful sessions — keep `previous_response_id` chain.
- Per-vendor optimization — caching saves real money at scale; getting it right is non-trivial.

### 3. Tool execution loop

The current architecture: underlying agent (e.g., Claude Code) requests a tool call → silvercode forwards as `ACP RequestPermission` if dangerous → user approves → silvercode dispatches the tool → result returns to the agent.

Moving this into silvercode-agent: silvercode-agent's loop owns "claim a tool, request permission via ACP, execute, return result, recurse." This is the biggest engineering lift because it duplicates what `claude` / `codex` already do well.

### 4. Context-window management

- Compaction / summarization strategies — today `claude` does this; we'd own it.
- Sliding window, key-fact extraction, branch-prune on long sessions.
- Per-vendor context-window limits respected automatically.

### 5. ACP server surface

silvercode-agent runs as an **ACP server** (responds to `initialize`, `newSession`, `loadSession`, `prompt`, `cancel`, etc.). Plus extension methods for ACP++:

- `silvercode/claim` — file claims as a first-class agent operation
- `silvercode/handoff` — context-bearing handoff to another session
- `silvercode/branch` — fork-from-turn at the protocol level
- `silvercode/swarm-status` — peer awareness
- `silvercode/recall` — query session memory across past sessions

All `_meta`-namespaced or behind a sub-protocol negotiation so non-silvercode clients see plain ACP.

### 6. Persistent memory across sessions

- Session-end summarization + recall index, similar to `bearly/recall` but agent-side.
- Optional, user-configurable.
- Across-session memory lets silvercode-agent know "you've worked with this file before" without us projecting history every turn.

## Trigger criteria — when to start

Build silvercode-agent when ANY of the following holds. Revisit quarterly.

### Trigger 1 — ACP gap forces our hand

A high-value silvercode feature requires a primitive ACP doesn't model AND can't be cleanly hosted out-of-band (i.e., would force `_meta` to carry semantically load-bearing information). Examples:

- First-class branch awareness inside the agent (agent knows it's on branch B, can reason about parent branch).
- Native fork-from-turn that reuses prompt cache (replay-via-`newSession` is cache-hostile).
- Persistent agent memory across sessions (today every `newSession` is amnesiac unless we project history).
- Per-session model routing (one logical session, different turns to different LLMs based on task).

### Trigger 2 — Vendor lock-in exceeds tolerance

The underlying agents diverge enough that "use the agent at full power" (per-agent capability descriptors) becomes "maintain N completely different vocabularies." silvercode-agent collapses the vocabulary into one we control.

### Trigger 3 — Plugin-runtime competitor outpaces us

If a competitor's plugin-runtime advantages compound — they ship 5 features per month that take us host-side gymnastics — the architecture pays for itself by removing the gymnastics tax.

### Trigger 4 — Subscription auth dies for delegated agents

If Anthropic / OpenAI / Google make the "driving the official CLI" pattern unviable, silvercode-agent talking directly to APIs becomes the only path that works regardless. (Current 2026-04-27 read: this is unlikely — Anthropic clarified CLI reuse is allowed. But this is the catastrophic-fallback motivation.)

### Trigger 5 — Multi-host agent coordination requires it

Cross-host swarm with persistent state, agent migration, distributed tool execution — these are easier to build into our own agent than to coordinate across N vendor CLIs.

## Anti-triggers — when NOT to build

- **"Just to have our own thing"** — not a reason. The delegate-to-vendor pattern is cheaper and ships features faster.
- **"Competitor is doing it"** — they're solving a different problem (one-best-experience). Mimicry isn't strategy.
- **"Better cost economics"** — until silvercode has paying users, cost optimization isn't the priority.
- **"Demos / marketing"** — silvercode is a research project; flashy never beats useful.

## Estimated cost when triggered

- **Engineering**: 6-12 months of focused work, single architect (this is foundational, not parallelizable).
- **Token spend**: significant ramp-up while testing all four backend APIs across realistic workloads.
- **Maintenance**: ongoing — each LLM API churns; we'd carry that maintenance burden ourselves.
- **Compatibility**: silvercode without silvercode-agent (i.e., delegating to claude-code / codex / etc.) MUST keep working. silvercode-agent is an **addition**, not a **replacement**.

## Quarterly review checklist

Each quarter, review:

- [ ] Are any of the 5 trigger criteria met? Cite specific evidence.
- [ ] Has ACP shipped any extensions that close the gaps we'd build for? If yes, write a one-line summary; consider deferring the trigger.
- [ ] Are there any new ACP-native features in the underlying CLIs we should adopt instead? If yes, prefer those.
- [ ] Has the strategic landscape changed (vendor consolidation, new subscription rules, competing harnesses)?

If a trigger fires, file `km-silvercode.silvercode-agent-v0` as the actionable epic with a phased plan: model-call-loop → tool-loop → ACP server surface → ACP++ extensions → migration story.

## Why this lives in `hub/`, not in the bead

Beads track work-to-do. This is vision, with explicit conditions for when it becomes work. Putting the full vision in a bead description bloats the issue tracker; the bead exists as a thin pointer back to this doc so future quarterly reviewers find the file.

## Reference

- Conversation 2026-04-27 (silvercode README + opencode comparison + Anthropic policy clarification) drove the "discipline of host-side everything produces silvercode-agent foundations as a side effect" insight.
- [openclaw provider docs (Anthropic)](https://docs.openclaw.ai/providers/anthropic) — the post-clarification policy that says CLI-reuse is sanctioned.
- HN: [Anthropic says OpenClaw-style Claude CLI usage is allowed again](https://news.ycombinator.com/item?id=47844269).
- The New Stack: [Anthropic: You can still use your Claude accounts to run OpenClaw, NanoClaw and Co.](https://thenewstack.io/anthropic-agent-sdk-confusion/)
- Companion: silvery's plugin-vs-ACP comparison and the trade-off geometry that made delegate-to-vendor the right starting point.
