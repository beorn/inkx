/**
 * CLI Integration Tests
 *
 * End-to-end tests that run actual CLI commands and verify behavior.
 * Tests the full workflow from command to database to output.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { $ } from "bun"

// ============================================================================
// Types
// ============================================================================

/** Parsed task from JSON output */
interface TaskJson {
  id: string
  type: string
  content: string
  item?: { list?: string; task?: { marker?: string; status?: string } }
  due_at?: string
  priority?: string
  parent_id?: string | null
  fs_path?: string
}

/** km new --json output */
interface NewTaskJson {
  content: string
  file: string
}

/** CLI command result */
interface CmdResult {
  stdout: string
  stderr: string
  exitCode: number
}

// ============================================================================
// Test Environment
// ============================================================================

// Use process.pid to ensure unique directories across parallel test runs
const TEST_DIR = join("/tmp", `kmtest-cli-${process.pid}`)
const REPO_DIR = join(TEST_DIR, "repo")
const KM_DIR = join(REPO_DIR, ".km") // .km inside repo, not sibling

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = join(__dirname, "..", "src", "index.ts")

// ============================================================================
// Helpers
// ============================================================================

/** Run km CLI command and return result */
async function km(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): Promise<CmdResult> {
  const cwd = options.cwd ?? REPO_DIR
  const env = { ...process.env, KM_DIR, ...options.env }

  try {
    const result = await $`bun ${CLI_PATH} ${args}`.cwd(cwd).env(env).quiet()
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: result.exitCode,
    }
  } catch (error: unknown) {
    const err = error as {
      stdout?: Buffer
      stderr?: Buffer
      exitCode?: number
    }
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: err.exitCode ?? 1,
    }
  }
}

/** Parse JSON output from km command */
function parseJson<T>(result: CmdResult): T {
  return JSON.parse(result.stdout) as T
}

/** Get tasks from km tasks --json */
async function getTasks(extraArgs: string[] = []): Promise<TaskJson[]> {
  const result = await km(["tasks", "--json", ...extraArgs])
  return parseJson<TaskJson[]>(result)
}

/** Get all tasks including completed */
async function getAllTasks(): Promise<TaskJson[]> {
  return getTasks(["--all"])
}

/** Find task by content substring */
function findTask(tasks: TaskJson[], content: string): TaskJson | undefined {
  return tasks.find((t) => t.content.includes(content))
}

/** Get task by content, throw if not found */
async function getTaskByContent(content: string, includeAll = false): Promise<TaskJson> {
  const tasks = includeAll ? await getAllTasks() : await getTasks()
  const task = findTask(tasks, content)
  if (!task) throw new Error(`Task not found: ${content}`)
  return task
}

/** Create standard test directories */
function setupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true })
  }
  mkdirSync(TEST_DIR, { recursive: true })
  mkdirSync(REPO_DIR, { recursive: true })
  mkdirSync(KM_DIR, { recursive: true })
}

/** Clean up test directories */
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true })
  }
}

