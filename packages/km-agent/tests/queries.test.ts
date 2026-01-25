/**
 * Agent Query Tests
 *
 * Tests for agent query functions.
 */

import { describe, test, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { runWithDb, SCHEMA } from "@km/storage"
import {
  queryAgents,
  getAgent,
  getActiveAgents,
  nodeToAgent,
} from "../src/queries.ts"
import type { KNode } from "@km/core"

/** Create an in-memory test database with minimal schema for agents */
function createTestDb(): Database {
  const db = new Database(":memory:")
  db.exec(SCHEMA)
  return db
}

/** Insert a test agent into the database */
function insertAgent(
  db: Database,
  id: string,
  name: string,
  data: Record<string, unknown>,
  parentIdx = 0,
): void {
  const now = Date.now()
  db.run(
    `INSERT INTO nodes (id, type, name, content, data, created_at, updated_at, parent_idx)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, "agent", name, name, JSON.stringify(data), now, now, parentIdx],
  )
}

describe("nodeToAgent", () => {
  const baseNode: KNode = {
    id: "01ABCDEFGHIJKL",
    type: "agent",
    name: "Test Agent",
    content: "Test Agent",
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    version: "01ABCDEFGHIJKL",
    created_at: Date.now(),
    updated_at: Date.now(),
    data: {},
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
    const db = createTestDb()
    insertAgent(db, "agent-0001", "Agent One", {
      short_id: "0001",
      model: "claude-sonnet-4",
      harness: "general",
      status: "idle",
    })
    insertAgent(
      db,
      "agent-0002",
      "Agent Two",
      {
        short_id: "0002",
        model: "claude-opus-4",
        harness: "code-reviewer",
        status: "running",
      },
      1,
    )
    insertAgent(
      db,
      "agent-0003",
      "Agent Three",
      {
        short_id: "0003",
        model: "claude-sonnet-4",
        harness: "general",
        status: "error",
      },
      2,
    )

    runWithDb(db, () => {
      const agents = queryAgents()
      expect(agents.length).toBe(3)
    })
  })

  test("filters by status", () => {
    const db = createTestDb()
    insertAgent(db, "agent-0001", "Agent One", {
      short_id: "0001",
      status: "idle",
    })
    insertAgent(db, "agent-0002", "Agent Two", {
      short_id: "0002",
      status: "running",
    })

    runWithDb(db, () => {
      const idle = queryAgents({ status: "idle" })
      expect(idle.length).toBe(1)
      expect(idle[0]!.name).toBe("Agent One")

      const running = queryAgents({ status: "running" })
      expect(running.length).toBe(1)
      expect(running[0]!.name).toBe("Agent Two")
    })
  })

  test("filters by status array", () => {
    const db = createTestDb()
    insertAgent(db, "agent-0001", "Agent One", { status: "idle" })
    insertAgent(db, "agent-0002", "Agent Two", { status: "running" })
    insertAgent(db, "agent-0003", "Agent Three", { status: "error" })

    runWithDb(db, () => {
      const agents = queryAgents({ status: ["idle", "error"] })

      expect(agents.length).toBe(2)
      expect(agents.map((a) => a.status)).toContain("idle")
      expect(agents.map((a) => a.status)).toContain("error")
    })
  })

  test("filters by harness", () => {
    const db = createTestDb()
    insertAgent(db, "agent-0001", "Agent One", { harness: "general" })
    insertAgent(db, "agent-0002", "Agent Two", { harness: "code-reviewer" })
    insertAgent(db, "agent-0003", "Agent Three", { harness: "general" })

    runWithDb(db, () => {
      const general = queryAgents({ harness: "general" })
      expect(general.length).toBe(2)

      const codeReviewer = queryAgents({ harness: "code-reviewer" })
      expect(codeReviewer.length).toBe(1)
      expect(codeReviewer[0]!.name).toBe("Agent Two")
    })
  })

  test("filters by model", () => {
    const db = createTestDb()
    insertAgent(db, "agent-0001", "Agent One", { model: "claude-sonnet-4" })
    insertAgent(db, "agent-0002", "Agent Two", { model: "claude-opus-4" })
    insertAgent(db, "agent-0003", "Agent Three", { model: "claude-sonnet-4" })

    runWithDb(db, () => {
      const sonnet = queryAgents({ model: "claude-sonnet-4" })
      expect(sonnet.length).toBe(2)

      const opus = queryAgents({ model: "claude-opus-4" })
      expect(opus.length).toBe(1)
      expect(opus[0]!.name).toBe("Agent Two")
    })
  })

  test("combines multiple filters", () => {
    const db = createTestDb()
    insertAgent(db, "agent-0001", "Agent One", {
      model: "claude-sonnet-4",
      harness: "general",
      status: "idle",
    })
    insertAgent(db, "agent-0002", "Agent Two", {
      model: "claude-opus-4",
      harness: "code-reviewer",
      status: "running",
    })

    runWithDb(db, () => {
      const agents = queryAgents({
        model: "claude-sonnet-4",
        harness: "general",
        status: "idle",
      })

      expect(agents.length).toBe(1)
      expect(agents[0]!.name).toBe("Agent One")
    })
  })
})

describe("getAgent", () => {
  test("finds agent by short ID", () => {
    const db = createTestDb()
    insertAgent(db, "01ABC123DEFG456", "Test Agent", {
      short_id: "test",
      model: "claude-sonnet-4",
      harness: "general",
      status: "idle",
    })

    runWithDb(db, () => {
      const agent = getAgent("agent-test")

      expect(agent).not.toBeNull()
      expect(agent!.name).toBe("Test Agent")
    })
  })

  test("finds agent by full ID", () => {
    const db = createTestDb()
    insertAgent(db, "01ABC123DEFG456", "Test Agent", { short_id: "test" })

    runWithDb(db, () => {
      const agent = getAgent("01ABC123DEFG456")

      expect(agent).not.toBeNull()
      expect(agent!.name).toBe("Test Agent")
    })
  })

  test("finds agent by partial ID (without agent- prefix)", () => {
    const db = createTestDb()
    insertAgent(db, "01ABC123DEFG456", "Test Agent", { short_id: "test" })

    runWithDb(db, () => {
      const agent = getAgent("test")

      expect(agent).not.toBeNull()
      expect(agent!.name).toBe("Test Agent")
    })
  })

  test("returns null for non-existent agent", () => {
    const db = createTestDb()

    runWithDb(db, () => {
      const agent = getAgent("nonexistent")

      expect(agent).toBeNull()
    })
  })
})

describe("getActiveAgents", () => {
  test("returns only running agents", () => {
    const db = createTestDb()
    insertAgent(db, "agent-1", "Idle Agent", { status: "idle" })
    insertAgent(db, "agent-2", "Running Agent", { status: "running" }, 1)

    runWithDb(db, () => {
      const active = getActiveAgents()

      expect(active.length).toBe(1)
      expect(active[0]!.name).toBe("Running Agent")
      expect(active[0]!.status).toBe("running")
    })
  })
})
