/**
 * Property-based fuzz tests for markdown roundtrip fidelity
 *
 * Key properties tested:
 * 1. Idempotency — roundtrip(roundtrip(md)) === roundtrip(md)
 * 2. Content preservation — text content survives parse/serialize
 * 3. Structure preservation — node types and counts are stable
 */

import { test, describe, expect, gen, take, type SeededRandom } from "vimonkey"
import { roundtrip, parse, normalizeMarkdown } from "./helpers/test-utils.ts"

// ---------------------------------------------------------------------------
// Markdown fragment generators
// ---------------------------------------------------------------------------

/** Safe alphanumeric words that won't be parsed as markdown syntax */
const WORDS = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
  "mike",
  "november",
  "oscar",
  "papa",
  "quebec",
  "romeo",
  "sierra",
  "tango",
]

/** Generate a random phrase (2-5 words) */
function randomPhrase(rng: SeededRandom): string {
  const count = rng.int(2, 5)
  return rng.shuffle(WORDS).slice(0, count).join(" ")
}

/** Generate a random heading (h1-h4) */
function randomHeading(rng: SeededRandom): string {
  const level = rng.int(1, 4)
  return `${"#".repeat(level)} ${randomPhrase(rng)}\n`
}

/** Generate a random task with optional properties */
function randomTask(rng: SeededRandom): string {
  const markers = [" ", "x", "/"]
  const marker = rng.pick(markers)
  const content = randomPhrase(rng)

  // Optionally add inline properties
  let props = ""
  if (rng.bool(0.4)) {
    const propTypes = [
      () => `status:: ${rng.pick(["active", "pending", "done"])}`,
      () => `priority:: P${rng.int(1, 5)}`,
      () => `due:: 2026-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
      () => `owner:: [[${rng.pick(WORDS)}]]`,
    ]
    const propCount = rng.int(1, 2)
    const chosen = rng.shuffle(propTypes).slice(0, propCount)
    props = " " + chosen.map((fn) => fn()).join(" ")
  }

  return `- [${marker}] ${content}${props}\n`
}

/** Generate a random blockquote */
function randomBlockquote(rng: SeededRandom): string {
  const lines = rng.int(1, 3)
  return Array.from({ length: lines }, () => `> ${randomPhrase(rng)}`).join("\n") + "\n"
}

/** Generate a random code block */
function randomCodeBlock(rng: SeededRandom): string {
  const langs = ["", "typescript", "python", "javascript", "bash"]
  const lang = rng.pick(langs)
  const lines = rng.int(1, 4)
  const code = Array.from({ length: lines }, () => `  ${randomPhrase(rng)}`).join("\n")
  return `\`\`\`${lang}\n${code}\n\`\`\`\n`
}

/** Generate a random unordered list */
function randomList(rng: SeededRandom): string {
  const count = rng.int(2, 5)
  return Array.from({ length: count }, () => `- ${randomPhrase(rng)}`).join("\n") + "\n"
}

/** Generate a paragraph with optional wikilinks */
function randomParagraph(rng: SeededRandom): string {
  let text = randomPhrase(rng)
  if (rng.bool(0.3)) {
    text += ` [[${rng.pick(WORDS)}]]`
  }
  if (rng.bool(0.2)) {
    text += ` [[${rng.pick(WORDS)}|${randomPhrase(rng)}]]`
  }
  return text + "\n"
}

/** Generate a horizontal rule */
function randomHR(): string {
  return "---\n"
}

/** Generate a YAML frontmatter block */
function randomFrontmatter(rng: SeededRandom): string {
  const lines: string[] = ["---"]

  // title (string)
  if (rng.bool(0.7)) {
    lines.push(`title: ${randomPhrase(rng)}`)
  }

  // status (enum)
  if (rng.bool(0.5)) {
    lines.push(`status: ${rng.pick(["active", "pending", "done", "archived", "draft"])}`)
  }

  // priority (P1-P5)
  if (rng.bool(0.4)) {
    lines.push(`priority: P${rng.int(1, 5)}`)
  }

  // tags (array of strings)
  if (rng.bool(0.4)) {
    const tagCount = rng.int(1, 3)
    const tagValues = rng.shuffle(WORDS).slice(0, tagCount)
    lines.push("tags:")
    for (const t of tagValues) {
      lines.push(`  - ${t}`)
    }
  }

  // due (date string)
  if (rng.bool(0.3)) {
    const month = String(rng.int(1, 12)).padStart(2, "0")
    const day = String(rng.int(1, 28)).padStart(2, "0")
    lines.push(`due: 2026-${month}-${day}`)
  }

  lines.push("---")
  return lines.join("\n") + "\n"
}

/** Generate an Obsidian-style embed: ![[filename]], ![[filename#heading]], ![[filename|alias]] */
function randomEmbed(rng: SeededRandom): string {
  const target = rng.pick(WORDS)
  const variant = rng.int(0, 2)
  switch (variant) {
    case 0:
      return `![[${target}]]\n`
    case 1:
      return `![[${target}#${rng.pick(WORDS)}]]\n`
    case 2:
      return `![[${target}|${randomPhrase(rng)}]]\n`
    default:
      return `![[${target}]]\n`
  }
}

/**
 * Generate an inline tag: #tag, #tag-with-dashes
 * Note: nested tags (#nested/tag) are NOT supported by the parser's tag regex,
 * so we only generate simple and hyphenated tags.
 */
function randomTag(rng: SeededRandom): string {
  const variant = rng.int(0, 1)
  switch (variant) {
    case 0:
      return `#${rng.pick(WORDS)}`
    case 1:
      return `#${rng.pick(WORDS)}-${rng.pick(WORDS)}`
    default:
      return `#${rng.pick(WORDS)}`
  }
}

/** Generate a paragraph containing inline tags */
function randomParagraphWithTags(rng: SeededRandom): string {
  const tagCount = rng.int(1, 3)
  const parts = [randomPhrase(rng)]
  for (let i = 0; i < tagCount; i++) {
    parts.push(randomTag(rng))
  }
  return parts.join(" ") + "\n"
}

type FragmentGenerator = (rng: SeededRandom) => string

/** All fragment generators with weights (headings and tasks more common) */
const GENERATORS: Array<[number, FragmentGenerator]> = [
  [20, randomHeading],
  [25, randomTask],
  [8, randomBlockquote],
  [8, randomCodeBlock],
  [8, randomList],
  [8, randomParagraph],
  [4, randomHR],
  [7, randomEmbed],
  [7, randomParagraphWithTags],
  [5, randomFrontmatter],
]

/** Non-frontmatter generators for use inside document body (frontmatter is only valid at document start) */
const BODY_GENERATORS: Array<[number, FragmentGenerator]> = GENERATORS.filter(([, gen]) => gen !== randomFrontmatter)

/** Pick a weighted random body generator (no frontmatter — use only at document level) */
function pickGenerator(rng: SeededRandom): FragmentGenerator {
  const total = BODY_GENERATORS.reduce((sum, [w]) => sum + w, 0)
  let r = rng.float() * total
  for (const [weight, gen] of BODY_GENERATORS) {
    r -= weight
    if (r <= 0) return gen
  }
  return BODY_GENERATORS[BODY_GENERATORS.length - 1]![1]
}

/** Generate a complete markdown document from fragments */
function generateDocument(rng: SeededRandom, fragmentCount: number): string {
  const fragments: string[] = []

  // Optionally start with frontmatter
  if (rng.bool(0.3)) {
    fragments.push(randomFrontmatter(rng))
  }

  // Always have an h1
  fragments.push(`# ${randomPhrase(rng)}\n`)

  for (let i = 0; i < fragmentCount; i++) {
    const generator = pickGenerator(rng)
    fragments.push(generator(rng))
  }

  return fragments.join("\n")
}

/** Extract all text words from markdown (ignoring syntax characters and frontmatter) */
function extractTextWords(md: string): string[] {
  // Strip frontmatter — its content is stored as data, not rendered as text
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, "")
  return body.split(/[\s\n#>|`\-\[\](){}*_~=+!]+/).filter((w) => WORDS.includes(w))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Roundtrip Fuzz: Idempotency", () => {
  test.fuzz("second roundtrip is stable (single fragments)", async () => {
    const fragments = gen(({ random }) => {
      const generator = pickGenerator(random)
      // Wrap in heading context so tasks/lists parse correctly
      return `# Context\n\n${generator(random)}`
    })

    for await (const md of take(fragments, 100)) {
      const rt1 = roundtrip(md)
      const rt2 = roundtrip(rt1)
      expect(normalizeMarkdown(rt2)).toBe(normalizeMarkdown(rt1))
    }
  })

  test.fuzz("second roundtrip is stable (full documents)", async () => {
    const documents = gen(({ random }) => {
      const fragCount = random.int(3, 10)
      return generateDocument(random, fragCount)
    })

    for await (const md of take(documents, 50)) {
      const rt1 = roundtrip(md)
      const rt2 = roundtrip(rt1)
      expect(normalizeMarkdown(rt2)).toBe(normalizeMarkdown(rt1))
    }
  })
})

describe("Roundtrip Fuzz: Content Preservation", () => {
  test.fuzz("text words survive roundtrip", async () => {
    const documents = gen(({ random }) => {
      const fragCount = random.int(3, 8)
      return generateDocument(random, fragCount)
    })

    for await (const md of take(documents, 50)) {
      const output = roundtrip(md)
      const inputWords = extractTextWords(md)
      for (const word of inputWords) {
        expect(output).toContain(word)
      }
    }
  })

  test.fuzz("wikilinks survive roundtrip", async () => {
    const docs = gen(({ random }) => {
      const target = random.pick(WORDS)
      const lines = [`# ${randomPhrase(random)}\n`, `\n`, `${randomPhrase(random)} [[${target}]]\n`]
      return lines.join("")
    })

    for await (const md of take(docs, 100)) {
      const output = roundtrip(md)
      // Extract wikilink targets from input
      const wikilinks = [...md.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g)]
      for (const match of wikilinks) {
        expect(output).toContain(`[[${match[1]}`)
      }
    }
  })

  test.fuzz("inline properties survive roundtrip", async () => {
    const docs = gen(({ random }) => {
      const propName = random.pick(["status", "priority", "owner", "due", "score"])
      const propValue = random.pick([
        random.pick(["active", "pending", "done"]),
        String(random.int(1, 100)),
        `2026-${String(random.int(1, 12)).padStart(2, "0")}-${String(random.int(1, 28)).padStart(2, "0")}`,
        `[[${random.pick(WORDS)}]]`,
      ])
      return `# Test\n\n- [ ] ${randomPhrase(random)} ${propName}:: ${propValue}\n`
    })

    for await (const md of take(docs, 100)) {
      const output = roundtrip(md)
      // Extract the property key:: value from input
      const propMatch = md.match(/(\w+):: (.+)/)
      if (propMatch) {
        expect(output).toContain(`${propMatch[1]}::`)
      }
    }
  })
})

describe("Roundtrip Fuzz: Structure Preservation", () => {
  test.fuzz("node count is stable across roundtrips", async () => {
    const documents = gen(({ random }) => {
      const fragCount = random.int(3, 10)
      return generateDocument(random, fragCount)
    })

    for await (const md of take(documents, 50)) {
      const rt1 = roundtrip(md)
      const nodes1 = parse(rt1)
      const nodes2 = parse(roundtrip(rt1))

      // Same number of nodes after first roundtrip
      expect(nodes2.length).toBe(nodes1.length)

      // Same type distribution
      const types1 = nodes1.map((n) => n.type).sort()
      const types2 = nodes2.map((n) => n.type).sort()
      expect(types2).toEqual(types1)
    }
  })

  test.fuzz("heading count and text are preserved", async () => {
    // The parser normalizes heading levels based on section nesting,
    // so we test count and text content, not exact levels.
    const docs = gen(({ random }) => {
      const headings: string[] = []
      let currentLevel = 1
      headings.push(`# ${randomPhrase(random)}\n`)
      const count = random.int(1, 4)
      for (let i = 0; i < count; i++) {
        const maxLevel = Math.min(currentLevel + 1, 4)
        currentLevel = random.int(1, maxLevel)
        headings.push(`${"#".repeat(currentLevel)} ${randomPhrase(random)}\n`)
      }
      return headings.join("\n")
    })

    for await (const md of take(docs, 100)) {
      const output = roundtrip(md)
      const inputHeadings = [...md.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1]!.trim())
      const outputHeadings = [...output.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1]!.trim())
      // Same number of headings
      expect(outputHeadings.length).toBe(inputHeadings.length)
      // Same text content in same order
      expect(outputHeadings).toEqual(inputHeadings)
    }
  })

  test.fuzz("task markers are preserved", async () => {
    const docs = gen(({ random }) => {
      const markers = random.array(random.int(2, 6), () => random.pick([" ", "x", "/"]))
      const tasks = markers.map((m) => `- [${m}] ${randomPhrase(random)}\n`)
      return `# Tasks\n\n${tasks.join("")}`
    })

    for await (const md of take(docs, 100)) {
      const output = roundtrip(md)
      const inputMarkers = [...md.matchAll(/- \[(.)\]/g)].map((m) => m[1])
      const outputMarkers = [...output.matchAll(/- \[(.)\]/g)].map((m) => m[1])
      expect(outputMarkers).toEqual(inputMarkers)
    }
  })

  test.fuzz("code block language tags are preserved", async () => {
    const docs = gen(({ random }) => {
      const lang = random.pick(["typescript", "python", "javascript", "bash", "go", "rust"])
      const code = randomPhrase(random)
      return `# Code\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`
    })

    for await (const md of take(docs, 100)) {
      const output = roundtrip(md)
      const inputLang = md.match(/```(\w+)/)
      if (inputLang) {
        expect(output).toContain(`\`\`\`${inputLang[1]}`)
      }
    }
  })
})

