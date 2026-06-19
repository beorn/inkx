import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const repoRoot = resolve(import.meta.dirname, "../..")

describe("README screenshot SVGs", () => {
  test("counter screenshot preserves leading spaces inside split text spans", () => {
    const svg = readFileSync(resolve(repoRoot, "docs/public/screenshots/counter.svg"), "utf8")

    expect(svg).toContain('xml:space="preserve"')
    expect(svg).toContain(">                      │ <")
    expect(svg).toContain("> to increment")
  })
})
