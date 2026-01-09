/**
 * Task Queue
 *
 * Priority queue for agent task management
 */

import type { Node, TaskStatus } from "../node/types.ts";
import { getTasksByStatus, getNode, getSubtree } from "../node/db.ts";
import { emitTaskClaimed, emitTaskReleased } from "../node/emit.ts";

export interface QueuedTask {
  node: Node;
  priority: number;
  addedAt: number;
}

export interface TaskQueueConfig {
  id: string;
  /** Task statuses to include */
  statuses?: TaskStatus[];
  /** Only tasks assigned to this actor */
  assignedTo?: string;
  /** Filter function */
  filter?: (node: Node) => boolean;
  /** Max tasks to keep in queue */
  maxSize?: number;
}

/**
 * TaskQueue - Priority queue for task management
 *
 * Features:
 * - Priority ordering
 * - Due date awareness
 * - Claim/release management
 * - Auto-refresh from database
 */
export class TaskQueue {
  private id: string;
  private tasks: QueuedTask[] = [];
  private config: TaskQueueConfig;

  constructor(config: TaskQueueConfig) {
    this.id = config.id;
    this.config = {
      statuses: ["open"],
      maxSize: 100,
      ...config,
    };
  }

  /**
   * Refresh queue from database
   */
  refresh(): void {
    const statuses = this.config.statuses ?? ["open"];
    const rawTasks = getTasksByStatus(statuses);

    let filteredTasks = rawTasks;

    // Filter by assigned_to
    if (this.config.assignedTo) {
      filteredTasks = filteredTasks.filter(
        (t) => t.assigned_to === this.config.assignedTo
      );
    }

    // Apply custom filter
    if (this.config.filter) {
      filteredTasks = filteredTasks.filter(this.config.filter);
    }

    // Convert to queued tasks with priority scoring
    this.tasks = filteredTasks
      .map((node) => ({
        node,
        priority: this.calculatePriority(node),
        addedAt: Date.now(),
      }))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, this.config.maxSize);
  }

  /**
   * Calculate effective priority (lower = higher priority)
   */
  private calculatePriority(node: Node): number {
    let score = 0;

    // Base priority (1-5, default 3)
    score += (node.priority ?? 3) * 1000;

    // Due date urgency
    if (node.due_date) {
      const dueTime = new Date(node.due_date).getTime();
      const now = Date.now();
      const daysUntilDue = (dueTime - now) / (1000 * 60 * 60 * 24);

      if (daysUntilDue < 0) {
        // Overdue - highest priority
        score -= 10000;
      } else if (daysUntilDue < 1) {
        // Due today
        score -= 5000;
      } else if (daysUntilDue < 7) {
        // Due this week
        score -= 1000;
      }
    }

    // In-progress tasks get slight priority
    if (node.task_status === "in_progress") {
      score -= 500;
    }

    return score;
  }

  /**
   * Get the next task without removing it
   */
  peek(): Node | null {
    if (this.tasks.length === 0) {
      return null;
    }
    return this.tasks[0].node;
  }

  /**
   * Get and claim the next task
   */
  claim(actor: string): Node | null {
    const task = this.peek();
    if (!task) {
      return null;
    }

    // Emit claim event
    emitTaskClaimed(task.id, actor);

    // Remove from queue
    this.tasks.shift();

    // Return the latest version
    return getNode(task.id);
  }

  /**
   * Release a claimed task back to the queue
   */
  release(taskId: string, actor: string, reason?: string): void {
    emitTaskReleased(taskId, actor, reason);
    // Queue will pick it up on next refresh
  }

  /**
   * Get all tasks in queue
   */
  getAll(): Node[] {
    return this.tasks.map((t) => t.node);
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.tasks.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  /**
   * Add a task manually
   */
  add(node: Node): void {
    if (node.type !== "task") {
      return;
    }

    // Check if already in queue
    if (this.tasks.some((t) => t.node.id === node.id)) {
      return;
    }

    const queued: QueuedTask = {
      node,
      priority: this.calculatePriority(node),
      addedAt: Date.now(),
    };

    // Insert in priority order
    const index = this.tasks.findIndex((t) => t.priority > queued.priority);
    if (index === -1) {
      this.tasks.push(queued);
    } else {
      this.tasks.splice(index, 0, queued);
    }

    // Trim to max size
    if (this.tasks.length > (this.config.maxSize ?? 100)) {
      this.tasks.pop();
    }
  }

  /**
   * Remove a task from queue
   */
  remove(taskId: string): boolean {
    const index = this.tasks.findIndex((t) => t.node.id === taskId);
    if (index !== -1) {
      this.tasks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get queue stats
   */
  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    overdue: number;
  } {
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let overdue = 0;
    const now = Date.now();

    for (const { node } of this.tasks) {
      // Count by status
      const status = node.task_status ?? "unknown";
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      // Count by priority
      const priority = String(node.priority ?? "none");
      byPriority[priority] = (byPriority[priority] ?? 0) + 1;

      // Count overdue
      if (node.due_date && new Date(node.due_date).getTime() < now) {
        overdue++;
      }
    }

    return {
      total: this.tasks.length,
      byStatus,
      byPriority,
      overdue,
    };
  }
}
