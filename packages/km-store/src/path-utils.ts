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
