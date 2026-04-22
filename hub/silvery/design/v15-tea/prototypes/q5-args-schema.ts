/**
 * Q5 Spike: Args Schema
 *
 * Challenge: Command args need to be both:
 * 1. Strongly typed in TypeScript (for IDE autocomplete, refactoring, safety)
 * 2. Runtime-validated when parsed from CLI, YAML, MCP, or user input
 *
 * Two approaches:
 * 1. Pure TS inference: Only use TypeScript types, no runtime schema
 * 2. Schema + TS: Define schema (Zod/Standard Schema) for runtime, derive TS type
 *
 * Context: Q15 (serialization) stores commands in a registry.
 * Registry can hold optional schema for each command.
 *
 * Verdict: Dual approach (pragmatic).
 * - Default: Pure TS types from command function signature (simple, ergonomic)
 * - Optional: Attach Zod schema to command for runtime validation (explicit opt-in)
 */

// ============================================================================
// Pure TypeScript Approach
// ============================================================================

/**
 * Command args are inferred from function signature.
 * No runtime validation, but full type safety.
 */

interface CommandWithoutSchema {
  invoke(args: { id: string; title?: string }): { success: boolean };
  help?: string;
}

const simpleCommand: CommandWithoutSchema = {
  invoke: (args) => {
    // TypeScript knows args has id (required) and title (optional)
    console.log(`Task: ${args.id} — ${args.title || "untitled"}`);
    return { success: true };
  },
  help: "Update a task",
};

// Usage: Pure TS, no validation at runtime
console.log("=== Pure TS Approach ===");
simpleCommand.invoke({ id: "task-1", title: "Buy milk" }); // ✅ Type-safe
// simpleCommand.invoke({ id: "task-1", wrong: "field" }); // ❌ TypeScript error

// ============================================================================
// Schema + TypeScript Approach
// ============================================================================

/**
 * Define schema for runtime validation + TS type derivation.
 * Can use Zod, Standard Schema, or simple objects.
 */

// Minimal schema interface (enough for Q5)
interface Schema<T = any> {
  parse(value: unknown): T;
  safeParse(value: unknown): { success: boolean; data?: T; error?: any };
}

/** Zod-like schema builder (simplified) */
function createSchema<T>(validator: (v: any) => T): Schema<T> {
  return {
    parse: validator,
    safeParse: (value: unknown) => {
      try {
        return { success: true, data: validator(value) };
      } catch (error) {
        return { success: false, error };
      }
    },
  };
}

// Define a command with schema
const taskAddSchema = createSchema((args: any) => {
  if (typeof args.title !== "string" || args.title.length === 0) {
    throw new Error("title is required and must be non-empty");
  }
  if (args.priority && ![1, 2, 3].includes(args.priority)) {
    throw new Error("priority must be 1, 2, or 3");
  }
  return {
    title: args.title,
    priority: args.priority ?? 2,
    tags: Array.isArray(args.tags) ? args.tags : [],
  };
});

interface TaskAddArgs {
  title: string;
  priority?: 1 | 2 | 3;
  tags?: string[];
}

interface CommandWithSchema<Args = any, Result = any> {
  invoke(args: Args): Result;
  schema?: Schema<Args>;
  help?: string;
}

const taskAdd: CommandWithSchema<TaskAddArgs> = {
  invoke: (args) => {
    console.log(`Adding task: "${args.title}" (priority ${args.priority})`);
    return { id: `task-${Date.now()}`, ...args };
  },
  schema: taskAddSchema,
  help: "Add a new task",
};

// Usage: Runtime validation
console.log("\n=== Schema + TS Approach ===");

// Valid input
const validInput = { title: "Buy milk", priority: 2, tags: ["shopping"] };
const result1 = taskAdd.schema?.safeParse(validInput);
if (result1?.success) {
  taskAdd.invoke(result1.data);
}

// Invalid input
const invalidInput = { title: "", priority: 5 };
const result2 = taskAdd.schema?.safeParse(invalidInput);
if (!result2?.success) {
  console.log("Validation failed:", result2?.error);
}

// ============================================================================
// Integration with Command Registry
// ============================================================================

interface CommandEntry {
  path: string;
  command: CommandWithSchema;
  argsSchema?: Schema;
}

/**
 * Command registry can store and validate args.
 */
class AdvancedRegistry {
  private entries: Map<string, CommandEntry> = new Map();

  register(path: string, command: CommandWithSchema) {
    this.entries.set(path, { path, command, argsSchema: command.schema });
  }

  /**
   * Invoke a command from a string path with args validation.
   * Used by CLI, MCP, YAML loaders.
   */
  invoke(path: string, rawArgs: unknown): { success: boolean; result?: any; error?: any } {
    const entry = this.entries.get(path);
    if (!entry) {
      return { success: false, error: `Command not found: ${path}` };
    }

    // Validate args if schema is present
    if (entry.argsSchema) {
      const parseResult = entry.argsSchema.safeParse(rawArgs);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error };
      }
      return { success: true, result: entry.command.invoke(parseResult.data) };
    }

    // No schema, invoke directly (trust TypeScript)
    return { success: true, result: entry.command.invoke(rawArgs) };
  }

  /**
   * Export command metadata for CLI help, MCP discovery, etc.
   */
  exportMetadata() {
    const result: Record<string, any> = {};
    for (const [path, entry] of this.entries) {
      result[path] = {
        help: entry.command.help,
        hasSchema: !!entry.argsSchema,
      };
    }
    return result;
  }
}

// Demo: Registry with validation
console.log("\n=== Registry with Validation ===");
const registry = new AdvancedRegistry();
registry.register("task.add", taskAdd);
registry.register("task.simple", simpleCommand);

// Invoke with valid args
const r1 = registry.invoke("task.add", { title: "Buy groceries" });
console.log("task.add result:", r1);

// Invoke with invalid args
const r2 = registry.invoke("task.add", { title: "" });
console.log("task.add error:", r2);

// Invoke schema-less command
const r3 = registry.invoke("task.simple", { id: "t1" });
console.log("task.simple result:", r3);

// ============================================================================
// Q5 Resolution
// ============================================================================

/**
 * VERDICT: Dual approach (pragmatic and ergonomic).
 *
 * Default: Pure TypeScript for simple commands
 * - Command function signature is the type contract
 * - No runtime overhead
 * - IDE autocomplete works great
 * - Best for internal/programmatic use
 *
 * Optional: Attach schema for CLI/MCP/YAML boundary commands
 * - Define Zod/Standard Schema inline with command
 * - Registry uses schema to validate at boundary
 * - CLI gets error messages, type hints
 * - Config files can be validated before parsing
 *
 * Pattern:
 * ```typescript
 * const myCommand: CommandWithSchema<Args> = {
 *   invoke: (args) => { ... },
 *   schema: createSchema(validator), // optional
 *   help: "...",
 * };
 * ```
 *
 * Works with:
 * ✅ Q15 (serialization): registry holds schema for each command
 * ✅ CLI: schema validates user input, provides error messages
 * ✅ YAML/JSON config: schema validates loaded config
 * ✅ MCP: schema describes command args for discovery
 * ✅ Type safety: TS types still primary, schema is validation layer
 *
 * Benefits:
 * ✅ Zero boilerplate for simple commands
 * ✅ Explicit validation only where needed
 * ✅ Reusable schemas across commands
 * ✅ Interoperates with Zod, Standard Schema, custom validators
 *
 * Next: Q6 (keymap) to complete command+input story.
 */
