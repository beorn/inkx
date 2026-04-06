/**
 * Agent Query Tests
 *
 * Tests for agent query functions.
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { queryAgents, getAgent, getActiveAgents, nodeToAgent } from "../src/queries.ts"
import type { KNode } from "@km/core"
import { ulid } from "ulid"

/** Create a test agent node */
function createAgent(name: string, data: Record<string, unknown>, parentIdx = 0): KNode {
  const now = Date.now()
  return {
    id: ulid(),
    type: "h",
    item: {},
    name,
    content: name,
    parent_id: null,
    parent_idx: parentIdx,
    symlink_to: null,
    data: { kind: "agent", ...data },
    created_at: now,
    updated_at: now,
    version: "test-0",
  }
}

describe("nodeToAgent", () => {
  const baseNode: KNode = {
    id: "01ABCDEFGHIJKL",
    type: "h",
    item: {},
    name: "Test Agent",
    content: "Test Agent",
    parent_id: null,
    parent_idx: 0,
    symlink_to: null,
    version: "01ABCDEFGHIJKL",
    created_at: Date.now(),
    updated_at: Date.now(),
    data: { kind: "agent" },
  }

  test("converts node to agent with defaults", () => {
    const agent = nodeToAgent(baseNode)

    expect(agent.id).toBe(baseNode.id)
    expect(agent.shortId).toBe("agent-ijkl") // last 4 chars of ID
    expect(agent.name).toBe("Test Agent")
    expect(agent.model).toBe("claude-sonnet-4")
    expect(agent.harness).toBe("general")
    expect(agent.status).toBe("idle")
  })

  test("uses short_id from data if present", () => {
    const node = { ...baseNode, data: { short_id: "custom" } }
    const agent = nodeToAgent(node)

    expect(agent.shortId).toBe("agent-custom")
  })

  test("extracts all fields from data", () => {
    const node: KNode = {
      ...baseNode,
      data: {
        model: "claude-opus-4",
        harness: "code-reviewer",
        status: "running",
        workdir: "/tmp/agent",
        pid: 12345,
        current_task_id: "task-123",
      },
    }
    const agent = nodeToAgent(node)

    expect(agent.model).toBe("claude-opus-4")
    expect(agent.harness).toBe("code-reviewer")
    expect(agent.status).toBe("running")
    expect(agent.workdir).toBe("/tmp/agent")
    expect(agent.pid).toBe(12345)
    expect(agent.currentTaskId).toBe("task-123")
  })

  test("falls back to content for name", () => {
    const node = {
      ...baseNode,
      name: undefined,
      content: "Agent from Content",
    }
    const agent = nodeToAgent(node)

    expect(agent.name).toBe("Agent from Content")
  })

  test("falls back to 'Unnamed Agent' when no name or content", () => {
    const node = { ...baseNode, name: undefined, content: undefined }
    const agent = nodeToAgent(node)

    expect(agent.name).toBe("Unnamed Agent")
  })
})

