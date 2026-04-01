import { describe, expect, test } from "vitest"
import {
  createAgentNode,
  updateAgentFields,
  startAgentFields,
  stopAgentFields,
  idleAgentFields,
  errorAgentFields,
} from "../src/mutations.ts"

describe("createAgentNode", () => {
  test("creates agent with default options", () => {
    const { node, shortId } = createAgentNode("Test Agent")

    expect(node.type).toBe("h")
    expect(node.item).toEqual({})
    expect(node.data?.kind).toBe("agent")
    expect(node.name).toBe("Test Agent")
    expect(node.content).toBe("Test Agent")
    expect(node.data?.model).toBe("claude-sonnet-4")
    expect(node.data?.harness).toBe("general")
    expect(node.data?.status).toBe("idle")
    expect(shortId).toMatch(/^agent-[a-z0-9]{4}$/)
  })

  test("creates agent with custom options", () => {
    const { node, shortId } = createAgentNode("Code Reviewer", {
      model: "claude-opus-4",
      harness: "code-reviewer",
      customId: "reviewer-1",
      workdir: "/tmp/agent",
    })

    expect(node.data?.model).toBe("claude-opus-4")
    expect(node.data?.harness).toBe("code-reviewer")
    expect(node.data?.short_id).toBe("reviewer-1")
    expect(node.data?.workdir).toBe("/tmp/agent")
    expect(shortId).toBe("agent-reviewer-1")
  })

  test("generates unique IDs", () => {
    const a1 = createAgentNode("Agent 1")
    const a2 = createAgentNode("Agent 2")

    expect(a1.node.id).not.toBe(a2.node.id)
    // Short IDs may collide since they're just last 4 chars of ULID
  })
})

describe("updateAgentFields", () => {
  const mockAgent = {
    id: "01ABCDEF",
    shortId: "agent-cdef",
    name: "Test Agent",
    model: "claude-sonnet-4",
    harness: "general",
    status: "idle" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  test("updates name", () => {
    const updates = updateAgentFields(mockAgent, { name: "New Name" })

    expect(updates.name).toBe("New Name")
    expect(updates.content).toBe("New Name")
    expect(updates.updated_at).toBeGreaterThan(0)
  })

  test("updates model", () => {
    const updates = updateAgentFields(mockAgent, { model: "claude-opus-4" })

    expect(updates.data?.model).toBe("claude-opus-4")
  })

  test("updates status", () => {
    const updates = updateAgentFields(mockAgent, { status: "running" })

    expect(updates.data?.status).toBe("running")
  })

  test("updates currentTaskId", () => {
    const updates = updateAgentFields(mockAgent, { currentTaskId: "task-123" })

    expect(updates.data?.current_task_id).toBe("task-123")
  })

  test("updates multiple fields", () => {
    const updates = updateAgentFields(mockAgent, {
      status: "running",
      currentTaskId: "task-456",
    })

    expect(updates.data?.status).toBe("running")
    expect(updates.data?.current_task_id).toBe("task-456")
  })
})

describe("lifecycle helpers", () => {
  test("startAgentFields sets running status with PID", () => {
    const updates = startAgentFields(12345)

    expect(updates.data?.status).toBe("running")
    expect(updates.data?.pid).toBe(12345)
  })

  test("stopAgentFields clears status and PID", () => {
    const updates = stopAgentFields()

    expect(updates.data?.status).toBe("stopped")
    expect(updates.data?.pid).toBeUndefined()
    expect(updates.data?.current_task_id).toBeUndefined()
  })

  test("idleAgentFields sets idle status", () => {
    const updates = idleAgentFields()

    expect(updates.data?.status).toBe("idle")
    expect(updates.data?.current_task_id).toBeUndefined()
  })

  test("errorAgentFields sets error status with message", () => {
    const updates = errorAgentFields("Connection failed")

    expect(updates.data?.status).toBe("error")
    expect(updates.data?.last_error).toBe("Connection failed")
  })
})
