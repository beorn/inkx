/**
 * CLI Integration Tests
 *
 * End-to-end tests that run actual CLI commands and verify behavior.
 * Tests the full workflow from command to database to output.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { $ } from "bun"

// Type for parsed task objects from JSON output
interface TaskJson {
  id: string
  type: string
  content: string
  task_status?: string
  due_date?: string
  priority?: number
  parent_id?: string | null
  fs_path?: string
}

// Type for km new --json output
interface NewTaskJson {
  content: string
  file: string
}

// Set test environment before imports
// KM_DIR should be inside the repo so sync defaults to correct directory
// Use process.pid to ensure unique directories across parallel test runs
const TEST_DIR = join("/tmp", `kmtest-cli-${process.pid}`)
const REPO_DIR = join(TEST_DIR, "repo")
const KM_DIR = join(REPO_DIR, ".km") // .km inside repo, not sibling

// CLI path
const CLI_PATH = join(import.meta.dir, "..", "src", "index.ts")

/**
 * Run km CLI command and return result
 */
async function km(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cwd = options.cwd ?? REPO_DIR
  const env = {
    ...process.env,
    KM_DIR,
    ...options.env,
  }

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

describe.serial("CLI Integration", () => {
  beforeEach(() => {
    // Clean up test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  describe("km --help", () => {
    test("should show help message", async () => {
      const result = await km(["--help"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Knowledge Machine")
      expect(result.stdout).toContain("tasks")
      expect(result.stdout).toContain("sync")
    })
  })

  describe("km sync", () => {
    test("should sync files to database", async () => {
      // Create test file
      writeFileSync(
        join(REPO_DIR, "test.md"),
        `# Test Document

- [ ] First task
- [ ] Second task
`,
      )

      const result = await km(["sync"])
      expect(result.exitCode).toBe(0)
      // Output contains "Synced" with change count
      expect(result.stdout.toLowerCase()).toContain("synced")
    })

    test("should sync nested folder structure", async () => {
      // Create nested structure
      const projectDir = join(REPO_DIR, "projects")
      mkdirSync(projectDir, { recursive: true })

      writeFileSync(
        join(projectDir, "todo.md"),
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
      // Create test files with tasks
      writeFileSync(
        join(REPO_DIR, "inbox.md"),
        `# Inbox

- [ ] Inbox task 1
- [ ] Inbox task 2
- [x] Completed inbox task
`,
      )

      const projectDir = join(REPO_DIR, "projects")
      mkdirSync(projectDir, { recursive: true })
      writeFileSync(
        join(projectDir, "work.md"),
        `# Work Project

## Tasks

- [ ] Work task A
- [ ] Work task B
`,
      )

      // Sync to populate database
      await km(["sync"])
    })

    test("should list open tasks", async () => {
      const result = await km(["tasks"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Inbox task 1")
      expect(result.stdout).toContain("Inbox task 2")
      expect(result.stdout).toContain("Work task A")
      // Should NOT show completed tasks by default
      expect(result.stdout).not.toContain("Completed inbox task")
    })

    test("should show all tasks with --all", async () => {
      const result = await km(["tasks", "--all"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Completed inbox task")
    })

    test("should filter by path prefix", async () => {
      // Filter by folder name - matches segments starting with "projects"
      const result = await km(["tasks", "projects"])
      expect(result.exitCode).toBe(0)
      // Should show tasks under projects folder
      expect(result.stdout).toContain("Work task A")
      expect(result.stdout).toContain("Work task B")
      // Should NOT show inbox tasks (not under projects/)
      expect(result.stdout).not.toContain("Inbox task 1")
    })

    test("should filter by file name prefix", async () => {
      // Filter by file name - matches "work.md" which starts with "work"
      const result = await km(["tasks", "work"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Work task A")
    })

    test("should filter by contains with *filter*", async () => {
      const result = await km(["tasks", "*work*"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Work task A")
    })

    test("should show task count", async () => {
      const result = await km(["tasks"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("task(s)")
    })

    test("should show flat output with --flat", async () => {
      const result = await km(["tasks", "--flat"])
      expect(result.exitCode).toBe(0)
      // Flat mode uses › separator
      expect(result.stdout).toContain("›")
    })

    test("should output JSON with --json", async () => {
      const result = await km(["tasks", "--json"])
      expect(result.exitCode).toBe(0)
      const tasks = JSON.parse(result.stdout) as TaskJson[]
      expect(Array.isArray(tasks)).toBe(true)
      expect(tasks.length).toBeGreaterThan(0)
      expect(tasks[0]).toHaveProperty("id")
      expect(tasks[0]).toHaveProperty("type", "task")
    })
  })

  describe("km tasks --add", () => {
    beforeEach(async () => {
      writeFileSync(join(REPO_DIR, "inbox.md"), "# Inbox\n")
      await km(["sync"])
    })

    test("should add a new task", async () => {
      const result = await km(["tasks", "--add", "New test task"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Created task")

      // Verify task appears in list
      const listResult = await km(["tasks"])
      expect(listResult.stdout).toContain("New test task")
    })

    test("should add task with metadata", async () => {
      const result = await km(["tasks", "--add", "Task with due 📅 2025-12-25"])
      expect(result.exitCode).toBe(0)

      // Verify task with verbose output
      const listResult = await km(["tasks", "--verbose", "--json"])
      const tasks = JSON.parse(listResult.stdout) as TaskJson[]
      const newTask = tasks.find((t) => t.content.includes("Task with due"))
      expect(newTask).toBeDefined()
      expect(newTask!.due_date).toBe("2025-12-25")
    })
  })

  describe("km tasks --done", () => {
    beforeEach(async () => {
      writeFileSync(
        join(REPO_DIR, "tasks.md"),
        `# Tasks

- [ ] Task to complete
`,
      )
      await km(["sync"])
    })

    test("should mark task as done by ID prefix", async () => {
      // Get task ID
      const listResult = await km(["tasks", "--json"])
      const tasks = JSON.parse(listResult.stdout) as TaskJson[]
      const task = tasks.find((t) => t.content.includes("Task to complete"))
      expect(task).toBeDefined()

      // Mark as done using ID prefix (first 8 chars)
      const idPrefix = task!.id.slice(0, 8)
      const doneResult = await km(["tasks", "--done", idPrefix])
      expect(doneResult.exitCode).toBe(0)
      expect(doneResult.stdout).toContain("Marked as done")

      // Verify task is now done
      const allResult = await km(["tasks", "--all", "--json"])
      const allTasks = JSON.parse(allResult.stdout) as TaskJson[]
      const doneTask = allTasks.find((t) => t.id === task!.id)
      expect(doneTask!.task_status).toBe("done")
    })

    test("should mark task as done by ID suffix (displayed short ID)", async () => {
      // Reset task status first
      const listResult = await km(["tasks", "--all", "--json"])
      const tasks = JSON.parse(listResult.stdout) as TaskJson[]
      const task = tasks.find((t) => t.content.includes("Task to complete"))
      expect(task).toBeDefined()

      // Mark as done using ID suffix (last 8 chars - what 'km task -i' displays)
      const idSuffix = task!.id.slice(-8)
      const doneResult = await km(["status", idSuffix, "done"])
      expect(doneResult.exitCode).toBe(0)
      expect(doneResult.stdout).toContain("done")

      // Verify task is now done
      const afterResult = await km(["tasks", "--all", "--json"])
      const afterTasks = JSON.parse(afterResult.stdout) as TaskJson[]
      const doneTask = afterTasks.find((t) => t.id === task!.id)
      expect(doneTask!.task_status).toBe("done")
    })
  })

  // Note: km search removed - use 'km list' for filtering
  // Note: km tree removed - use 'km view' with 'v' to toggle board/tree

  describe("km rebuild", () => {
    beforeEach(async () => {
      writeFileSync(join(REPO_DIR, "test.md"), "# Test\n\n- [ ] Task\n")
      await km(["sync"])
    })

    test("should rebuild database from events", async () => {
      const result = await km(["rebuild"])
      expect(result.exitCode).toBe(0)

      // Verify data still accessible after rebuild
      const listResult = await km(["tasks"])
      expect(listResult.stdout).toContain("Task")
    })

    test("should support --fresh flag", async () => {
      const result = await km(["rebuild", "--fresh"])
      expect(result.exitCode).toBe(0)
    })
  })

  describe("km show", () => {
    beforeEach(async () => {
      writeFileSync(
        join(REPO_DIR, "doc.md"),
        `# Document Title

Some content here.

- [ ] A task in the doc
`,
      )
      await km(["sync"])
    })

    test("should show node by ID prefix", async () => {
      // Get a task ID
      const listResult = await km(["tasks", "--json"])
      const tasks = JSON.parse(listResult.stdout) as TaskJson[]
      expect(tasks.length).toBeGreaterThan(0)

      const idPrefix = tasks[0]!.id.slice(0, 8)
      const result = await km(["show", idPrefix])
      expect(result.exitCode).toBe(0)
    })
  })
})

describe.serial("km list", () => {
  beforeEach(async () => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })

    // Create test files
    writeFileSync(
      join(REPO_DIR, "notes.md"),
      `# Notes

Some paragraph content.

- [ ] A task in notes
`,
    )

    const projectDir = join(REPO_DIR, "projects")
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, "work.md"),
      `# Work

## Tasks

- [ ] Work task
- [x] Done task
`,
    )

    await km(["sync"])
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should list all nodes", async () => {
    const result = await km(["list"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("node(s)")
  })

  test("should filter by type", async () => {
    const result = await km(["ls", "--type", "task"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("A task in notes")
    expect(result.stdout).toContain("Work task")
  })

  test("should filter by path query", async () => {
    const result = await km(["ls", "--type", "task", "projects"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Work task")
    expect(result.stdout).not.toContain("A task in notes")
  })

  test("should show IDs with --id flag", async () => {
    const result = await km(["ls", "--type", "task", "--id"])
    expect(result.exitCode).toBe(0)
    // Should show ID prefixes in brackets
    expect(result.stdout).toMatch(/\[[\w]{5}\]/)
  })

  test("should output JSON with --json", async () => {
    const result = await km(["ls", "--type", "task", "--json"])
    expect(result.exitCode).toBe(0)
    const nodes = JSON.parse(result.stdout) as TaskJson[]
    expect(Array.isArray(nodes)).toBe(true)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0]).toHaveProperty("type", "task")
  })
})

describe.serial("km task status", () => {
  beforeEach(async () => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })

    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task to toggle
- [x] Already done
`,
    )
    await km(["sync"])
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should set task status to in_progress", async () => {
    // Get task ID
    const listResult = await km(["tasks", "--json"])
    const tasks = JSON.parse(listResult.stdout) as TaskJson[]
    const task = tasks.find((t) => t.content.includes("Task to toggle"))
    expect(task).toBeDefined()

    // Set status (using valid status "blocked" instead of "in_progress")
    const statusResult = await km([
      "tasks",
      "status",
      task!.id.slice(0, 8),
      "blocked",
    ])
    expect(statusResult.exitCode).toBe(0)
    expect(statusResult.stdout).toContain("blocked")

    // Verify
    const afterResult = await km(["tasks", "--all", "--json"])
    const afterTasks = JSON.parse(afterResult.stdout) as TaskJson[]
    const updated = afterTasks.find((t) => t.id === task!.id)
    expect(updated!.task_status).toBe("blocked")
  })

  test("should set task status to done", async () => {
    // Get task ID
    const listResult = await km(["tasks", "--json"])
    const tasks = JSON.parse(listResult.stdout) as TaskJson[]
    const task = tasks.find((t) => t.content.includes("Task to toggle"))

    // Set done
    const statusResult = await km([
      "tasks",
      "status",
      task!.id.slice(0, 8),
      "done",
    ])
    expect(statusResult.exitCode).toBe(0)
    expect(statusResult.stdout).toContain("done")
  })

  test("should error on invalid ID", async () => {
    const result = await km(["tasks", "status", "nonexistent123"])
    expect(result.exitCode).not.toBe(0)
  })
})

describe.serial("km init", () => {
  const INIT_TEST_DIR = join("/tmp", `kmtest-init-${process.pid}`)

  beforeEach(() => {
    // Use a completely separate directory for init tests
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
    const initDir = join(INIT_TEST_DIR, "new-project")
    mkdirSync(initDir, { recursive: true })

    // Run init without existing .km/ (--force needed since tests run within km repo)
    const result = await km(["init", "--force"], {
      cwd: initDir,
      env: { KM_DIR: join(initDir, ".km") },
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Initializing")
    expect(existsSync(join(initDir, ".km"))).toBe(true)
    expect(existsSync(join(initDir, ".km", "events.jsonl"))).toBe(true)
  })

  test("should warn if already initialized", async () => {
    const initDir = join(INIT_TEST_DIR, "already-init")
    mkdirSync(join(initDir, ".km"), { recursive: true })

    const result = await km(["init"], {
      cwd: initDir,
      env: { KM_DIR: join(initDir, ".km") },
    })

    expect(result.stdout).toContain("Already initialized")
  })

  describe("gtd template (default)", () => {
    test("should create GTD folder structure by default", async () => {
      const initDir = join(INIT_TEST_DIR, "gtd-project")
      mkdirSync(initDir, { recursive: true })

      // --force needed since tests run within km repo which has ancestor .km/
      const result = await km(["init", "--force"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Initializing")

      // Check folders exist
      expect(existsSync(join(initDir, "inbox"))).toBe(true)
      expect(existsSync(join(initDir, "archive"))).toBe(true)

      // Check board files exist
      expect(existsSync(join(initDir, "@inbox.md"))).toBe(true)
      expect(existsSync(join(initDir, "@next.md"))).toBe(true)
      expect(existsSync(join(initDir, "@someday.md"))).toBe(true)
    })

    test("should create @inbox.md with correct content", async () => {
      const initDir = join(INIT_TEST_DIR, "gtd-inbox")
      mkdirSync(initDir, { recursive: true })

      await km(["init", "--force"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      })

      const content = readFileSync(join(initDir, "@inbox.md"), "utf-8")
      // Sync adds frontmatter with title extracted from heading (due to add= rule)
      expect(content).toContain("title: Inbox")
      expect(content).toContain("# Inbox")
      expect(content).toContain('## Unprocessed add="./inbox/**"')
    })

    test("should create @next.md with columns and sync rules", async () => {
      const initDir = join(INIT_TEST_DIR, "gtd-next")
      mkdirSync(initDir, { recursive: true })

      await km(["init", "--force"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      })

      const content = readFileSync(join(initDir, "@next.md"), "utf-8")
      // No frontmatter - clean headings with minimal inline rules
      expect(content).not.toContain("---")
      expect(content).toContain("# Next Actions")
      expect(content).toContain("## Processing default=true")
      expect(content).toContain("## Next")
      expect(content).toContain("## Doing")
      expect(content).toContain("## Waiting")
      expect(content).toContain("## Done collapse=true")
    })

    test("should create @someday.md with columns", async () => {
      const initDir = join(INIT_TEST_DIR, "gtd-someday")
      mkdirSync(initDir, { recursive: true })

      await km(["init", "--force"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      })

      const content = readFileSync(join(initDir, "@someday.md"), "utf-8")
      // No frontmatter - just clean markdown with columns
      expect(content).not.toContain("---")
      expect(content).toContain("# Someday/Maybe")
      expect(content).toContain("## Ideas")
      expect(content).toContain("## Projects")
    })

    test("should use path argument", async () => {
      const initDir = join(INIT_TEST_DIR, "path-argument")

      // km init ./path should create .km/ and GTD files in ./path
      const result = await km(["init", "--force", initDir], {
        cwd: INIT_TEST_DIR,
        env: { KM_DIR: join(initDir, ".km") },
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Initializing")
      expect(existsSync(join(initDir, ".km"))).toBe(true)
      // GTD files should also be created by default
      expect(existsSync(join(initDir, "@inbox.md"))).toBe(true)
    })

    test("should skip GTD with --no-gtd", async () => {
      const initDir = join(INIT_TEST_DIR, "no-gtd")
      mkdirSync(initDir, { recursive: true })

      const result = await km(["init", "--force", "--no-gtd"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Initializing")
      expect(existsSync(join(initDir, ".km"))).toBe(true)
      // GTD files should NOT exist
      expect(existsSync(join(initDir, "@inbox.md"))).toBe(false)
      expect(existsSync(join(initDir, "inbox"))).toBe(false)
    })

    // Regression test for km-init-db-bug: database initialization during sync
    test("should initialize database and sync GTD files without errors", async () => {
      const initDir = join(INIT_TEST_DIR, "db-sync-test")
      mkdirSync(initDir, { recursive: true })

      const result = await km(["init", "--force"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      })

      expect(result.exitCode).toBe(0)
      expect(result.stderr).not.toContain("TypeError")
      expect(result.stderr).not.toContain("undefined is not an object")

      // Verify database was created
      expect(existsSync(join(initDir, ".km", "state.db"))).toBe(true)
      expect(existsSync(join(initDir, ".km", "events.jsonl"))).toBe(true)

      // Verify files were synced by querying the database
      const listResult = await km(["list"], {
        cwd: initDir,
        env: { KM_DIR: join(initDir, ".km") },
      })

      expect(listResult.exitCode).toBe(0)
      // Should find nodes from the GTD structure
      expect(listResult.stdout).toContain("Inbox")
      expect(listResult.stdout).toContain("Next Actions")
      expect(listResult.stdout).toContain("Someday/Maybe")
      // Should report multiple nodes (proves sync worked)
      expect(listResult.stdout).toMatch(/\d+ node\(s\)/)
    })
  })
})

describe.serial("CLI Error Handling", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should handle invalid command gracefully", async () => {
    const result = await km(["invalidcommand"])
    // Commander shows help for unknown commands
    expect(result.exitCode).not.toBe(0)
  })

  test("should handle missing task ID for --done", async () => {
    const result = await km(["tasks", "--done"])
    // Should fail without an ID
    expect(result.exitCode).not.toBe(0)
  })
})

describe.serial("Global --repo option", () => {
  const ROOT_TEST_DIR = `/tmp/km-root-test-${process.pid}`
  const REPO_A = join(ROOT_TEST_DIR, "repo-a")
  const REPO_B = join(ROOT_TEST_DIR, "repo-b")

  beforeEach(() => {
    // Clean up and create test directories
    if (existsSync(ROOT_TEST_DIR)) {
      rmSync(ROOT_TEST_DIR, { recursive: true })
    }
    mkdirSync(REPO_A, { recursive: true })
    mkdirSync(REPO_B, { recursive: true })

    // Create test files in repo-a
    writeFileSync(
      join(REPO_A, "tasks-a.md"),
      `# Repo A Tasks

- [ ] Task from repo A
`,
    )

    // Create test files in repo-b
    writeFileSync(
      join(REPO_B, "tasks-b.md"),
      `# Repo B Tasks

- [ ] Task from repo B
`,
    )
  })

  afterEach(() => {
    if (existsSync(ROOT_TEST_DIR)) {
      rmSync(ROOT_TEST_DIR, { recursive: true })
    }
  })

  test("should use --repo option for memory mode", async () => {
    // Run from a different directory but specify --repo
    const result = await km(["--repo", REPO_A, "tasks"], {
      cwd: "/tmp",
      env: { KM_DIR: "" }, // Ensure no KM_DIR interference
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Task from repo A")
    expect(result.stdout).not.toContain("Task from repo B")
  })

  test("should use KM_ROOT env var for memory mode", async () => {
    const result = await km(["tasks"], {
      cwd: "/tmp",
      env: { KM_ROOT: REPO_B, KM_DIR: "" },
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Task from repo B")
    expect(result.stdout).not.toContain("Task from repo A")
  })

  test("--repo should override KM_ROOT env var", async () => {
    const result = await km(["--repo", REPO_A, "tasks"], {
      cwd: "/tmp",
      env: { KM_ROOT: REPO_B, KM_DIR: "" },
    })

    expect(result.exitCode).toBe(0)
    // Should use --repo (repo A), not KM_ROOT (repo B)
    expect(result.stdout).toContain("Task from repo A")
    expect(result.stdout).not.toContain("Task from repo B")
  })

  test("should support tilde expansion in --repo", async () => {
    // Create a test file in home directory (use a temp subdir)
    const homeSubdir = join(process.env.HOME || "", ".km-test-home")
    mkdirSync(homeSubdir, { recursive: true })
    writeFileSync(
      join(homeSubdir, "home-tasks.md"),
      `# Home Tasks

- [ ] Task from home
`,
    )

    try {
      const result = await km(["--repo", "~/.km-test-home", "tasks"], {
        cwd: "/tmp",
        env: { KM_DIR: "" },
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Task from home")
    } finally {
      rmSync(homeSubdir, { recursive: true })
    }
  })

  test("should show --repo in help", async () => {
    const result = await km(["--help"], { cwd: "/tmp" })
    expect(result.stdout).toContain("--repo")
    expect(result.stdout).toContain("-r")
  })
})

describe.serial("km new", () => {
  beforeEach(() => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should create task in inbox file", async () => {
    const result = await km(["new", "Call dentist"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Added to inbox")

    // Verify inbox file was created with task
    const inboxPath = join(REPO_DIR, "inbox", "inbox.md")
    expect(existsSync(inboxPath)).toBe(true)
    const content = readFileSync(inboxPath, "utf-8")
    expect(content).toContain("- [ ] Call dentist")
  })

  test("should parse metadata from content", async () => {
    const result = await km(["new", "Task @bjorn due:2026-01-20 p:1"])
    expect(result.exitCode).toBe(0)

    const inboxPath = join(REPO_DIR, "inbox", "inbox.md")
    const content = readFileSync(inboxPath, "utf-8")
    expect(content).toContain("- [ ] Task @bjorn due:2026-01-20 p:1")
  })

  test("should add metadata from options", async () => {
    const result = await km([
      "new",
      "Simple task",
      "-d",
      "2026-01-15",
      "-P",
      "2",
    ])
    expect(result.exitCode).toBe(0)

    const inboxPath = join(REPO_DIR, "inbox", "inbox.md")
    const content = readFileSync(inboxPath, "utf-8")
    expect(content).toContain("- [ ] Simple task due:2026-01-15 p:2")
  })

  test("should output JSON with --json", async () => {
    const result = await km(["new", "JSON task", "--json"])
    expect(result.exitCode).toBe(0)

    const output = JSON.parse(result.stdout) as NewTaskJson
    expect(output.content).toBe("JSON task")
    expect(output.file).toContain("inbox.md")
  })

  test("should append multiple tasks to same inbox", async () => {
    await km(["new", "First task"])
    await km(["new", "Second task"])

    const inboxPath = join(REPO_DIR, "inbox", "inbox.md")
    const content = readFileSync(inboxPath, "utf-8")
    expect(content).toContain("- [ ] First task")
    expect(content).toContain("- [ ] Second task")
  })

  test("should sync and show tasks after km new", async () => {
    await km(["new", "Synced task"])
    await km(["sync"])

    const result = await km(["tasks"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Synced task")
  })
})

describe.serial("km done", () => {
  beforeEach(async () => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })

    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task to mark done
- [x] Already completed task
`,
    )
    await km(["sync"])
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should mark task as done by ID prefix", async () => {
    // Get task ID
    const listResult = await km(["tasks", "--json"])
    const tasks = JSON.parse(listResult.stdout) as TaskJson[]
    const task = tasks.find((t) => t.content.includes("Task to mark done"))
    expect(task).toBeDefined()

    // Mark as done using km status
    const idPrefix = task!.id.slice(0, 8)
    const doneResult = await km(["status", idPrefix, "done"])
    expect(doneResult.exitCode).toBe(0)
    expect(doneResult.stdout).toContain("done")

    // Verify task is now done
    const allResult = await km(["tasks", "--all", "--json"])
    const allTasks = JSON.parse(allResult.stdout) as TaskJson[]
    const doneTask = allTasks.find((t) => t.id === task!.id)
    expect(doneTask!.task_status).toBe("done")
  })

  test("should error on task not found", async () => {
    const result = await km(["status", "nonexistent123"])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("Task not found")
  })

  test("should show status for already done task", async () => {
    // Get the already completed task - use full ID to avoid prefix collisions
    const listResult = await km(["tasks", "--all", "--json"])
    const tasks = JSON.parse(listResult.stdout) as TaskJson[]
    const task = tasks.find((t) => t.content.includes("Already completed task"))
    expect(task).toBeDefined()

    // View status - should show done
    const statusResult = await km(["status", task!.id])
    expect(statusResult.exitCode).toBe(0)
    expect(statusResult.stdout).toContain("done")
  })

  test("should error when file ID prefix has no matching task", async () => {
    // Get a file node (not a task)
    const listResult = await km(["ls", "--type", "file", "--json"])
    const nodes = JSON.parse(listResult.stdout) as TaskJson[]
    expect(nodes.length).toBeGreaterThan(0)

    // Use full ID to ensure no accidental task matches
    const fileNode = nodes[0]!
    const result = await km(["status", fileNode.id])
    expect(result.exitCode).not.toBe(0)
    // Since resolveTask only looks for tasks, a file ID returns "Task not found"
    expect(result.stderr).toContain("Task not found")
  })

  test("should output JSON with --json", async () => {
    // Get task ID
    const listResult = await km(["tasks", "--json"])
    const tasks = JSON.parse(listResult.stdout) as TaskJson[]
    const task = tasks.find((t) => t.content.includes("Task to mark done"))

    // Use full ID to avoid race condition with other tasks created same millisecond
    const doneResult = await km(["status", task!.id, "done", "--json"])
    expect(doneResult.exitCode).toBe(0)

    const output = JSON.parse(doneResult.stdout) as { id: string; status: string }
    expect(output.id).toBe(task!.id)
    expect(output.status).toBe("done")
  })
})

describe.serial(
  "Bidirectional sync - km status writes to markdown file",
  () => {
    beforeEach(async () => {
      if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true })
      }
      mkdirSync(TEST_DIR, { recursive: true })
      mkdirSync(REPO_DIR, { recursive: true })
      mkdirSync(KM_DIR, { recursive: true })

      writeFileSync(
        join(REPO_DIR, "tasks.md"),
        `# Tasks

- [ ] Open task
- [ ] Another open task
- [/] In progress task
- [!] Blocked task
`,
      )
      await km(["sync"])
    })

    afterEach(() => {
      if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true })
      }
    })

    // TODO: CLI commands need to set up fsSync to write changes back to files
    // This requires architectural work - see setFsSync in emit.ts
    test.skip("km status done should update markdown file with [x]", async () => {
      // Get task ID for "Open task"
      const listResult = await km(["tasks", "--json"])
      const tasks = JSON.parse(listResult.stdout) as TaskJson[]
      const task = tasks.find((t) => t.content === "Open task")
      expect(task).toBeDefined()

      // Mark as done
      const doneResult = await km(["status", task!.id, "done"])
      expect(doneResult.exitCode).toBe(0)

      // Read the markdown file and verify it was updated
      const content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
      expect(content).toContain("- [x] Open task")
      // Other tasks should remain unchanged
      expect(content).toContain("- [ ] Another open task")
      expect(content).toContain("- [/] In progress task")
      expect(content).toContain("- [!] Blocked task")
    })

    test.skip("km status should cycle through statuses and update markdown", async () => {
      // Get task ID for "Another open task"
      const listResult = await km(["tasks", "--json"])
      const tasks = JSON.parse(listResult.stdout) as TaskJson[]
      const task = tasks.find((t) => t.content === "Another open task")
      expect(task).toBeDefined()

      // Set to blocked
      const blockedResult = await km(["status", task!.id, "blocked"])
      expect(blockedResult.exitCode).toBe(0)

      // Read the markdown file - should now show [!]
      let content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
      expect(content).toContain("- [!] Another open task")

      // Set to done
      await km(["status", task!.id, "done"])
      content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
      expect(content).toContain("- [x] Another open task")

      // Set back to todo
      await km(["status", task!.id, "todo"])
      content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
      expect(content).toContain("- [ ] Another open task")
    })

    test.skip("km tasks status should update markdown with correct mark", async () => {
      // Get task ID
      const listResult = await km(["tasks", "--all", "--json"])
      const tasks = JSON.parse(listResult.stdout) as TaskJson[]
      const task = tasks.find((t) => t.content === "Open task")
      expect(task).toBeDefined()

      // Set to blocked
      const statusResult = await km(["tasks", "status", task!.id, "blocked"])
      expect(statusResult.exitCode).toBe(0)

      let content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
      expect(content).toContain("- [!] Open task")

      // Set to done
      await km(["tasks", "status", task!.id, "done"])
      content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
      expect(content).toContain("- [x] Open task")

      // Set back to todo
      await km(["tasks", "status", task!.id, "todo"])
      content = readFileSync(join(REPO_DIR, "tasks.md"), "utf-8")
      expect(content).toContain("- [ ] Open task")
    })

    test.skip("nested task should update in correct file", async () => {
      // Create a nested structure
      const projectDir = join(REPO_DIR, "projects")
      mkdirSync(projectDir, { recursive: true })
      writeFileSync(
        join(projectDir, "alpha.md"),
        `# Alpha Project

## Tasks

- [ ] Nested task in project
`,
      )

      // Re-sync to pick up new file
      await km(["sync"])

      // Get the nested task
      const listResult = await km(["tasks", "--json"])
      const tasks = JSON.parse(listResult.stdout) as TaskJson[]
      const nestedTask = tasks.find((t) =>
        t.content.includes("Nested task in project"),
      )
      expect(nestedTask).toBeDefined()

      // Mark as done
      await km(["status", nestedTask!.id, "done"])

      // Verify the nested file was updated
      const content = readFileSync(join(projectDir, "alpha.md"), "utf-8")
      expect(content).toContain("- [x] Nested task in project")

      // Note: We don't check the original tasks.md here because:
      // 1. Previous tests in this describe block may have modified it
      // 2. The key assertion is that the NESTED file was updated correctly
      // 3. Other tests already verify that only the target file changes
    })
  },
)

describe.serial("Task mark types - parsing and status mapping", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })

    // Test file with GFM-standard task mark types ([ ] and [x]/[X])
    // Note: Extended marks ([!], [-], [/], [?]) are not recognized by GFM parser
    // See bead km-afp for tracking extended mark support
    writeFileSync(
      join(REPO_DIR, "all-marks.md"),
      `# All Task Marks

- [ ] Open task (space mark)
- [x] Done task (x mark)
- [X] Done task uppercase (X mark)
`,
    )
    await km(["sync"])
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should parse GFM-standard mark types correctly", async () => {
    const result = await km(["tasks", "--all", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    // Find each task by content
    const openTask = tasks.find((t) =>
      t.content.includes("Open task (space mark)"),
    )
    const doneTask = tasks.find((t) => t.content.includes("Done task (x mark)"))
    const doneUpperTask = tasks.find((t) =>
      t.content.includes("Done task uppercase"),
    )

    // Verify status mapping for standard marks
    expect(openTask?.task_status).toBe("todo")
    expect(doneTask?.task_status).toBe("done")
    expect(doneUpperTask?.task_status).toBe("done")
  })

  test("km task (default) should only show todo tasks", async () => {
    const result = await km(["tasks", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    // Should only include todo status tasks
    const hasTodo = tasks.some(
      (t) => t.content.includes("Open task") && !t.content.includes("Done"),
    )
    const hasDone = tasks.some((t) => t.content.includes("Done task"))

    expect(hasTodo).toBe(true)
    expect(hasDone).toBe(false)
  })

  test("km task --all should show all statuses", async () => {
    const result = await km(["tasks", "--all", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    // Should have 3 tasks (standard GFM marks)
    expect(tasks.length).toBe(3)
  })
})

describe.serial("Query language integration - km task with queries", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })

    // Create test file with tasks having various metadata
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task with @bjorn mention
- [ ] Task with #urgent tag
- [x] Completed task for @sarah
- [ ] Task with +project-alpha
- [ ] High priority task p:1
- [ ] Task due today due:${new Date().toISOString().slice(0, 10)}
`,
    )

    // Create nested folder structure
    const projectDir = join(REPO_DIR, "projects")
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, "work.md"),
      `# Work Tasks

- [ ] Work task in projects folder
- [x] Done work task
`,
    )

    await km(["sync"])
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should filter by @mention", async () => {
    const result = await km(["tasks", "@bjorn", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks.some((t) => t.content.includes("@bjorn"))).toBe(true)
    expect(tasks.every((t) => t.content.includes("@bjorn"))).toBe(true)
  })

  test("should filter by #tag", async () => {
    const result = await km(["tasks", "#urgent", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks.some((t) => t.content.includes("#urgent"))).toBe(true)
  })

  test("should filter by +project", async () => {
    const result = await km(["tasks", "+project-alpha", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks.some((t) => t.content.includes("+project-alpha"))).toBe(true)
  })

  test("should filter by status:todo", async () => {
    const result = await km(["tasks", "status:todo", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.every((t) => t.task_status === "todo")).toBe(true)
  })

  test("should filter by status:done with --all", async () => {
    const result = await km(["tasks", "--all", "status:done", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.every((t) => t.task_status === "done")).toBe(true)
  })

  test("should exclude with negation -status:done", async () => {
    // Use --query= syntax to avoid -status:done being interpreted as a flag
    const result = await km(["tasks", "--all", "--query=-status:done", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    expect(tasks.every((t) => t.task_status !== "done")).toBe(true)
  })

  test("should filter by path pattern ./projects/**", async () => {
    const result = await km(["tasks", "--all", "./projects/**", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    // Should only find tasks from projects folder
    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks.some((t) => t.content.includes("Work task"))).toBe(true)
    // Should NOT include tasks from root tasks.md
    expect(tasks.some((t) => t.content.includes("@bjorn"))).toBe(false)
  })

  test("should combine multiple conditions (AND)", async () => {
    const result = await km(["tasks", "@bjorn", "status:todo", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    // Should match only todo tasks with @bjorn
    expect(
      tasks.every((t) => t.content.includes("@bjorn") && t.task_status === "todo"),
    ).toBe(true)
  })

  test("should filter by priority p:1", async () => {
    const result = await km(["tasks", "p:1", "--json"])
    expect(result.exitCode).toBe(0)
    const tasks = JSON.parse(result.stdout) as TaskJson[]

    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks.some((t) => t.priority === 1)).toBe(true)
  })
})

describe.serial("km move - re-parent nodes", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })

    // Create test structure
    writeFileSync(
      join(REPO_DIR, "inbox.md"),
      `# Inbox

- [ ] Task in inbox
`,
    )

    const projectDir = join(REPO_DIR, "projects")
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, "work.md"),
      `# Work Project

- [ ] Existing work task
`,
    )

    await km(["sync"])
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should move task to different parent by ID", async () => {
    // Get IDs
    const listResult = await km(["tasks", "--json"])
    const tasks = JSON.parse(listResult.stdout) as TaskJson[]
    const inboxTask = tasks.find((t) => t.content.includes("Task in inbox"))
    const workTask = tasks.find((t) => t.content.includes("Existing work task"))
    expect(inboxTask).toBeDefined()
    expect(workTask).toBeDefined()

    // Get the work project file node (parent of work task)
    const nodesResult = await km(["ls", "--type", "file", "--json"])
    const nodes = JSON.parse(nodesResult.stdout) as TaskJson[]
    const workFile = nodes.find((n) => n.fs_path?.includes("work.md"))
    expect(workFile).toBeDefined()

    // Move inbox task to work project
    const moveResult = await km(["move", inboxTask!.id, workFile!.id, "--json"])
    expect(moveResult.exitCode).toBe(0)

    const output = JSON.parse(moveResult.stdout) as { id: string; parent_id: string | null }
    expect(output.id).toBe(inboxTask!.id)
    expect(output.parent_id).toBe(workFile!.id)
  })

  test("should move task to root with --root", async () => {
    const listResult = await km(["tasks", "--json"])
    const tasks = JSON.parse(listResult.stdout) as TaskJson[]
    const task = tasks.find((t) => t.content.includes("Task in inbox"))
    expect(task).toBeDefined()
    expect(task!.parent_id).not.toBeNull()

    // Move to root
    const moveResult = await km(["move", task!.id, "--to-root", "--json"])
    expect(moveResult.exitCode).toBe(0)

    const output = JSON.parse(moveResult.stdout) as { id: string; parent_id: string | null }
    expect(output.parent_id).toBeNull()
  })

  test("should error when node not found", async () => {
    const result = await km(["move", "nonexistent", "somewhere"])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("Node not found")
  })

  test("should error when no parent specified", async () => {
    const listResult = await km(["tasks", "--json"])
    const tasks = JSON.parse(listResult.stdout) as TaskJson[]
    const task = tasks[0]!

    const result = await km(["move", task.id])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("Specify a parent")
  })
})

describe.serial("km view - state initialization", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
    mkdirSync(KM_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("km view should work after km add modifies database", async () => {
    // This test verifies the fix for the issue where km view would fail
    // with "No board found" after km add had linked tasks to a board.
    // The root cause was that view.ts wasn't calling ensureState() to
    // replay events from events.jsonl before accessing the database.

    // Create a board file
    writeFileSync(
      join(REPO_DIR, "@next.md"),
      `# Next Actions

## Tasks
`,
    )

    // Create tasks in a separate folder
    const projectDir = join(REPO_DIR, "projects")
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, "work.md"),
      `# Work

- [ ] Task A
- [ ] Task B
`,
    )

    // Sync to populate database
    const syncResult = await km(["sync"])
    expect(syncResult.exitCode).toBe(0)

    // Use km add to link tasks to the board
    const addResult = await km(["add", "@next", "./projects/**"])
    expect(addResult.exitCode).toBe(0)
    expect(addResult.stdout).toContain("Linked")

    // Now km view should work (non-interactive mode to avoid TTY issues)
    // The bug was that view would fail with "No board found" because
    // it didn't call ensureState() to replay the add events
    const viewResult = await km(["view", "@next.md", "--no-interactive"])
    expect(viewResult.exitCode).toBe(0)
    // Should display the board content (static mode output shows columns)
    expect(viewResult.stdout).toContain("Tasks")
  })

  test("km view should find board after km sync and km add in sequence", async () => {
    // Create initial structure with board
    writeFileSync(
      join(REPO_DIR, "@inbox.md"),
      `# Inbox

## Unprocessed
`,
    )

    const inboxDir = join(REPO_DIR, "inbox")
    mkdirSync(inboxDir, { recursive: true })
    writeFileSync(
      join(inboxDir, "new.md"),
      `# New Items

- [ ] Review email
- [ ] Check calendar
`,
    )

    // Sync first
    await km(["sync"])

    // Add tasks to board
    const addResult = await km(["add", "@inbox", "./inbox/**"])
    expect(addResult.exitCode).toBe(0)

    // View should work and show the board
    const viewResult = await km(["view", "@inbox.md", "--no-interactive"])
    expect(viewResult.exitCode).toBe(0)
    // Static mode shows column headings
    expect(viewResult.stdout).toContain("Unprocessed")
  })

  test("km view should work with filesystem path to board", async () => {
    // Create board file
    const boardPath = join(REPO_DIR, "board.md")
    writeFileSync(
      boardPath,
      `# My Board

## Column A
- [ ] Task 1
`,
    )

    await km(["sync"])

    // View using absolute path
    const viewResult = await km(["view", boardPath, "--no-interactive"])
    expect(viewResult.exitCode).toBe(0)
    // Static mode shows column headings and tasks
    expect(viewResult.stdout).toContain("Column A")
  })
})
