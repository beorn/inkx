/**
 * Path utilities for filesystem-based node resolution
 *
 * Enables CLI commands to accept filesystem paths as node references,
 * with automatic KM_ROOT detection by walking up parent directories.
 */

import { existsSync, statSync } from "fs";
import { resolve, dirname, join } from "path";

export interface PathResolution {
  /** Resolved absolute path */
  absolutePath: string;
  /** Path to .km directory if found, or null */
  kmRoot: string | null;
  /** Whether path points to a file */
  isFile: boolean;
  /** Whether path points to a directory */
  isDirectory: boolean;
  /** Whether path exists on filesystem */
  exists: boolean;
}

/**
 * Check if a query string looks like an explicit filesystem path.
 * Returns true for paths starting with / or ./  or ../
 * Note: ~ is handled by the shell before reaching the program
 */
export function isExplicitPath(query: string): boolean {
  return (
    query.startsWith("/") || query.startsWith("./") || query.startsWith("../")
  );
}

/**
 * Find .km directory in path or ancestors
 */
export function findKmRootFromPath(startPath: string): string | null {
  // Resolve to absolute path first
  const absolutePath = resolve(startPath);

  // If the path is a file, start from its parent directory
  let current: string;
  try {
    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
      current = dirname(absolutePath);
    } else {
      current = absolutePath;
    }
  } catch {
    // Path doesn't exist or can't be accessed
    current = dirname(absolutePath);
  }

  const root = "/";

  while (current !== root) {
    const kmPath = join(current, ".km");
    if (existsSync(kmPath) && statSync(kmPath).isDirectory()) {
      return kmPath;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Resolve a filesystem path to detailed information about it
 */
export function resolveFsPath(input: string): PathResolution {
  const absolutePath = resolve(input);
  let exists = false;
  let isFile = false;
  let isDirectory = false;

  try {
    if (existsSync(absolutePath)) {
      exists = true;
      const stat = statSync(absolutePath);
      isFile = stat.isFile();
      isDirectory = stat.isDirectory();
    }
  } catch {
    // Path doesn't exist or can't be accessed
  }

  const kmRoot = findKmRootFromPath(absolutePath);

  return {
    absolutePath,
    kmRoot,
    isFile,
    isDirectory,
    exists,
  };
}

/**
 * Get the effective root directory for a path.
 * If .km exists, returns the directory containing .km.
 * Otherwise, returns the directory containing the file (for memory mode).
 */
export function getEffectiveRoot(resolution: PathResolution): string {
  if (resolution.kmRoot) {
    return dirname(resolution.kmRoot);
  }
  // For memory mode, use the file's parent or the directory itself
  if (resolution.isFile) {
    return dirname(resolution.absolutePath);
  }
  return resolution.absolutePath;
}

/**
 * Result of resolving a path argument from CLI
 */
export interface ResolvedPathArg {
  /** Vault root path (directory containing .km or the directory itself) */
  vaultRoot: string;
  /** Node reference to resolve after store init, or null for vault root */
  nodeRef: string | null;
  /** Whether the input was an explicit filesystem path */
  wasExplicitPath: boolean;
}

/**
 * Resolve a CLI path argument to vault root + optional node reference.
 *
 * Handles three cases:
 * 1. Directory path → vault root, no specific node
 * 2. File path → vault root from ancestors, file path as node ref
 * 3. Non-path (ID, @ref) → use existing vault root, pass through as node ref
 *
 * @param arg - CLI argument (path, ID, or @ref)
 * @param fallbackRoot - Fallback vault root if not determined from path
 * @returns Resolved vault root and node reference
 */
export function resolvePathArg(
  arg: string | undefined,
  fallbackRoot?: string,
): ResolvedPathArg {
  // No argument - use fallback root, show all nodes
  if (!arg) {
    return {
      vaultRoot: fallbackRoot || process.cwd(),
      nodeRef: null,
      wasExplicitPath: false,
    };
  }

  // Check if it's an explicit filesystem path
  if (isExplicitPath(arg)) {
    const resolution = resolveFsPath(arg);

    if (resolution.exists && resolution.isDirectory) {
      // Directory path - use as vault root, show all top-level nodes
      return {
        vaultRoot: resolution.absolutePath,
        nodeRef: null,
        wasExplicitPath: true,
      };
    } else if (resolution.exists && resolution.isFile) {
      // File path - find vault root, use file path as node ref
      const vaultRoot = resolution.kmRoot
        ? dirname(resolution.kmRoot)
        : dirname(resolution.absolutePath);
      return {
        vaultRoot,
        nodeRef: resolution.absolutePath,
        wasExplicitPath: true,
      };
    } else {
      // Path doesn't exist - still treat as explicit path
      // Let resolveNode fail with appropriate error
      const vaultRoot = fallbackRoot || process.cwd();
      return {
        vaultRoot,
        nodeRef: arg,
        wasExplicitPath: true,
      };
    }
  }

  // Non-path argument (ID, @ref, etc) - pass through
  return {
    vaultRoot: fallbackRoot || process.cwd(),
    nodeRef: arg,
    wasExplicitPath: false,
  };
}
