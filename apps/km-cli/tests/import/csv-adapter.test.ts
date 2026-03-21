/**
 * CSV Import Adapter Tests
 *
 * Tests for: CSV/TSV parsing, column mapping, hierarchy, section grouping,
 * and integration with the convert pipeline.
 */

import { describe, expect, test } from "vitest"
import { parseCSV, parseCSVToImportData } from "../../src/import/adapters/csv-adapter.ts"
import { convert } from "../../src/import/convert.ts"

// ============================================================================
// CSV Parser
// ============================================================================

describe("CSV parser", () => {
  test("parses simple CSV", () => {
    const rows = parseCSV("a,b,c\n1,2,3\n4,5,6")
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ])
  })

  test("handles quoted fields with commas", () => {
    const rows = parseCSV('name,body\n"Task A","Description, with comma"')
    expect(rows).toEqual([
      ["name", "body"],
      ["Task A", "Description, with comma"],
    ])
  })

  test("handles escaped quotes (doubled)", () => {
    const rows = parseCSV('name\n"Task ""quoted"" title"')
    expect(rows).toEqual([["name"], ['Task "quoted" title']])
  })

  test("handles CRLF line endings", () => {
    const rows = parseCSV("a,b\r\n1,2\r\n3,4")
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ])
  })

  test("skips empty rows", () => {
    const rows = parseCSV("a,b\n\n1,2\n\n")
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  test("parses TSV", () => {
    const rows = parseCSV("a\tb\tc\n1\t2\t3", "\t")
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ])
  })
})

// ============================================================================
// Column mapping
// ============================================================================

describe("column mapping", () => {
  test("maps standard column names", () => {
    const csv = "title,status,assignee,due,priority,tags\nDesign page,todo,alice,2026-03-01,P1,design\n"
    const data = parseCSVToImportData(csv)

    expect(data.projects).toHaveLength(1)
    const items = data.projects[0]!.items!
    expect(items).toHaveLength(1)

    const item = items[0]!
    expect(item.title).toBe("Design page")
    expect(item.status).toBe("todo")
    expect(item.assignee).toBe("alice")
    expect(item.dueAt).toBe("2026-03-01")
    expect(item.priority).toBe("P1")
    expect(item.tags).toEqual(["design"])
  })

  test("maps alternative column names (name, description, labels)", () => {
    const csv = 'name,description,labels\nMy task,Some notes,"backend, urgent"\n'
    const data = parseCSVToImportData(csv)
    const item = data.projects[0]!.items![0]!
    expect(item.title).toBe("My task")
    expect(item.body).toBe("Some notes")
    expect(item.tags).toEqual(["backend", "urgent"])
  })

  test("maps 'task' as title column", () => {
    const csv = "task,status\nBuild feature,done\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.title).toBe("Build feature")
    expect(data.projects[0]!.items![0]!.status).toBe("done")
  })

  test("throws on missing title column", () => {
    const csv = "status,assignee\ntodo,alice\n"
    expect(() => parseCSVToImportData(csv)).toThrow("no title column")
  })

  test("maps case-insensitively", () => {
    const csv = "Title,Status,DUE_DATE\nTask,done,2026-01-01\n"
    const data = parseCSVToImportData(csv)
    const item = data.projects[0]!.items![0]!
    expect(item.title).toBe("Task")
    expect(item.status).toBe("done")
    expect(item.dueAt).toBe("2026-01-01")
  })
})

// ============================================================================
// Status normalization
// ============================================================================

describe("status normalization", () => {
  test.each([
    ["todo", "todo"],
    ["To Do", "todo"],
    ["open", "todo"],
    ["pending", "todo"],
    ["done", "done"],
    ["complete", "done"],
    ["Completed", "done"],
    ["closed", "done"],
    ["wip", "wip"],
    ["in progress", "wip"],
    ["In-Progress", "wip"],
    ["doing", "wip"],
    ["blocked", "blocked"],
    ["dropped", "dropped"],
    ["cancelled", "dropped"],
    ["won't fix", "dropped"],
  ])("normalizes '%s' to '%s'", (input, expected) => {
    const csv = `title,status\nTask,${input}\n`
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.status).toBe(expected)
  })

  test("empty status is undefined", () => {
    const csv = "title,status\nTask,\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.status).toBeUndefined()
  })
})

// ============================================================================
// Sections (project/group column)
// ============================================================================

