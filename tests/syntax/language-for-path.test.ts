import { describe, expect, test } from "vitest"
import { languageForPath } from "@silvery/syntax"

describe("languageForPath", () => {
  test("maps filenames to canonical language identifiers without React", () => {
    expect(languageForPath("src/browser.ts")).toBe("typescript")
    expect(languageForPath("Component.tsx")).toBe("tsx")
    expect(languageForPath("worker.mjs")).toBe("javascript")
    expect(languageForPath("types.cts")).toBe("typescript")
    expect(languageForPath("script.py")).toBe("python")
    expect(languageForPath("README.md")).toBe("markdown")
    expect(languageForPath("Dockerfile")).toBe("dockerfile")
    expect(languageForPath("config.jsonc")).toBe("jsonc")
    expect(languageForPath("include/value.hpp")).toBe("cpp")
    expect(languageForPath("script.zsh")).toBe("bash")
    expect(languageForPath("config.fish")).toBe("fish")
  })

  test("returns plain for extensionless, dotfile, and unknown paths", () => {
    expect(languageForPath("LICENSE")).toBe("plain")
    expect(languageForPath(".gitignore")).toBe("plain")
    expect(languageForPath("data.unknown-extension")).toBe("plain")
  })
})
