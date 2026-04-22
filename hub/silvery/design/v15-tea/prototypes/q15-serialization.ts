/**
 * Q15 Spike: Command Serialization
 *
 * Challenge: Nested command tree exists as object references in memory.
 * But for config files, CLI help, MCP export, we need string paths.
 *
 * Questions:
 * 1. How do we serialize app.commands.task.toggle_done → "task.toggle_done"?
 * 2. How do we deserialize "task.toggle_done" → app.commands.task.toggle_done?
 * 3. How does this work for dynamic command registration?
 * 4. What about command args serialization (Zod schemas)?
 *
 * Verdict: Dual registry approach.
 * - In-memory: nested object structure (app.commands)
 * - Boundary: flat registry for serialization (CommandRegistry)
 */

// ============================================================================
// Serialization Registry
// ============================================================================

export interface CommandEntry {
  path: string; // "domain.action"
  command: any; // The actual command object
  schema?: any; // Optional Zod schema for args
}

export class CommandRegistry {
  private entries: Map<string, CommandEntry> = new Map();
  private pathIndex: Map<any, string> = new Map(); // Command object → path

  /**
   * Register a command from the nested tree.
   * Called during app startup to build the registry.
   */
  register(path: string, command: any, schema?: any) {
    const entry: CommandEntry = { path, command, schema };
    this.entries.set(path, entry);
    this.pathIndex.set(command, path);
  }

  /**
   * Flatten a nested command tree into the registry.
   * Called automatically after all plugins are composed.
   */
  loadFromTree(commands: Record<string, any>, prefix = ""): void {
    for (const [key, value] of Object.entries(commands)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === "object" && "invoke" in value) {
        // It's a command
        this.register(path, value);
      } else if (value && typeof value === "object") {
        // It's a namespace, recurse
        this.loadFromTree(value, path);
      }
    }
  }

  /**
   * Serialize: Get the string path for a command object.
   * Used when saving to config, displaying in help, etc.
   */
  pathOf(command: any): string | null {
    return this.pathIndex.get(command) ?? null;
  }

  /**
   * Deserialize: Get the command object from a string path.
   * Used when loading from config, parsing CLI args, etc.
   */
  commandAt(path: string): any | null {
    return this.entries.get(path)?.command ?? null;
  }

  /**
   * List all commands for help/export.
   */
  list(): CommandEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Export as JSON for MCP, API, or documentation.
   */
  export(): Record<string, { help?: string; icon?: string }> {
    const result: Record<string, any> = {};
    for (const [path, entry] of this.entries) {
      result[path] = {
        help: entry.command.help,
        icon: entry.command.icon,
      };
    }
    return result;
  }
}

// ============================================================================
// Integration with App
// ============================================================================

export interface HasCommandRegistry {
  _registry: CommandRegistry;
  commandByPath(path: string): any | null;
  pathOfCommand(command: any): string | null;
}

export function withCommandRegistry<A extends { commands: any }>(
  app: A,
): A & HasCommandRegistry {
  const registry = new CommandRegistry();
  registry.loadFromTree(app.commands);

  return {
    ...app,
    _registry: registry,
    commandByPath: (path: string) => registry.commandAt(path),
    pathOfCommand: (command: any) => registry.pathOf(command),
  };
}

// ============================================================================
// Use Cases
// ============================================================================

console.log("=== Q15: Command Serialization ===\n");

// Example app with commands
const exampleApp = {
  commands: {
    task: {
      toggle_done: { invoke: (id: string) => ({}), help: "Toggle task done" },
      add: { invoke: (title: string) => ({}), help: "Add new task" },
      delete: { invoke: (id: string) => ({}), help: "Delete task" },
    },
    project: {
      create: { invoke: (name: string) => ({}), help: "Create project" },
      archive: { invoke: (id: string) => ({}), help: "Archive project" },
    },
    nav: {
      open: { invoke: (path: string) => ({}), help: "Open view" },
      close: { invoke: () => ({}), help: "Close view" },
    },
  },
};

// Create registry
const app = withCommandRegistry(exampleApp);

// Use case 1: Serialize for config file
console.log("1. Serialize for config file:\n");
const config = {
  keybindings: [
    {
      key: "x",
      command: app.pathOfCommand(app.commands.task.toggle_done),
    },
    {
      key: "a",
      command: app.pathOfCommand(app.commands.task.add),
    },
    {
      key: "o",
      command: app.pathOfCommand(app.commands.nav.open),
    },
  ],
};
console.log(JSON.stringify(config, null, 2));

// Use case 2: Deserialize from config
console.log("\n2. Deserialize from config:\n");
const keybind = config.keybindings[0];
const cmd = app.commandByPath(keybind.command!);
console.log(`Key '${keybind.key}' → command: ${keybind.command}`);
console.log(`Resolved to:`, cmd);

// Use case 3: Export for CLI help
console.log("\n3. Export for CLI help:\n");
const exported = app._registry.export();
for (const [path, info] of Object.entries(exported)) {
  console.log(`  ${path}${info.help ? ` — ${info.help}` : ""}`);
}

// Use case 4: Dispatch from MCP
console.log("\n4. MCP command invocation:\n");
function invokeFromMCP(
  app: typeof exampleApp & HasCommandRegistry,
  path: string,
  args: any,
) {
  const command = app.commandByPath(path);
  if (!command) {
    return { error: `Command not found: ${path}` };
  }
  try {
    const result = command.invoke(args);
    return { success: true, result };
  } catch (error) {
    return { error: String(error) };
  }
}

const mcpResult = invokeFromMCP(app, "task.toggle_done", "task-123");
console.log("MCP call result:", mcpResult);

// ============================================================================
// Q15 Resolution
// ============================================================================

/**
 * VERDICT: Dual registry (in-memory tree + flat registry for boundaries).
 *
 * ✅ In-memory: nested app.commands structure for type safety and discoverability
 * ✅ Boundary: CommandRegistry.pathOf()/commandAt() for serialization
 *
 * Implementation:
 * 1. After all plugins composed, call withCommandRegistry(app)
 * 2. Registry auto-flattens the tree into a path → command map
 * 3. Reverse index (command → path) for serialization
 * 4. At boundaries (CLI, config, MCP), convert between paths and objects:
 *    - Save config: app.pathOfCommand(app.commands.task.toggle_done) → "task.toggle_done"
 *    - Load config: app.commandByPath("task.toggle_done") → command object
 *    - MCP export: registry.export() → JSON with all paths + metadata
 *
 * Works with:
 * ✅ Dynamic command registration (plugins add commands, registry updates)
 * ✅ Args validation (Zod schemas can be attached to registry entries)
 * ✅ CLI help generation (registry.list() provides all command info)
 * ✅ Replay/undo (command paths are serializable, can reconstruct calls)
 *
 * Next: Integrate with Q5 (args schema) for full CLI/MCP story.
 */
