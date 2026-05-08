# Silvercode Agent Host State Machines

Silvercode state changes are closed transitions over the domain model in
`chat-session-model.md`. Runtime code should not derive lifecycle from scattered
booleans, transport latches, or UI rows. Every important transition has one owner and
one illegal-transition policy.

Streaming provider chunks are normalized before they reach these state machines;
see `chat-stream-normalization.md` for block stitching and raw-provenance rules.

```text
Provider event
  -> parser
  -> normalizer
  -> ThreadEvent
  -> transition owner
  -> ThreadState
  -> ChatTree + ChatTrack projection
```

## Rules

- The transition owner validates every state change.
- Unknown provider events become TrafficLog/debug evidence before they affect
  user-visible state.
- Late events are routed by Thread, SessionBinding, Turn, and provider
  provenance. They do not reopen completed work unless a transition explicitly
  allows it.
- Projection is pure: it reads ThreadState and emits ChatTree/ChatTrack data.
- UI components render projection data; they do not infer agent lifecycle from
  raw provider events.

## Connection

An AgentConnection owns a live transport/process/server attachment.

| From           | Event                       | To             | Notes                                  |
| -------------- | --------------------------- | -------------- | -------------------------------------- |
| `created`      | start requested             | `starting`     | Spawn/connect begins.                  |
| `starting`     | handshake ok                | `ready`        | Capabilities become available.         |
| `starting`     | handshake failed            | `failed`       | SessionBinding records failure.        |
| `ready`        | transient disconnect        | `reconnecting` | Only if backend supports recovery.     |
| `reconnecting` | handshake ok                | `ready`        | Same binding resumes.                  |
| `reconnecting` | retry exhausted             | `failed`       | Binding becomes failed/lost.           |
| `ready`        | close requested             | `closing`      | Stop accepting new Turns.              |
| `closing`      | process exited              | `closed`       | Terminal.                              |
| `ready`        | process exited unexpectedly | `failed`       | Terminal unless recovery starts first. |

Terminal states are `closed` and `failed`.

## SessionBinding

A SessionBinding attaches a provider session to a Thread.

| From       | Event                     | To         | Notes                                                                            |
| ---------- | ------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `unbound`  | bind requested            | `starting` | Creates or resumes provider session.                                             |
| `starting` | provider session id known | `bound`    | Binding can accept Turns if Connection is ready.                                 |
| `starting` | provider failed           | `failed`   | Terminal for this binding attempt.                                               |
| `bound`    | drain requested           | `draining` | Existing Turn may finish; new foreground Turns are rejected or queued elsewhere. |
| `draining` | all Turns settled         | `ended`    | Terminal normal end.                                                             |
| `bound`    | provider ended            | `ended`    | Terminal normal end.                                                             |
| `bound`    | provider lost             | `lost`     | Recoverable only by creating a new binding or explicit recovery edge.            |
| `lost`     | recovery requested        | `starting` | New handshake for same logical binding when backend supports it.                 |
| `lost`     | abandoned                 | `failed`   | Terminal.                                                                        |

Terminal states are `ended` and `failed`.

## Turn

A Turn is the lifecycle boundary for submitted agent work.

| From         | Event                      | To           | Notes                                                                             |
| ------------ | -------------------------- | ------------ | --------------------------------------------------------------------------------- |
| `accepted`   | enqueue policy says wait   | `queued`     | Owned locally; visible and cancellable.                                           |
| `accepted`   | can start now              | `starting`   | Submission begins immediately.                                                    |
| `queued`     | selected by owner          | `starting`   | Queue owner is the only writer.                                                   |
| `queued`     | user cancels before submit | `cancelled`  | Terminal; no transcript Message is created.                                       |
| `starting`   | provider ack               | `active`     | Provider has accepted or started work.                                            |
| `starting`   | local send failed          | `failed`     | Terminal unless retry creates a new Turn attempt.                                 |
| `active`     | provider says complete     | `draining`   | Enter late-event drain window.                                                    |
| `draining`   | idle window elapsed        | `completed`  | Terminal success.                                                                 |
| `active`     | cancel requested           | `cancelling` | Stop accepting normal output as foreground-owned after policy cutoff.             |
| `cancelling` | provider confirms cancel   | `cancelled`  | Terminal.                                                                         |
| `cancelling` | provider cannot confirm    | `lost`       | Terminal from control perspective; later output becomes debug/abandoned evidence. |
| `active`     | provider failed            | `failed`     | Terminal.                                                                         |
| `active`     | binding lost               | `lost`       | Terminal unless recovery explicitly reattaches.                                   |

