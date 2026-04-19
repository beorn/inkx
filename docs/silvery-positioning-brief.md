# Silvery Positioning Brief (for LLM calls and onboarding)

**One-paragraph summary for external LLMs, reviewers, and new contributors.** Include this — or link to it — any time context about silvery/km is sent to a `/pro`, `/deep`, `/llm`, or `/ask` tool.

## What silvery is

Silvery is a **multi-target UI framework with web ambitions**. It renders to terminals today (primary), canvas and DOM are explicit future targets, and the design system is built for all three. It is **not** "Ink but better"; it's not a terminal-only library; it's not a ports-to-other-targets afterthought. The design system, tokens, components, layout engine, and theming are designed as a **cross-platform design system first** and happen to render beautifully in a terminal today.

## Why this matters for design decisions

When weighing a trade-off, pick the answer that serves silvery as a multi-target framework — even when the current shipped target is only terminal:

- **Token naming**: prefer cross-platform conventions (Polaris / Tailwind — `fg-critical`, `bg-fill-accent-hover`) over TUI idioms (`$error`). Web-literate devs onboard via prior art.
- **Interactive states**: include the full hover/active matrix (not just "what TUI needs today") — the taxonomy defines the ceiling; components adopt as they grow mouse handling.
- **Theme values**: pure hex (no ANSI slot name strings); tier quantization at the output phase only. Web/canvas get the same Theme shape without translation.
- **API surface**: `ColorScheme` + `Theme` are platform-neutral; terminal specifics live in `@silvery/ansi`. Web target will get its own derivation / render path, same Theme contract.
- **Component APIs**: hover/click/focus ARE first-class — silvery just shipped omnibox-style SelectList/ListView/Tabs with `onMouseEnter`/`onClick` + visual hover. Mouse interaction is the design norm, not an optional extra.

## Why this matters for AI-assistant answers

When answering "should we do X or Y," the default posture is:

- If X is "what terminal devs expect" and Y is "what web/cross-platform design systems do" — pick Y unless there's a specific TUI-pain argument.
- If the answer would cap silvery's ceiling to current capability, don't pick it. Design for where silvery is going, not where it is.
- The user has said it explicitly: "if we create a design system that is great now we can actually more easily make silvery/km feel more web-like — if we restrict the design system to 'traditional TUI-like' then that's all silvery/km will be."

## What km is in relation

km is silvery's **lead showcase app** (terminal-first, knowledge-worker tool). km drives feature requirements; silvery ships them as general-purpose framework primitives. They co-evolve: km uses whatever silvery ships; silvery ships what km needs AND what the multi-target framework requires. When a feature only makes sense for km, it stays in km's views layer. When a feature could serve any silvery app, it graduates into silvery.

## Use

- In `/pro`, `/deep`, `/llm`, `/ask` tool calls: include this file via `--context-file`, OR paste this paragraph directly into the prompt preamble.
- When the LLM would otherwise default to "advise them as a TUI library author" — the brief redirects to "advise them as a cross-platform design-system author."
- When onboarding a new agent / session — reference this in the root CLAUDE.md.
