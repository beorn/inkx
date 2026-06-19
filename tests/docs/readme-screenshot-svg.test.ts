import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const repoRoot = resolve(import.meta.dirname, "../..")

describe("README screenshot SVGs", () => {
  test("counter screenshot uses deterministic geometry instead of whitespace-dependent borders", () => {
    const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8")
    const screenshotPaths = [
      "docs/public/screenshots/counter.svg",
      "docs/public/screenshots/counter-readme.svg",
      "docs/public/screenshots/counter-readme-frame.svg",
    ]

    expect(readme).toContain("docs/public/screenshots/counter-readme-frame.svg")

    for (const screenshotPath of screenshotPaths) {
      const svg = readFileSync(resolve(repoRoot, screenshotPath), "utf8")

      expect(svg).toContain('xml:space="preserve"')
      expect(svg).toContain(
        '<rect x="0" y="0" width="260.4" height="72" rx="3" ry="3" fill="none" stroke="#e6edf3" stroke-width="1.5"/>',
      )
      expect(svg).toContain('<tspan x="81.2">to increment</tspan>')
      expect(svg).toContain('<rect x="198" y="38" width="8.4" height="18"')
      expect(svg).not.toContain("│")
      expect(svg).not.toContain("╭")
      expect(svg).not.toContain("╰")
      expect(svg).not.toContain(">                      │ <")
      expect(svg).not.toContain("> to increment")
    }
  })
})
