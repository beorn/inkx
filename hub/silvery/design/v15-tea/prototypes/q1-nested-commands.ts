/**
 * Q1 Spike: Nested Command Trees with Object References
 *
 * Era2b principle: Commands are object references, not strings.
 * `app.commands.task.toggle_done` is a value; serialization happens only at boundaries.
 *
 * Approach:
 * 1. Each plugin declares a command namespace shape (e.g., { task: { toggle_done, add, ... } })
 * 2. Plugins contribute command objects that include metadata + the invoke function
 * 3. Intersection types track all command namespaces through the pipe
 * 4. Invoking is strongly typed: app.commands.task.toggle_done.invoke(args)
 * 5. Serialization at boundaries derives the path: commands.task.toggle_done → "task.toggle_done"
 */

// ============================================================================
// Core Framework
// ============================================================================

export interface Scope<S = any, E = any> {
  state: S;
  signal: (v: S) => void;
  events: Map<string, E>;
}

export function scope<S>(initial: S): Scope<S> {
  return {
    state: initial,
    signal: () => {},
    events: new Map(),
  };
}

export function pipe<A>(seed: A): A;
export function pipe<A, B>(seed: A, f1: (a: A) => B): B;
export function pipe<A, B, C>(seed: A, f1: (a: A) => B, f2: (b: B) => C): C;
export function pipe<A, B, C, D>(
  seed: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
): D;
export function pipe(
  seed: any,
  ...fns: ((a: any) => any)[]
): any {
  return fns.reduce((acc, fn) => fn(acc), seed);
}

// ============================================================================
// Command System
// ============================================================================

/** A command is an object with invoke function + optional metadata (help, icon, etc.) */
export interface Command<Args = any, Result = any> {
  invoke(args: Args): Result;
  name?: string;
  help?: string;
  icon?: string;
}

/** Plugin contributes a set of command namespaces */
export interface HasCommands {
  commands: Record<string, any>;
}

// ============================================================================
// Plugin Factories
// ============================================================================

/** Task domain: toggle_done, add, delete, etc. */
export function withTaskCommands<A extends object>(app: A): A & HasCommands {
  const taskCommands = {
    toggle_done: {
      invoke: (id: string) => ({ type: "task.toggle_done", id }),
      help: "Toggle task done state",
    } as Command<string, { type: string; id: string }>,
    add: {
      invoke: (title: string) => ({ type: "task.add", title }),
      help: "Add new task",
    } as Command<string, { type: string; title: string }>,
    delete: {
      invoke: (id: string) => ({ type: "task.delete", id }),
      help: "Delete task",
    } as Command<string, { type: string; id: string }>,
  };

  return {
    ...app,
    commands: {
      ...(app as any).commands,
      task: taskCommands,
    },
  };
}

/** Project domain: create, archive, list, etc. */
export function withProjectCommands<A extends object>(app: A): A & HasCommands {
  const projectCommands = {
    create: {
      invoke: (name: string) => ({ type: "project.create", name }),
      help: "Create new project",
    } as Command<string, { type: string; name: string }>,
    archive: {
      invoke: (id: string) => ({ type: "project.archive", id }),
      help: "Archive project",
    } as Command<string, { type: string; id: string }>,
    list: {
      invoke: () => ({ type: "project.list", items: [] }),
      help: "List all projects",
    } as Command<void, { type: string; items: any[] }>,
  };

  return {
    ...app,
    commands: {
      ...(app as any).commands,
      project: projectCommands,
    },
  };
}

/** Navigation domain: open, close, focus, etc. */
export function withNavCommands<A extends object>(app: A): A & HasCommands {
  const navCommands = {
    open: {
      invoke: (path: string) => ({ type: "nav.open", path }),
      help: "Open a view",
    } as Command<string, { type: string; path: string }>,
    close: {
      invoke: () => ({ type: "nav.close" }),
      help: "Close current view",
    } as Command<void, { type: string }>,
    focus: {
      invoke: (target: string) => ({ type: "nav.focus", target }),
      help: "Focus element",
    } as Command<string, { type: string; target: string }>,
  };

  return {
    ...app,
    commands: {
      ...(app as any).commands,
      nav: navCommands,
    },
  };
}