describe("Roundtrip Fuzz: Edge Patterns", () => {
  test.fuzz("deeply nested headings are stable", async () => {
    const docs = gen(({ random }) => {
      const sections: string[] = []
      for (let level = 1; level <= random.int(2, 4); level++) {
        sections.push(`${"#".repeat(level)} ${randomPhrase(random)}\n`)
        // Add content under each heading
        if (random.bool(0.5)) {
          sections.push(`\n${randomPhrase(random)}\n`)
        }
        if (random.bool(0.5)) {
          sections.push(`\n- [ ] ${randomPhrase(random)}\n`)
        }
      }
      return sections.join("\n")
    })

    for await (const md of take(docs, 50)) {
      const rt1 = roundtrip(md)
      const rt2 = roundtrip(rt1)
      expect(normalizeMarkdown(rt2)).toBe(normalizeMarkdown(rt1))
    }
  })

  test.fuzz("mixed task statuses in one section are stable", async () => {
    const docs = gen(({ random }) => {
      const tasks: string[] = []
      for (const marker of random.shuffle([" ", "x", "/", " ", "x"])) {
        let task = `- [${marker}] ${randomPhrase(random)}`
        // Optionally add a property
        if (random.bool(0.3)) {
          task += ` priority:: P${random.int(1, 5)}`
        }
        tasks.push(task)
      }
      return `# Project\n\n${tasks.join("\n")}\n`
    })

    for await (const md of take(docs, 100)) {
      const rt1 = roundtrip(md)
      const rt2 = roundtrip(rt1)
      expect(normalizeMarkdown(rt2)).toBe(normalizeMarkdown(rt1))
    }
  })

  test.fuzz("multiple properties on one task are stable", async () => {
    const docs = gen(({ random }) => {
      const props = [
        `status:: ${random.pick(["active", "pending"])}`,
        `priority:: P${random.int(1, 5)}`,
        `owner:: [[${random.pick(WORDS)}]]`,
      ]
      const count = random.int(1, 3)
      const chosen = random.shuffle(props).slice(0, count).join(" ")
      return `# Test\n\n- [ ] ${randomPhrase(random)} ${chosen}\n`
    })

    for await (const md of take(docs, 100)) {
      const rt1 = roundtrip(md)
      const rt2 = roundtrip(rt1)
      expect(normalizeMarkdown(rt2)).toBe(normalizeMarkdown(rt1))
    }
  })
})

