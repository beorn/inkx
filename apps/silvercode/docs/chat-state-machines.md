# Silvercode Chat State Machines

Silvercode models chat as canonical events applied to session state and projected into a render tree.

```text
AgentEvent / ChannelNotification / ProtocolNotification
  -> ChatEvent
  -> ChatSession

ChatSession -> ChatShell
ChatSession -> ChatTree

ChatSession + ChatShell + ChatTree
  -> Chat.Pane
```

This page defines the durable state machines inside that model. Prompt queueing, job control, interruption, subagent activity, and notifications are chat-domain state, not separate UI systems.

## Terminology

Use `block` for a typed content unit inside a prompt, message, or tool output.

Use `activity` for a time-bounded unit of work inside a chat job or chat span.

Use `job` for user-controllable agent work that can attach to the foreground, move to the background, complete, fail, cancel, or be abandoned.

Use `task` only when naming an agent/tool concept that is literally called Task, such as a Task tool that launches a subagent. A backgrounded agent turn is a background job, not a task in the chat-domain model.

Use `Agent*` names for cross-backend runtime surfaces. Use protocol-specific prefixes such as `Acp*`, `Claude*`, or `Codex*` only for exact source shapes. Use `Chat*` names for Silvercode-owned chat-domain state, control, and projection. Agent ids can appear inside `Chat*` records only as provenance.

## Shell

```text
no-jobs
  -> foreground-attached
  -> no-jobs

foreground-attached
  -> background-only
  -> no-jobs

foreground-attached
  -> foreground-and-background

foreground-and-background
  -> background-only
  -> no-jobs

background-only
  -> no-jobs
```

A chat shell (`ChatShell`) is the continuous interactive surface for one chat session. It owns the composer, prompt queue controls, foreground attachment slot, background job table, active selection, and job-control commands.

The shell does not start and end for each prompt. It has a foreground slot:

```text
foregroundJobId: ChatJobId | null
backgroundJobIds: ChatJobId[]
```

When `foregroundJobId` is `null`, the shell itself owns the foreground like an idle terminal prompt. When `foregroundJobId` points to a running job, that job is attached to the foreground and owns the main conversation flow.

## Session

```text
starting
  -> active
  -> ending
  -> ended

active
  -> failed
  -> ended
```

A chat session owns messages, blocks, tools, plan state, prompt queue, permissions, notifications, activity records, channels, and projection state. Session lifecycle facts enter as `ChatEvent`s and project only when they help the user understand ordering or control state.

## Span

```text
idle
  -> open
  -> settling
  -> idle
```

A chat span is a foreground idle-delimited activity group. It opens when user or agent foreground activity starts while the foreground shell is idle, remains open while foreground work is active, and closes when the foreground shell is idle again.

A span can contain multiple prompts, assistant messages, foreground jobs, tool calls, permission waits, subagent activity, notifications, and plan changes. It is not a prompt/response pair and it is not an agent turn. Background jobs do not keep a foreground span open; they project as job lifecycle/activity output.

Spans do not nest. If nested work needs hierarchy, the span contains activities and those activities contain child activities.

## Prompt

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

A prompt draft is ephemeral composer text. A `ChatPrompt` begins when Silvercode owns a user-authored prompt that has not yet become transcript history. A prompt leaves `ChatPromptQueue` when it becomes a user `ChatMessage`, is cancelled, or fails permanently.

Agent-owned queued prompts use `agent-queued` only when the agent exposes queue identity and capabilities. stdin buffering, prompt RPC waiters, and transcript attachments are provenance, not sufficient queue ownership.

## Message

```text
started
  -> streaming
  -> completed

started
  -> cancelled

started
  -> failed
```

A `ChatMessage` is transcript history. It owns role, block ids, and source event ids. Once a prompt commits as a user message, editing is transcript editing rather than prompt queue editing.

Message content is typed as `ChatBlock`: text, reasoning, image, audio, resource, resource link, diff, terminal, or tool reference. Tool output belongs to `ChatTool` and projects near a message only through the chat tree.

## Block

```text
created
  -> appended
  -> completed

created
  -> failed
```

A `ChatBlock` is a typed content unit. Streaming text and reasoning blocks may append content before completion. Static blocks such as image, resource link, diff, terminal, or tool reference are usually created complete.

