/**
 * WriteQueue Tests
 *
 * Tests for retry logic, error classification, backoff calculation, conflict detection,
 * and permission error handling
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  WriteQueue,
  classifyError,
  calculateBackoffDelay,
  getErrorType,
  getPermissionSuggestion,
  type FileSystemOps,
  type RetryConfig,
  type OperationResult,
  type ConflictInfo,
  type PermissionError,
} from "../../src/watch/writequeue.ts";

// Event type emitted by WriteQueue on "flushed"
type FlushedEvent = {
  count: number;
  errors: number;
  retries: number;
  conflicts: number;
  permissionErrors: number;
  results: OperationResult[];
};

describe("Error Classification", () => {
  test("classifies transient errors correctly", () => {
    const transientCodes = [
      "EBUSY",
      "EAGAIN",
      "EMFILE",
      "ENFILE",
      "ENOSPC",
      "ETXTBSY",
      "EIO",
      "ETIMEDOUT",
      "ECONNRESET",
      "ENETUNREACH",
      "EHOSTUNREACH",
    ];

    for (const code of transientCodes) {
      const error = Object.assign(new Error(`Error: ${code}`), { code });
      expect(classifyError(error)).toBe("transient");
    }
  });

  test("classifies permanent errors correctly", () => {
    const permanentCodes = [
      "ENOENT",
      "EACCES",
      "EPERM",
      "EEXIST",
      "EISDIR",
      "ENOTDIR",
      "EROFS",
    ];

    for (const code of permanentCodes) {
      const error = Object.assign(new Error(`Error: ${code}`), { code });
      expect(classifyError(error)).toBe("permanent");
    }
  });

  test("classifies errors without code as permanent", () => {
    const error = new Error("Unknown error");
    expect(classifyError(error)).toBe("permanent");
  });
});

describe("Backoff Calculation", () => {
  const config: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    jitterFactor: 0, // No jitter for deterministic tests
  };

  test("calculates exponential delays", () => {
    expect(calculateBackoffDelay(0, config)).toBe(100); // 100 * 2^0
    expect(calculateBackoffDelay(1, config)).toBe(200); // 100 * 2^1
    expect(calculateBackoffDelay(2, config)).toBe(400); // 100 * 2^2
    expect(calculateBackoffDelay(3, config)).toBe(800); // 100 * 2^3
  });

  test("clamps to maxDelayMs", () => {
    const smallMaxConfig = { ...config, maxDelayMs: 300 };
    expect(calculateBackoffDelay(0, smallMaxConfig)).toBe(100);
    expect(calculateBackoffDelay(1, smallMaxConfig)).toBe(200);
    expect(calculateBackoffDelay(2, smallMaxConfig)).toBe(300); // Clamped
    expect(calculateBackoffDelay(3, smallMaxConfig)).toBe(300); // Clamped
  });

  test("applies jitter within bounds", () => {
    const jitterConfig = { ...config, jitterFactor: 0.5 };
    const results = Array.from({ length: 100 }, () =>
      calculateBackoffDelay(0, jitterConfig),
    );

    // All results should be within ±50% of base (100 ± 50)
    for (const result of results) {
      expect(result).toBeGreaterThanOrEqual(50);
      expect(result).toBeLessThanOrEqual(150);
    }
  });
});

describe("WriteQueue Retry Logic", () => {
  let mockFs: FileSystemOps;
  let writeHistory: string[];
  let failCount: number;
  let failError: Error & { code?: string };

  beforeEach(() => {
    writeHistory = [];
    failCount = 0;
    failError = Object.assign(new Error("Resource busy"), { code: "EBUSY" });

    mockFs = {
      writeFileSync: (path: string, _content: string) => {
        if (failCount > 0) {
          failCount--;
          throw failError;
        }
        writeHistory.push(`write:${path}`);
      },
      unlinkSync: (path: string) => {
        if (failCount > 0) {
          failCount--;
          throw failError;
        }
        writeHistory.push(`delete:${path}`);
      },
      mkdirSync: () => {},
      existsSync: () => true,
      renameSync: (oldPath: string, newPath: string) => {
        if (failCount > 0) {
          failCount--;
          throw failError;
        }
        writeHistory.push(`rename:${oldPath}->${newPath}`);
      },
      readFileSync: () => "",
      statSync: () => ({
        ino: 1,
        mtimeMs: Date.now(),
        size: 100,
        isDirectory: () => false,
        isFile: () => true,
      }),
    };
  });

  test("succeeds on first attempt when no errors", async () => {
    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let flushedEvent: FlushedEvent | null = null;
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" });
    await queue.forceFlush();

    expect(writeHistory).toEqual(["write:/test.md"]);
    expect(flushedEvent!.results[0]?.attempts).toBe(1);
    expect(flushedEvent!.results[0]?.success).toBe(true);
  });

  test("retries transient errors with backoff", async () => {
    failCount = 2; // Fail twice, succeed on third attempt

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let flushedEvent: FlushedEvent | null = null;
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" });
    await queue.forceFlush();

    expect(writeHistory).toEqual(["write:/test.md"]);
    expect(flushedEvent!.results[0]?.attempts).toBe(3);
    expect(flushedEvent!.results[0]?.success).toBe(true);
    expect(flushedEvent!.retries).toBe(2);
  });

  test("fails after max retries for transient errors", async () => {
    failCount = 10; // More failures than max retries

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let errorsEvent: unknown[] | null = null;
    let flushedEvent: FlushedEvent | null = null;
    queue.on("errors", (e) => (errorsEvent = e as unknown[]));
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" });
    await queue.forceFlush();

    expect(writeHistory).toEqual([]);
    expect(errorsEvent).toHaveLength(1);
    expect(flushedEvent!.errors).toBe(1);
    expect(flushedEvent!.retries).toBe(2); // 2 retries after initial attempt
  });

  test("does not retry permanent errors", async () => {
    failCount = 10;
    failError = Object.assign(new Error("Permission denied"), {
      code: "EACCES",
    });

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let flushedEvent: FlushedEvent | null = null;
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" });
    await queue.forceFlush();

    expect(writeHistory).toEqual([]);
    expect(flushedEvent!.results[0]?.attempts).toBe(1); // Only one attempt
    expect(flushedEvent!.results[0]?.success).toBe(false);
    expect(flushedEvent!.results[0]?.errorClass).toBe("permanent");
    expect(flushedEvent!.retries).toBe(0);
  });

  test("retries delete operations", async () => {
    failCount = 1;

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    queue.queueDelete("/test.md", "1");
    await queue.forceFlush();

    expect(writeHistory).toEqual(["delete:/test.md"]);
  });

  test("retries rename operations", async () => {
    failCount = 1;

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    queue.queueRename("/old.md", "/new.md", "1");
    await queue.forceFlush();

    expect(writeHistory).toEqual(["rename:/old.md->/new.md"]);
  });

  test("handles multiple operations with mixed results", async () => {
    let callCount = 0;
    mockFs.writeFileSync = (path: string) => {
      callCount++;
      // Fail first file twice (transient), succeed second file, fail third file permanently
      if (path === "/a.md" && callCount <= 2) {
        throw Object.assign(new Error("Busy"), { code: "EBUSY" });
      }
      if (path === "/c.md") {
        throw Object.assign(new Error("Permission denied"), { code: "EACCES" });
      }
      writeHistory.push(`write:${path}`);
    };

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let flushedEvent: FlushedEvent | null = null;
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    queue.queue({ path: "/a.md", content: "a", sourceEventId: "1" });
    queue.queue({ path: "/b.md", content: "b", sourceEventId: "2" });
    queue.queue({ path: "/c.md", content: "c", sourceEventId: "3" });
    await queue.forceFlush();

    // a.md succeeds after retries, b.md succeeds first try, c.md fails permanently
    expect(writeHistory).toContain("write:/a.md");
    expect(writeHistory).toContain("write:/b.md");
    expect(writeHistory).not.toContain("write:/c.md");

    expect(flushedEvent!.errors).toBe(1); // c.md failed
    expect(flushedEvent!.retries).toBe(2); // a.md needed 2 retries
  });

  test("uses custom retry config", async () => {
    failCount = 5; // More than default max retries

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let flushedEvent: FlushedEvent | null = null;
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" });
    await queue.forceFlush();

    expect(writeHistory).toEqual(["write:/test.md"]);
    expect(flushedEvent!.results[0]?.attempts).toBe(6); // 1 initial + 5 retries
    expect(flushedEvent!.results[0]?.success).toBe(true);
  });
});

describe("Conflict Detection", () => {
  let writeHistory: string[];
  let fileMtimes: Map<string, number>;
  let mockFs: FileSystemOps;

  beforeEach(() => {
    writeHistory = [];
    fileMtimes = new Map();

    mockFs = {
      writeFileSync: (path: string, _content: string) => {
        writeHistory.push(`write:${path}`);
        fileMtimes.set(path, Date.now()); // Update mtime after write
      },
      unlinkSync: (path: string) => {
        writeHistory.push(`delete:${path}`);
        fileMtimes.delete(path);
      },
      mkdirSync: () => {},
      existsSync: (path: string) => fileMtimes.has(path),
      renameSync: (oldPath: string, newPath: string) => {
        writeHistory.push(`rename:${oldPath}->${newPath}`);
        const mtime = fileMtimes.get(oldPath);
        if (mtime) {
          fileMtimes.set(newPath, mtime);
          fileMtimes.delete(oldPath);
        }
      },
      readFileSync: () => "",
      statSync: (path: string) => {
        const mtime = fileMtimes.get(path);
        if (mtime === undefined) {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        }
        return {
          ino: 1,
          mtimeMs: mtime,
          size: 100,
          isDirectory: () => false,
          isFile: () => true,
        };
      },
    };
  });

  test("no conflict when file unchanged", async () => {
    // Set initial mtime
    fileMtimes.set("/test.md", 1000);

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      conflictStrategy: "last_write_wins",
    });

    let flushedEvent: FlushedEvent | null = null;
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    queue.queue({ path: "/test.md", content: "updated", sourceEventId: "1" });
    await queue.forceFlush();

    expect(writeHistory).toEqual(["write:/test.md"]);
    expect(flushedEvent!.conflicts).toBe(0);
    expect(flushedEvent!.results[0]?.conflict).toBeUndefined();
  });

  test("detects conflict when file changed externally (last_write_wins)", async () => {
    // Set initial mtime
    fileMtimes.set("/test.md", 1000);

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      conflictStrategy: "last_write_wins",
    });

    let conflictsEvent: ConflictInfo[] | null = null;
    let flushedEvent: FlushedEvent | null = null;
    queue.on("conflicts", (e) => (conflictsEvent = e as ConflictInfo[]));
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    // Queue write - this captures baseMtime=1000
    queue.queue({ path: "/test.md", content: "tui-edit", sourceEventId: "1" });

    // Simulate external edit changing the file before flush
    fileMtimes.set("/test.md", 2000);

    await queue.forceFlush();

    // last_write_wins: should still write despite conflict
    expect(writeHistory).toEqual(["write:/test.md"]);
    expect(flushedEvent!.conflicts).toBe(1);
    expect(conflictsEvent).toHaveLength(1);
    expect(flushedEvent!.results[0]?.conflict?.resolution).toBe("written");
  });

  test("discards write when file changed (fs_wins strategy)", async () => {
    // Set initial mtime
    fileMtimes.set("/test.md", 1000);

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      conflictStrategy: "fs_wins",
    });

    let conflictsEvent: ConflictInfo[] | null = null;
    let flushedEvent: FlushedEvent | null = null;
    queue.on("conflicts", (e) => (conflictsEvent = e as ConflictInfo[]));
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    // Queue write - captures baseMtime=1000
    queue.queue({ path: "/test.md", content: "tui-edit", sourceEventId: "1" });

    // Simulate external edit
    fileMtimes.set("/test.md", 2000);

    await queue.forceFlush();

    // fs_wins: should NOT write
    expect(writeHistory).toEqual([]);
    expect(flushedEvent!.conflicts).toBe(1);
    expect(conflictsEvent).toHaveLength(1);
    expect(flushedEvent!.results[0]?.conflict?.resolution).toBe("discarded");
    expect(flushedEvent!.results[0]?.success).toBe(true); // Still "success" - not an error
  });

  test("writes with warning when file changed (db_wins strategy)", async () => {
    // Set initial mtime
    fileMtimes.set("/test.md", 1000);

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      conflictStrategy: "db_wins",
    });

    let flushedEvent: FlushedEvent | null = null;
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    queue.queue({ path: "/test.md", content: "tui-edit", sourceEventId: "1" });
    fileMtimes.set("/test.md", 2000);

    await queue.forceFlush();

    // db_wins: should write despite conflict
    expect(writeHistory).toEqual(["write:/test.md"]);
    expect(flushedEvent!.conflicts).toBe(1);
    expect(flushedEvent!.results[0]?.conflict?.resolution).toBe("written");
  });

  test("no conflict for new files", async () => {
    // File doesn't exist yet
    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      conflictStrategy: "fs_wins",
    });

    let flushedEvent: FlushedEvent | null = null;
    queue.on("flushed", (e) => (flushedEvent = e as FlushedEvent));

    queue.queue({ path: "/new.md", content: "new file", sourceEventId: "1" });
    await queue.forceFlush();

    expect(writeHistory).toEqual(["write:/new.md"]);
    expect(flushedEvent!.conflicts).toBe(0);
  });

  test("conflict info includes mtime details", async () => {
    fileMtimes.set("/test.md", 1000);

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      conflictStrategy: "last_write_wins",
    });

    let conflictsEvent: ConflictInfo[] | null = null;
    queue.on("conflicts", (e) => (conflictsEvent = e as ConflictInfo[]));

    queue.queue({ path: "/test.md", content: "edit", sourceEventId: "1" });
    fileMtimes.set("/test.md", 2000);
    await queue.forceFlush();

    expect(conflictsEvent![0]?.path).toBe("/test.md");
    expect(conflictsEvent![0]?.baseMtime).toBe(1000);
    expect(conflictsEvent![0]?.currentMtime).toBe(2000);
  });
});

describe("Permission Error Handling", () => {
  test("getErrorType classifies permission errors correctly", () => {
    expect(
      getErrorType(Object.assign(new Error("EACCES"), { code: "EACCES" })),
    ).toBe("permission");
    expect(
      getErrorType(Object.assign(new Error("EPERM"), { code: "EPERM" })),
    ).toBe("permission");
    expect(
      getErrorType(Object.assign(new Error("EROFS"), { code: "EROFS" })),
    ).toBe("read_only");
    expect(
      getErrorType(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    ).toBe("not_found");
    expect(
      getErrorType(Object.assign(new Error("EBUSY"), { code: "EBUSY" })),
    ).toBe("transient");
    expect(
      getErrorType(Object.assign(new Error("EISDIR"), { code: "EISDIR" })),
    ).toBe("other");
  });

  test("getPermissionSuggestion provides helpful messages", () => {
    const eaccesSuggestion = getPermissionSuggestion("/test.md", "EACCES");
    expect(eaccesSuggestion).toContain("chmod");
    expect(eaccesSuggestion).toContain("/test.md");

    const epermSuggestion = getPermissionSuggestion("/test.md", "EPERM");
    expect(epermSuggestion).toContain("not permitted");

    const erofsSuggestion = getPermissionSuggestion("/test.md", "EROFS");
    expect(erofsSuggestion).toContain("read-only");
  });

  test("emits permission-denied event on EACCES error", async () => {
    const mockFs: FileSystemOps = {
      writeFileSync: () => {
        throw Object.assign(new Error("Permission denied"), { code: "EACCES" });
      },
      unlinkSync: () => {},
      mkdirSync: () => {},
      existsSync: () => false,
      renameSync: () => {},
      readFileSync: () => "",
      statSync: () => ({
        ino: 1,
        mtimeMs: Date.now(),
        size: 100,
        isDirectory: () => false,
        isFile: () => true,
      }),
    };

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let permissionEvent: PermissionError[] = [];
    let flushedEvent: { permissionErrors?: number } = {};
    queue.on(
      "permission-denied",
      (e: PermissionError[]) => (permissionEvent = e),
    );
    queue.on(
      "flushed",
      (e: { permissionErrors?: number }) => (flushedEvent = e),
    );

    queue.queue({
      path: "/protected/test.md",
      content: "test",
      sourceEventId: "1",
    });
    await queue.forceFlush();

    expect(permissionEvent).toHaveLength(1);
    expect(permissionEvent[0]?.path).toBe("/protected/test.md");
    expect(permissionEvent[0]?.code).toBe("EACCES");
    expect(permissionEvent[0]?.operation).toBe("write");
    expect(permissionEvent[0]?.suggestion).toContain("chmod");
    expect(flushedEvent.permissionErrors).toBe(1);
  });

  test("emits permission-denied event on EPERM error", async () => {
    const mockFs: FileSystemOps = {
      writeFileSync: () => {
        throw Object.assign(new Error("Operation not permitted"), {
          code: "EPERM",
        });
      },
      unlinkSync: () => {},
      mkdirSync: () => {},
      existsSync: () => false,
      renameSync: () => {},
      readFileSync: () => "",
      statSync: () => ({
        ino: 1,
        mtimeMs: Date.now(),
        size: 100,
        isDirectory: () => false,
        isFile: () => true,
      }),
    };

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let permissionEvent: PermissionError[] | null = null;
    queue.on("permission-denied", (e) => (permissionEvent = e as PermissionError[]));

    queue.queue({ path: "/root/test.md", content: "test", sourceEventId: "1" });
    await queue.forceFlush();

    expect(permissionEvent).toHaveLength(1);
    expect(permissionEvent![0]?.code).toBe("EPERM");
    expect(permissionEvent![0]?.suggestion).toContain("not permitted");
  });

  test("emits permission-denied event on EROFS error", async () => {
    const mockFs: FileSystemOps = {
      writeFileSync: () => {
        throw Object.assign(new Error("Read-only file system"), {
          code: "EROFS",
        });
      },
      unlinkSync: () => {},
      mkdirSync: () => {},
      existsSync: () => false,
      renameSync: () => {},
      readFileSync: () => "",
      statSync: () => ({
        ino: 1,
        mtimeMs: Date.now(),
        size: 100,
        isDirectory: () => false,
        isFile: () => true,
      }),
    };

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let permissionEvent: PermissionError[] | null = null;
    queue.on("permission-denied", (e) => (permissionEvent = e as PermissionError[]));

    queue.queue({
      path: "/readonly/test.md",
      content: "test",
      sourceEventId: "1",
    });
    await queue.forceFlush();

    expect(permissionEvent).toHaveLength(1);
    expect(permissionEvent![0]?.code).toBe("EROFS");
    expect(permissionEvent![0]?.suggestion).toContain("read-only");
  });

  test("does not emit permission-denied for non-permission errors", async () => {
    const mockFs: FileSystemOps = {
      writeFileSync: () => {
        throw Object.assign(new Error("File exists"), { code: "EEXIST" });
      },
      unlinkSync: () => {},
      mkdirSync: () => {},
      existsSync: () => false,
      renameSync: () => {},
      readFileSync: () => "",
      statSync: () => ({
        ino: 1,
        mtimeMs: Date.now(),
        size: 100,
        isDirectory: () => false,
        isFile: () => true,
      }),
    };

    const queue = new WriteQueue({
      debounceMs: 0,
      fs: mockFs,
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10, jitterFactor: 0 },
    });

    let permissionEvent: PermissionError[] | null = null;
    let errorsEvent: unknown[] | null = null;
    queue.on("permission-denied", (e) => (permissionEvent = e));
    queue.on("errors", (e) => (errorsEvent = e));

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" });
    await queue.forceFlush();

    expect(permissionEvent).toBeNull();
    expect(errorsEvent).toHaveLength(1);
  });
});