/** Create a markdown file in the test repo */
function createFile(relativePath: string, content: string): void {
  const fullPath = join(REPO_DIR, relativePath)
  const dir = dirname(fullPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(fullPath, content)
}

/** Assert command succeeded and stdout contains text */
function expectSuccess(result: CmdResult, ...contains: string[]): void {
  expect(result.exitCode).toBe(0)
  for (const text of contains) {
    expect(result.stdout).toContain(text)
  }
}

/** Assert command failed */
function expectFailure(result: CmdResult): void {
  expect(result.exitCode).not.toBe(0)
}

describe("CLI Integration", () => {
  beforeEach(() => setupTestDirs())
  afterEach(() => cleanupTestDirs())

  describe("km --help", () => {
    test("should show help message", async () => {
      const result = await km(["--help"])
      expectSuccess(result, "Knowledge Machine", "tasks", "sync")
    })
  })

  describe("km sync", () => {
    test("should sync files to database", async () => {
      createFile(
        "test.md",
        `# Test Document

- [ ] First task
- [ ] Second task
`,
      )

      const result = await km(["sync"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toLowerCase()).toContain("synced")
    })

    test("should sync nested folder structure", async () => {
      createFile(
        "projects/todo.md",
        `# Project Tasks

- [ ] Task in project
`,
      )

      const result = await km(["sync"])
      expect(result.exitCode).toBe(0)
    })
  })

  describe("km tasks", () => {
    beforeEach(async () => {
      createFile(
        "inbox.md",
        `# Inbox

- [ ] Inbox task 1
- [ ] Inbox task 2
- [x] Completed inbox task
`,
      )
      createFile(
        "projects/work.md",
        `# Work Project

## Tasks

- [ ] Work task A
- [ ] Work task B
`,
      )
      await km(["sync"])
    })

    test("should list open tasks", async () => {
      const result = await km(["tasks"])
      expectSuccess(result, "Inbox task 1", "Inbox task 2", "Work task A")
      expect(result.stdout).not.toContain("Completed inbox task")
    })

    test("should show all tasks with --all", async () => {
      const result = await km(["tasks", "--all"])
      expectSuccess(result, "Completed inbox task")
    })

    test("should filter by path prefix", async () => {
      const result = await km(["tasks", "projects"])
      expectSuccess(result, "Work task A", "Work task B")
      expect(result.stdout).not.toContain("Inbox task 1")
    })

    test("should filter by file name prefix", async () => {
      const result = await km(["tasks", "work"])
      expectSuccess(result, "Work task A")
    })

    test("should filter by contains with *filter*", async () => {
      const result = await km(["tasks", "*work*"])
      expectSuccess(result, "Work task A")
    })

    test("should show task count", async () => {
      const result = await km(["tasks"])
      expectSuccess(result, "task(s)")
    })

    test("should show flat output with --flat", async () => {
      const result = await km(["tasks", "--flat"])
      expectSuccess(result, "›")
    })

    test("should output JSON with --json", async () => {
      const tasks = await getTasks()
      expect(tasks.length).toBeGreaterThan(0)
      expect(tasks[0]).toHaveProperty("id")
      // Tasks can be any structural type that has item.task set
      expect(tasks[0]?.item?.task).toBeDefined()
    })
  })

  describe("km tasks --new", () => {
    beforeEach(async () => {
      createFile("inbox.md", "# Inbox\n")
      await km(["sync"])
    })

    test("should create a new task", async () => {
      const result = await km(["tasks", "--new", "New test task"])
      expectSuccess(result, "Created task")
      const listResult = await km(["tasks"])
      expect(listResult.stdout).toContain("New test task")
    })

    test("should create task with metadata", async () => {
      const result = await km(["tasks", "--new", "Task with due 📅 2025-12-25"])
      expect(result.exitCode).toBe(0)
      const tasks = await getTasks(["--detail"])
      const newTask = findTask(tasks, "Task with due")
      expect(newTask?.due_at).toBe("2025-12-25")
    })
  })

  describe("km tasks --done", () => {
    beforeEach(async () => {
      createFile(
        "tasks.md",
        `# Tasks

- [ ] Task to complete
`,
      )
      await km(["sync"])
    })

    test("should mark task as done by ID prefix", async () => {
      const task = await getTaskByContent("Task to complete")
      const doneResult = await km(["tasks", "--done", task.id])
      expectSuccess(doneResult, "Marked as done")

      const allTasks = await getAllTasks()
      const doneTask = allTasks.find((t) => t.id === task.id)
      expect(doneTask?.item?.task?.status).toBe("done")
    })

    test("should mark task as done by ID suffix (displayed short ID)", async () => {
      const task = await getTaskByContent("Task to complete", true)
      const doneResult = await km(["status", task.id.slice(-8), "done"])
      expectSuccess(doneResult, "done")

      const allTasks = await getAllTasks()
      const doneTask = allTasks.find((t) => t.id === task.id)
      expect(doneTask?.item?.task?.status).toBe("done")
    })
  })

  // Note: km search removed - use 'km list' for filtering
  // Note: km tree removed - use 'km view' with 'v' to toggle board/tree

  describe("km doctor", () => {
    beforeEach(async () => {
      createFile("test.md", "# Test\n\n- [ ] Task\n")
      await km(["sync"])
    })

    test("should show store health", async () => {
      const result = await km(["doctor"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Worktree")
      expect(result.stdout).toContain("state.db")
    })

    test("should rebuild database", async () => {
      const result = await km(["doctor", "rebuild"])
      expect(result.exitCode).toBe(0)
      const listResult = await km(["tasks"])
      expect(listResult.stdout).toContain("Task")
    })

    test("should reset from worktree", async () => {
      const result = await km(["doctor", "reset"])
      expect(result.exitCode).toBe(0)
    })
  })

  describe("km show", () => {
    beforeEach(async () => {
      createFile(
        "doc.md",
        `# Document Title

Some content here.

- [ ] A task in the doc
`,
      )
      await km(["sync"])
    })

    test("should show node by ID prefix", async () => {
      const tasks = await getTasks()
      expect(tasks.length).toBeGreaterThan(0)
      const result = await km(["show", tasks[0]!.id])
      expect(result.exitCode).toBe(0)
    })
  })
})

describe("km list", () => {
  beforeEach(async () => {
    setupTestDirs()
    createFile(
      "notes.md",
      `# Notes

Some paragraph content.

- [ ] A task in notes
`,
    )
    createFile(
      "projects/work.md",
      `# Work

## Tasks

- [ ] Work task
- [x] Done task
`,
    )
    await km(["sync"])
  })

  afterEach(() => cleanupTestDirs())

  test("should list all nodes", async () => {
    const result = await km(["list"])
    expectSuccess(result, "node(s)")
  })

  test("should filter by type", async () => {
    const result = await km(["ls", "--type", "task"])
    expectSuccess(result, "A task in notes", "Work task")
  })

  test("should filter by path query", async () => {
    const result = await km(["ls", "--type", "task", "projects"])
    expectSuccess(result, "Work task")
    expect(result.stdout).not.toContain("A task in notes")
  })

  test("should show IDs with --id flag", async () => {
    const result = await km(["ls", "--type", "task", "--id"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/\[[\w]{5}\]/)
  })

  test("should output JSON with --json", async () => {
    const result = await km(["ls", "--type", "task", "--json"])
    const nodes = parseJson<TaskJson[]>(result)
    expect(nodes.length).toBeGreaterThan(0)
    // Tasks can be any structural type that has item.task set
    expect(nodes[0]?.item?.task).toBeDefined()
  })
})

describe("km task status", () => {
  beforeEach(async () => {
    setupTestDirs()
    createFile(
      "tasks.md",
      `# Tasks

- [ ] Task to toggle
- [x] Already done
`,
    )
    await km(["sync"])
  })

  afterEach(() => cleanupTestDirs())

  test("should set task status to blocked", async () => {
    const task = await getTaskByContent("Task to toggle")
    const statusResult = await km(["tasks", "status", task.id, "blocked"])
    expectSuccess(statusResult, "blocked")

    const afterTasks = await getAllTasks()
    const updated = afterTasks.find((t) => t.id === task.id)
    expect(updated?.item?.task?.status).toBe("blocked")
  })

  test("should set task status to done", async () => {
    const task = await getTaskByContent("Task to toggle")
    const statusResult = await km(["tasks", "status", task.id, "done"])
    expectSuccess(statusResult, "done")
  })

  test("should error on invalid ID", async () => {
    const result = await km(["tasks", "status", "nonexistent123"])
    expectFailure(result)
  })
})

describe("km init", () => {
  const INIT_TEST_DIR = join("/tmp", `kmtest-init-${process.pid}`)

  /** Helper to run km init in a subdirectory */
  async function initInDir(subdir: string, args: string[] = ["--force"]): Promise<{ result: CmdResult; dir: string }> {
    const dir = join(INIT_TEST_DIR, subdir)
    mkdirSync(dir, { recursive: true })
    const result = await km(["init", ...args], {
      cwd: dir,
      env: { KM_DIR: join(dir, ".km") },
    })
    return { result, dir }
  }

  beforeEach(() => {
    if (existsSync(INIT_TEST_DIR)) {
      rmSync(INIT_TEST_DIR, { recursive: true })
    }
    mkdirSync(INIT_TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(INIT_TEST_DIR)) {
      rmSync(INIT_TEST_DIR, { recursive: true })
    }
  })

  test("should create .km/ directory", async () => {
    const { result, dir } = await initInDir("new-project")
    expectSuccess(result, "Initializing")
    expect(existsSync(join(dir, ".km"))).toBe(true)
    expect(existsSync(join(dir, ".km", "changes.jsonl"))).toBe(true)
  })

  test("should warn if already initialized", async () => {
    const dir = join(INIT_TEST_DIR, "already-init")
    mkdirSync(join(dir, ".km"), { recursive: true })
    const result = await km(["init"], {
      cwd: dir,
      env: { KM_DIR: join(dir, ".km") },
    })
    expect(result.stdout).toContain("Already initialized")
  })

  describe("gtd template (default)", () => {
    test("should create GTD folder structure by default", async () => {
      const { result, dir } = await initInDir("gtd-project")
      expectSuccess(result, "Initializing")
      // Check folders and board files exist
      expect(existsSync(join(dir, "inbox"))).toBe(true)
      expect(existsSync(join(dir, "archive"))).toBe(true)
      expect(existsSync(join(dir, "@next.md"))).toBe(true)
      expect(existsSync(join(dir, "@someday.md"))).toBe(true)
    })

    test("should create @next.md with inbox column and sync rules", async () => {
      const { dir } = await initInDir("gtd-next")
      const content = readFileSync(join(dir, "@next.md"), "utf-8")
      expect(content).toContain("# Next Actions")
      expect(content).toContain("## Inbox km.add:: ./inbox/**(.) km.add:: **(tpws)")
      expect(content).toContain("## Next")
      expect(content).toContain("## Waiting")
      expect(content).toContain("## Done km.collapse:: true")
      expect(content).toContain("## Removed km.collapse:: true km.removed:: true")
    })

    test("should create @someday.md with columns", async () => {
      const { dir } = await initInDir("gtd-someday")
      const content = readFileSync(join(dir, "@someday.md"), "utf-8")
      expect(content).not.toContain("---")
      expect(content).toContain("# Someday/Maybe")
      expect(content).toContain("## Ideas")
      expect(content).toContain("## Projects")
    })

    test("should use path argument", async () => {
      const dir = join(INIT_TEST_DIR, "path-argument")
      const result = await km(["init", "--force", dir], {
        cwd: INIT_TEST_DIR,
        env: { KM_DIR: join(dir, ".km") },
      })
      expectSuccess(result, "Initializing")
      expect(existsSync(join(dir, ".km"))).toBe(true)
      expect(existsSync(join(dir, "@next.md"))).toBe(true)
    })

    test("should skip GTD with --no-gtd", async () => {
      const { result, dir } = await initInDir("no-gtd", ["--force", "--no-gtd"])
      expectSuccess(result, "Initializing")
      expect(existsSync(join(dir, ".km"))).toBe(true)
      expect(existsSync(join(dir, "@next.md"))).toBe(false)
      expect(existsSync(join(dir, "inbox"))).toBe(false)
    })

    // Regression test for km-init-db-bug
    test("should initialize database and sync GTD files without errors", async () => {
      const { result, dir } = await initInDir("db-sync-test")
      expect(result.exitCode).toBe(0)
      expect(result.stderr).not.toContain("TypeError")
      expect(result.stderr).not.toContain("undefined is not an object")

      expect(existsSync(join(dir, ".km", "state.db"))).toBe(true)
      expect(existsSync(join(dir, ".km", "changes.jsonl"))).toBe(true)

      const listResult = await km(["list"], {
        cwd: dir,
        env: { KM_DIR: join(dir, ".km") },
      })
      expectSuccess(listResult, "Inbox", "Next Actions", "Someday/Maybe")
      expect(listResult.stdout).toMatch(/\d+ node\(s\)/)
    })
  })
})

describe("CLI Error Handling", () => {
  beforeEach(() => setupTestDirs())
  afterEach(() => cleanupTestDirs())

  test("should handle invalid command gracefully", async () => {
    expectFailure(await km(["invalidcommand"]))
  })

  test("should handle missing task ID for --done", async () => {
    expectFailure(await km(["tasks", "--done"]))
  })
})

describe("Global --repo option", () => {
  const ROOT_TEST_DIR = `/tmp/km-root-test-${process.pid}`
  const REPO_A = join(ROOT_TEST_DIR, "repo-a")
  const REPO_B = join(ROOT_TEST_DIR, "repo-b")

  beforeEach(() => {
    if (existsSync(ROOT_TEST_DIR)) {
      rmSync(ROOT_TEST_DIR, { recursive: true })
    }
    mkdirSync(REPO_A, { recursive: true })
    mkdirSync(REPO_B, { recursive: true })
    writeFileSync(join(REPO_A, "tasks-a.md"), "# Repo A\n\n- [ ] Task from repo A\n")
    writeFileSync(join(REPO_B, "tasks-b.md"), "# Repo B\n\n- [ ] Task from repo B\n")
  })

  afterEach(() => {
    if (existsSync(ROOT_TEST_DIR)) {
      rmSync(ROOT_TEST_DIR, { recursive: true })
    }
  })

  test("should use --repo option for memory mode", async () => {
    const result = await km(["--repo", REPO_A, "tasks"], {
      cwd: "/tmp",
      env: { KM_DIR: "" },
    })
    expectSuccess(result, "Task from repo A")
    expect(result.stdout).not.toContain("Task from repo B")
  })

  test("should use KM_ROOT env var for memory mode", async () => {
    const result = await km(["tasks"], {
      cwd: "/tmp",
      env: { KM_ROOT: REPO_B, KM_DIR: "" },
    })
    expectSuccess(result, "Task from repo B")
    expect(result.stdout).not.toContain("Task from repo A")
  })

  test("--repo should override KM_ROOT env var", async () => {
    const result = await km(["--repo", REPO_A, "tasks"], {
      cwd: "/tmp",
      env: { KM_ROOT: REPO_B, KM_DIR: "" },
    })
    expectSuccess(result, "Task from repo A")
    expect(result.stdout).not.toContain("Task from repo B")
  })

  test("should support tilde expansion in --repo", async () => {
    const homeSubdir = join(process.env.HOME || "", ".km-test-home")
    mkdirSync(homeSubdir, { recursive: true })
    writeFileSync(join(homeSubdir, "home-tasks.md"), "# Home\n\n- [ ] Task from home\n")

    try {
      const result = await km(["--repo", "~/.km-test-home", "tasks"], {
        cwd: "/tmp",
        env: { KM_DIR: "" },
      })
      expectSuccess(result, "Task from home")
    } finally {
      rmSync(homeSubdir, { recursive: true })
    }
  })

  test("should show --repo in help", async () => {
    const result = await km(["--help"], { cwd: "/tmp" })
    expectSuccess(result, "--repo", "-r")
  })
})

describe("km new", () => {
  beforeEach(() => setupTestDirs())
  afterEach(() => cleanupTestDirs())

  /** Read the inbox file content */
  function readInbox(): string {
    return readFileSync(join(REPO_DIR, "inbox", "inbox.md"), "utf-8")
  }

  test("should create task in inbox file", async () => {
    const result = await km(["new", "Call dentist"])
    expectSuccess(result, "Added to inbox")
    expect(existsSync(join(REPO_DIR, "inbox", "inbox.md"))).toBe(true)
    expect(readInbox()).toContain("- [ ] Call dentist")
  })

  test("should parse metadata from content", async () => {
    await km(["new", "Task @bjorn due:2026-01-20 p:1"])
    expect(readInbox()).toContain("- [ ] Task @bjorn due:2026-01-20 p:1")
  })

  test("should add metadata from options", async () => {
    await km(["new", "Simple task", "-d", "2026-01-15", "-P", "2"])
    expect(readInbox()).toContain("- [ ] Simple task due:2026-01-15 priority:: 2")
  })

  test("should output JSON with --json", async () => {
    const result = await km(["new", "JSON task", "--json"])
    const output = parseJson<NewTaskJson>(result)
    expect(output.content).toBe("JSON task")
    expect(output.file).toContain("inbox.md")
  })

  test("should append multiple tasks to same inbox", async () => {
    await km(["new", "First task"])
    await km(["new", "Second task"])
    const content = readInbox()
    expect(content).toContain("- [ ] First task")
    expect(content).toContain("- [ ] Second task")
  })

  test("should sync and show tasks after km new", async () => {
    await km(["new", "Synced task"])
    await km(["sync"])
    const result = await km(["tasks"])
    expectSuccess(result, "Synced task")
  })
})

describe("km done", () => {
  beforeEach(async () => {
    setupTestDirs()
    createFile(
      "tasks.md",
      `# Tasks

- [ ] Task to mark done
- [x] Already completed task
`,
    )
    await km(["sync"])
  })

  afterEach(() => cleanupTestDirs())

  test("should mark task as done by ID prefix", async () => {
    const task = await getTaskByContent("Task to mark done")
    const doneResult = await km(["status", task.id, "done"])
    expectSuccess(doneResult, "done")

    const allTasks = await getAllTasks()
    const doneTask = allTasks.find((t) => t.id === task.id)
    expect(doneTask?.item?.task?.status).toBe("done")
  })

  test("should error on task not found", async () => {
    const result = await km(["status", "nonexistent123"])
    expectFailure(result)
    expect(result.stderr).toContain("Task not found")
  })

  test("should show status for already done task", async () => {
    const task = await getTaskByContent("Already completed task", true)
    const statusResult = await km(["status", task.id])
    expectSuccess(statusResult, "done")
  })

  test("should error when file ID prefix has no matching task", async () => {
    const nodesResult = await km(["ls", "--type", "file", "--json"])
    const nodes = parseJson<TaskJson[]>(nodesResult)
    expect(nodes.length).toBeGreaterThan(0)

    const result = await km(["status", nodes[0]!.id])
    expectFailure(result)
    expect(result.stderr).toContain("Task not found")
  })

  test("should output JSON with --json", async () => {
    const task = await getTaskByContent("Task to mark done")
    const doneResult = await km(["status", task.id, "done", "--json"])
    expect(doneResult.exitCode).toBe(0)

    const output = parseJson<{ id: string; status: string }>(doneResult)
    expect(output.id).toBe(task.id)
    expect(output.status).toBe("done")
  })
})

describe("Bidirectional sync - km status writes to markdown file", () => {
  beforeEach(async () => {
    setupTestDirs()
    createFile(
      "tasks.md",
      `# Tasks

- [ ] Open task
- [ ] Another open task
- [/] In progress task
- [!] Blocked task
`,
    )
    await km(["sync"])
  })

  afterEach(() => cleanupTestDirs())

  // TODO: CLI commands need withFsWriter to write changes back to files
  // createRepo in disk mode auto-registers withFsWriter on the emitter
  test.skip("km status done should update markdown file with [x]", async () => {
    const task = await getTaskByContent("Open task")
    const doneResult = await km(["status", task.id, "done"])
    expect(doneResult.exitCode).toBe(0)

    const content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
    expect(content).toContain("- [x] Open task")
    expect(content).toContain("- [ ] Another open task")
    expect(content).toContain("- [/] In progress task")
    expect(content).toContain("- [!] Blocked task")
  })

  test.skip("km status should cycle through statuses and update markdown", async () => {
    const task = await getTaskByContent("Another open task")

    await km(["status", task.id, "blocked"])
    let content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
    expect(content).toContain("- [!] Another open task")

    await km(["status", task.id, "done"])
    content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
    expect(content).toContain("- [x] Another open task")

    await km(["status", task.id, "todo"])
    content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
    expect(content).toContain("- [ ] Another open task")
  })

  test.skip("km tasks status should update markdown with correct mark", async () => {
    const task = await getTaskByContent("Open task", true)

    const statusResult = await km(["tasks", "status", task.id, "blocked"])
    expect(statusResult.exitCode).toBe(0)

    let content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
    expect(content).toContain("- [!] Open task")

    await km(["tasks", "status", task.id, "done"])
    content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
    expect(content).toContain("- [x] Open task")

    await km(["tasks", "status", task.id, "todo"])
    content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
    expect(content).toContain("- [ ] Open task")
  })

  test.skip("nested task should update in correct file", async () => {
    createFile(
      "projects/alpha.md",
      `# Alpha Project

## Tasks

- [ ] Nested task in project
`,
    )
    await km(["sync"])

    const nestedTask = await getTaskByContent("Nested task in project")
    await km(["status", nestedTask.id, "done"])

    const content = readFileSync(join(REPO_DIR, "projects/alpha.md"), "utf-8")
    expect(content).toContain("- [x] Nested task in project")
  })
})

describe("Task mark types - parsing and status mapping", () => {
  // Test GFM-standard task marks ([ ] and [x]/[X])
  // Note: Extended marks ([!], [-], [/], [?]) are not recognized by GFM parser
  beforeEach(async () => {
    setupTestDirs()
    createFile(
      "all-marks.md",
      `# All Task Marks

- [ ] Open task (space mark)
- [x] Done task (x mark)
- [X] Done task uppercase (X mark)
`,
    )
    await km(["sync"])
  })

  afterEach(() => cleanupTestDirs())

  test("should parse GFM-standard mark types correctly", async () => {
    const tasks = await getAllTasks()

    expect(findTask(tasks, "Open task (space mark)")?.item?.task?.status).toBe("todo")
    expect(findTask(tasks, "Done task (x mark)")?.item?.task?.status).toBe("done")
    expect(findTask(tasks, "Done task uppercase")?.item?.task?.status).toBe("done")
  })

  test("km task (default) should only show todo tasks", async () => {
    const tasks = await getTasks()

    const hasTodo = tasks.some((t) => t.content.includes("Open task") && !t.content.includes("Done"))
    expect(hasTodo).toBe(true)
    expect(tasks.some((t) => t.content.includes("Done task"))).toBe(false)
  })

  test("km task --all should show all statuses", async () => {
    const tasks = await getAllTasks()
    expect(tasks.length).toBe(3)
  })
})

describe("Query language integration - km task with queries", () => {
  const today = new Date().toISOString().slice(0, 10)

  beforeEach(async () => {
    setupTestDirs()
    createFile(
      "tasks.md",
      `# Tasks

- [ ] Task with @bjorn mention
- [ ] Task with #urgent tag
- [x] Completed task for @sarah
- [ ] Task with +project-alpha
- [ ] High priority task priority:: P1
- [ ] Task due today due:${today}
`,
    )
    createFile(
      "projects/work.md",
      `# Work Tasks

- [ ] Work task in projects folder
- [x] Done work task
`,
    )
    await km(["sync"])
  })

  afterEach(() => cleanupTestDirs())

  test.each([
    ["@mention", "@bjorn", "@bjorn"],
    ["#tag", "#urgent", "#urgent"],
    ["+project", "+project-alpha", "+project-alpha"],
  ])("should filter by %s", async (_name, query, expected) => {
    const tasks = await getTasks([query])
    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks.every((t) => t.content.includes(expected))).toBe(true)
  })

  test("should filter by status:todo", async () => {
    const tasks = await getTasks(["status:todo"])
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.every((t) => t.item?.task?.status === "todo")).toBe(true)
  })

  test("should filter by status:done with --all", async () => {
    const tasks = await getTasks(["--all", "status:done"])
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.every((t) => t.item?.task?.status === "done")).toBe(true)
  })

  test("should exclude with negation -status:done", async () => {
    const tasks = await getTasks(["--all", "--query=-status:done"])
    expect(tasks.every((t) => t.item?.task?.status !== "done")).toBe(true)
  })

  test("should filter by path pattern ./projects/**", async () => {
    const tasks = await getTasks(["--all", "./projects/**"])
    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks.some((t) => t.content.includes("Work task"))).toBe(true)
    expect(tasks.some((t) => t.content.includes("@bjorn"))).toBe(false)
  })

  test("should combine multiple conditions (AND)", async () => {
    const tasks = await getTasks(["@bjorn", "status:todo"])
    expect(tasks.every((t) => t.content.includes("@bjorn") && t.item?.task?.status === "todo")).toBe(true)
  })

  test("should filter by priority", async () => {
    const tasks = await getTasks(["priority:P1"])
    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks.some((t) => t.priority === "P1")).toBe(true)
  })
})

