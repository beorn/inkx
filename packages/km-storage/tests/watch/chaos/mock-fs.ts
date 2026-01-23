/**
 * MockFileSystem - In-memory filesystem for fast chaos testing
 *
 * Implements FileSystemOps and DirectoryScanner interfaces for use in
 * chaos tests without real filesystem I/O.
 */

import { dirname, basename, join } from "path";
import type {
  FileSystemOps,
  StatResult,
} from "../../../src/watch/writequeue.ts";
import type { FsEntry, DirectoryScanner } from "../../../src/watch/reconcile.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FileEntry {
  type: "file";
  content: string;
  ino: number;
  mtime: number;
  size: number;
}

interface DirEntry {
  type: "dir";
  ino: number;
  mtime: number;
}

type FsNode = FileEntry | DirEntry;

// ─────────────────────────────────────────────────────────────────────────────
// MockFileSystem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory filesystem implementation for testing
 */
export class MockFileSystem implements FileSystemOps {
  private files = new Map<string, FsNode>();
  private nextIno = 1;

  constructor() {
    // Initialize with root directory
    this.files.set("/", { type: "dir", ino: this.nextIno++, mtime: Date.now() });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FileSystemOps Implementation
  // ─────────────────────────────────────────────────────────────────────────

  writeFileSync(path: string, content: string, _encoding?: BufferEncoding): void {
    const normalized = this.normalizePath(path);
    const existing = this.files.get(normalized);

    if (existing?.type === "dir") {
      const error = new Error(`EISDIR: illegal operation on a directory, write '${path}'`);
      (error as NodeJS.ErrnoException).code = "EISDIR";
      throw error;
    }

    // Ensure parent directory exists
    const parentDir = dirname(normalized);
    if (parentDir !== normalized && !this.files.has(parentDir)) {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    }

    const now = Date.now();
    this.files.set(normalized, {
      type: "file",
      content,
      ino: existing?.ino ?? this.nextIno++,
      mtime: now,
      size: content.length,
    });
  }

  readFileSync(path: string, _encoding?: BufferEncoding): string {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);

    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    }

    if (entry.type === "dir") {
      const error = new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
      (error as NodeJS.ErrnoException).code = "EISDIR";
      throw error;
    }

    return entry.content;
  }

  unlinkSync(path: string): void {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);

    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    }

    if (entry.type === "dir") {
      const error = new Error(`EISDIR: illegal operation on a directory, unlink '${path}'`);
      (error as NodeJS.ErrnoException).code = "EISDIR";
      throw error;
    }

    this.files.delete(normalized);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    const normalized = this.normalizePath(path);

    if (this.files.has(normalized)) {
      const existing = this.files.get(normalized)!;
      if (existing.type === "file") {
        const error = new Error(`EEXIST: file already exists, mkdir '${path}'`);
        (error as NodeJS.ErrnoException).code = "EEXIST";
        throw error;
      }
      // Directory already exists, that's fine
      return;
    }

    const parentDir = dirname(normalized);
    if (parentDir !== normalized && !this.files.has(parentDir)) {
      if (options?.recursive) {
        this.mkdirSync(parentDir, options);
      } else {
        const error = new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
        (error as NodeJS.ErrnoException).code = "ENOENT";
        throw error;
      }
    }

    this.files.set(normalized, {
      type: "dir",
      ino: this.nextIno++,
      mtime: Date.now(),
    });
  }

  existsSync(path: string): boolean {
    return this.files.has(this.normalizePath(path));
  }

  renameSync(oldPath: string, newPath: string): void {
    const normalizedOld = this.normalizePath(oldPath);
    const normalizedNew = this.normalizePath(newPath);

    const entry = this.files.get(normalizedOld);
    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, rename '${oldPath}'`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    }

    // Ensure parent of new path exists
    const newParent = dirname(normalizedNew);
    if (newParent !== normalizedNew && !this.files.has(newParent)) {
      const error = new Error(`ENOENT: no such file or directory, rename '${newPath}'`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    }

    this.files.delete(normalizedOld);
    this.files.set(normalizedNew, { ...entry, mtime: Date.now() });
  }

  statSync(path: string): StatResult {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);

    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, stat '${path}'`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    }

    const isDir = entry.type === "dir";
    return {
      ino: entry.ino,
      mtimeMs: entry.mtime,
      size: isDir ? 0 : (entry as FileEntry).size,
      isDirectory: () => isDir,
      isFile: () => !isDir,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DirectoryScanner Implementation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a DirectoryScanner function bound to this MockFileSystem
   */
  createScanner(): DirectoryScanner {
    return (dirPath: string, ignorePatterns?: string[]): FsEntry[] => {
      return this.scanDirectory(dirPath, ignorePatterns);
    };
  }

  /**
   * Scan a directory and return entries
   */
  scanDirectory(dirPath: string, ignorePatterns?: string[]): FsEntry[] {
    const normalized = this.normalizePath(dirPath);
    const entries: FsEntry[] = [];

    for (const [path, node] of this.files) {
      // Check if this is a direct child of dirPath
      const parent = dirname(path);
      if (parent !== normalized) continue;

      // Skip the directory itself
      if (path === normalized) continue;

      // Check ignore patterns
      const name = basename(path);
      if (this.shouldIgnore(name, path, ignorePatterns)) continue;

      entries.push({
        path,
        ino: node.ino,
        mtime: node.mtime,
        isDirectory: node.type === "dir",
      });
    }

    return entries;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reset filesystem to initial state
   */
  reset(): void {
    this.files.clear();
    this.nextIno = 1;
    this.files.set("/", { type: "dir", ino: this.nextIno++, mtime: Date.now() });
  }

  /**
   * Set mtime for a file (useful for conflict testing)
   */
  setMtime(path: string, mtime: number): void {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);
    if (entry) {
      entry.mtime = mtime;
    }
  }

  /**
   * Get all file paths (for debugging)
   */
  getAllPaths(): string[] {
    return Array.from(this.files.keys()).sort();
  }

  /**
   * Get file content (bypasses error throwing)
   */
  getContent(path: string): string | undefined {
    const entry = this.files.get(this.normalizePath(path));
    return entry?.type === "file" ? entry.content : undefined;
  }

  /**
   * Dump filesystem state (for debugging)
   */
  dump(): Record<string, { type: string; size?: number; mtime: number }> {
    const result: Record<string, { type: string; size?: number; mtime: number }> = {};
    for (const [path, node] of this.files) {
      result[path] = {
        type: node.type,
        size: node.type === "file" ? node.size : undefined,
        mtime: node.mtime,
      };
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    // Remove trailing slashes (except for root)
    let normalized = path.replace(/\/+$/, "") || "/";
    // Normalize multiple slashes
    normalized = normalized.replace(/\/+/g, "/");
    return normalized;
  }

  private shouldIgnore(name: string, _path: string, patterns?: string[]): boolean {
    if (!patterns) return false;

    // Simple pattern matching (supports * wildcard and negation)
    for (const pattern of patterns) {
      if (pattern.startsWith("!")) continue; // Skip negation patterns for now

      if (pattern.startsWith("**/")) {
        // Match anywhere in path
        const suffix = pattern.slice(3);
        if (name === suffix || name.endsWith("/" + suffix)) return true;
      } else if (pattern.includes("*")) {
        // Simple wildcard - escape special regex chars except *, then convert * to .*
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
        if (regex.test(name)) return true;
      } else {
        // Exact match
        if (name === pattern) return true;
      }
    }

    return false;
  }
}

/**
 * Create a new MockFileSystem instance
 */
export function createMockFileSystem(): MockFileSystem {
  return new MockFileSystem();
}
