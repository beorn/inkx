---
topic: "subagent run lifecycle projection"
date: 2026-05-07
session: "silvercode agent drawer only #2"
arch_agent_report: "Second opinion agreed drawer must project from one authoritative run registry, not message/notification stitching."
verdict: "ADOPTED"
---

# Arch retro — subagent run lifecycle projection

## Bundle path

No full `/tmp/arch-*` bundle was created. This was an urgent bug-fix slice after `/big`; the implementation used the existing chat-session model doc, the active quality-plateau bead, the persisted Claude JSONL evidence, and an external second-opinion run saved at `/var/folders/x6/0j792q0d0411wgsxyr1bqkp40000gn/T/llm-manual-second-opinion-for-a-8327.txt`.

## Canonical docs actually read

- `apps/silvercode/docs/chat-session-model.md:1-96` — read model pipeline, identity rules, and UI projection boundary.
- `@km/silvercode/chat-domain-quality-plateau.md:1-236` — active design bead for chat-domain projection, terminology, recent regressions, and close criteria.
- `apps/silvercode/packages/agent-harness/src/events.ts:1-178` — canonical `AgentEvent` tool-use/tool-result surface.
- `apps/silvercode/packages/agent-harness/src/session-types.ts:1-220` — compatibility `MessageEntry` / `MessageOp` shape.
- `apps/silvercode/src/chat/types.ts:1-370` — existing `ChatEvent`, `ChatSession`, `ChatTool`, `ChatTree`, and channel model.

## Close-reasons read

None through `km bd show`: the local bead CLI currently fails in this worktree with `SyntaxError: export 'readTerminalGrapheme' not found in '@silvery/ag-term/unicode'`. The active bead body was read directly instead.

## Contradictions found

- Prior local fixes treated "only Agent #2" as a drawer projection loss. The latest persisted Claude JSONL window showed only one `Agent` tool-use event for `Sleep 20s #2`; the assistant text claimed "All 4 done" but the lifecycle event stream did not contain #1/#3/#4. The source-of-truth model wins over assistant narration.
- The existing user-visible path still rendered from legacy `MessageEntry[]` plus notification entries, while the documented target pipeline is `AgentEvent / NotificationStreamEntry -> ChatEvent -> ChatSession -> ChatProjection -> UI`. This slice moves subagent drawer state onto the `ChatEvent` projection while leaving shell/background compatibility in the legacy snapshot helper.

## Reversal check

- [x] REVERSAL FROM PRIOR FRAMING

Prior framing said: fix drawer merge keys, notification breaker admission, mute handling, and current-turn filters.

New verdict says: subagent cardinality needs a first-class lifecycle projection. Notification observations can enrich the run model, but they are not drawer state. Assistant completion text is not lifecycle evidence.

Why justified: in the latest JSONL evidence, the model emitted one `Agent` tool-use event and one result, but text claimed four. A UI merge patch cannot render missing lifecycle events honestly.

## Verdict

ADOPTED. Add `SubagentRun` / `ChatSubagentRun` as the canonical lifecycle read model for Task/Agent-style local agents. The drawer consumes current-session/current-turn runs. Compatibility code may adapt `MessageEntry[]` into the same reducer until the legacy transcript renderer is fully migrated.

## Effort estimate

Implemented as a low-risk slice: one new chat-domain reducer, small `ChatSession` type/store extension, `ChatPane` drawer source reroute, compatibility adapter update, regression tests, and doc/bead notes.