Blocks are content, not lifecycle owners. Tool lifecycle belongs to `ChatTool`; job lifecycle belongs to `ChatJob`; span lifecycle belongs to `ChatSpan`.

## Tool

```text
requested
  -> running
  -> completed

running
  -> waiting-permission
  -> running

running
  -> cancelled

running
  -> failed
```

A `ChatTool` is the chat-domain lifecycle record for a tool call. Agent ids, protocol ids, and CLI ids stay in `rawRefs` or source-specific metadata. Tool lifecycle state can project as transcript detail, activity summary, notification, or Debug leaf depending on channel and usefulness.

## Job

Execution state:

```text
queued
  -> running
  -> completed

running
  -> waiting
  -> running

running
  -> cancelling
  -> cancelled

running
  -> failed
```

Shell attachment transitions:

```text
ChatShell.foregroundJobId = job
  -> ChatShell.backgroundJobIds includes job
  -> job completes/cancels/fails in background

ChatShell.foregroundJobId = job
  -> interrupt-requested
  -> job.output = abandoned
```

A chat job (`ChatJob`) is user-controllable agent work. It starts when a prompt submission, restored live run, or agent-originated event creates a controllable unit of work. It ends when the work completes, fails, or is cancelled. Silvercode marks the job output as abandoned when an interrupted job cannot be cancelled precisely and late events should not become normal transcript output.

Execution state answers whether the agent is still doing work. Shell attachment answers whether that work owns the foreground. The two axes are separate: a job can be `running` while the shell lists it as either foreground or background.

`bg` detaches the foreground job from the shell without stopping it. Background jobs can be surfaced for inspection, but they do not reattach to the shell foreground. `Esc` interrupts the foreground job; it does not background it.

A job contains activity. Activity describes nested work inside the job, while the job describes the user's control handle for that work.

## Activity

```text
observed
  -> running
  -> completed

running
  -> cancelled

running
  -> failed
```

Activity is one time-bounded work unit inside a job or span: reasoning, tool execution, shell command, permission wait, or subagent work. Activities are not transcript messages and are not generic grouping nodes.

Activities may contain child activities when nested work needs hierarchy. Background jobs, spans, and messages do not become activities just because they contain activity.

Subagent activity is activity for Task/Agent-style local agents spawned under the session. A background job is not a subagent unless the job itself contains subagent work.

Interrupting is not the same thing as backgrounding and not proof that the underlying process stopped. Backgrounding says "keep running, but stop blocking my foreground." Interrupting says "this foreground job is no longer the conversation I am controlling; cancel it if possible, otherwise abandon its later output."

Agent turn ids are provenance for correlating late events; they are not canonical span keys. Late events for interrupted agent work are Debug/provenance unless the source confirms they belong to still-owned chat-domain state.

## Permission

```text
requested
  -> approved

requested
  -> rejected

requested
  -> cancelled
```

Permission state belongs to the chat session. Permission requests can block a tool or activity, but the permission object has its own lifecycle and channel. Resolution updates owner state first; transcript rows are projection choices.

## Notification

```text
received
  -> admitted
  -> projected

received
  -> duplicate

received
  -> debug-only
```

A channel notification is side-channel input before chat normalization. A chat notification (`ChatNotification`) is the normalized fact admitted into the chat domain. Same-session notifications that duplicate transcript-owned tool or subagent facts merge into the owner state instead of rendering as parallel rows. Debug-only notifications remain inspectable without becoming normal transcript content.

## Plan

```text
empty
  -> active
  -> completed

active
  -> abandoned
```

A chat plan (`ChatPlan`) owns ordered chat plan steps (`ChatPlanStep`). Plan updates replace or reconcile steps according to source provenance, but the chat domain exposes steps rather than source-specific entries or tasks.

## Projection

```text
ChatSession
  -> projectChatTree(...)
  -> ChatTree
  -> Chat.Pane
```

Projection decides grouping, ordering, disclosure, channel filtering, lifecycle placement, summaries, and widths. UI components render `ChatTree`; they do not infer agent semantics directly from raw events.

The invariant is one ownership path: every visible chat fact has an owner in event normalization, chat session state, projection, or rendering. If a screenshot looks wrong, the owner should be obvious.
