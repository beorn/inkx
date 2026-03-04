/**
 * Property-based fuzz tests for markdown roundtrip fidelity
 *
 * Key properties tested:
 * 1. Idempotency — roundtrip(roundtrip(md)) === roundtrip(md)
 * 2. Content preservation — text content survives parse/serialize
 * 3. Structure preservation — node types and counts are stable
 */

import { test, describe, expect, gen, take, type SeededRandom } from "vitestx"
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

type FragmentGenerator = (rng: SeededRandom) => string

/** All fragment generators with weights (headings and tasks more common) */
const GENERATORS: Array<[number, FragmentGenerator]> = [
  [25, randomHeading],
  [30, randomTask],
  [10, randomBlockquote],
  [10, randomCodeBlock],
  [10, randomList],
  [10, randomParagraph],
  [5, randomHR],
]

/** Pick a weighted random generator */
function pickGenerator(rng: SeededRandom): FragmentGenerator {
  const total = GENERATORS.reduce((sum, [w]) => sum + w, 0)
  let r = rng.float() * total
  for (const [weight, gen] of GENERATORS) {
    r -= weight
    if (r <= 0) return gen
  }
  return GENERATORS[GENERATORS.length - 1][1]
}

/** Generate a complete markdown document from fragments */
function generateDocument(rng: SeededRandom, fragmentCount: number): string {
  // Always start with an h1
  const fragments: string[] = [`# ${randomPhrase(rng)}\n`]

  for (let i = 0; i < fragmentCount; i++) {
    const generator = pickGenerator(rng)
    fragments.push(generator(rng))
  }

  return fragments.join("\n")
}

/** Extract all text words from markdown (ignoring syntax characters) */
function extractTextWords(md: string): string[] {
  return md.split(/[\s\n#>|`\-\[\](){}*_~=+!]+/).filter((w) => WORDS.includes(w))
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
      const inputHeadings = [...md.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim())
      const outputHeadings = [...output.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim())
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