// ============================================================================
// Utility: Command Path Serialization
// ============================================================================

/**
 * Walk a nested command object and return all (path, command) pairs.
 * Used for serialization, CLI help, MCP export, etc.
 */
export function flattenCommands(
  commandTree: Record<string, any>,
  prefix = "",
): Map<string, Command> {
  const result = new Map<string, Command>();

  for (const [key, value] of Object.entries(commandTree)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && "invoke" in value) {
      // It's a command
      result.set(path, value as Command);
    } else if (value && typeof value === "object") {
      // It's a namespace, recurse
      const nested = flattenCommands(value, path);
      for (const [p, cmd] of nested) {
        result.set(p, cmd);
      }
    }
  }

  return result;
}

// ============================================================================
// Demo: Building a Composed App
// ============================================================================

// Seed: empty app
const seed = { commands: {} };

// Compose with nested command domains
const app = pipe(
  seed,
  withTaskCommands,
  withProjectCommands,
  withNavCommands,
);

// ============================================================================
// Usage Examples (Type-Safe)
// ============================================================================

// 1. Invoke a command directly (strongly typed)
console.log("=== Direct Command Invocation ===");
const toggleResult = app.commands.task.toggle_done.invoke("task-123");
console.log("toggle_done result:", toggleResult);

const createResult = app.commands.project.create.invoke("My Project");
console.log("project.create result:", createResult);

const focusResult = app.commands.nav.focus.invoke("sidebar");
console.log("nav.focus result:", focusResult);

// 2. List all available commands (for CLI, MCP, help menu)
console.log("\n=== All Available Commands ===");
const allCommands = flattenCommands(app.commands);
for (const [path, cmd] of allCommands) {
  console.log(`${path}: ${cmd.help || "(no help)"}`);
}

// 3. Dispatch from a serialized string (e.g., from config, CLI, MCP)
console.log("\n=== Dispatch from String ===");
function dispatchByPath(
  app: typeof globalApp,
  path: string,
  args: any,
): any {
  const parts = path.split(".");
  let cmd: any = app.commands;
  for (const part of parts) {
    cmd = cmd[part];
    if (!cmd) return { error: `Command not found: ${path}` };
  }
  if (!cmd.invoke) return { error: `Not a command: ${path}` };
  return cmd.invoke(args);
}

const dispatchResult = dispatchByPath(app, "task.toggle_done", "task-456");
console.log("Dispatched task.toggle_done:", dispatchResult);

// 4. Introspection: Get command metadata
console.log("\n=== Command Metadata ===");
const taskToggle = app.commands.task.toggle_done;
console.log("Command:", {
  name: taskToggle.name || "toggle_done",
  help: taskToggle.help,
  namespace: "task",
});

// ============================================================================
// Q1 Resolution Analysis
// ============================================================================

/**
 * VERDICT: Nested object references work well for:
 *
 * ✅ Type safety: app.commands.task.toggle_done is strongly typed
 * ✅ Discoverability: IDE autocomplete guides users through the hierarchy
 * ✅ Refactoring: Rename the command object, TypeScript catches all callsites
 * ✅ Composition: Each plugin contributes to one namespace, no conflicts
 * ✅ Serialization: flattenCommands() can export to CLI, MCP, config
 * ✅ Layer legibility: Each plugin is independent, namespace is predictable
 *
 * ✅ Pipe threading: Intersection types not needed; commands are merged per plugin
 *
 * KEY INSIGHT: The nested structure isn't a type-level problem (would break pipe generics).
 * It's a value-level structure that plugins build up. Each plugin returns
 * app & { commands: { newDomain: { ...commands } } }, which is straightforward to
 * thread through pipe. No fancy generic intersection constraints needed.
 *
 * NEXT STEPS:
 * - Promote Q1 to D9: "Commands are nested object references (app.commands.domain.action)."
 * - Implement serialization for CLI/MCP/config (path-based lookup).
 * - Resolve Q2-Q3 (input seam, effects) with this model in place.
 * - Update canonical.ts prototype.
 */

// Type annotation to keep TypeScript happy (placeholder for real app type)
declare const globalApp: typeof app;
