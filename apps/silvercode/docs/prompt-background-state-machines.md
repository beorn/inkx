# Silvercode Prompt and Background State Machines

This page describes the interaction model around queued prompts, foreground turns, background turns, interruption, and subagent activity. It complements `chat-session-model.md`: all of these facts flow through `ChatEvent -> ChatSession -> ChatTree -> UI`.

## Terms

Prompt queue means the local, user-owned queue of pre-transcript prompts. Its domain state is `ChatPromptQueue`.

Provider queue means a backend-owned queue exposed by an agent provider. Silvercode should model this only when the provider returns queue ids and edit/cancel/list capabilities. stdin buffering, RPC waiters, and Claude-style "queued command" transcript attachments are not enough to claim a provider queue.

Foreground turn means the in-flight provider activity that currently owns the main session UI. While a turn is foregrounded, the composer can still collect input, but new submissions may queue locally instead of being sent immediately.

Background task means a foreground turn that the user explicitly moved out of the main UI path with Ctrl-B or trailing `&`. It is still the same provider turn; Silvercode mirrors its later events into a `BackgroundTask` so the side panel and notification block can show progress and completion.

Subagent activity means Task/Agent-style nested work inside the current chat session. It is not a background task unless the whole parent turn was backgrounded. A background task may contain subagent activity.

Interruption means the user asked Silvercode to stop showing the active foreground turn and return control to the composer. If the provider exposes per-turn abort, interruption requests cancellation. If it does not, Silvercode marks the turn interrupted, returns the UI to idle, and treats later chunks for that turn as abandoned provider output.

## Prompt Queue

```text
draft
  -> queued
  -> submitting
  -> agent-queued
  -> committed

queued
  -> cancelled
  -> failed

submitting
  -> failed
  -> committed
```

```text
command draft
  Enter while sendable
    -> ChatPrompt(status=submitting)
    -> outbound awaiting-turn-start
    -> provider running or provider queued
    -> committed user ChatMessage

command draft
  Enter while not sendable
    -> ChatPrompt(status=queued)

ChatPromptQueue
  turn-end or session lifecycle and focus is not queue
    -> flush whole queue as one user turn

ChatPromptQueue
  Ctrl+Enter in queue editor
    -> force flush unless outbound is awaiting turn-start

ChatPromptQueue
  Esc on empty command input
    -> pop queue head back into command draft
```

The important guard is the outbound state. After Silvercode writes a prompt to the provider, the session store may still look idle until the provider emits `turn-start`. During that gap, submissions must queue rather than bypass the prompt lifecycle.

## Foreground and Background

Foreground/background is a view and control state for one provider turn, not a different kind of agent.

```text
foreground running turn
  Ctrl-B or trailing &
    -> mark provider turn as backgrounded
    -> create BackgroundTask
    -> close the foreground projection for that turn
    -> composer becomes available

background task
  later provider events with same turn id
    -> append to task event buffer
    -> update task snippet/status UI

background task
  real provider turn-end
    -> mark completed
    -> emit background-result chat event
    -> keep task available for inspection

background task
  user cancels
    -> request provider abort when available
    -> mark cancelled
    -> suppress eventual completion row
```

Ctrl-B differs from prompt queue flushing. It moves the active running turn out of the foreground so the user can continue. Prompt queue flushing sends queued user input to become another prompt/turn.

## Esc and Interruption

Esc has two related but distinct behaviors:

```text
foreground running turn + empty command input
  Esc
    -> interrupt active turn
    -> mark provider turn id as interrupted
    -> close the foreground projection for that turn
    -> emit interrupted chat event
    -> drop later stream events for that turn

empty command input + non-empty prompt queue
  Esc
    -> pop queue head into command draft
```

The Claude Code wording "press esc to interrupt and send immediately" means: interrupt the currently foregrounded work so the queued prompt can become the next active prompt now. That is not Ctrl-B. Ctrl-B keeps the old turn running in the background; Esc interruption abandons the old foreground turn from the UI perspective.

## Data Model Mapping

| Concern               | Domain owner             | Shape                                                        |
| --------------------- | ------------------------ | ------------------------------------------------------------ |
| Prompt queue          | Chat domain              | `ChatPromptQueue` in `ChatSession`                           |
| Prompt                | Chat domain              | `ChatPrompt` until committed as user `ChatMessage`           |
| Outbound send gate    | Chat/controller boundary | `awaiting-turn-start`, `running`, or provider queue metadata |
| Background tasks      | Chat domain              | Background activity records projected into `ChatTree`        |
| Backgrounded turn ids | Adapter provenance       | Provider ids inside `rawRefs` or adapter-specific metadata   |
| Interrupted turn ids  | Adapter provenance       | Provider ids inside `rawRefs` or adapter-specific metadata   |
| Projection            | Chat domain              | `ChatTree` leaves/channels                                   |

```text
AgentEvent / raw notification
  -> ChatEvent
  -> ChatSession
  -> ChatTree
  -> UI
```

Prompt queue updates, background-task observations, interruptions, permission waits, and subagent activity should become owner-state updates first. They should render as transcript rows only when they are user-actionable, completion summaries, errors, or Debug-visible records.
