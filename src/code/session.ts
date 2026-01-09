/**
 * Session
 *
 * Tracks agent work sessions for audit and replay
 */

import { ulid } from "ulid";
import { emit } from "../node/emit.ts";
import type {
  Event,
  SessionStartData,
  SessionMessageData,
  SessionToolCallData,
  SessionEndData,
} from "../node/types.ts";

export interface SessionConfig {
  agentId: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export type SessionState = "active" | "completed" | "failed" | "cancelled";

/**
 * Session - Tracks a work session
 *
 * Records:
 * - Start/end events
 * - Messages exchanged
 * - Tool calls made
 * - Outcome summary
 */
export class Session {
  private id: string;
  private agentId: string;
  private taskId?: string;
  private state: SessionState = "active";
  private startedAt: number;
  private endedAt?: number;
  private messages: SessionMessageData[] = [];
  private toolCalls: SessionToolCallData[] = [];
  private metadata: Record<string, unknown>;

  constructor(config: SessionConfig) {
    this.id = ulid();
    this.agentId = config.agentId;
    this.taskId = config.taskId;
    this.metadata = config.metadata ?? {};
    this.startedAt = Date.now();

    // Emit session start event
    this.emitStart();
  }

  /**
   * Emit session_started event
   */
  private emitStart(): void {
    emit({
      type: "session_started",
      actor: this.agentId,
      target: this.taskId,
      data: {
        session_id: this.id,
        task_id: this.taskId,
        metadata: this.metadata,
      } satisfies SessionStartData,
    });
  }

  /**
   * Log a message in the session
   */
  logMessage(
    role: "user" | "assistant" | "system",
    content: string,
    metadata?: Record<string, unknown>,
  ): void {
    const messageData: SessionMessageData = {
      session_id: this.id,
      role,
      content,
      metadata,
    };

    this.messages.push(messageData);

    emit({
      type: "session_message",
      actor: this.agentId,
      target: this.taskId,
      data: messageData,
    });
  }

  /**
   * Log a tool call
   */
  logToolCall(
    tool: string,
    input: Record<string, unknown>,
    output?: unknown,
    error?: string,
  ): void {
    const toolData: SessionToolCallData = {
      session_id: this.id,
      tool,
      input,
      output,
      error,
    };

    this.toolCalls.push(toolData);

    emit({
      type: "session_tool_call",
      actor: this.agentId,
      target: this.taskId,
      data: toolData,
    });
  }

  /**
   * Complete the session successfully
   */
  complete(summary?: string): void {
    if (this.state !== "active") {
      return;
    }

    this.state = "completed";
    this.endedAt = Date.now();

    emit({
      type: "session_ended",
      actor: this.agentId,
      target: this.taskId,
      data: {
        session_id: this.id,
        outcome: "completed",
        summary,
        duration_ms: this.endedAt - this.startedAt,
      } satisfies SessionEndData,
    });
  }

  /**
   * Mark session as failed
   */
  fail(error: string): void {
    if (this.state !== "active") {
      return;
    }

    this.state = "failed";
    this.endedAt = Date.now();

    emit({
      type: "session_ended",
      actor: this.agentId,
      target: this.taskId,
      data: {
        session_id: this.id,
        outcome: "failed",
        error,
        duration_ms: this.endedAt - this.startedAt,
      } satisfies SessionEndData,
    });
  }

  /**
   * Cancel the session
   */
  cancel(reason?: string): void {
    if (this.state !== "active") {
      return;
    }

    this.state = "cancelled";
    this.endedAt = Date.now();

    emit({
      type: "session_ended",
      actor: this.agentId,
      target: this.taskId,
      data: {
        session_id: this.id,
        outcome: "cancelled",
        summary: reason,
        duration_ms: this.endedAt - this.startedAt,
      } satisfies SessionEndData,
    });
  }

  /**
   * Get session ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get session state
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Get session duration in ms
   */
  getDuration(): number {
    const end = this.endedAt ?? Date.now();
    return end - this.startedAt;
  }

  /**
   * Get all messages
   */
  getMessages(): SessionMessageData[] {
    return [...this.messages];
  }

  /**
   * Get all tool calls
   */
  getToolCalls(): SessionToolCallData[] {
    return [...this.toolCalls];
  }

  /**
   * Get session summary
   */
  getSummary(): {
    id: string;
    agentId: string;
    taskId?: string;
    state: SessionState;
    startedAt: number;
    endedAt?: number;
    duration: number;
    messageCount: number;
    toolCallCount: number;
  } {
    return {
      id: this.id,
      agentId: this.agentId,
      taskId: this.taskId,
      state: this.state,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      duration: this.getDuration(),
      messageCount: this.messages.length,
      toolCallCount: this.toolCalls.length,
    };
  }
}

/**
 * Create and start a new session
 */
export function startSession(config: SessionConfig): Session {
  return new Session(config);
}