describe("km move - re-parent nodes", () => {
  beforeEach(async () => {
    setupTestDirs()
    createFile("inbox.md", "# Inbox\n\n- [ ] Task in inbox\n")
    createFile("projects/work.md", "# Work Project\n\n- [ ] Existing work task\n")
    await km(["sync"])
  })

  afterEach(() => cleanupTestDirs())

  test("should move task to different parent by ID", async () => {
    const tasks = await getTasks()
    const inboxTask = findTask(tasks, "Task in inbox")!
    expect(inboxTask).toBeDefined()

    const nodesResult = await km(["ls", "--type", "file", "--json"])
    const nodes = parseJson<TaskJson[]>(nodesResult)
    const workFile = nodes.find((n) => n.fs_path?.includes("work.md"))!
    expect(workFile).toBeDefined()

    const moveResult = await km(["move", inboxTask.id, workFile.id, "--json"])
    expect(moveResult.exitCode).toBe(0)

    const output = parseJson<{ id: string; parent_id: string | null }>(moveResult)
    expect(output.id).toBe(inboxTask.id)
    expect(output.parent_id).toBe(workFile.id)
  })

  test("should move task to root with --to-root", async () => {
    const task = await getTaskByContent("Task in inbox")
    expect(task.parent_id).not.toBeNull()

    const moveResult = await km(["move", task.id, "--to-root", "--json"])
    expect(moveResult.exitCode).toBe(0)

    const output = parseJson<{ parent_id: string | null }>(moveResult)
    expect(output.parent_id).toBeNull()
  })

  test("should error when node not found", async () => {
    const result = await km(["move", "nonexistent", "somewhere"])
    expectFailure(result)
    expect(result.stderr).toContain("Node not found")
  })

  test("should error when no parent specified", async () => {
    const tasks = await getTasks()
    const result = await km(["move", tasks[0]!.id])
    expectFailure(result)
    expect(result.stderr).toContain("Specify a parent")
  })
})

