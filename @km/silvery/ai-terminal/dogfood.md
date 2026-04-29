---
id: "@km/silvery/ai-terminal/dogfood"
aliases:
  - km-silvery.ai-terminal.dogfood
  - km-silvery-ai-terminal-dogfood
created_by: claude:c56dc5d6
created_at: 2026-04-24T07:20:07Z
---

# [ ] Dogfood vehicle — silvery eats its own building blocks (interactive terminal + ai-repl) @km/silvery #feature #P2

blocks:: [[@km/silvery/ai-terminal]]

# Dogfood vehicle: silvery eats its own building blocks

**Parent**: @km/silvery/ai-terminal
**Priority**: P2 — the part of the ai-terminal thesis that's actually actionable near-term. Dogfooding finds framework bugs before users do.

## The idea

Silvery is a multi-target TUI framework. km is one showcase app. The ai-terminal thesis suggests another: **silvery can dogfood its own primitives by building a terminal on itself** — an interactive terminal at the top, and an ai-repl mode alongside.

Two dogfood targets, stacked:

1. **"Old-school" interactive terminal** — the boring shell-host use case. Stress-tests PTY integration, key-decoding (including shift+; + IME + dead keys), mouse reporting, scrollback, alt-screen, clipboard, hyperlinks. Every corner of the input + output pipeline exercised by real use.
2. **AI-repl / ai-terminal** — structured-session host for coding agents (Claude Code, Codex) in non-interactive mode. Exercises multiplex, block typing, session log, hooks. The "agent workstation" wedge in miniature.

## Why this before the product thesis is validated

Dogfooding is a framework-quality lever, not a product bet. Even if we never ship an ai-terminal product:

- The primitives (`@silvery/ansi`, `termless`, `@silvery/ag-react`, `@silvery/theme`) are stress-tested against real-world terminal weirdness by their own author. Bugs surface before users file them.
- The "one missing primitive" problem (`@silvery/pty`) gets answered: we either ship it or we don't. Better to know.
- @km/tui and @km/logview are narrow-domain apps. Dogfooding a general-purpose terminal catches edge cases those apps never hit (mouse in alt-screen, complex ANSI sequences, very-wide lines, bidirectional text, etc.).

## What to build (rough shape, open to design)

- `silvery-term` (working name) — a silvery-rendered terminal emulator pane. Initially just hosts one child PTY. Renders output through silvery components (a ScrollbackView + InputLine). Reuses `@vterm/modern` for emulation, silvery for the UI shell.
- `silvery-repl` — the ai-repl variant. Multiplexes N child processes (user's shell, an agent CLI, etc.), block-structured display, session log to JSONL.
- Both live in `vendor/silvery/examples/` (or `apps/` if they grow big) — public showcase, not hidden.

## Things to figure out (not decided, just flagged)

- Does this require `@silvery/pty` as a real package, or is a dogfood-internal `runPty()` helper enough to start?
- node-pty vs script(1) vs Bun FFI — feasibility doc ranks them; dogfood likely wants node-pty wrapper for day-1 speed.
- What's the smallest interactive-terminal that meaningfully dogfoods the stack? Answer this before building.
- Whether this is one example or two (interactive terminal + ai-repl). Probably two layers of the same stack — interactive is the substrate, ai-repl adds block typing + session semantics.

## Acceptance

- [ ] A silvery-hosted terminal pane that runs the user's shell interactively, handles mouse + alt-screen + scrollback, and doesn't corrupt output.
- [ ] Measurable bug-find: list the silvery / termless / theme / input bugs surfaced *only* by dogfooding this example (not by km).
- [ ] Decision recorded: do we need `@silvery/pty` as a public package, or is the dogfood's private helper sufficient until someone else asks?

## Not in scope

- Public product launch — that's deferred to `km-silvery.ai-terminal` epic un-parking.
- CAP protocol, commander, capability manifests — those belong to later phases of the ai-terminal thesis. Dogfood doesn't need any of it.
- Multi-pane multiplex, session persistence, collaboration — @km/silvery/ai-terminal/collaboration owns those.