describe("Roundtrip Fuzz: Frontmatter", () => {
  test.fuzz("frontmatter roundtrips stably", async () => {
    const docs = gen(({ random }) => {
      const fm = randomFrontmatter(random)
      return `${fm}\n# ${randomPhrase(random)}\n\n${randomPhrase(random)}\n`
    })

    for await (const md of take(docs, 100)) {
      const rt1 = roundtrip(md)
      const rt2 = roundtrip(rt1)
      expect(normalizeMarkdown(rt2)).toBe(normalizeMarkdown(rt1))
    }
  })

  test.fuzz("frontmatter keys survive roundtrip", async () => {
    const docs = gen(({ random }) => {
      const keys: Array<{ key: string; value: string }> = []

      if (random.bool(0.7)) keys.push({ key: "title", value: randomPhrase(random) })
      if (random.bool(0.5)) keys.push({ key: "status", value: random.pick(["active", "pending", "done"]) })
      if (random.bool(0.4)) keys.push({ key: "priority", value: `P${random.int(1, 5)}` })
      if (random.bool(0.3)) {
        const month = String(random.int(1, 12)).padStart(2, "0")
        const day = String(random.int(1, 28)).padStart(2, "0")
        keys.push({ key: "due", value: `2026-${month}-${day}` })
      }

      // Ensure at least one key
      if (keys.length === 0) {
        keys.push({ key: "title", value: randomPhrase(random) })
      }

      const yamlLines = keys.map(({ key, value }) => `${key}: ${value}`)
      const fm = `---\n${yamlLines.join("\n")}\n---\n`
      return `${fm}\n# ${randomPhrase(random)}\n`
    })

    for await (const md of take(docs, 100)) {
      const output = roundtrip(md)

      // Extract frontmatter keys from input
      const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
      if (fmMatch) {
        const yamlBody = fmMatch[1]!
        const keyLines = yamlBody.split("\n").filter((l) => l.match(/^\w+:/))
        for (const line of keyLines) {
          const key = line.split(":")[0]!.trim()
          // The key should appear in the output frontmatter
          expect(output).toContain(`${key}:`)
        }
      }
    }
  })
})