describe("queryAgents", () => {
  test("returns all agents when no filter", () => {
    const repo = createFakeRepo({
      nodes: [
        createAgent("Agent One", {
          short_id: "0001",
          model: "claude-sonnet-4",
          harness: "general",
          status: "idle",
        }),
        createAgent(
          "Agent Two",
          {
            short_id: "0002",
            model: "claude-opus-4",
            harness: "code-reviewer",
            status: "running",
          },
          1,
        ),
        createAgent(
          "Agent Three",
          {
            short_id: "0003",
            model: "claude-sonnet-4",
            harness: "general",
            status: "error",
          },
          2,
        ),
      ],
    })

    const agents = queryAgents(repo)
    expect(agents.length).toBe(3)
  })

  test("filters by status", () => {
    const repo = createFakeRepo({
      nodes: [
        createAgent("Agent One", {
          short_id: "0001",
          status: "idle",
        }),
        createAgent("Agent Two", {
          short_id: "0002",
          status: "running",
        }),
      ],
    })

    const idle = queryAgents(repo, { status: "idle" })
    expect(idle.length).toBe(1)
    expect(idle[0]!.name).toBe("Agent One")

    const running = queryAgents(repo, { status: "running" })
    expect(running.length).toBe(1)
    expect(running[0]!.name).toBe("Agent Two")
  })

  test("filters by status array", () => {
    const repo = createFakeRepo({
      nodes: [
        createAgent("Agent One", { status: "idle" }),
        createAgent("Agent Two", { status: "running" }),
        createAgent("Agent Three", { status: "error" }),
      ],
    })

    const agents = queryAgents(repo, { status: ["idle", "error"] })

    expect(agents.length).toBe(2)
    expect(agents.map((a) => a.status)).toContain("idle")
    expect(agents.map((a) => a.status)).toContain("error")
  })

  test("filters by harness", () => {
    const repo = createFakeRepo({
      nodes: [
        createAgent("Agent One", { harness: "general" }),
        createAgent("Agent Two", { harness: "code-reviewer" }),
        createAgent("Agent Three", { harness: "general" }),
      ],
    })

    const general = queryAgents(repo, { harness: "general" })
    expect(general.length).toBe(2)

    const codeReviewer = queryAgents(repo, { harness: "code-reviewer" })
    expect(codeReviewer.length).toBe(1)
    expect(codeReviewer[0]!.name).toBe("Agent Two")
  })

  test("filters by model", () => {
    const repo = createFakeRepo({
      nodes: [
        createAgent("Agent One", { model: "claude-sonnet-4" }),
        createAgent("Agent Two", { model: "claude-opus-4" }),
        createAgent("Agent Three", { model: "claude-sonnet-4" }),
      ],
    })

    const sonnet = queryAgents(repo, { model: "claude-sonnet-4" })
    expect(sonnet.length).toBe(2)

    const opus = queryAgents(repo, { model: "claude-opus-4" })
    expect(opus.length).toBe(1)
    expect(opus[0]!.name).toBe("Agent Two")
  })

  test("combines multiple filters", () => {
    const repo = createFakeRepo({
      nodes: [
        createAgent("Agent One", {
          model: "claude-sonnet-4",
          harness: "general",
          status: "idle",
        }),
        createAgent("Agent Two", {
          model: "claude-opus-4",
          harness: "code-reviewer",
          status: "running",
        }),
      ],
    })

    const agents = queryAgents(repo, {
      model: "claude-sonnet-4",
      harness: "general",
      status: "idle",
    })

    expect(agents.length).toBe(1)
    expect(agents[0]!.name).toBe("Agent One")
  })
})

describe("getAgent", () => {
  test("finds agent by short ID", () => {
    const repo = createFakeRepo({
      nodes: [
        {
          ...createAgent("Test Agent", {
            short_id: "test",
            model: "claude-sonnet-4",
            harness: "general",
            status: "idle",
          }),
          id: "01ABC123DEFG456",
        },
      ],
    })

    const agent = getAgent(repo, "agent-test")

    expect(agent).not.toBeNull()
    expect(agent!.name).toBe("Test Agent")
  })

  test("finds agent by full ID", () => {
    const repo = createFakeRepo({
      nodes: [
        {
          ...createAgent("Test Agent", { short_id: "test" }),
          id: "01ABC123DEFG456",
        },
      ],
    })

    const agent = getAgent(repo, "01ABC123DEFG456")

    expect(agent).not.toBeNull()
    expect(agent!.name).toBe("Test Agent")
  })

  test("finds agent by partial ID (without agent- prefix)", () => {
    const repo = createFakeRepo({
      nodes: [
        {
          ...createAgent("Test Agent", { short_id: "test" }),
          id: "01ABC123DEFG456",
        },
      ],
    })

    const agent = getAgent(repo, "test")

    expect(agent).not.toBeNull()
    expect(agent!.name).toBe("Test Agent")
  })

  test("returns null for non-existent agent", () => {
    const repo = createFakeRepo({ nodes: [] })

    const agent = getAgent(repo, "nonexistent")

    expect(agent).toBeNull()
  })
})

describe("getActiveAgents", () => {
  test("returns only running agents", () => {
    const repo = createFakeRepo({
      nodes: [createAgent("Idle Agent", { status: "idle" }), createAgent("Running Agent", { status: "running" }, 1)],
    })

    const active = getActiveAgents(repo)

    expect(active.length).toBe(1)
    expect(active[0]!.name).toBe("Running Agent")
    expect(active[0]!.status).toBe("running")
  })
})
