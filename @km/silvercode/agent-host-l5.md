---
aliases:
  - km-silvercode.agent-host-l5
  - km-silvercode-agent-host-l5
created_at: 2026-05-08T06:21:46.788Z
---

# [/] L5 agent host architecture — prior art, domain model, runtime, providers, tests #epic #P0 @agent/3

Canonical umbrella for re-architecting Silvercode as a robust agent client host. Owns prior-art study, provider feature matrix, domain vocabulary, state machines, runtime/turn owner, thread/session persistence, projection, context/mentions, permissions/plans/tools, background jobs/subagents, provider conformance, tests, and legacy quarantine.

Reference design: `hub/silvercode/future/ai-terminal/acp-wrapper-runtime-reference-2026-05-08.md`.

This is a `/refactor plan`, not a backlog bucket. Every implementation phase must follow `docs/lessons/refactoring.md`: update beads first, introduce one concept per phase, delete the old equivalent in the same phase whenever possible, avoid compatibility shims, and run literal `/complete` greps with actual counts before closing.

## Quality Plateau

Silvercode reaches L5 when the live path has one obvious model:

`Thread -> SessionBinding -> Turn -> Message/Block/Thought/Tool/Plan/Job -> ChatTree -> ChatTrack projection`

There may be provider-specific raw ledgers and parsers, but UI code must not infer state from provider chunk shape, output gates, `SessionUpdateList`, `MessageEntry`, `ChatChannel`, or `reasoning` UI names. Those are legacy or provider-boundary terms only.

## MECE Phase Ownership

| Phase | Owns | Does not own |
|---|---|---|
| 00 prior art and feature matrix | external systems, capability matrix, adopted/adapted/rejected decisions | code migration |
| 01 domain vocabulary and state machines | names, types, legal transitions, state ownership | provider quirks |
| 02 runtime kernel and turn owner | live session owner, turn lifecycle, queue/backpressure, cancel/drain | transcript rendering |
| 03 thread/session persistence and replay | durable Thread, SessionBinding history, raw/runtime ledgers, replay identity | visual debug UI |
| 04 chat thread projection | stream normalization, chunk reconciliation, ChatTree, ChatTrack, transcript cutover | provider conformance scoring |
| 05 context mentions and prompt composition | MentionUri/MentionSet, prompt assembly, attachments, ambient context | runtime queue policy |
| 06 permissions, plans, tools, controls | Permission, Plan, Tool, config, usage, mode/model controls | subagent navigation |
| 07 background jobs and subagents | Job, SubagentRun/Subthread, backgrounding, completion/cancel routing | generic plan statuses |
| 08 provider conformance | executable provider matrix and unsupported-feature behavior | canonical model design |
| 09 test system and quality gates | fakes, fixtures, replay, traffic log viewer, property/visual/conformance tests | production runtime ownership |
| 10 migration and legacy quarantine | delete old names/paths/shims and verify zero-hit greps | new feature design |

If a concern appears in two phases, the owner above wins and the other phase links to it.

## Refactor Gates

- Prior-art gate: 00 must record the systems studied and each decision as adopted, adapted, or rejected before implementation phases close.
- Vocabulary gate: 01 must define the accepted names and grep gates. `Track` replaces chat `channel`; `Thought` replaces UI/domain `reasoning`; `Message` replaces `assistant-text`, `user-text`, and `Chat.Narration` naming.
- State-machine gate: each durable owner has a closed state table with illegal-transition tests.
- Delete gate: any phase that leaves a legacy bridge must link to a cleanup bead under 10 before it closes.
- Test gate: each new substrate lands with focused tests in the same phase. Shadow-oracle dual paths are allowed for one test-suite run only and must have a deletion bead.
- Debug gate: raw traffic capture and replay are first-class test/debug tools, not ad-hoc logs.

## Global Completion Greps

Run these from repo root and report actual counts before closing the epic or an L5 cleanup bead:

```bash
rg -n "ChatChannel|ChatLeaf\\.channel|defaultChatChannels|setChannelVisible" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs
rg -n "assistant-text|user-text|Chat\\.Narration|\\breasoning\\b" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs
rg -n "SessionUpdateList|MessageEntry|ContentBlock" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs
rg -n "output gate|outputGate|canSend.*thinking|status.*thinking" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs
```

Allowed survivors must be explicitly documented provider-boundary terms, raw fixture text, or historical bead/design notes. They do not count as live-path L5.