Terminal states are `completed`, `cancelled`, `failed`, and `lost`.

`draining` is deliberate. It copies ACPX's robustness pattern: a provider may
send final content just after the nominal completion notification.

## Message

A Message is transcript history, not the Turn lifecycle itself.

| From        | Event              | To          | Notes                                |
| ----------- | ------------------ | ----------- | ------------------------------------ |
| `created`   | first block starts | `streaming` | User Messages may skip to completed. |
| `streaming` | block appended     | `streaming` | Reconciliation updates owned Blocks. |
| `streaming` | message closed     | `completed` | Terminal for this Message.           |
| `created`   | message closed     | `completed` | Static Message.                      |
| `created`   | owner cancelled    | `cancelled` | Terminal.                            |
| `streaming` | owner failed       | `failed`    | Terminal.                            |

Terminal states are `completed`, `cancelled`, and `failed`.

## Block

A Block is typed content inside a Message, prompt, or ToolCall output.

| From        | Event        | To          | Notes                                      |
| ----------- | ------------ | ----------- | ------------------------------------------ |
| `created`   | append chunk | `streaming` | TextBlock and ThoughtBlock usually stream. |
| `streaming` | append chunk | `streaming` | Chunk reconciliation owns merge rules.     |
| `created`   | close        | `completed` | Static blocks.                             |
| `streaming` | close        | `completed` | Terminal.                                  |
| `created`   | owner failed | `failed`    | Terminal.                                  |
| `streaming` | owner failed | `failed`    | Terminal.                                  |

Terminal states are `completed` and `failed`.

## ToolCall

ToolCall owns provider tool lifecycle and output.

| From                 | Event             | To                   | Notes                                                                   |
| -------------------- | ----------------- | -------------------- | ----------------------------------------------------------------------- |
| `announced`          | start             | `running`            | Tool args are known enough to display.                                  |
| `running`            | permission needed | `waiting_permission` | PermissionRequest owns the decision.                                    |
| `waiting_permission` | approved          | `running`            | Tool resumes.                                                           |
| `waiting_permission` | denied            | `cancelled`          | Terminal unless provider keeps running, then output is abandoned/debug. |
| `running`            | output chunk      | `running`            | Output Blocks reconcile under the ToolCall.                             |
| `running`            | result            | `completed`          | Terminal success.                                                       |
| `running`            | failure           | `failed`             | Terminal.                                                               |
| `running`            | owner cancelled   | `cancelled`          | Terminal.                                                               |

Terminal states are `completed`, `cancelled`, and `failed`.

## PermissionRequest

PermissionRequest owns user authorization.

| From        | Event         | To          | Notes                                                     |
| ----------- | ------------- | ----------- | --------------------------------------------------------- |
| `requested` | user approves | `approved`  | Unblocks owner.                                           |
| `requested` | user denies   | `denied`    | Owner transitions according to policy.                    |
| `requested` | owner cancels | `cancelled` | Terminal.                                                 |
| `requested` | timeout       | `expired`   | Terminal unless policy reopens by creating a new request. |

Terminal states are `approved`, `denied`, `cancelled`, and `expired`.

## PlanStep

PlanStep status is provider-normalized. Snapshot providers reconcile by stable
step identity plus order; delta providers update individual steps.

| From          | Event                   | To            | Notes                                                              |
| ------------- | ----------------------- | ------------- | ------------------------------------------------------------------ |
| `pending`     | starts                  | `in_progress` | Only one in-progress step is required when provider guarantees it. |
| `pending`     | skipped                 | `skipped`     | Terminal.                                                          |
| `pending`     | completed without start | `completed`   | Terminal; some providers emit snapshots only.                      |
| `in_progress` | completed               | `completed`   | Terminal.                                                          |
| `in_progress` | failed                  | `failed`      | Terminal.                                                          |
| `in_progress` | cancelled               | `cancelled`   | Terminal.                                                          |
| `pending`     | removed by snapshot     | `cancelled`   | Unless source says omission means unknown.                         |

