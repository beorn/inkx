/**
 * Task-Based Progress Display
 *
 * Shows a checklist of tasks with progress indicators using MultiProgress.
 * Supports both async tasks (spinner) and generator tasks (progress bar).
 */

import { MultiProgress, type TaskHandle } from "@beorn/progressx/cli";
import type { ProgressInfo } from "@beorn/progressx";

/**
 * Task definition for runWithTasks
 */
export interface TaskDef<T = void> {
  /** Unique task identifier */
  id: string;
  /** Display title */
  title: string;
  /** Task function - can be sync, async, or generator */
  run: () => T | Promise<T> | Generator<ProgressInfo, T, unknown>;
}

/**
 * Result from a task execution
 */
interface TaskResult<T> {
  id: string;
  value: T;
}

/**
 * Run a sequence of tasks with progress display
 *
 * Shows a checklist of all tasks:
 * - ○ pending tasks
 * - ⠋ running task (with progress bar if generator)
 * - ✓ completed tasks
 *
 * @example
 * ```typescript
 * const results = await runWithTasks([
 *   { id: "load", title: "Loading", run: async () => loadData() },
 *   { id: "process", title: "Processing", run: function*() { ... yield progress ... } },
 * ]);
 * ```
 */
export async function runWithTasks<T extends TaskDef<unknown>[]>(
  tasks: T,
): Promise<{ [K in T[number]["id"]]: unknown }> {
  const multi = new MultiProgress();
  const handles = new Map<string, TaskHandle>();
  const results: Record<string, unknown> = {};

  // Register all tasks upfront (shows pending state)
  for (const task of tasks) {
    handles.set(task.id, multi.add(task.title, { type: "spinner" }));
  }

  multi.start();

  try {
    for (const task of tasks) {
      const handle = handles.get(task.id)!;
      handle.start();

      // Force render before potentially blocking operation
      await new Promise((r) => setImmediate(r));

      const result = task.run();

      if (isGenerator(result)) {
        // Generator task - consume and show progress
        results[task.id] = await runGenerator(result, handle, task.title);
      } else if (isPromise(result)) {
        // Async task
        results[task.id] = await result;
      } else {
        // Sync task
        results[task.id] = result;
      }

      handle.complete();
    }
  } finally {
    // Clear progress display after all tasks complete
    multi.stop(true);
  }

  return results as { [K in T[number]["id"]]: unknown };
}

/** Phase names for progress display */
const PHASE_LABELS: Record<string, string> = {
  reading: "Reading events",
  applying: "Applying events",
  rules: "Evaluating rules",
  scanning: "Scanning files",
  reconciling: "Reconciling changes",
  board: "Building view",
};

/**
 * Run a generator task with progress updates
 */
async function runGenerator<T>(
  gen: Generator<ProgressInfo, T, unknown>,
  handle: TaskHandle,
  baseTitle: string,
): Promise<T> {
  let result = gen.next();

  while (!result.done) {
    const info = result.value;
    const phase = info.phase ?? "";
    const phaseLabel = PHASE_LABELS[phase] ?? (phase || baseTitle);

    // Update title with phase and progress count
    if (info.total && info.total > 0) {
      handle.setTitle(`${phaseLabel} (${info.current}/${info.total})`);
    } else {
      handle.setTitle(phaseLabel);
    }

    // Yield to event loop for animation
    await new Promise((r) => setImmediate(r));

    result = gen.next();
  }

  // Reset title on completion
  handle.setTitle(baseTitle);

  return result.value;
}

function isGenerator(value: unknown): value is Generator<ProgressInfo, unknown, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Generator).next === "function" &&
    typeof (value as Generator).throw === "function"
  );
}

function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Promise<unknown>).then === "function"
  );
}
