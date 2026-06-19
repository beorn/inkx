import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const repoRoot = resolve(import.meta.dirname, "../..")

describe("README screenshot SVGs", () => {
  test("counter screenshot positions split text spans without relying on leading spaces", () => {
    const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8")
    const screenshotPaths = [
      "docs/public/screenshots/counter.svg",
      "docs/public/screenshots/counter-readme.svg",
    ]

    expect(readme).toContain("docs/public/screenshots/counter-readme.svg")

    for (const screenshotPath of screenshotPaths) {
      const svg = readFileSync(resolve(repoRoot, screenshotPath), "utf8")

      expect(svg).toContain('xml:space="preserve"')
      expect(svg).toContain('<tspan x="260.4">│</tspan>')
      expect(svg).toContain('<tspan x="84">to increment</tspan>')
      expect(svg).not.toContain(">                      │ <")
      expect(svg).not.toContain("> to increment")
    }
  })
})
