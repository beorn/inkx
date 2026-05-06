---
mentions:
  - silvery
  - km
id: "@km/silvery/shell"
aliases:
  - km-silvery.shell
  - km-silvery-shell
created_by: claude:6443387f
created_at: 2026-04-24T04:57:25Z
closed_at: 2026-04-24T06:15:47Z
close_reason: Moved out of beads (2026-04-23). Speculative brainstorming, not
  roadmap — docs at hub/silvery/future/ai-terminal/. Revisit after km + silvery
  1.0 ship.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.shell
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T21:57:46Z
    created_by: claude:6443387f
    metadata: "{}"
  - issue_id: km-silvery.shell
    depends_on_id: km-silvery.commander-protocol
    type: blocks
    created_at: 2026-04-23T22:32:02Z
    created_by: claude:6443387f
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery
      - type: link
        target: km-silvery.commander-protocol
---

# [x] @silvery/commander: silvery-app for command execution (shell input is one component) @km/silvery #feature #P4

blocks:: [[@km/silvery]], [[@km/silvery/commander-protocol]]

Build our own shell — standalone binary that works in any terminal, progressively enhanced when running inside silvery-mux. Agent-first positioning: shell itself understands that agents drive it, blocks are structured data, policy gates are first-class.

## Why

Warp/Fig sit on top of bash/zsh via line-editor interception. nushell is general-purpose structured-data. Nobody has shipped an agent-first shell. Ours becomes the canonical experience inside silvery-mux while remaining independently useful.

## What it unlocks

- Structured blocks natively (no OSC 133 hack, no shell integration install dance). Every command emits {cmd, cwd, env_delta, exit_code, duration, stdout, stderr, timestamps} as first-class data.
- Agent-aware execution gate — policy prompts before rm -rf, audit log, deny rules. bash can't do this.
- Perfect OSC emission always (OSC 7 cwd, OSC 133 A/B/C/D prompts, OSC 9/99/777 events). silvery-mux rich-tab metadata depends on markers existing; with our shell, they always exist.
- Structured prompt as silvery component — <Prompt><GitBranch /><CwdCompact /><AgentStatus /></Prompt>, themed with $tokens.
- Cross-pane block queries — all panes stream blocks to daemon; searchable, replayable.
- Agent-first prompt UX — when driven by agent, suppress interactivity; when human-driven, full ceremony.

## Scope — minimal useful, ~6 weeks

| Component                                                                                      | Time |
| ---------------------------------------------------------------------------------------------- | ---- |
| REPL skeleton (line editor via silvery TextInput, history, parser, spawn/wait, basic builtins) | 1 wk |
| Pipelines + redirects                                                                          | 1 wk |
| Job control (&, SIGTSTP, jobs/fg/bg)                                                           | 1 wk |
| Completion + syntax highlighting                                                               | 1 wk |
| Config + startup (~/.silveryshrc, aliases, env)                                                | 1 wk |
| Structured blocks emission (OSC 133 + metadata streaming to daemon)                            | 1 wk |

Not POSIX-compatible. Existing #!/bin/bash scripts fall back to bash via shebang detection. Daily-driver-with-zsh-plugin-compat is a separate 6-month effort we do NOT commit to.

## Integrated vs. separate

Both. Standalone binary that works in any terminal; progressive enhancement when running inside silvery-mux (richer OSC streams, direct daemon channel via FD inheritance instead of parsing output). Mux panes default to silvery-shell; users can override; nothing is forced.

Preserves "primitive not solution" — silvery-shell is separately useful, not a piece that only makes sense as part of the harness.

## Explicit non-scope

- POSIX compat layer (use bash for scripts via shebang dispatch)
- zsh/bash plugin compat (users choose)
- Daily-driver replacement of zsh/bash for general users (opinionated: agent/mux users first)
- Feature parity with fish's UX polish (start with useful, iterate)

## Consumers

- silvery-mux agent panes (default shell)
- silvery-showcase coding-assistant demo
- Standalone users who want structured-data + agent-aware features
- km (terminal panes alongside kanban)

## Relation to other beads

- @km/silvery/multiplex — multiplex daemon consumes our block stream; silvery-shell is the best citizen inside mux panes
- @km/silvery/agent-harness — agent-harness adapters consume silvery-shell's structured events for richer per-pane UI

## Dependencies

- silvery TextInput (for line editor)
- @silvery/pty (for spawn/exec)
- recall-shape block index (for cross-pane search, reuse bearly infra)

## Origin

2026-04-23 discussion — libghostty ruled out as dependency; own-shell analysis showed ~6 weeks for minimal useful, big benefits for agent-first positioning.

