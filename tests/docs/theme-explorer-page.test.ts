import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const repoRoot = resolve(import.meta.dirname, "../..")

describe("Theme Explorer docs page", () => {
  test("uses the standard docs page shell with restrained Sterling copy", () => {
    const page = readFileSync(resolve(repoRoot, "docs/themes.md"), "utf8")

    expect(page).toContain("# Theme Explorer")
    expect(page).toContain("::: info New in 0.20.0")
    expect(page).toContain("Silvery uses the Sterling theme shape.")
    expect(page).toContain("<ThemeExplorer />")
    expect(page).not.toContain("layout: page")
    expect(page).not.toContain("theme-page-hero")
    expect(page).not.toContain("ships with")
    expect(page).not.toContain("THE Theme")
    expect(page).not.toContain("one-and-only")
  })
})
