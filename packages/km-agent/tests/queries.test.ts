/**
 * Agent Query Tests
 *
 * Tests for agent query functions.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { setDb, closeDb } from "@km/storage";
import { queryAgents, getAgent, getActiveAgents, nodeToAgent, getAgentQueue } from "../src/queries.ts";
import type { KNode } from "@km/core";

describe("nodeToAgent", () => {
  const baseNode: KNode = {
    id: "01ABCDEFGHIJKL",
    type: "agent",
    name: "Test Agent",
    content: "Test Agent",
    parent_id: null,
    parent_idx: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    data: {},
  };

  test("converts node to agent with defaults", () => {
    const agent = nodeToAgent(baseNode);

    expect(agent.id).toBe(baseNode.id);
    expect(agent.shortId).toBe("agent-ijkl"); // last 4 chars of ID
    expect(agent.name).toBe("Test Agent");
    expect(agent.model).toBe("claude-sonnet-4");
    expect(agent.harness).toBe("general");
    expect(agent.status).toBe("idle");
  });

  test("uses short_id from data if present", () => {
    const node = { ...baseNode, data: { short_id: "custom" } };
    const agent = nodeToAgent(node);

    expect(agent.shortId).toBe("agent-custom");
  });

  test("extracts all fields from data", () => {
    const now = Date.now();
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
    };
    const agent = nodeToAgent(node);

    expect(agent.model).toBe("claude-opus-4");
    expect(agent.harness).toBe("code-reviewer");
    expect(agent.status).toBe("running");
    expect(agent.workdir).toBe("/tmp/agent");
    expect(agent.pid).toBe(12345);
    expect(agent.currentTaskId).toBe("task-123");
  });

  test("falls back to content for name", () => {
    const node = { ...baseNode, name: undefined, content: "Agent from Content" };
    const agent = nodeToAgent(node);

    expect(agent.name).toBe("Agent from Content");
  });

  test("falls back to 'Unnamed Agent' when no name or content", () => {
    const node = { ...baseNode, name: undefined, content: undefined };
    const agent = nodeToAgent(node);

    expect(agent.name).toBe("Unnamed Agent");
  });
});

describe.serial("queryAgents", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");

    // Create minimal schema for agent queries
    db.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT,
        content TEXT,
        parent_id TEXT,
        parent_idx INTEGER DEFAULT 0,
        depth INTEGER,
        md_pos INTEGER,
        md_slug TEXT,
        task_status TEXT,
        task_mark TEXT,
        assigned_to TEXT,
        due_date TEXT,
        scheduled_date TEXT,
        priority INTEGER,
        content_hash TEXT,
        data JSON DEFAULT '{}',
        created_at INTEGER,
        updated_at INTEGER,
        version TEXT
      );
    `);

    const now = Date.now();
    // Insert test agents
    db.run(
      `INSERT INTO nodes (id, type, name, content, data, created_at, updated_at, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "agent-0001",
        "agent",
        "Agent One",
        "Agent One",
        JSON.stringify({ short_id: "0001", model: "claude-sonnet-4", harness: "general", status: "idle" }),
        now,
        now,
        0,
      ],
    );
    db.run(
      `INSERT INTO nodes (id, type, name, content, data, created_at, updated_at, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "agent-0002",
        "agent",
        "Agent Two",
        "Agent Two",
        JSON.stringify({ short_id: "0002", model: "claude-opus-4", harness: "code-reviewer", status: "running" }),
        now,
        now,
        1,
      ],
    );
    db.run(
      `INSERT INTO nodes (id, type, name, content, data, created_at, updated_at, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "agent-0003",
        "agent",
        "Agent Three",
        "Agent Three",
        JSON.stringify({ short_id: "0003", model: "claude-sonnet-4", harness: "general", status: "error" }),
        now,
        now,
        2,
      ],
    );

    setDb(db);
  });

  afterEach(() => {
    closeDb();
  });

  test("returns all agents when no filter", () => {
    const agents = queryAgents();

    expect(agents.length).toBe(3);
  });

  test("filters by status", () => {
    const idle = queryAgents({ status: "idle" });
    expect(idle.length).toBe(1);
    expect(idle[0].name).toBe("Agent One");

    const running = queryAgents({ status: "running" });
    expect(running.length).toBe(1);
    expect(running[0].name).toBe("Agent Two");
  });

  test("filters by status array", () => {
    const agents = queryAgents({ status: ["idle", "error"] });

    expect(agents.length).toBe(2);
    expect(agents.map((a) => a.status)).toContain("idle");
    expect(agents.map((a) => a.status)).toContain("error");
  });

  test("filters by harness", () => {
    const general = queryAgents({ harness: "general" });
    expect(general.length).toBe(2);

    const codeReviewer = queryAgents({ harness: "code-reviewer" });
    expect(codeReviewer.length).toBe(1);
    expect(codeReviewer[0].name).toBe("Agent Two");
  });

  test("filters by model", () => {
    const sonnet = queryAgents({ model: "claude-sonnet-4" });
    expect(sonnet.length).toBe(2);

    const opus = queryAgents({ model: "claude-opus-4" });
    expect(opus.length).toBe(1);
    expect(opus[0].name).toBe("Agent Two");
  });

  test("combines multiple filters", () => {
    const agents = queryAgents({
      model: "claude-sonnet-4",
      harness: "general",
      status: "idle",
    });

    expect(agents.length).toBe(1);
    expect(agents[0].name).toBe("Agent One");
  });
});

describe.serial("getAgent", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");

    db.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT,
        content TEXT,
        parent_id TEXT,
        parent_idx INTEGER DEFAULT 0,
        depth INTEGER,
        md_pos INTEGER,
        md_slug TEXT,
        task_status TEXT,
        task_mark TEXT,
        assigned_to TEXT,
        due_date TEXT,
        scheduled_date TEXT,
        priority INTEGER,
        content_hash TEXT,
        data JSON DEFAULT '{}',
        created_at INTEGER,
        updated_at INTEGER,
        version TEXT
      );
    `);

    const now = Date.now();
    db.run(
      `INSERT INTO nodes (id, type, name, content, data, created_at, updated_at, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "01ABC123DEFG456",
        "agent",
        "Test Agent",
        "Test Agent",
        JSON.stringify({ short_id: "test", model: "claude-sonnet-4", harness: "general", status: "idle" }),
        now,
        now,
        0,
      ],
    );

    setDb(db);
  });

  afterEach(() => {
    closeDb();
  });

  test("finds agent by short ID", () => {
    const agent = getAgent("agent-test");

    expect(agent).not.toBeNull();
    expect(agent!.name).toBe("Test Agent");
  });

  test("finds agent by full ID", () => {
    const agent = getAgent("01ABC123DEFG456");

    expect(agent).not.toBeNull();
    expect(agent!.name).toBe("Test Agent");
  });

  test("finds agent by partial ID (without agent- prefix)", () => {
    const agent = getAgent("test");

    expect(agent).not.toBeNull();
    expect(agent!.name).toBe("Test Agent");
  });

  test("returns null for non-existent agent", () => {
    const agent = getAgent("nonexistent");

    expect(agent).toBeNull();
  });
});

describe.serial("getActiveAgents", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");

    db.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT,
        content TEXT,
        parent_id TEXT,
        parent_idx INTEGER DEFAULT 0,
        depth INTEGER,
        md_pos INTEGER,
        md_slug TEXT,
        task_status TEXT,
        task_mark TEXT,
        assigned_to TEXT,
        due_date TEXT,
        scheduled_date TEXT,
        priority INTEGER,
        content_hash TEXT,
        data JSON DEFAULT '{}',
        created_at INTEGER,
        updated_at INTEGER,
        version TEXT
      );
    `);

    const now = Date.now();
    db.run(
      `INSERT INTO nodes (id, type, name, content, data, created_at, updated_at, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "agent-1",
        "agent",
        "Idle Agent",
        "Idle Agent",
        JSON.stringify({ status: "idle" }),
        now,
        now,
        0,
      ],
    );
    db.run(
      `INSERT INTO nodes (id, type, name, content, data, created_at, updated_at, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "agent-2",
        "agent",
        "Running Agent",
        "Running Agent",
        JSON.stringify({ status: "running" }),
        now,
        now,
        1,
      ],
    );

    setDb(db);
  });

  afterEach(() => {
    closeDb();
  });

  test("returns only running agents", () => {
    const active = getActiveAgents();

    expect(active.length).toBe(1);
    expect(active[0].name).toBe("Running Agent");
    expect(active[0].status).toBe("running");
  });
});
