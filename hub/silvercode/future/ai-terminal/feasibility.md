# Feasibility: blockers, critical path, sequencing

**Verdict**: feasible, massively differentiating if sequenced right, will stall if fanned out.

The vision isn't too big. The parallel-build instinct is.

## What's genuinely novel

- **Silvery-as-substrate for terminals** — no one ships a component library that renders to vterm + canvas + DOM with the same tree.
- **CAP** — if apps opt in, you get structured blocks, typed completion, MCP tools, and NL palettes from one manifest.
- **Session job control** — `tee A B`, `link A B`, bus-subscription — operating system for agents, Unix fg/bg/& redesigned for 2026.

Each alone would be a product. Together they're a category.

## Real blockers, ranked

### 1. Capability lying — the only scary *technical* blocker

Terminals and child processes both lie about what they support, and the failure mode is silent: wrong glyphs, eaten input, mystery corruption.

Mitigation exists:

- Smallest-persona policy (claim `xterm-256color`, not Kitty)
- Fuzz against real emulators (terminfo.dev as source)
- Conformance matrix (`@vterm/modern` vs `@vterm/vt100` as oracles)

But you'll be chasing "works on iTerm, broken in Kitty" bugs for a long time. The win: we already own `@vterm/modern`, `termless`, `terminfo.dev` — more leverage here than anyone else has.

Not a blocker; a permanent tax.

**Major mitigation added 2026-04-23**: running wrapped agents in non-interactive / structured-output modes (`claude -p --output-format=stream-json`, JSONL tailing) bypasses capability games entirely for the integration track. See 02-agent-integration.md and big-ideas.md § U.

### 2. Scope — five interdependent tracks in parallel (strategic, bigger risk than #1)

The dependency graph is fine on paper, but commander needs CAP, CAP needs at least one commander consumer, multiplex needs PTY, sessions need multiplex + CAP. If you try to ship all five to parity, you stall all five.

**Path forward**: sequence it, don't fan out. Minimum viable core:

- `@silvery/pty`
- Trivial multiplex (one pane, spawn/attach)
- CAP v0 manifest format
- One dogfood command (e.g., `bd` or `km` itself)

Everything else is phase 2+.

### 3. `@silvery/pty` is the critical path

It's the one primitive that doesn't exist yet and blocks four of the six tracks. node-pty has macOS/Windows headaches and questionable maintenance. Options:

- **Wrap node-pty** (fast, tech debt)
- **Ship `script(1)`-based fallback** (POSIX-only, good enough for v0)
- **Bun FFI into libuv pty** (best long-term, ~1-2 weeks extra)

**Pick one in week 1** or the whole thing slips.

Recommendation: ship node-pty wrapper as v0 (under `@silvery/pty` stable API), start Bun FFI track in parallel for v1.

### 4. CAP adoption — zero blockers technically, all blockers strategically

"Millions of apps" requires millions of apps to adopt it. First-order fix: `cap-wrap` that retrofits a manifest onto any existing CLI by scraping `--help`. That means CAP works on day 1 for tools that haven't heard of you. Without `cap-wrap`, CAP is a beautiful spec no one uses.

### 5. Bun lock-in (minor, acknowledge it)

Bun.$ + Bun FFI + bun:sqlite is deep. If commander ever runs outside Bun (browser target for web-native deploy), you've got work.

Mitigation: `dax` as exec-engine default (runtime-agnostic), Bun.$ as fast-path.

Not a blocker; flag it.

## What's NOT a blocker (things I checked for and don't see)

- Nested rendering isolation — solved by vterm-as-sole-sink; we own vterm.
- Input encoding modalities — tedious, not hard; `termless` already handles it.
- Daemon architecture — `bearly/tribe` is 80% there; piggyback, don't rebuild.
- Record/replay — `mdtest` tape format exists.
- Cross-target rendering — silvery already does it.
- Team size (single-maintainer velocity) — staff-eng-team pace with AI leverage. Not the bottleneck.

## Recommended sequence (don't fan out)

### Phase 0 (week 1)

`@silvery/pty` decision + skeleton. Nothing else starts without this.

### Phase 1 (weeks 2–6)

- `@silvery/commander` Phase 1 (`<CommandInput>` + dax / Bun.$)
- `@silvery/multiplex` as single-pane shim (no splits yet, just PTY-in-silvery-component)
- Dogfood: run `bun km` from inside commander, make sure it doesn't corrupt

### Phase 2 (weeks 7–10)

- CAP v0 (manifest + `cap-wrap` + block stdout)
- Retrofit onto `km` and `bd`
- Dogfood: palette, flag forms, block rendering for own tools

This is when the 10× story becomes demonstrable.

### Phase 3 (weeks 11–16)

- Sessions (typed pipe + tribe bus)
- Splits / tabs in multiplex
- Agent-integration adapter for Claude Code (non-interactive mode first)

### Phase 4 (weeks 17+)

- Agent-authoring track: `silvery-coder` MVP on the substrate
- Multi-agent pipelines via sessions
- `@silvery/agent-kit`

### Later / opportunistic

- Web-native deployment
- Collaborative sessions
- Accessibility polish
- Observability UI

## Why sequenced, not parallel

- Commander Phase 1 is **the proof** that unlocks everything else. Without a working `<CommandInput>` + block emission, CAP is a spec with no consumer, multiplex is tmux-but-silvery, sessions is a protocol with no users.
- Each phase's deliverable must be dogfood-able by me daily. If I can't use it, I can't ship it.
- Parallel agents on foundational code means orphan branches, lost coordination, duplicated decisions. Sequence avoids that.

## The one decision to make now

**`@silvery/pty` strategy**: node-pty wrap vs script(1) shim vs Bun FFI. That decision gates everything else.

Recommendation (repeat): ship node-pty wrap as stable interface, plan Bun FFI replacement in v1. Low-risk, reversible, fast.

## When to revisit this doc

- After km + silvery 1.0 ship — capacity to take on new track
- When showcase demo needs embedded panes (pulls substrate forward)
- When a CAP-adjacent opportunity emerges (e.g., Anthropic ships MCP for CLIs, making our CAP position either obsolete or validated)
- After /pro review returns blockers we missed

