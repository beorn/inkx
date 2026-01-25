/**
 * Round-trip Content Preservation Tests
 *
 * Tests that content is preserved through the parse → DB → serialize cycle.
 * This is critical for ensuring no silent data loss during sync operations.
 */

import { describe, test, expect } from "bun:test"
import { parseMarkdownToNodes, nodesToMarkdown } from "@km/markdown"
import { SeededRandom } from "./seeded-random.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize whitespace for comparison.
 * - Trims trailing whitespace
 * - Collapses multiple blank lines into single blank lines (semantically equivalent in markdown)
 */
function normalize(content: string): string {
  return (
    content
      .replace(/\n{3,}/g, "\n\n") // Collapse 3+ newlines to 2
      .trim() + "\n"
  )
}

/**
 * Test round-trip: parse → serialize → compare
 */
function verifyRoundtrip(
  original: string,
  path: string = "/test.md",
): { passed: boolean; original: string; regenerated: string } {
  const nodes = parseMarkdownToNodes(original, path)
  const regenerated = nodesToMarkdown(nodes)

  return {
    passed: normalize(original) === normalize(regenerated),
    original: normalize(original),
    regenerated: normalize(regenerated),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe("Round-trip Content Preservation", () => {
  describe("Simple Content", () => {
    test("empty file round-trips", () => {
      const content = ""
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("simple heading round-trips", () => {
      const content = "# Tasks\n"
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("simple task round-trips", () => {
      const content = "# Tasks\n\n- [ ] Task 1\n"
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("completed task round-trips", () => {
      const content = "# Tasks\n\n- [x] Done task\n"
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("multiple tasks round-trip", () => {
      const content = `# Tasks

- [ ] Task 1
- [x] Task 2
- [ ] Task 3
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })
  })

  describe("Complex Content", () => {
    test("nested sections round-trip", () => {
      const content = `# Project

## Phase 1

- [ ] Task A
- [ ] Task B

## Phase 2

- [ ] Task C
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("deeply nested headings round-trip", () => {
      const content = `# Level 1

## Level 2

### Level 3

#### Level 4

- [ ] Deep task
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("mixed content round-trips", () => {
      const content = `# Project Notes

Some paragraph text here.

## Tasks

- [ ] First task
- [x] Second task

## Notes

More paragraph text.

- Regular list item
- Another item
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })
  })

  describe("Task Metadata", () => {
    test("task with due date round-trips", () => {
      const content = `# Tasks

- [ ] Task with due date @due(2024-01-15)
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("task with priority round-trips", () => {
      const content = `# Tasks

- [ ] !!! High priority task
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("task with tags round-trips", () => {
      const content = `# Tasks

- [ ] Task with #tag1 and #tag2
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("task with mentions round-trips", () => {
      const content = `# Tasks

- [ ] Task for @alice and @bob
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("task with project round-trips", () => {
      const content = `# Tasks

- [ ] Task for +project-name
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })
  })

  describe("Frontmatter", () => {
    test("simple frontmatter round-trips", () => {
      const content = `---
tags:
  - test
---

# Document

- [ ] Task
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("complex frontmatter round-trips", () => {
      const content = `---
title: My Document
tags:
  - project
  - work
priority: high
custom_field: value
---

# Tasks

- [ ] Task 1
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })
  })

  describe("Wiki Links", () => {
    test("simple wiki link round-trips", () => {
      const content = `# Notes

See [[Other Note]] for details.

- [ ] Task with [[link]]
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("wiki link with alias round-trips", () => {
      const content = `# Notes

See [[Other Note|custom text]] for details.
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })
  })

  describe("Edge Cases", () => {
    test("file with only whitespace", () => {
      const content = "   \n\n   \n"
      const result = verifyRoundtrip(content)
      // Whitespace-only files may normalize differently
      expect(result.regenerated.trim()).toBe("")
    })

    test("task with special characters", () => {
      const content = `# Tasks

- [ ] Task with "quotes" and 'apostrophes'
- [ ] Task with <brackets> and &ampersand
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("unicode content round-trips", () => {
      const content = `# 任务列表

- [ ] 完成项目 🎯
- [ ] 日本語タスク
- [ ] Tâche française
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })

    test("code blocks round-trip", () => {
      const content = `# Notes

\`\`\`javascript
const x = 1;
\`\`\`

- [ ] Review code
`
      const result = verifyRoundtrip(content)
      expect(result.passed).toBe(true)
    })
  })

  describe("Fuzz Testing", () => {
    test("random simple files round-trip", () => {
      const random = new SeededRandom(12345)
      const failures: string[] = []

      for (let i = 0; i < 50; i++) {
        const content = generateRandomSimpleFile(random)
        const result = verifyRoundtrip(content, `/test-${i}.md`)

        if (!result.passed) {
          failures.push(
            `File ${i}:\nOriginal:\n${result.original}\nRegenerated:\n${result.regenerated}`,
          )
        }
      }

      if (failures.length > 0) {
        console.log(`Failed ${failures.length}/50 round-trips:`)
        console.log(failures.slice(0, 3).join("\n---\n"))
      }

      expect(failures.length).toBe(0)
    })

    test("random complex files round-trip", () => {
      const random = new SeededRandom(67890)
      const failures: string[] = []

      for (let i = 0; i < 20; i++) {
        const content = generateRandomComplexFile(random)
        const result = verifyRoundtrip(content, `/complex-${i}.md`)

        if (!result.passed) {
          failures.push(
            `File ${i}:\nOriginal:\n${result.original}\nRegenerated:\n${result.regenerated}`,
          )
        }
      }

      if (failures.length > 0) {
        console.log(`Failed ${failures.length}/20 round-trips:`)
        console.log(failures.slice(0, 3).join("\n---\n"))
      }

      expect(failures.length).toBe(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Random Content Generators
// ─────────────────────────────────────────────────────────────────────────────

function generateRandomSimpleFile(random: SeededRandom): string {
  const taskCount = random.nextInt(1, 6)
  const lines: string[] = ["# Tasks", ""]

  for (let i = 0; i < taskCount; i++) {
    const status = random.chance(0.3) ? "x" : " "
    const text = `Task ${i + 1}`
    lines.push(`- [${status}] ${text}`)
  }

  return lines.join("\n") + "\n"
}

function generateRandomComplexFile(random: SeededRandom): string {
  const lines: string[] = []

  // Maybe frontmatter
  if (random.chance(0.3)) {
    lines.push("---")
    lines.push("tags:")
    lines.push("  - generated")
    lines.push("---")
    lines.push("")
  }

  // H1 heading
  lines.push("# " + randomWord(random))
  lines.push("")

  // Random sections
  const sectionCount = random.nextInt(1, 4)
  for (let s = 0; s < sectionCount; s++) {
    lines.push("## " + randomWord(random))
    lines.push("")

    // Random tasks in section
    const taskCount = random.nextInt(0, 5)
    for (let t = 0; t < taskCount; t++) {
      const status = random.chance(0.3) ? "x" : " "
      let task = `- [${status}] ${randomWord(random)}`

      // Maybe add metadata
      if (random.chance(0.2)) {
        task += ` #${randomWord(random)}`
      }
      if (random.chance(0.1)) {
        task += ` @due(2024-0${random.nextInt(1, 10)}-15)`
      }

      lines.push(task)
    }

    lines.push("")
  }

  return lines.join("\n")
}

function randomWord(random: SeededRandom): string {
  const words = [
    "alpha",
    "beta",
    "gamma",
    "delta",
    "epsilon",
    "project",
    "task",
    "review",
    "complete",
    "pending",
    "urgent",
    "normal",
    "low",
    "high",
    "medium",
  ]
  return words[random.nextInt(0, words.length)]!
}
