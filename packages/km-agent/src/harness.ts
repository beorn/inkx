/**
 * Harness Loader
 *
 * Load and validate harness definitions from .km/harnesses/*.yaml
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { Harness } from "./types.ts";

/** Options for harness functions */
export interface HarnessOptions {
  /** Path to .km directory. If not provided, only built-in harnesses are available. */
  kmDir?: string;
}

/**
 * Default general-purpose harness (built-in).
 */
export const DEFAULT_HARNESS: Harness = {
  name: "general",
  description: "General-purpose agent harness",
  tools: [
    "read_file",
    "write_file",
    "search_codebase",
    "run_tests",
    "execute_command",
  ],
  constraints: {
    max_tokens_per_session: 100000,
  },
};

/**
 * Load a harness by name.
 * First checks .km/harnesses/, then falls back to built-ins.
 * @param name - Harness name to load
 * @param options - Optional options (kmDir for DI)
 */
export function loadHarness(
  name: string,
  options?: HarnessOptions,
): Harness | null {
  // Try loading from .km/harnesses/
  const kmDir = options?.kmDir;
  if (kmDir) {
    const harnessPath = join(kmDir, "harnesses", `${name}.yaml`);
    if (existsSync(harnessPath)) {
      return loadHarnessFromPath(harnessPath);
    }
  }

  // Fall back to built-in harnesses
  if (name === "general") {
    return DEFAULT_HARNESS;
  }

  return null;
}

/**
 * Load a harness from a specific file path.
 */
export function loadHarnessFromPath(path: string): Harness {
  const content = readFileSync(path, "utf-8");
  const parsed = parseYaml(content);

  if (!validateHarness(parsed)) {
    throw new Error(`Invalid harness definition at ${path}`);
  }

  // The YAML wraps the harness in a `harness:` key
  const harness = "harness" in parsed ? parsed.harness : parsed;
  return harness as Harness;
}

/**
 * Validate that an object is a valid Harness definition.
 */
export function validateHarness(
  obj: unknown,
): obj is { harness: Harness } | Harness {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  // Handle wrapped format: { harness: { ... } }
  const harness = (obj as Record<string, unknown>).harness ?? obj;

  if (typeof harness !== "object" || harness === null) {
    return false;
  }

  const h = harness as Record<string, unknown>;

  // Required fields
  if (typeof h.name !== "string") {
    return false;
  }
  if (!Array.isArray(h.tools)) {
    return false;
  }

  // Optional fields type checks
  if (h.description !== undefined && typeof h.description !== "string") {
    return false;
  }
  if (h.connectors !== undefined && !Array.isArray(h.connectors)) {
    return false;
  }
  if (h.constraints !== undefined && typeof h.constraints !== "object") {
    return false;
  }

  return true;
}

/**
 * Get the default harness.
 */
export function getDefaultHarness(): Harness {
  return DEFAULT_HARNESS;
}

/**
 * List all available harnesses (built-in + custom).
 * @param options - Optional options (kmDir for DI)
 */
export function listHarnesses(options?: HarnessOptions): string[] {
  const harnesses = new Set<string>(["general"]);

  const kmDir = options?.kmDir;
  if (kmDir) {
    const harnessDir = join(kmDir, "harnesses");
    if (existsSync(harnessDir)) {
      const files = readdirSync(harnessDir);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          harnesses.add(file.replace(/\.ya?ml$/, ""));
        }
      }
    }
  }

  return Array.from(harnesses).sort();
}