describe("sections from project column", () => {
  test("groups tasks by project column into sections", () => {
    const csv = ["title,project,status", "Task A,To Do,todo", "Task B,To Do,todo", "Task C,Done,done"].join("\n")

    const data = parseCSVToImportData(csv)
    expect(data.projects).toHaveLength(1)
    const project = data.projects[0]!
    expect(project.sections).toHaveLength(2)
    expect(project.sections![0]!.title).toBe("To Do")
    expect(project.sections![0]!.items).toHaveLength(2)
    expect(project.sections![1]!.title).toBe("Done")
    expect(project.sections![1]!.items).toHaveLength(1)
  })

  test("tasks without project go to loose items", () => {
    const csv = ["title,project", "Has project,Backlog", "No project,"].join("\n")
    const data = parseCSVToImportData(csv)
    const project = data.projects[0]!
    expect(project.sections).toHaveLength(1)
    expect(project.items).toHaveLength(1)
    expect(project.items![0]!.title).toBe("No project")
  })

  test("no project column = all tasks as loose items", () => {
    const csv = "title,status\nTask A,todo\nTask B,done\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.sections).toBeUndefined()
    expect(data.projects[0]!.items).toHaveLength(2)
  })
})

// ============================================================================
// Hierarchy (parent column)
// ============================================================================

describe("hierarchy from parent column", () => {
  test("nests children under parent by title", () => {
    const csv = ["title,parent", "Build feature,", "Design UI,Build feature", "Write tests,Build feature"].join("\n")

    const data = parseCSVToImportData(csv)
    const items = data.projects[0]!.items!
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe("Build feature")
    expect(items[0]!.children).toHaveLength(2)
    expect(items[0]!.children![0]!.title).toBe("Design UI")
    expect(items[0]!.children![1]!.title).toBe("Write tests")
  })

  test("orphan parent references stay at top level", () => {
    const csv = ["title,parent", "Task A,Nonexistent parent", "Task B,"].join("\n")
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items).toHaveLength(2)
  })
})

// ============================================================================
// Assignee normalization
// ============================================================================

describe("assignee normalization", () => {
  test("strips @ prefix and lowercases", () => {
    const csv = "title,assignee\nTask,@Alice Smith\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.assignee).toBe("alice-smith")
  })

  test("replaces spaces with dashes", () => {
    const csv = "title,assignee\nTask,Bob Jones\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.assignee).toBe("bob-jones")
  })
})

// ============================================================================
// Tags normalization
// ============================================================================

describe("tags normalization", () => {
  test("splits comma-separated tags and strips #", () => {
    const csv = 'title,tags\nTask,"#design, #frontend"\n'
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.tags).toEqual(["design", "frontend"])
  })

  test("replaces spaces with dashes in tags", () => {
    const csv = 'title,tags\nTask,"my tag, other tag"\n'
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.tags).toEqual(["my-tag", "other-tag"])
  })

  test("empty tags field produces no tags", () => {
    const csv = "title,tags\nTask,\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.tags).toBeUndefined()
  })
})

// ============================================================================
// Priority validation
// ============================================================================

describe("priority", () => {
  test("passes bare digit through as-is", () => {
    const csv = "title,priority\nTask,2\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.priority).toBe("2")
  })

  test("accepts free-form priority string", () => {
    const csv = "title,priority\nTask,high\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.priority).toBe("high")
  })

  test("accepts multi-digit number as string", () => {
    const csv = "title,priority\nTask,99\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.priority).toBe("99")
  })
})

// ============================================================================
// TSV auto-detection
// ============================================================================

describe("TSV auto-detection", () => {
  test("auto-detects tab delimiter", () => {
    const tsv = "title\tstatus\nTask A\ttodo\nTask B\tdone\n"
    const data = parseCSVToImportData(tsv)
    expect(data.projects[0]!.items).toHaveLength(2)
    expect(data.projects[0]!.items![0]!.title).toBe("Task A")
    expect(data.projects[0]!.items![1]!.status).toBe("done")
  })
})

// ============================================================================
// Edge cases
// ============================================================================

