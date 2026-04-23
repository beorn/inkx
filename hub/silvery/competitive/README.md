# Silvery Competitive Analysis

Internal strategic docs on what silvery competes against. Paired with [`docs/silvery-positioning-brief.md`](../../../docs/silvery-positioning-brief.md).

## The competitive set

Silvery's real competitors, ranked by threat level:

1. **[OpenTUI](opentui.md)** (TS+Zig+WGSL) — powers opencode (147.7k ⭐). Native-compiled renderer. Silvery's #1 competitor in the TS TUI framework layer.
2. **[@jrichman/ink fork](ink-fork-analysis.md)** (Ink+Google patches) — powers gemini-cli (102.1k ⭐). Not a competitor *today* but a spec for Ink's gaps.
3. **Mainline Ink** — legacy TS TUI dominator. Fading but broadly installed.
4. **Bubble Tea** (Go) — out of our language, but same strategic slot in Go-land. Worth watching for pattern ideas.

## Out of scope (not competitors)

- **aider** — Python tool, different layer (pair programmer, not framework).
- **Cline/Roo/Kilo** — VS Code extensions, different surface.
- **OpenHands/SWE-agent** — agent-loop research, different concern.

## Reference wiki

Cross-reference with general-purpose reference pages at `~/Bear/Journal/ref/`:
- [coding-agents/](../../../../../Bear/Journal/ref/coding-agents/README.md) — all the agents
- [tui-frameworks/](../../../../../Bear/Journal/ref/tui-frameworks/README.md) — all the frameworks

(General descriptions live in the vault; silvery-strategic commentary lives here.)

## Open questions

- Should silvery ship an Ink-compat API layer to capture fork-chain users (gemini-cli, others)?
- Does OpenTUI's Zig moat actually matter, or can pure-TS silvery match it with incremental rendering?
- Does the "multi-target" story (TUI→canvas→DOM) resonate with coding-agent builders, or is it a distraction?
