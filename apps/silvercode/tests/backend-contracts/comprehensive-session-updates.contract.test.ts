/**
 * Backend spec: comprehensive fake ACP stream.
 *
 * Local Claude/Codex/opencode transcript surveys show that real sessions are
 * a mix of text, reasoning, tool calls/results, file diffs, terminal output,
 * plans, config/status updates, and occasional binary/resource attachments.
 * The provider-injected fakes must cover those shapes so UI specs exercise the
 * same event families without launching real agents.
 */

import { describe, expect, test } from "vitest"
import {
  ACP_REGISTRY_IDS,
  createFakeAcpAgentBackends,
  type AgentBackendSpecTarget,
  type AgentEvent,
  type ToolKind,
} from "@km/agent-harness"
import { runAgentBackendSpec } from "@km/agent-harness/testing/backend-spec-runner"

const fakes = createFakeAcpAgentBackends({ sessionIdPrefix: "contract-comprehensive" })

const targets = ACP_REGISTRY_IDS.map((id) => ({
  mode: "fake",
  backend: fakes.backends.get(id)!,
  controller: fakes.controllers.get(id)!,
  cwd: "/tmp/silvercode-contract",
})) satisfies AgentBackendSpecTarget[]

const TOOL_KINDS = [
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
] satisfies ToolKind[]

describe("backend spec: comprehensive fake ACP stream", () => {
  for (const target of targets) {
    test(`${target.backend.id} emits representative session updates`, async () => {
      await runAgentBackendSpec(target, async (ctx) => {
        const events: AgentEvent[] = []
        const unsubscribe = ctx.conn.subscribe((event) => events.push(event))
        try {
          const response = await ctx.conn.prompt([{ type: "text", text: "exercise every fake update" }])
          expect(response.stopReason).toBe("end_turn")
        } finally {
          unsubscribe()
        }

        expect(events.map((event) => event.kind)).toEqual(
          expect.arrayContaining([
            "turn-start",
            "text-delta",
            "thinking-delta",
            "tool-use",
            "tool-result",
            "plan-update",
            "slash-commands-update",
            "status",
            "turn-end",
          ]),
        )

        expect(events.filter((event) => event.kind === "text-delta").map((event) => event.text)).toContain(
          `fake ${target.backend.id} comprehensive response`,
        )
        expect(events.filter((event) => event.kind === "text-delta").every((event) => event.text.length > 0)).toBe(true)
        expect(events.filter((event) => event.kind === "thinking-delta").map((event) => event.text)).toContain(
          `fake ${target.backend.id} reasoning trace`,
        )

        const statuses = events.flatMap((event) => (event.kind === "status" ? [event.status] : []))
        expect(statuses).toEqual(
          expect.arrayContaining([
            "acp:agent_message_chunk:image",
            "acp:agent_message_chunk:audio",
            "acp:agent_message_chunk:resource_link",
            "acp:agent_message_chunk:resource",
            "tool:fake-read:pending",
            "tool:fake-execute:in_progress",
            "acp:current_mode_update",
            "acp:config_option_update",
            "acp:session_info_update",
            "acp:usage_update",
          ]),
        )

        const toolUses = events.filter((event) => event.kind === "tool-use")
        expect(toolUses.map((event) => event.id)).toEqual(TOOL_KINDS.map((kind) => `fake-${kind}`))
        expect(toolUses.map((event) => event.name)).toEqual(TOOL_KINDS.map((kind) => `Fake ${kind} tool`))

        const toolResults = events.filter((event) => event.kind === "tool-result")
        expect(toolResults.map((event) => event.id)).toEqual(TOOL_KINDS.map((kind) => `fake-${kind}`))
        expect(toolResults.some((event) => event.is_error === true)).toBe(true)
        expect(toolResults.some((event) => event.output && typeof event.output === "object")).toBe(true)

        const plan = events.find((event) => event.kind === "plan-update")
        expect(plan?.entries.map((entry) => entry.status)).toEqual(["completed", "in_progress", "pending"])

        const slashCommands = events.find((event) => event.kind === "slash-commands-update")
        expect(slashCommands?.slashCommands).toEqual(["/fake-review", "/fake-compact"])
      })
    })
  }
})