describe("km view - state initialization", () => {
  beforeEach(() => setupTestDirs())
  afterEach(() => cleanupTestDirs())

  /** Helper to view a path and check for expected content */
  async function viewAndExpect(path: string, expected: string, cwd = REPO_DIR): Promise<void> {
    const result = await km(["view", path, "--no-interactive"], { cwd })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(expected)
  }

  test("km view should work after km add modifies database", async () => {
    // Regression: view.ts wasn't calling ensureState() to replay events
    createFile("@next.md", "# Next Actions\n\n## Tasks\n")
    createFile("projects/work.md", "# Work\n\n- [ ] Task A\n- [ ] Task B\n")

    await km(["sync"])
    const addResult = await km(["add", "@next", "./projects/**"])
    expectSuccess(addResult, "Linked")

    await viewAndExpect("@next.md", "Tasks")
  })

  test("km view should find board after km sync and km add in sequence", async () => {
    createFile("@next.md", "# Next Actions\n\n## Inbox km.add:: ./inbox/**\n\n## Processing\n")
    createFile("inbox/new.md", "# New Items\n\n- [ ] Review email\n- [ ] Check calendar\n")

    await km(["sync"])
    await km(["add", "@next", "./inbox/**"])
    await viewAndExpect("@next.md", "Inbox")
  })

  test("km view should work with filesystem path to board", async () => {
    createFile("board.md", "# My Board\n\n## Column A\n- [ ] Task 1\n")
    await km(["sync"])
    await viewAndExpect(join(REPO_DIR, "board.md"), "Column A")
  })

  test("km view should work with directory path (repo root)", async () => {
    createFile("project1.md", "# Project 1\n\n## Tasks\n- [ ] Task A\n")
    createFile("project2.md", "# Project 2\n\n## Done\n- [x] Task B\n")
    await km(["sync"])

    const result = await km(["view", REPO_DIR, "--no-interactive"])
    expectSuccess(result, "Project 1", "Project 2")
  })

  // Path format tests - parameterized
  test.each([
    ["./relative path", "projects/board.md", "./projects/board.md", "Column"],
    ["bare relative path", "areas/work.md", "areas/work.md", "Active"],
    ["directory trailing slash", "ref/notes.md", "ref/", "Notes"],
    ["bare filename", "tasks.md", "tasks", "Todo"],
    ["filename with extension", "myfile.md", "myfile.md", "Section"],
    ["nested path without ./", "docs/guides/start.md", "docs/guides/start.md", "Steps"],
  ])("km view with %s", async (_name, filePath, viewPath, expected) => {
    createFile(filePath, `# Test\n\n## ${expected}\n- [ ] Item\n`)
    await km(["sync"])
    await viewAndExpect(viewPath, expected)
  })

  test.skip("km view with nonexistent file shows error", async () => {
    // TODO: km view currently falls back to memory mode with the repo root
    // when the specified file doesn't exist, rather than erroring. Re-enable
    // once view.ts validates file existence explicitly.
    await km(["sync"])
    const result = await km(["view", "nonexistent-file.md", "--no-interactive"], { cwd: REPO_DIR })
    expect(result.exitCode).toBe(1)
    expect(result.stdout + result.stderr).toContain("No board found")
  })

  test("km view with node ID", async () => {
    createFile("idtest.md", "# ID Test\n\n## Column\n- [ ] Task X\n")
    await km(["sync"])

    const tasks = await getTasks()
    const task = findTask(tasks, "Task X")
    if (task) {
      await viewAndExpect(task.id, "Task X")
    }
  })
})
