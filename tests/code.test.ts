/**
 * Code Module Unit Tests (km-4qy)
 *
 * Unit tests for src/code/: hub, subscriber, queue, session, agent
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

import {
  EventHub,
  getEventHub,
  resetEventHub,
  Subscriber,
  createSubscriber,
  TaskQueue,
  Session,
  startSession,
  Agent,
  createAgent,
} from "../src/code/index.ts";
import { setKmDir, emit, clearDatabase } from "../src/node/emit.ts";
import { getDb, closeDb, resetDb } from "../src/node/db.ts";
import type { Event, Node } from "../src/node/types.ts";

// Test directory
const TEST_DIR = join(import.meta.dir, ".test-code");

describe("EventHub", () => {
  let hub: EventHub;

  beforeEach(() => {
    hub = new EventHub();
  });

  test("should publish events to subscribers", async () => {
    const received: Event[] = [];
    hub.subscribe("test-sub", (event) => {
      received.push(event);
    });

    const event: Event = {
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: { content: "test" },
    };

    await hub.publish(event);

    expect(received.length).toBe(1);
    expect(received[0].id).toBe("evt-1");
  });

  test("should filter events by type", async () => {
    const received: Event[] = [];
    hub.subscribe(
      "test-sub",
      (event) => {
        received.push(event);
      },
      (e) => e.type === "node_created",
    );

    await hub.publish({
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    await hub.publish({
      id: "evt-2",
      ts: Date.now(),
      type: "node_updated",
      actor: "test",
      target: "node-1",
      data: {},
    });

    expect(received.length).toBe(1);
    expect(received[0].type).toBe("node_created");
  });

  test("should handle async handlers", async () => {
    let completed = false;

    hub.subscribe("async-sub", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      completed = true;
    });

    await hub.publish({
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    expect(completed).toBe(true);
  });

  test("should allow unsubscribing", async () => {
    const received: Event[] = [];
    const unsubscribe = hub.subscribe("test-sub", (event) => {
      received.push(event);
    });

    await hub.publish({
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    unsubscribe();

    await hub.publish({
      id: "evt-2",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    expect(received.length).toBe(1);
  });

  test("should track recent events", async () => {
    await hub.publish({
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    await hub.publish({
      id: "evt-2",
      ts: Date.now(),
      type: "node_updated",
      actor: "test",
      target: "node-1",
      data: {},
    });

    const recent = hub.getRecentEvents(10);
    expect(recent.length).toBe(2);
    expect(recent[0].id).toBe("evt-1");
    expect(recent[1].id).toBe("evt-2");
  });

  test("should get events since cursor", async () => {
    await hub.publish({
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    await hub.publish({
      id: "evt-2",
      ts: Date.now(),
      type: "node_updated",
      actor: "test",
      target: "node-1",
      data: {},
    });

    await hub.publish({
      id: "evt-3",
      ts: Date.now(),
      type: "node_deleted",
      actor: "test",
      target: "node-1",
      data: {},
    });

    const since = hub.getEventsSince("evt-1");
    expect(since.length).toBe(2);
    expect(since[0].id).toBe("evt-2");
    expect(since[1].id).toBe("evt-3");
  });

  test("should clear log", async () => {
    await hub.publish({
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    hub.clearLog();

    expect(hub.getRecentEvents().length).toBe(0);
  });

  test("should limit log size", async () => {
    // Publish more than maxLogSize events
    for (let i = 0; i < 1100; i++) {
      await hub.publish({
        id: `evt-${i}`,
        ts: Date.now(),
        type: "node_created",
        actor: "test",
        data: {},
      });
    }

    const recent = hub.getRecentEvents(2000);
    expect(recent.length).toBe(1000); // maxLogSize
  });

  test("should track subscription count", () => {
    expect(hub.getSubscriptionCount()).toBe(0);

    hub.subscribe("sub-1", () => {});
    expect(hub.getSubscriptionCount()).toBe(1);

    hub.subscribe("sub-2", () => {});
    expect(hub.getSubscriptionCount()).toBe(2);

    hub.unsubscribe("sub-1");
    expect(hub.getSubscriptionCount()).toBe(1);
  });

  test("should list subscriptions", () => {
    hub.subscribe("alpha", () => {});
    hub.subscribe("beta", () => {});

    const subs = hub.listSubscriptions();
    expect(subs).toContain("alpha");
    expect(subs).toContain("beta");
  });
});

describe("Global EventHub", () => {
  beforeEach(() => {
    resetEventHub();
  });

  test("should return singleton instance", () => {
    const hub1 = getEventHub();
    const hub2 = getEventHub();
    expect(hub1).toBe(hub2);
  });

  test("should reset to new instance", () => {
    const hub1 = getEventHub();
    hub1.subscribe("test", () => {});

    resetEventHub();

    const hub2 = getEventHub();
    expect(hub2.getSubscriptionCount()).toBe(0);
  });
});

describe("Subscriber", () => {
  beforeEach(() => {
    resetEventHub();
  });

  test("should start and stop", () => {
    const sub = new Subscriber({ id: "test-sub" });

    expect(sub.isRunning()).toBe(false);

    sub.start();
    expect(sub.isRunning()).toBe(true);

    sub.stop();
    expect(sub.isRunning()).toBe(false);
  });

  test("should receive events when started", async () => {
    const received: Event[] = [];
    const sub = createSubscriber("test-sub", (event) => {
      received.push(event);
    });

    sub.start();

    const hub = getEventHub();
    await hub.publish({
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    expect(received.length).toBe(1);

    sub.stop();
  });

  test("should not receive events when stopped", async () => {
    const received: Event[] = [];
    const sub = createSubscriber("test-sub", (event) => {
      received.push(event);
    });

    sub.start();
    sub.stop();

    const hub = getEventHub();
    await hub.publish({
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    expect(received.length).toBe(0);
  });

  test("should filter by event types", async () => {
    const received: Event[] = [];
    const sub = createSubscriber(
      "test-sub",
      (event) => {
        received.push(event);
      },
      { eventTypes: ["node_created"] },
    );

    sub.start();

    const hub = getEventHub();
    await hub.publish({
      id: "evt-1",
      ts: Date.now(),
      type: "node_created",
      actor: "test",
      data: {},
    });

    await hub.publish({
      id: "evt-2",
      ts: Date.now(),
      type: "node_updated",
      actor: "test",
      target: "node-1",
      data: {},
    });

    expect(received.length).toBe(1);
    expect(received[0].type).toBe("node_created");

    sub.stop();
  });

  test("should emit started/stopped events", () => {
    const sub = new Subscriber({ id: "test-sub" });
    const events: string[] = [];

    sub.on("started", () => events.push("started"));
    sub.on("stopped", () => events.push("stopped"));

    sub.start();
    sub.stop();

    expect(events).toEqual(["started", "stopped"]);
  });

  test("should return id and name", () => {
    const sub = new Subscriber({ id: "my-id", name: "My Subscriber" });

    expect(sub.getId()).toBe("my-id");
    expect(sub.getName()).toBe("My Subscriber");
  });

  test("should use id as name if not provided", () => {
    const sub = new Subscriber({ id: "my-id" });
    expect(sub.getName()).toBe("my-id");
  });
});

describe("TaskQueue", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    // getDb() auto-initializes the database
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  function createTask(content: string, options: Partial<Node> = {}): Node {
    const db = getDb();
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const node: Node = {
      id,
      type: "task",
      content,
      task_status: "open",
      created_at: now,
      updated_at: now,
      ...options,
    };

    db.prepare(
      `INSERT INTO nodes (id, type, content, task_status, priority, due_date, assigned_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      node.id,
      node.type,
      node.content,
      node.task_status,
      node.priority ?? null,
      node.due_date ?? null,
      node.assigned_to ?? null,
      node.created_at,
      node.updated_at,
    );

    return node;
  }

  test("should start empty", () => {
    const queue = new TaskQueue({ id: "test-queue" });
    expect(queue.isEmpty()).toBe(true);
    expect(queue.size()).toBe(0);
  });

  test("should refresh from database", () => {
    createTask("Task 1");
    createTask("Task 2");

    const queue = new TaskQueue({ id: "test-queue" });
    queue.refresh();

    expect(queue.size()).toBe(2);
  });

  test("should filter by status", () => {
    createTask("Open task", { task_status: "open" });
    createTask("Done task", { task_status: "done" });

    const queue = new TaskQueue({
      id: "test-queue",
      statuses: ["open"],
    });
    queue.refresh();

    expect(queue.size()).toBe(1);
    expect(queue.peek()?.content).toBe("Open task");
  });

  test("should filter by assigned_to", () => {
    createTask("Agent A task", { assigned_to: "agent-a" });
    createTask("Agent B task", { assigned_to: "agent-b" });

    const queue = new TaskQueue({
      id: "test-queue",
      assignedTo: "agent-a",
    });
    queue.refresh();

    expect(queue.size()).toBe(1);
    expect(queue.peek()?.content).toBe("Agent A task");
  });

  test("should order by priority", () => {
    createTask("Low priority", { priority: 5 });
    createTask("High priority", { priority: 1 });
    createTask("Medium priority", { priority: 3 });

    const queue = new TaskQueue({ id: "test-queue" });
    queue.refresh();

    const tasks = queue.getAll();
    expect(tasks[0].content).toBe("High priority");
    expect(tasks[1].content).toBe("Medium priority");
    expect(tasks[2].content).toBe("Low priority");
  });

  test("should prioritize overdue tasks", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    createTask("Future task", {
      due_date: tomorrow.toISOString().split("T")[0],
    });
    createTask("Overdue task", {
      due_date: yesterday.toISOString().split("T")[0],
    });

    const queue = new TaskQueue({ id: "test-queue" });
    queue.refresh();

    const tasks = queue.getAll();
    expect(tasks[0].content).toBe("Overdue task");
  });

  test("should add tasks manually", () => {
    const queue = new TaskQueue({ id: "test-queue" });

    const task = createTask("Manual task");
    queue.add(task);

    expect(queue.size()).toBe(1);
    expect(queue.peek()?.id).toBe(task.id);
  });

  test("should not add duplicate tasks", () => {
    const queue = new TaskQueue({ id: "test-queue" });

    const task = createTask("Manual task");
    queue.add(task);
    queue.add(task);

    expect(queue.size()).toBe(1);
  });

  test("should remove tasks", () => {
    const queue = new TaskQueue({ id: "test-queue" });

    const task = createTask("Manual task");
    queue.add(task);

    expect(queue.remove(task.id)).toBe(true);
    expect(queue.size()).toBe(0);
    expect(queue.remove(task.id)).toBe(false);
  });

  test("should get stats", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    createTask("Task 1", { priority: 1 });
    createTask("Task 2", {
      priority: 2,
      due_date: yesterday.toISOString().split("T")[0],
    });

    const queue = new TaskQueue({ id: "test-queue" });
    queue.refresh();

    const stats = queue.getStats();
    expect(stats.total).toBe(2);
    expect(stats.byStatus["open"]).toBe(2);
    expect(stats.byPriority["1"]).toBe(1);
    expect(stats.byPriority["2"]).toBe(1);
    expect(stats.overdue).toBe(1);
  });

  test("should respect maxSize", () => {
    for (let i = 0; i < 10; i++) {
      createTask(`Task ${i}`);
    }

    const queue = new TaskQueue({ id: "test-queue", maxSize: 5 });
    queue.refresh();

    expect(queue.size()).toBe(5);
  });
});

describe("Session", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    // Session tests emit events, which may use the database
    // Clear any stale db references from previous tests
    clearDatabase();
    closeDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should create session with unique id", () => {
    const session1 = startSession({ agentId: "agent-1" });
    const session2 = startSession({ agentId: "agent-1" });

    expect(session1.getId()).not.toBe(session2.getId());
  });

  test("should start in active state", () => {
    const session = startSession({ agentId: "agent-1" });
    expect(session.getState()).toBe("active");
  });

  test("should log messages", () => {
    const session = startSession({ agentId: "agent-1" });

    session.logMessage("user", "Hello");
    session.logMessage("assistant", "Hi there!");
    session.logMessage("system", "Session started");

    const messages = session.getMessages();
    expect(messages.length).toBe(3);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello");
    expect(messages[1].role).toBe("assistant");
    expect(messages[2].role).toBe("system");
  });

  test("should log tool calls", () => {
    const session = startSession({ agentId: "agent-1" });

    session.logToolCall("search", { query: "test" }, ["result1", "result2"]);
    session.logToolCall("edit", { file: "test.ts" }, null, "File not found");

    const toolCalls = session.getToolCalls();
    expect(toolCalls.length).toBe(2);
    expect(toolCalls[0].tool).toBe("search");
    expect(toolCalls[0].output).toEqual(["result1", "result2"]);
    expect(toolCalls[1].error).toBe("File not found");
  });

  test("should complete session", () => {
    const session = startSession({ agentId: "agent-1" });

    session.complete("Task finished successfully");

    expect(session.getState()).toBe("completed");
  });

  test("should fail session", () => {
    const session = startSession({ agentId: "agent-1" });

    session.fail("Something went wrong");

    expect(session.getState()).toBe("failed");
  });

  test("should cancel session", () => {
    const session = startSession({ agentId: "agent-1" });

    session.cancel("User requested cancellation");

    expect(session.getState()).toBe("cancelled");
  });

  test("should not change state after ended", () => {
    const session = startSession({ agentId: "agent-1" });

    session.complete("Done");
    session.fail("Error"); // Should be ignored
    session.cancel("Cancel"); // Should be ignored

    expect(session.getState()).toBe("completed");
  });

  test("should track duration", async () => {
    const session = startSession({ agentId: "agent-1" });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const duration = session.getDuration();
    expect(duration).toBeGreaterThanOrEqual(50);
  });

  test("should get summary", () => {
    const session = startSession({ agentId: "agent-1", taskId: "task-1" });

    session.logMessage("user", "Hello");
    session.logToolCall("search", { query: "test" });

    const summary = session.getSummary();
    expect(summary.agentId).toBe("agent-1");
    expect(summary.taskId).toBe("task-1");
    expect(summary.state).toBe("active");
    expect(summary.messageCount).toBe(1);
    expect(summary.toolCallCount).toBe(1);
  });
});

describe("Agent", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    // getDb() auto-initializes the database
    resetDb();
    resetEventHub();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  function createTask(content: string, options: Partial<Node> = {}): Node {
    const db = getDb();
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const node: Node = {
      id,
      type: "task",
      content,
      task_status: "open",
      created_at: now,
      updated_at: now,
      ...options,
    };

    db.prepare(
      `INSERT INTO nodes (id, type, content, task_status, priority, due_date, assigned_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      node.id,
      node.type,
      node.content,
      node.task_status,
      node.priority ?? null,
      node.due_date ?? null,
      node.assigned_to ?? null,
      node.created_at,
      node.updated_at,
    );

    return node;
  }

  test("should create with unique id", () => {
    const agent = createAgent({ id: "test-agent", name: "Test Agent" });

    expect(agent.getId()).toBe("test-agent");
    expect(agent.getName()).toBe("Test Agent");
  });

  test("should start in idle state", () => {
    const agent = createAgent({ id: "test-agent" });
    expect(agent.getState()).toBe("idle");
  });

  test("should emit started/stopped events", () => {
    const agent = createAgent({ id: "test-agent" });
    const events: string[] = [];

    agent.on("started", () => events.push("started"));
    agent.on("stopped", () => events.push("stopped"));

    agent.start();
    agent.stop();

    expect(events).toEqual(["started", "stopped"]);
  });

  test("should claim task from queue", () => {
    const task = createTask("Test task", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      autoAdvance: false,
    });

    agent.start();

    const claimed = agent.claimNext();
    expect(claimed).not.toBeNull();
    expect(claimed?.id).toBe(task.id);
    expect(agent.getState()).toBe("working");
    expect(agent.getCurrentTask()?.id).toBe(task.id);

    agent.stop();
  });

  test("should not claim when already working", () => {
    createTask("Task 1", { assigned_to: "test-agent" });
    createTask("Task 2", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      autoAdvance: false,
    });

    agent.start();

    const first = agent.claimNext();
    const second = agent.claimNext();

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    agent.stop();
  });

  test("should complete task", () => {
    const task = createTask("Test task", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      autoAdvance: false,
    });

    const completed: Node[] = [];
    agent.on("task-completed", (t) => completed.push(t));

    agent.start();
    agent.claimNext();
    agent.completeTask("All done");

    expect(completed.length).toBe(1);
    expect(completed[0].id).toBe(task.id);
    expect(agent.getState()).toBe("idle");
    expect(agent.getCurrentTask()).toBeNull();

    agent.stop();
  });

  test("should release task", () => {
    const task = createTask("Test task", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      autoAdvance: false,
    });

    const released: Node[] = [];
    agent.on("task-released", (t) => released.push(t));

    agent.start();
    agent.claimNext();
    agent.releaseTask("Changed my mind");

    expect(released.length).toBe(1);
    expect(released[0].id).toBe(task.id);
    expect(agent.getState()).toBe("idle");
    expect(agent.getCurrentTask()).toBeNull();

    agent.stop();
  });

  test("should pause and resume", () => {
    const agent = createAgent({
      id: "test-agent",
      autoAdvance: false,
    });

    agent.start();
    agent.pause();
    expect(agent.getState()).toBe("paused");

    agent.resume();
    expect(agent.getState()).toBe("idle");

    agent.stop();
  });

  test("should not claim when paused", () => {
    createTask("Test task", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      autoAdvance: false,
    });

    agent.start();
    agent.pause();

    const claimed = agent.claimNext();
    expect(claimed).toBeNull();

    agent.stop();
  });

  test("should log messages via session", () => {
    createTask("Test task", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      autoAdvance: false,
    });

    agent.start();
    agent.claimNext();

    agent.log("user", "Hello");
    agent.log("assistant", "Hi");

    const session = agent.getCurrentSession();
    expect(session?.getMessages().length).toBe(2);

    agent.stop();
  });

  test("should log tool calls via session", () => {
    createTask("Test task", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      autoAdvance: false,
    });

    agent.start();
    agent.claimNext();

    agent.logTool("search", { query: "test" }, { results: [] });

    const session = agent.getCurrentSession();
    expect(session?.getToolCalls().length).toBe(1);

    agent.stop();
  });

  test("should get status", () => {
    createTask("Test task", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      name: "Test Agent",
      autoAdvance: false,
    });

    agent.start();
    agent.claimNext();

    const status = agent.getStatus();
    expect(status.id).toBe("test-agent");
    expect(status.name).toBe("Test Agent");
    expect(status.state).toBe("working");
    expect(status.currentTask).not.toBeNull();

    agent.stop();
  });

  test("should auto-advance when enabled", () => {
    createTask("Task 1", { assigned_to: "test-agent" });
    createTask("Task 2", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      autoAdvance: true,
    });

    const claimed: Node[] = [];
    agent.on("task-claimed", (t) => claimed.push(t));

    agent.start();

    // Should auto-claim first task
    expect(claimed.length).toBe(1);

    // Complete first task - should auto-claim second
    agent.completeTask("Done");

    expect(claimed.length).toBe(2);

    agent.stop();
  });

  test("should cancel session on stop", () => {
    createTask("Test task", { assigned_to: "test-agent" });

    const agent = createAgent({
      id: "test-agent",
      autoAdvance: false,
    });

    agent.start();
    agent.claimNext();

    const session = agent.getCurrentSession();
    expect(session?.getState()).toBe("active");

    agent.stop();

    expect(session?.getState()).toBe("cancelled");
  });

  test("should get queue", () => {
    const agent = createAgent({ id: "test-agent" });

    const queue = agent.getQueue();
    expect(queue).toBeDefined();
    expect(queue.size()).toBe(0);
  });
});
