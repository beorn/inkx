import { describe, expect, test } from "vitest"
import { normalizeAgentEventsToChatEvents } from "../src/chat/normalize-agent-event.ts"
import {
  assertSubagentActivityInvariants,
  projectCurrentSubagentActivitiesFromChatEvents,
  subagentActivityRowsFromActivities,
} from "../src/chat/subagent-activities.ts"
import type { AgentEvent, SessionId, ToolUseId, TurnId } from "@km/agent-harness"

function userMessage(text: string, ts = 1_000): AgentEvent {
  return {
    kind: "user-message",
    sessionId: "provider-s1" as SessionId,
    turnId: `user-${ts}` as TurnId,
    text,
    ts,
  }
}

function assistantTurnStart(ts: number): AgentEvent {
  return {
    kind: "turn-start",
    sessionId: "provider-s1" as SessionId,
    turnId: "assistant-shared" as TurnId,
    role: "assistant",
    ts,
  }
}

function agentToolUse(id: string, description: string, ts: number): AgentEvent {
  return {
    kind: "tool-use",
    sessionId: "provider-s1" as SessionId,
    turnId: "assistant-shared" as TurnId,
    id: id as ToolUseId,
    name: "Agent",
    input: { description, subagent_type: "general-purpose", prompt: `sleep for ${description}` },
    ts,
  }
}

function agentToolResult(id: string, output: string, ts: number): AgentEvent {
  return {
    kind: "tool-result",
    sessionId: "provider-s1" as SessionId,
    id: id as ToolUseId,
    output,
    ts,
  }
}

function assistantText(text: string, ts: number): AgentEvent {
  return {
    kind: "text-delta",
    sessionId: "provider-s1" as SessionId,
    turnId: "assistant-shared" as TurnId,
    blockIndex: 0,
    text,
    ts,
  }
}

function project(events: readonly AgentEvent[]) {
  const chatEvents = normalizeAgentEventsToChatEvents(events, { sessionId: "s1" })
  return projectCurrentSubagentActivitiesFromChatEvents(chatEvents, { sessionId: "s1" })
}

describe("subagent activity projection", () => {
  test("preserves four sibling Agent tool-use events under the current user prompt", () => {
    const projected = project([
      userMessage("use 4 subagents to sleep 20s"),
      agentToolUse("toolu_1", "Sleep 20s #1", 1_200),
      agentToolUse("toolu_2", "Sleep 20s #2", 1_201),
      agentToolUse("toolu_3", "Sleep 20s #3", 1_202),
      agentToolUse("toolu_4", "Sleep 20s #4", 1_203),
    ])

    expect(projected.activities.map((activity) => `${activity.label}:${activity.status}`)).toEqual([
      "Sleep 20s #1:running",
      "Sleep 20s #2:running",
      "Sleep 20s #3:running",
      "Sleep 20s #4:running",
    ])
    expect(subagentActivityRowsFromActivities(projected.activities).map((agent) => agent.label)).toEqual([
      "Sleep 20s #1",
      "Sleep 20s #2",
      "Sleep 20s #3",
      "Sleep 20s #4",
    ])
    expect(projected.diagnostics).toEqual([])
  })

  test("preserves sibling Agent tool-use events with duplicate labels and distinct tool IDs", () => {
    const projected = project([
      userMessage("use 4 subagents to wait to 20s"),
      agentToolUse("toolu_1", "Sleep 20s", 1_200),
      agentToolUse("toolu_2", "Sleep 20s", 1_201),
      agentToolUse("toolu_3", "Sleep 20s", 1_202),
      agentToolUse("toolu_4", "Sleep 20s", 1_203),
    ])

    expect(projected.activities.map((activity) => `${activity.toolId}:${activity.label}:${activity.status}`)).toEqual([
      "toolu_1:Sleep 20s:running",
      "toolu_2:Sleep 20s:running",
      "toolu_3:Sleep 20s:running",
      "toolu_4:Sleep 20s:running",
    ])
    expect(projected.diagnostics).toEqual([])
  })

  test("throws when assistant completion text claims more agents than provider events contain", () => {
    const projected = project([
      userMessage("use 4 subagents to sleep 20 s"),
      assistantTurnStart(1_100),
      agentToolUse("toolu_2", "Sleep 20s #2", 1_200),
      agentToolResult("toolu_2", "agent 2: done sleeping 20s", 21_200),
      assistantText("All 4 done in parallel. Wallclock ~26s.", 21_300),
    ])

    expect(
      projected.activities.map((activity) => `${activity.label}:${activity.status}:${activity.resultText}`),
    ).toEqual(["Sleep 20s #2:done:agent 2: done sleeping 20s"])
    expect(projected.diagnostics).toEqual([
      {
        kind: "subagent-count-mismatch",
        claimed: 4,
        observed: 1,
        text: "All 4 done in parallel. Wallclock ~26s.",
      },
    ])
    expect(() => assertSubagentActivityInvariants(projected, { sessionId: "s1" })).toThrow(
      /subagent activity invariant failed.*claimed 4.*observed 1/s,
    )
  })

  test("does not treat the user-requested subagent count as observed provider state", () => {
    const projected = project([
      userMessage("use 4 subagents to sleep 20s"),
      agentToolUse("toolu_2", "Sleep 20s #2", 1_200),
    ])

    expect(projected.activities.map((activity) => `${activity.label}:${activity.status}`)).toEqual([
      "Sleep 20s #2:running",
    ])
    expect(projected.diagnostics).toEqual([])
    expect(() => assertSubagentActivityInvariants(projected, { sessionId: "s1" })).not.toThrow()
  })
})
