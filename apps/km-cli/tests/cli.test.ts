/**
 * CLI Integration Tests
 *
 * End-to-end tests that run actual CLI commands and verify behavior.
 * Tests the full workflow from command to database to output.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { $ } from "bun";

// Set test environment before imports
// KM_DIR should be inside the vault so sync defaults to correct directory
const TEST_DIR = join(import.meta.dir, ".test-cli");
const VAULT_DIR = join(TEST_DIR, "vault");
const KM_DIR = join(VAULT_DIR, ".km"); // .km inside vault, not sibling

// CLI path
const CLI_PATH = join(import.meta.dir, "..", "src", "index.ts");

/**
 * Run km CLI command and return result
 */
async function km(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cwd = options.cwd ?? VAULT_DIR;
  const env = {
    ...process.env,
    KM_DIR,
    ...options.env,
  };

  try {
    const result = await $`bun ${CLI_PATH} ${args}`.cwd(cwd).env(env).quiet();
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: result.exitCode,
    };
  } catch (error: unknown) {
    const err = error as {
      stdout?: Buffer;
      stderr?: Buffer;
      exitCode?: number;
    };
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: err.exitCode ?? 1,
    };
  }
}

describe("CLI Integration", () => {
  beforeEach(() => {
    // Clean up test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    mkdirSync(KM_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("km --help", () => {
    test("should show help message", async () => {
      const result = await km(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Knowledge Machine");
      expect(result.stdout).toContain("tasks");
      expect(result.stdout).toContain("sync");
    });
  });

  describe("km sync", () => {
    test("should sync files to database", async () => {
      // Create test file
      writeFileSync(
        join(VAULT_DIR, "test.md"),
        `# Test Document

- [ ] First task
- [ ] Second task
`,
      );

      const result = await km(["sync"]);
      expect(result.exitCode).toBe(0);
      // Output contains "Processed" with capital P
      expect(result.stdout.toLowerCase()).toContain("processed");
    });

    test("should sync nested folder structure", async () => {
      // Create nested structure
      const projectDir = join(VAULT_DIR, "projects");
      mkdirSync(projectDir, { recursive: true });

      writeFileSync(
        join(projectDir, "todo.md"),
        `# Project Tasks

- [ ] Task in project
`,
      );

      const result = await km(["sync"]);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("km tasks", () => {
    beforeEach(async () => {
      // Create test files with tasks
      writeFileSync(
        join(VAULT_DIR, "inbox.md"),
        `# Inbox

- [ ] Inbox task 1
- [ ] Inbox task 2
- [x] Completed inbox task
`,
      );

      const projectDir = join(VAULT_DIR, "projects");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(
        join(projectDir, "work.md"),
        `# Work Project

## Tasks

- [ ] Work task A
- [ ] Work task B
`,
      );

      // Sync to populate database
      await km(["sync"]);
    });

    test("should list open tasks", async () => {
      const result = await km(["task"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Inbox task 1");
      expect(result.stdout).toContain("Inbox task 2");
      expect(result.stdout).toContain("Work task A");
      // Should NOT show completed tasks by default
      expect(result.stdout).not.toContain("Completed inbox task");
    });

    test("should show all tasks with --all", async () => {
      const result = await km(["task", "--all"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Completed inbox task");
    });

    test("should filter by path prefix", async () => {
      // Filter by folder name - matches segments starting with "projects"
      const result = await km(["task", "projects"]);
      expect(result.exitCode).toBe(0);
      // Should show tasks under projects folder
      expect(result.stdout).toContain("Work task A");
      expect(result.stdout).toContain("Work task B");
      // Should NOT show inbox tasks (not under projects/)
      expect(result.stdout).not.toContain("Inbox task 1");
    });

    test("should filter by file name prefix", async () => {
      // Filter by file name - matches "work.md" which starts with "work"
      const result = await km(["task", "work"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Work task A");
    });

    test("should filter by contains with *filter*", async () => {
      const result = await km(["task", "*work*"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Work task A");
    });

    test("should show task count", async () => {
      const result = await km(["task"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("task(s)");
    });

    test("should show flat output with --flat", async () => {
      const result = await km(["task", "--flat"]);
      expect(result.exitCode).toBe(0);
      // Flat mode uses › separator
      expect(result.stdout).toContain("›");
    });

    test("should output JSON with --json", async () => {
      const result = await km(["task", "--json"]);
      expect(result.exitCode).toBe(0);
      const tasks = JSON.parse(result.stdout);
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0]).toHaveProperty("id");
      expect(tasks[0]).toHaveProperty("type", "task");
    });
  });

  describe("km tasks --add", () => {
    beforeEach(async () => {
      writeFileSync(join(VAULT_DIR, "inbox.md"), "# Inbox\n");
      await km(["sync"]);
    });

    test("should add a new task", async () => {
      const result = await km(["task", "--add", "New test task"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Created task");

      // Verify task appears in list
      const listResult = await km(["task"]);
      expect(listResult.stdout).toContain("New test task");
    });

    test("should add task with metadata", async () => {
      const result = await km(["task", "--add", "Task with due 📅 2025-12-25"]);
      expect(result.exitCode).toBe(0);

      // Verify task with verbose output
      const listResult = await km(["task", "--verbose", "--json"]);
      const tasks = JSON.parse(listResult.stdout);
      const newTask = tasks.find((t: { content: string }) =>
        t.content.includes("Task with due"),
      );
      expect(newTask).toBeDefined();
      expect(newTask.due_date).toBe("2025-12-25");
    });
  });

  describe("km tasks --done", () => {
    beforeEach(async () => {
      writeFileSync(
        join(VAULT_DIR, "tasks.md"),
        `# Tasks

- [ ] Task to complete
`,
      );
      await km(["sync"]);
    });

    test("should mark task as done by ID prefix", async () => {
      // Get task ID
      const listResult = await km(["task", "--json"]);
      const tasks = JSON.parse(listResult.stdout);
      const task = tasks.find((t: { content: string }) =>
        t.content.includes("Task to complete"),
      );
      expect(task).toBeDefined();

      // Mark as done using ID prefix (first 8 chars)
      const idPrefix = task.id.slice(0, 8);
      const doneResult = await km(["task", "--done", idPrefix]);
      expect(doneResult.exitCode).toBe(0);
      expect(doneResult.stdout).toContain("Marked as done");

      // Verify task is now done
      const allResult = await km(["task", "--all", "--json"]);
      const allTasks = JSON.parse(allResult.stdout);
      const doneTask = allTasks.find((t: { id: string }) => t.id === task.id);
      expect(doneTask.task_status).toBe("done");
    });
  });

  describe("km search", () => {
    beforeEach(async () => {
      writeFileSync(
        join(VAULT_DIR, "notes.md"),
        `# Important Notes

This document contains information about the project.

## Keywords

Testing, integration, CLI commands.
`,
      );
      writeFileSync(
        join(VAULT_DIR, "other.md"),
        `# Other Document

Unrelated content here.
`,
      );
      await km(["sync"]);
    });

    test("should search content", async () => {
      const result = await km(["search", "integration"]);
      expect(result.exitCode).toBe(0);
      // Search results show content that matches, not necessarily filename
      expect(result.stdout).toContain("integration");
      expect(result.stdout).toContain("result");
    });

    test("should not match non-matching content", async () => {
      const result = await km(["search", "nonexistent-term-xyz"]);
      // Should complete but find no matches
      expect(result.exitCode).toBe(0);
    });
  });

  describe("km tree", () => {
    beforeEach(async () => {
      // Create hierarchical structure
      const projectDir = join(VAULT_DIR, "projects");
      const subDir = join(projectDir, "active");
      mkdirSync(subDir, { recursive: true });

      writeFileSync(join(VAULT_DIR, "root.md"), "# Root\n");
      writeFileSync(join(projectDir, "project.md"), "# Project\n");
      writeFileSync(join(subDir, "task.md"), "# Task\n");

      await km(["sync"]);
    });

    test("should show tree structure", async () => {
      const result = await km(["tree"]);
      expect(result.exitCode).toBe(0);
      // Should show folder names
      expect(result.stdout).toContain("projects");
      expect(result.stdout).toContain("active");
    });

    test("should limit depth", async () => {
      const result = await km(["tree", "--depth", "1"]);
      expect(result.exitCode).toBe(0);
      // With depth 1, should show top level but not deep nesting
    });
  });

  describe("km rebuild", () => {
    beforeEach(async () => {
      writeFileSync(join(VAULT_DIR, "test.md"), "# Test\n\n- [ ] Task\n");
      await km(["sync"]);
    });

    test("should rebuild database from events", async () => {
      const result = await km(["rebuild"]);
      expect(result.exitCode).toBe(0);

      // Verify data still accessible after rebuild
      const listResult = await km(["task"]);
      expect(listResult.stdout).toContain("Task");
    });

    test("should support --fresh flag", async () => {
      const result = await km(["rebuild", "--fresh"]);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("km show", () => {
    beforeEach(async () => {
      writeFileSync(
        join(VAULT_DIR, "doc.md"),
        `# Document Title

Some content here.

- [ ] A task in the doc
`,
      );
      await km(["sync"]);
    });

    test("should show node by ID prefix", async () => {
      // Get a task ID
      const listResult = await km(["task", "--json"]);
      const tasks = JSON.parse(listResult.stdout);
      expect(tasks.length).toBeGreaterThan(0);

      const idPrefix = tasks[0].id.slice(0, 8);
      const result = await km(["show", idPrefix]);
      expect(result.exitCode).toBe(0);
    });
  });
});

describe("km list", () => {
  beforeEach(async () => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    mkdirSync(KM_DIR, { recursive: true });

    // Create test files
    writeFileSync(
      join(VAULT_DIR, "notes.md"),
      `# Notes

Some paragraph content.

- [ ] A task in notes
`,
    );

    const projectDir = join(VAULT_DIR, "projects");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "work.md"),
      `# Work

## Tasks

- [ ] Work task
- [x] Done task
`,
    );

    await km(["sync"]);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should list all nodes", async () => {
    const result = await km(["list"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("node(s)");
  });

  test("should filter by type", async () => {
    const result = await km(["ls", "--type", "task"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("A task in notes");
    expect(result.stdout).toContain("Work task");
  });

  test("should filter by path query", async () => {
    const result = await km(["ls", "--type", "task", "projects"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Work task");
    expect(result.stdout).not.toContain("A task in notes");
  });

  test("should show IDs with --id flag", async () => {
    const result = await km(["ls", "--type", "task", "--id"]);
    expect(result.exitCode).toBe(0);
    // Should show ID prefixes in brackets
    expect(result.stdout).toMatch(/\[[\w]{5}\]/);
  });

  test("should output JSON with --json", async () => {
    const result = await km(["ls", "--type", "task", "--json"]);
    expect(result.exitCode).toBe(0);
    const nodes = JSON.parse(result.stdout);
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0]).toHaveProperty("type", "task");
  });
});

describe("km task status", () => {
  beforeEach(async () => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    mkdirSync(KM_DIR, { recursive: true });

    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task to toggle
- [x] Already done
`,
    );
    await km(["sync"]);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should set task status to in_progress", async () => {
    // Get task ID
    const listResult = await km(["task", "--json"]);
    const tasks = JSON.parse(listResult.stdout);
    const task = tasks.find((t: { content: string }) =>
      t.content.includes("Task to toggle"),
    );
    expect(task).toBeDefined();

    // Set status
    const statusResult = await km([
      "task",
      "status",
      task.id.slice(0, 8),
      "in_progress",
    ]);
    expect(statusResult.exitCode).toBe(0);
    expect(statusResult.stdout).toContain("in_progress");

    // Verify
    const afterResult = await km(["task", "--all", "--json"]);
    const afterTasks = JSON.parse(afterResult.stdout);
    const updated = afterTasks.find((t: { id: string }) => t.id === task.id);
    expect(updated.task_status).toBe("in_progress");
  });

  test("should set task status to done", async () => {
    // Get task ID
    const listResult = await km(["task", "--json"]);
    const tasks = JSON.parse(listResult.stdout);
    const task = tasks.find((t: { content: string }) =>
      t.content.includes("Task to toggle"),
    );

    // Set done
    const statusResult = await km([
      "task",
      "status",
      task.id.slice(0, 8),
      "done",
    ]);
    expect(statusResult.exitCode).toBe(0);
    expect(statusResult.stdout).toContain("done");
  });

  test("should error on invalid ID", async () => {
    const result = await km(["task", "status", "nonexistent123"]);
    expect(result.exitCode).not.toBe(0);
  });
});

describe("km init", () => {
  const INIT_TEST_DIR = join(import.meta.dir, ".test-init");

  beforeEach(() => {
    // Use a completely separate directory for init tests
    if (existsSync(INIT_TEST_DIR)) {
      rmSync(INIT_TEST_DIR, { recursive: true });
    }
    mkdirSync(INIT_TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(INIT_TEST_DIR)) {
      rmSync(INIT_TEST_DIR, { recursive: true });
    }
  });

  test("should create .km/ directory", async () => {
    const initDir = join(INIT_TEST_DIR, "new-project");
    mkdirSync(initDir, { recursive: true });

    // Run init without existing .km/ (--force needed since tests run within km repo)
    const result = await km(["init", "--force"], {
      cwd: initDir,
      env: { KM_DIR: join(initDir, ".km") },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Initialized");
    expect(existsSync(join(initDir, ".km"))).toBe(true);
    expect(existsSync(join(initDir, ".km", "events.jsonl"))).toBe(true);
  });

  test("should warn if already initialized", async () => {
    const initDir = join(INIT_TEST_DIR, "already-init");
    mkdirSync(join(initDir, ".km"), { recursive: true });

    const result = await km(["init"], {
      cwd: initDir,
      env: { KM_DIR: join(initDir, ".km") },
    });

    expect(result.stdout).toContain("Already initialized");
  });

  describe("gtd template", () => {
    test("should create GTD folder structure", async () => {
      const initDir = join(INIT_TEST_DIR, "gtd-project");
      mkdirSync(initDir, { recursive: true });

      // --force needed since tests run within km repo which has ancestor .km/
      const result = await km(["init", "--force", "gtd"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Initialized");

      // Check folders exist
      expect(existsSync(join(initDir, "inbox"))).toBe(true);
      expect(existsSync(join(initDir, "archive"))).toBe(true);

      // Check board files exist
      expect(existsSync(join(initDir, "@inbox.md"))).toBe(true);
      expect(existsSync(join(initDir, "@next.md"))).toBe(true);
      expect(existsSync(join(initDir, "@someday.md"))).toBe(true);
    });

    test("should create @inbox.md with correct content", async () => {
      const initDir = join(INIT_TEST_DIR, "gtd-inbox");
      mkdirSync(initDir, { recursive: true });

      await km(["init", "--force", "gtd"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      });

      const content = readFileSync(join(initDir, "@inbox.md"), "utf-8");
      expect(content).toContain("title: Inbox");
      expect(content).toContain("type: board");
      expect(content).toContain("add: ./inbox/**");
      expect(content).toContain("# Inbox");
      expect(content).toContain("Unprocessed items awaiting triage");
    });

    test("should create @next.md with columns", async () => {
      const initDir = join(INIT_TEST_DIR, "gtd-next");
      mkdirSync(initDir, { recursive: true });

      await km(["init", "--force", "gtd"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      });

      const content = readFileSync(join(initDir, "@next.md"), "utf-8");
      expect(content).toContain("title: Next Actions");
      expect(content).toContain("type: board");
      expect(content).toContain("## Today");
      expect(content).toContain("## This Week");
      expect(content).toContain("## Waiting");
    });

    test("should create @someday.md with correct content", async () => {
      const initDir = join(INIT_TEST_DIR, "gtd-someday");
      mkdirSync(initDir, { recursive: true });

      await km(["init", "--force", "gtd"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      });

      const content = readFileSync(join(initDir, "@someday.md"), "utf-8");
      expect(content).toContain("title: Someday/Maybe");
      expect(content).toContain("type: board");
      expect(content).toContain("# Someday/Maybe");
      expect(content).toContain("Ideas and projects for the future");
    });

    test("should use path argument when not gtd template", async () => {
      const initDir = join(INIT_TEST_DIR, "path-argument");

      // km init ./path should create .km/ in ./path
      const result = await km(["init", "--force", initDir], {
        cwd: INIT_TEST_DIR,
        env: { KM_DIR: join(initDir, ".km") },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Initialized");
      expect(existsSync(join(initDir, ".km"))).toBe(true);
    });
  });
});

describe("CLI Error Handling", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    mkdirSync(KM_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should handle invalid command gracefully", async () => {
    const result = await km(["invalidcommand"]);
    // Commander shows help for unknown commands
    expect(result.exitCode).not.toBe(0);
  });

  test("should handle missing task ID for --done", async () => {
    const result = await km(["task", "--done"]);
    // Should fail without an ID
    expect(result.exitCode).not.toBe(0);
  });
});

describe("Global --root option", () => {
  const ROOT_TEST_DIR = "/tmp/km-root-test";
  const VAULT_A = join(ROOT_TEST_DIR, "vault-a");
  const VAULT_B = join(ROOT_TEST_DIR, "vault-b");

  beforeEach(() => {
    // Clean up and create test directories
    if (existsSync(ROOT_TEST_DIR)) {
      rmSync(ROOT_TEST_DIR, { recursive: true });
    }
    mkdirSync(VAULT_A, { recursive: true });
    mkdirSync(VAULT_B, { recursive: true });

    // Create test files in vault-a
    writeFileSync(
      join(VAULT_A, "tasks-a.md"),
      `# Vault A Tasks

- [ ] Task from vault A
`,
    );

    // Create test files in vault-b
    writeFileSync(
      join(VAULT_B, "tasks-b.md"),
      `# Vault B Tasks

- [ ] Task from vault B
`,
    );
  });

  afterEach(() => {
    if (existsSync(ROOT_TEST_DIR)) {
      rmSync(ROOT_TEST_DIR, { recursive: true });
    }
  });

  test("should use --root option for memory mode", async () => {
    // Run from a different directory but specify --root
    const result = await km(["--root", VAULT_A, "task"], {
      cwd: "/tmp",
      env: { KM_DIR: "" }, // Ensure no KM_DIR interference
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Task from vault A");
    expect(result.stdout).not.toContain("Task from vault B");
  });

  test("should use KM_ROOT env var for memory mode", async () => {
    const result = await km(["task"], {
      cwd: "/tmp",
      env: { KM_ROOT: VAULT_B, KM_DIR: "" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Task from vault B");
    expect(result.stdout).not.toContain("Task from vault A");
  });

  test("--root should override KM_ROOT env var", async () => {
    const result = await km(["--root", VAULT_A, "task"], {
      cwd: "/tmp",
      env: { KM_ROOT: VAULT_B, KM_DIR: "" },
    });

    expect(result.exitCode).toBe(0);
    // Should use --root (vault A), not KM_ROOT (vault B)
    expect(result.stdout).toContain("Task from vault A");
    expect(result.stdout).not.toContain("Task from vault B");
  });

  test("should support tilde expansion in --root", async () => {
    // Create a test file in home directory (use a temp subdir)
    const homeSubdir = join(process.env.HOME || "", ".km-test-home");
    mkdirSync(homeSubdir, { recursive: true });
    writeFileSync(
      join(homeSubdir, "home-tasks.md"),
      `# Home Tasks

- [ ] Task from home
`,
    );

    try {
      const result = await km(["--root", "~/.km-test-home", "task"], {
        cwd: "/tmp",
        env: { KM_DIR: "" },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Task from home");
    } finally {
      rmSync(homeSubdir, { recursive: true });
    }
  });

  test("should show --root in help", async () => {
    const result = await km(["--help"], { cwd: "/tmp" });
    expect(result.stdout).toContain("--root");
    expect(result.stdout).toContain("-r");
  });
});

describe("km new", () => {
  beforeEach(() => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    mkdirSync(KM_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should create task in inbox file", async () => {
    const result = await km(["new", "Call dentist"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added to inbox");

    // Verify inbox file was created with task
    const inboxPath = join(VAULT_DIR, "inbox", "inbox.md");
    expect(existsSync(inboxPath)).toBe(true);
    const content = readFileSync(inboxPath, "utf-8");
    expect(content).toContain("- [ ] Call dentist");
  });

  test("should parse metadata from content", async () => {
    const result = await km(["new", "Task @bjorn due:2026-01-20 p:1"]);
    expect(result.exitCode).toBe(0);

    const inboxPath = join(VAULT_DIR, "inbox", "inbox.md");
    const content = readFileSync(inboxPath, "utf-8");
    expect(content).toContain("- [ ] Task @bjorn due:2026-01-20 p:1");
  });

  test("should add metadata from options", async () => {
    const result = await km([
      "new",
      "Simple task",
      "-d",
      "2026-01-15",
      "-P",
      "2",
    ]);
    expect(result.exitCode).toBe(0);

    const inboxPath = join(VAULT_DIR, "inbox", "inbox.md");
    const content = readFileSync(inboxPath, "utf-8");
    expect(content).toContain("- [ ] Simple task due:2026-01-15 p:2");
  });

  test("should output JSON with --json", async () => {
    const result = await km(["new", "JSON task", "--json"]);
    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.content).toBe("JSON task");
    expect(output.file).toContain("inbox.md");
  });

  test("should append multiple tasks to same inbox", async () => {
    await km(["new", "First task"]);
    await km(["new", "Second task"]);

    const inboxPath = join(VAULT_DIR, "inbox", "inbox.md");
    const content = readFileSync(inboxPath, "utf-8");
    expect(content).toContain("- [ ] First task");
    expect(content).toContain("- [ ] Second task");
  });

  test("should sync and show tasks after km new", async () => {
    await km(["new", "Synced task"]);
    await km(["sync"]);

    const result = await km(["task"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Synced task");
  });
});

describe("km done", () => {
  beforeEach(async () => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    mkdirSync(KM_DIR, { recursive: true });

    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task to mark done
- [x] Already completed task
`,
    );
    await km(["sync"]);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should mark task as done by ID prefix", async () => {
    // Get task ID
    const listResult = await km(["task", "--json"]);
    const tasks = JSON.parse(listResult.stdout);
    const task = tasks.find((t: { content: string }) =>
      t.content.includes("Task to mark done"),
    );
    expect(task).toBeDefined();

    // Mark as done using km done
    const idPrefix = task.id.slice(0, 8);
    const doneResult = await km(["done", idPrefix]);
    expect(doneResult.exitCode).toBe(0);
    expect(doneResult.stdout).toContain("Marked done");

    // Verify task is now done
    const allResult = await km(["task", "--all", "--json"]);
    const allTasks = JSON.parse(allResult.stdout);
    const doneTask = allTasks.find((t: { id: string }) => t.id === task.id);
    expect(doneTask.task_status).toBe("done");
  });

  test("should error on task not found", async () => {
    const result = await km(["done", "nonexistent123"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Task not found");
  });

  test("should handle already done task gracefully", async () => {
    // Get the already completed task - use full ID to avoid prefix collisions
    const listResult = await km(["task", "--all", "--json"]);
    const tasks = JSON.parse(listResult.stdout);
    const task = tasks.find((t: { content: string }) =>
      t.content.includes("Already completed task"),
    );
    expect(task).toBeDefined();

    // Try to mark as done again using full ID
    const doneResult = await km(["done", task.id]);
    expect(doneResult.exitCode).toBe(0);
    expect(doneResult.stdout).toContain("already done");
  });

  test("should error when file ID prefix has no matching task", async () => {
    // Get a file node (not a task)
    const listResult = await km(["ls", "--type", "file", "--json"]);
    const nodes = JSON.parse(listResult.stdout);
    expect(nodes.length).toBeGreaterThan(0);

    // Use full ID to ensure no accidental task matches
    const fileNode = nodes[0];
    const result = await km(["done", fileNode.id]);
    expect(result.exitCode).not.toBe(0);
    // Since findTask only looks for tasks, a file ID returns "Task not found"
    expect(result.stderr).toContain("Task not found");
  });

  test("should output JSON with --json", async () => {
    // Get task ID
    const listResult = await km(["task", "--json"]);
    const tasks = JSON.parse(listResult.stdout);
    const task = tasks.find((t: { content: string }) =>
      t.content.includes("Task to mark done"),
    );

    // Use full ID to avoid race condition with other tasks created same millisecond
    const doneResult = await km(["done", task.id, "--json"]);
    expect(doneResult.exitCode).toBe(0);

    const output = JSON.parse(doneResult.stdout);
    expect(output.id).toBe(task.id);
    expect(output.status).toBe("done");
  });
});
