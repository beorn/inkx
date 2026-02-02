/**
 * Markdown Parser Benchmarks
 *
 * Measures parse/serialize performance for markdown documents of various sizes and complexities.
 *
 * Run: bun run bench
 *
 * Hardware: [Document your machine here when reporting results]
 */

import { bench, describe, beforeAll } from "vitest"
import { parseMarkdown, nodesToMarkdown } from "@km/markdown"
import { parseMarkdownToNodes } from "@km/markdown"
import type { KNode } from "@km/core"

// ============================================================================
// Test Document Generators
// ============================================================================

/**
 * Simple flat list - common for task lists
 */
function generateFlatList(itemCount: number): string {
  const items = []
  for (let i = 0; i < itemCount; i++) {
    items.push(`- [ ] Task ${i + 1} with some description #tag @person`)
  }
  return items.join("\n")
}

/**
 * Nested list - deep hierarchy
 */
function generateNestedList(depth: number, branchFactor: number): string {
  function generate(currentDepth: number, indent: string): string {
    if (currentDepth === 0) return ""

    const items = []
    for (let i = 0; i < branchFactor; i++) {
      items.push(`${indent}- [ ] Item at depth ${depth - currentDepth + 1}`)
      if (currentDepth > 1) {
        items.push(generate(currentDepth - 1, indent + "  "))
      }
    }
    return items.join("\n")
  }

  return generate(depth, "")
}

/**
 * Rich content - headings, paragraphs, lists, links, formatting
 */
function generateRichDocument(): string {
  return `---
title: Project Plan
tags: [planning, sprint, q1]
---

# Project Overview

This is a comprehensive project plan with **bold** and *italic* text, as well as \`code\`.

## Goals

- [ ] Complete feature implementation [[wikilink]]
- [ ] Write comprehensive tests #testing
- [x] Review with team @alice @bob
  - [ ] Get feedback
  - [ ] Address comments

## Technical Details

Here's a code block:

\`\`\`typescript
function example() {
  return "test"
}
\`\`\`

### Links and References

Check out [this link](https://example.com) and [[another-page]].

## Next Steps

1. First step
2. Second step with #priority
3. Third step @owner
`
}

/**
 * Large document - stress test
 */
function generateLargeDocument(): string {
  const sections = []
  for (let i = 0; i < 50; i++) {
    sections.push(`## Section ${i + 1}

This section contains some text with **formatting** and *emphasis*.

${generateFlatList(20)}

### Subsection ${i + 1}.1

More content here with [[links]] and #tags.
`)
  }
  return `# Large Document\n\n${sections.join("\n\n")}`
}

// ============================================================================
// Benchmarks
// ============================================================================

describe("Markdown Parser Benchmarks", () => {
  describe("Parse (string → AST)", () => {
    let flatList: string
    let nestedList: string
    let richDoc: string
    let largeDoc: string

    beforeAll(() => {
      flatList = generateFlatList(100)
      nestedList = generateNestedList(5, 3) // 3^5 = 243 nodes
      richDoc = generateRichDocument()
      largeDoc = generateLargeDocument()
    })

    bench("Parse flat list (100 items)", () => {
      parseMarkdown(flatList)
    })

    bench("Parse nested list (243 items)", () => {
      parseMarkdown(nestedList)
    })

    bench("Parse rich document", () => {
      parseMarkdown(richDoc)
    })

    bench("Parse large document (50 sections, 1000 items)", () => {
      parseMarkdown(largeDoc)
    })
  })

  describe("Serialize (nodes → markdown)", () => {
    let flatNodes: KNode[]
    let richNodes: KNode[]
    let largeNodes: KNode[]

    beforeAll(() => {
      const flatList = generateFlatList(100)
      const richDoc = generateRichDocument()
      const largeDoc = generateLargeDocument()

      flatNodes = parseMarkdownToNodes(flatList, "test.md")
      richNodes = parseMarkdownToNodes(richDoc, "test.md")
      largeNodes = parseMarkdownToNodes(largeDoc, "test.md")
    })

    bench("Serialize flat list (100 items)", () => {
      nodesToMarkdown(flatNodes)
    })

    bench("Serialize rich document", () => {
      nodesToMarkdown(richNodes)
    })

    bench("Serialize large document", () => {
      nodesToMarkdown(largeNodes)
    })
  })

  describe("Round-trip (parse → serialize)", () => {
    let flatList: string
    let richDoc: string

    beforeAll(() => {
      flatList = generateFlatList(100)
      richDoc = generateRichDocument()
    })

    bench("Round-trip flat list", () => {
      const nodes = parseMarkdownToNodes(flatList, "test.md")
      nodesToMarkdown(nodes)
    })

    bench("Round-trip rich document", () => {
      const nodes = parseMarkdownToNodes(richDoc, "test.md")
      nodesToMarkdown(nodes)
    })
  })

  describe("Regex operations (hot paths)", () => {
    const taskText = "- [x] Complete task #urgent @alice [[link]]"
    const richText =
      "Check [[page1]] and [[page2]] with #tag1 #tag2 and @person1 @person2"

    bench("Extract task mark", () => {
      parseMarkdown(taskText)
    })

    bench("Extract wiki links, tags, mentions", () => {
      parseMarkdown(richText)
    })
  })
})