Terminal states are `completed`, `failed`, `cancelled`, and `skipped`.

## Job

Job is the user-control handle for work. Execution and attachment are separate
axes.

Execution state:

| From         | Event                      | To           | Notes                                |
| ------------ | -------------------------- | ------------ | ------------------------------------ |
| `queued`     | start                      | `running`    | Work begins.                         |
| `running`    | blocked on permission/tool | `waiting`    | Owner remains active.                |
| `waiting`    | unblocked                  | `running`    | Work resumes.                        |
| `running`    | complete                   | `completed`  | Terminal.                            |
| `running`    | cancel requested           | `cancelling` | Await confirmation or policy cutoff. |
| `cancelling` | confirmed                  | `cancelled`  | Terminal.                            |
| `cancelling` | cannot confirm             | `lost`       | Terminal from control perspective.   |
| `running`    | failed                     | `failed`     | Terminal.                            |

Attachment state:

| From         | Event                | To           | Notes                                                        |
| ------------ | -------------------- | ------------ | ------------------------------------------------------------ |
| `foreground` | background requested | `background` | Work continues; foreground accepts other input.              |
| `foreground` | interrupt requested  | `detaching`  | Cancel or abandon according to backend capability.           |
| `detaching`  | control released     | `abandoned`  | Later output is TrafficLog/debug unless explicitly surfaced. |
| `background` | user opens details   | `inspecting` | Does not reattach as foreground ownership.                   |
| `inspecting` | close details        | `background` | Work continues or remains terminal.                          |

Execution terminal states are `completed`, `cancelled`, `failed`, and `lost`.
Attachment terminal state is `abandoned`.

## SubagentRun

SubagentRun is child-agent work with parent provenance.

| From                 | Event                         | To                   | Notes                                               |
| -------------------- | ----------------------------- | -------------------- | --------------------------------------------------- |
| `requested`          | provider/tool accepts         | `starting`           | Parent ToolCall or Turn records provenance.         |
| `starting`           | child session known           | `running`            | Child SessionBinding may be created.                |
| `starting`           | provider only exposes tool id | `running`            | Transcript discovery can remain pending.            |
| `running`            | child emits progress          | `running`            | Progress belongs to child state, not parent prose.  |
| `running`            | child asks permission         | `waiting_permission` | Permission may route through parent UI.             |
| `waiting_permission` | resolved                      | `running`            | Child resumes or cancels by policy.                 |
| `running`            | delivery ready                | `delivering`         | Completion payload is normalized.                   |
| `delivering`         | parent accepts delivery       | `completed`          | Terminal.                                           |
| `running`            | cancel requested              | `cancelling`         | Cascade policy applies.                             |
| `cancelling`         | confirmed                     | `cancelled`          | Terminal.                                           |
| `running`            | failed                        | `failed`             | Terminal.                                           |
| `running`            | child session lost            | `lost`               | Terminal unless recovery creates a new run/binding. |

Terminal states are `completed`, `cancelled`, `failed`, and `lost`.

## Track Projection

Tracks are projection state, not durable lifecycle owners.

| Input                                          | Track          |
| ---------------------------------------------- | -------------- |
| User and assistant Messages                    | `conversation` |
| ThoughtBlocks                                  | `thought`      |
| ToolCall lifecycle and output                  | `tool`         |
| Plan and PlanStep changes                      | `plan`         |
| PermissionRequest lifecycle                    | `permission`   |
| Side signals admitted into the domain          | `notification` |
| Raw frames, unknown events, invariant warnings | `debug`        |
| Detached Job/SubagentRun progress              | `background`   |

Projection decides grouping, disclosure, visibility, lifecycle placement,
summaries, and widths. If a screenshot looks wrong, the owner should be obvious:
normalization, transition owner, projection, or component rendering.
