/**
 * Agent
 *
 * Base class for AI agents that process tasks
 */

import { EventEmitter } from "events";
import type { Node, Event } from "../node/types.ts";
import { getNode } from "../node/db.ts";
import { emitTaskCompleted } from "../node/emit.ts";
import { Subscriber } from "./subscriber.ts";
import { TaskQueue, type TaskQueueConfig } from "./queue.ts";
import { Session, startSession } from "./session.ts";
import { getEventHub } from "./hub.ts";

export type AgentState = "idle" | "working" | "paused" | "stopped";

export interface AgentConfig {
  id: string;
  name?: string;
  /** Queue configuration */
  queueConfig?: Partial<TaskQueueConfig>;
  /** Auto-claim next task when current completes */
  autoAdvance?: boolean;
  /** Max concurrent sessions */
  maxConcurrent?: number;
}

/**
 * Agent - AI worker that processes tasks
 *
 * Features:
 * - Task queue management
 * - Session tracking
 * - Event subscription
 * - Lifecycle management
 */
export class Agent extends EventEmitter {
  protected id: string;
  protected name: string;
  protected state: AgentState = "idle";
  protected queue: TaskQueue;
  protected subscriber: Subscriber;
  protected currentSession: Session | null = null;
  protected currentTask: Node | null = null;
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    super();
    this.id = config.id;
    this.name = config.name ?? config.id;
    this.config = {
      autoAdvance: true,
      maxConcurrent: 1,
      ...config,
    };

    // Initialize queue
    this.queue = new TaskQueue({
      id: `${this.id}-queue`,
      assignedTo: this.id,
      ...config.queueConfig,
    });

    // Initialize subscriber for task events
    this.subscriber = new Subscriber({
      id: `${this.id}-subscriber`,
      eventTypes: [
        "node_created",
        "node_updated",
        "task_claimed",
        "task_released",
        "task_completed",
      ],
      filter: (event) => this.shouldHandleEvent(event),
    });

    this.subscriber.on("event", (event) => this.handleEvent(event));
  }

  /**
   * Start the agent
   */
  start(): void {
    if (this.state !== "idle" && this.state !== "stopped") {
      return;
    }

    // Refresh queue
    this.queue.refresh();

    // Start subscriber
    this.subscriber.start();

    this.state = "idle";
    this.emit("started");

    // Auto-claim if enabled and queue has tasks
    if (this.config.autoAdvance && !this.queue.isEmpty()) {
      this.claimNext();
    }
  }

  /**
   * Stop the agent
   */
  stop(): void {
    // Complete current session if any
    if (this.currentSession) {
      this.currentSession.cancel("Agent stopped");
      this.currentSession = null;
    }

    // Release current task
    if (this.currentTask) {
      this.queue.release(this.currentTask.id, this.id, "Agent stopped");
      this.currentTask = null;
    }

    // Stop subscriber
    this.subscriber.stop();

    this.state = "stopped";
    this.emit("stopped");
  }

  /**
   * Pause the agent
   */
  pause(): void {
    if (this.state !== "working" && this.state !== "idle") {
      return;
    }

    this.state = "paused";
    this.emit("paused");
  }

  /**
   * Resume the agent
   */
  resume(): void {
    if (this.state !== "paused") {
      return;
    }

    this.state = this.currentTask ? "working" : "idle";
    this.emit("resumed");

    // Continue with current task or claim next
    if (this.config.autoAdvance && !this.currentTask) {
      this.claimNext();
    }
  }

  /**
   * Claim the next task from queue
   */
  claimNext(): Node | null {
    if (this.state === "stopped" || this.state === "paused") {
      return null;
    }

    if (this.currentTask) {
      return null; // Already working on a task
    }

    const task = this.queue.claim(this.id);
    if (!task) {
      return null;
    }

    this.currentTask = task;
    this.state = "working";

    // Start session
    this.currentSession = startSession({
      agentId: this.id,
      taskId: task.id,
    });

    this.emit("task-claimed", task);

    return task;
  }

  /**
   * Complete the current task
   */
  completeTask(summary?: string): void {
    if (!this.currentTask) {
      return;
    }

    // Emit completion event
    emitTaskCompleted(this.currentTask.id, this.id, summary);

    // Complete session
    if (this.currentSession) {
      this.currentSession.complete(summary);
      this.currentSession = null;
    }

    const completed = this.currentTask;
    this.currentTask = null;
    this.state = "idle";

    this.emit("task-completed", completed);

    // Auto-advance to next task
    if (this.config.autoAdvance) {
      this.claimNext();
    }
  }

  /**
   * Release current task back to queue
   */
  releaseTask(reason?: string): void {
    if (!this.currentTask) {
      return;
    }

    // Release to queue
    this.queue.release(this.currentTask.id, this.id, reason);

    // Cancel session
    if (this.currentSession) {
      this.currentSession.cancel(reason);
      this.currentSession = null;
    }

    const released = this.currentTask;
    this.currentTask = null;
    this.state = "idle";

    this.emit("task-released", released);
  }

  /**
   * Process work on current task
   * Override in subclass to implement actual work
   */
  async work(): Promise<void> {
    if (!this.currentTask || !this.currentSession) {
      return;
    }

    // Default implementation - complete immediately
    this.completeTask("Auto-completed");
  }

  /**
   * Log a message in current session
   */
  log(role: "user" | "assistant" | "system", content: string): void {
    this.currentSession?.logMessage(role, content);
  }

  /**
   * Log a tool call in current session
   */
  logTool(
    tool: string,
    input: Record<string, unknown>,
    output?: unknown,
    error?: string,
  ): void {
    this.currentSession?.logToolCall(tool, input, output, error);
  }

  /**
   * Check if event should be handled
   */
  protected shouldHandleEvent(event: Event): boolean {
    // Handle task events targeting this agent
    if (event.target && event.type.startsWith("task_")) {
      const task = getNode(event.target);
      return task?.assigned_to === this.id;
    }

    // Handle new tasks that might be claimable
    if (event.type === "node_created") {
      const data = event.data as Partial<Node>;
      return data.type === "task";
    }

    return false;
  }

  /**
   * Handle incoming event
   */
  protected handleEvent(event: Event): void {
    switch (event.type) {
      case "node_created":
        // New task - refresh queue
        this.queue.refresh();
        if (this.config.autoAdvance && !this.currentTask) {
          this.claimNext();
        }
        break;

      case "task_completed":
        // Task completed elsewhere - refresh queue
        if (event.target === this.currentTask?.id && event.actor !== this.id) {
          // Someone else completed our task
          this.currentTask = null;
          this.currentSession?.cancel("Completed by another agent");
          this.currentSession = null;
          this.state = "idle";
        }
        break;

      case "task_released":
        // Task released - refresh queue
        this.queue.refresh();
        break;
    }

    this.emit("event", event);
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get agent state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Get current task
   */
  getCurrentTask(): Node | null {
    return this.currentTask;
  }

  /**
   * Get current session
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * Get queue
   */
  getQueue(): TaskQueue {
    return this.queue;
  }

  /**
   * Get agent status
   */
  getStatus(): {
    id: string;
    name: string;
    state: AgentState;
    currentTask: string | null;
    queueSize: number;
  } {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      currentTask: this.currentTask?.id ?? null,
      queueSize: this.queue.size(),
    };
  }
}

/**
 * Create a simple agent
 */
export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