describe("edge cases", () => {
  test("empty CSV (headers only) produces no items", () => {
    const csv = "title,status\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects).toHaveLength(1)
    expect(data.projects[0]!.items).toHaveLength(0)
  })

  test("rows without title are skipped", () => {
    const csv = "title,status\nTask A,todo\n,done\nTask B,wip\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items).toHaveLength(2)
    expect(data.projects[0]!.items![0]!.title).toBe("Task A")
    expect(data.projects[0]!.items![1]!.title).toBe("Task B")
  })

  test("completely empty CSV produces no projects", () => {
    const data = parseCSVToImportData("")
    expect(data.projects).toHaveLength(0)
  })

  test("uses filename as project title when available", () => {
    const csv = "title\nTask A\n"
    const data = parseCSVToImportData(csv, "/path/to/my-tasks.csv")
    expect(data.projects[0]!.title).toBe("my-tasks")
  })

  test("uses 'Import' as default project title", () => {
    const csv = "title\nTask A\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.title).toBe("Import")
  })

  test("source is 'csv'", () => {
    const csv = "title\nTask A\n"
    const data = parseCSVToImportData(csv)
    expect(data.source).toBe("csv")
  })

  test("custom id column provides sourceId", () => {
    const csv = "id,title\nMY-001,Task A\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.sourceId).toBe("MY-001")
  })

  test("auto-generates sourceId when no id column", () => {
    const csv = "title\nTask A\nTask B\n"
    const data = parseCSVToImportData(csv)
    expect(data.projects[0]!.items![0]!.sourceId).toMatch(/^csv-/)
    expect(data.projects[0]!.items![1]!.sourceId).toMatch(/^csv-/)
    // Each item has a unique sourceId
    expect(data.projects[0]!.items![0]!.sourceId).not.toBe(data.projects[0]!.items![1]!.sourceId)
  })
})

// ============================================================================
// Integration: CSV → convert → markdown
// ============================================================================

describe("CSV → convert → markdown", () => {
  test("converts CSV to markdown via standard pipeline", () => {
    const csv = [
      "title,status,assignee,tags,priority",
      'Design page,todo,alice,"design, frontend",1',
      "Write tests,done,bob,backend,2",
    ].join("\n")

    const data = parseCSVToImportData(csv)
    const files = convert(data)

    expect(files.size).toBe(1)
    const md = [...files.values()][0]!

    // Frontmatter — imported_from removed (import JSON has that info)
    expect(md).not.toContain("imported_from:")

    // Tasks rendered as headings with task markers
    expect(md).toContain("## [ ] Design page @alice #design #frontend")
    expect(md).toContain("## [x] Write tests @bob #backend")
  })

  test("converts CSV with sections to markdown", () => {
    const csv = ["title,section,status", "Task A,To Do,todo", "Task B,To Do,todo", "Task C,Done,done"].join("\n")

    const data = parseCSVToImportData(csv)
    const files = convert(data)
    const md = [...files.values()][0]!

    expect(md).toContain("## To Do")
    expect(md).toContain("## Done")
    expect(md).toContain("## [ ] Task A")
    expect(md).toContain("## [x] Task C")
  })

  test("converts CSV with hierarchy to markdown", () => {
    const csv = ["title,parent,status", "Epic,, todo", "Sub A,Epic,todo", "Sub B,Epic,done"].join("\n")

    const data = parseCSVToImportData(csv)
    const files = convert(data)
    const md = [...files.values()][0]!

    expect(md).toContain("## [ ] Epic")
    expect(md).toContain("### [ ] Sub A")
    expect(md).toContain("### [x] Sub B")
  })

  test("full-featured CSV produces valid markdown", () => {
    const csv = [
      "title,status,assignee,due,start,priority,tags,section,body",
      'Launch v2,wip,alice,2026-04-01,2026-03-01,1,"launch, critical",Sprint 5,Final preparations',
      "Update docs,todo,bob,2026-03-15,,3,docs,Sprint 5,Write migration guide",
      "Close old bugs,done,,,,,,Sprint 4,",
    ].join("\n")

    const data = parseCSVToImportData(csv)
    const files = convert(data)
    const md = [...files.values()][0]!

    // Sections
    expect(md).toContain("## Sprint 5")
    expect(md).toContain("## Sprint 4")

    // Task with all metadata (depth 3 inside section, wip → [/])
    expect(md).toContain("### [/] Launch v2 @alice #launch #critical")
    expect(md).toContain("Final preparations")

    // Done task (depth 3 inside section)
    expect(md).toContain("### [x] Close old bugs")
  })
})