describe("Roundtrip Fuzz: Embeds", () => {
  test.fuzz("embed targets survive roundtrip", async () => {
    const docs = gen(({ random }) => {
      const target = random.pick(WORDS)
      const variant = random.int(0, 2)
      let embed: string
      switch (variant) {
        case 0:
          embed = `![[${target}]]`
          break
        case 1:
          embed = `![[${target}#${random.pick(WORDS)}]]`
          break
        case 2:
          embed = `![[${target}|${randomPhrase(random)}]]`
          break
        default:
          embed = `![[${target}]]`
      }
      return `# ${randomPhrase(random)}\n\n${embed}\n`
    })

    for await (const md of take(docs, 100)) {
      const output = roundtrip(md)
      // Extract the embed target from input
      const embedMatch = md.match(/!\[\[([^\]#|]+)/)
      if (embedMatch) {
        expect(output).toContain(`![[${embedMatch[1]}`)
      }
    }
  })

  test.fuzz("embed syntax is preserved across roundtrips", async () => {
    const docs = gen(({ random }) => {
      const embeds: string[] = []
      const count = random.int(1, 4)
      for (let i = 0; i < count; i++) {
        embeds.push(randomEmbed(random))
      }
      return `# ${randomPhrase(random)}\n\n${embeds.join("\n")}`
    })

    for await (const md of take(docs, 50)) {
      const rt1 = roundtrip(md)
      const rt2 = roundtrip(rt1)
      expect(normalizeMarkdown(rt2)).toBe(normalizeMarkdown(rt1))
    }
  })
})

describe("Roundtrip Fuzz: Tags", () => {
  test.fuzz("tags survive roundtrip", async () => {
    const docs = gen(({ random }) => {
      const tag = randomTag(random)
      return `# ${randomPhrase(random)}\n\n${randomPhrase(random)} ${tag}\n`
    })

    for await (const md of take(docs, 100)) {
      const output = roundtrip(md)
      // Extract tags from input (simple #word or #word-word patterns)
      const tags = [...md.matchAll(/#([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_-]+)*)/g)]
      for (const match of tags) {
        expect(output).toContain(`#${match[1]}`)
      }
    }
  })

  test.fuzz("tags in tasks survive roundtrip", async () => {
    const docs = gen(({ random }) => {
      const tag = randomTag(random)
      const marker = random.pick([" ", "x", "/"])
      return `# ${randomPhrase(random)}\n\n- [${marker}] ${randomPhrase(random)} ${tag}\n`
    })

    for await (const md of take(docs, 100)) {
      const output = roundtrip(md)
      // Tags may be extracted into data and reconstructed, but the tag text
      // should appear somewhere in the output
      const tags = [...md.matchAll(/#([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_-]+)*)/g)]
      for (const match of tags) {
        expect(output).toContain(`#${match[1]}`)
      }
    }
  })

  test.fuzz("paragraphs with tags are idempotent", async () => {
    const docs = gen(({ random }) => {
      const para = randomParagraphWithTags(random)
      return `# ${randomPhrase(random)}\n\n${para}`
    })

    for await (const md of take(docs, 100)) {
      const rt1 = roundtrip(md)
      const rt2 = roundtrip(rt1)
      expect(normalizeMarkdown(rt2)).toBe(normalizeMarkdown(rt1))
    }
  })
})
