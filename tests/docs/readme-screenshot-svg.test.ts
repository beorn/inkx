import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const repoRoot = resolve(import.meta.dirname, "../..")

describe("README screenshot SVGs", () => {
  test("counter screenshot positions split text spans without relying on leading spaces", () => {
    const svg = readFileSync(resolve(repoRoot, "docs/public/screenshots/counter.svg"), "utf8")

    expect(svg).toContain('xml:space="preserve"')
    expect(svg).toContain('<tspan x="260.4">│</tspan>')
    expect(svg).toContain('<tspan x="84">to increment</tspan>')
    expect(svg).not.toContain(">                      │ <")
    expect(svg).not.toContain("> to increment")
  })
})
