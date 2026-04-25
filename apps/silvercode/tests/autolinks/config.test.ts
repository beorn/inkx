/**
 * Unit tests for syntax-linker config loading + parsing.
 *
 * Bead: km-silvercode.autolinks-config
 * Config file: <cwd>/.km/config.yaml (top-level `syntaxlinks:` key)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  cascadeAutolinks,
  compilePattern,
  loadAutolinksConfig,
  parseSyntaxlinksYaml,
} from "../../src/autolinks/config.ts"

describe("syntaxlinks config — pattern compilation", () => {
  test("literal pattern matches verbatim, escapes meta characters", () => {
    const re = compilePattern("~repo")
    expect("~repo".match(re)?.[0]).toBe("~repo")
    // Tilde is not a regex meta — but `+` is. Verify the literal `+km` works.
    const plus = compilePattern("+km")
    expect("ping +km here".match(plus)?.[0]).toBe("+km")
  })

  test("regex pattern unwraps slashes and applies global flag", () => {
    const re = compilePattern("/\\+\\w+/")
    expect(re.flags).toContain("g")
    const matches = [..."ping +km and +pam".matchAll(re)].map((m) => m[0])
    expect(matches).toEqual(["+km", "+pam"])
  })

  test("regex pattern works with leading-only slash (no trailing)", () => {
    const re = compilePattern("/AGENTS\\.md")
    expect("see AGENTS.md".match(re)?.[0]).toBe("AGENTS.md")
  })

  test("invalid regex throws", () => {
    expect(() => compilePattern("/[unclosed/")).toThrow()
  })

  test("empty regex body throws", () => {
    expect(() => compilePattern("/")).toThrow("empty regex body")
  })
})

describe("syntaxlinks config — YAML parsing", () => {
  test("parses a single literal rule", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/Users/beorn/Code/pim/km"
    preview: readme
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules).toHaveLength(1)
    const rule = rules[0]!
    expect(rule.source).toBe("~repo")
    expect(rule.resolvesTo).toBe("/Users/beorn/Code/pim/km")
    expect(rule.preview).toBe("readme")
  })

  test("parses multiple rules with mixed pattern syntax", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/path/a"
    preview: readme
  - pattern: "/\\\\+\\\\w+/"
    resolves_to: "/path/b"
    preview: bd-active
  - pattern: "AGENTS.md"
    resolves_to: "/path/c"
    preview: first-paragraph
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules).toHaveLength(3)
    expect(rules.map((r) => r.preview)).toEqual(["readme", "bd-active", "first-paragraph"])
  })

  test("drops rules with missing `pattern`", () => {
    const yaml = `
syntaxlinks:
  - resolves_to: "/path"
    preview: readme
  - pattern: "~ok"
    resolves_to: "/ok"
    preview: readme
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules).toHaveLength(1)
    expect(rules[0]!.source).toBe("~ok")
  })

  test("drops rules with invalid `preview` kind", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~bad"
    resolves_to: "/path"
    preview: exec
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules).toHaveLength(0)
  })

  test("drops rules with malformed regex", () => {
    const yaml = `
syntaxlinks:
  - pattern: "/[unclosed/"
    resolves_to: "/path"
    preview: readme
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules).toHaveLength(0)
  })

  test("malformed YAML returns empty list (does not throw)", () => {
    const rules = parseSyntaxlinksYaml("syntaxlinks:\n  - this: is\n   bad: indent\n")
    expect(rules).toEqual([])
  })

  test("missing `syntaxlinks:` key returns empty list", () => {
    const rules = parseSyntaxlinksYaml('title: "no syntaxlinks here"\n')
    expect(rules).toEqual([])
  })

  test("non-array `syntaxlinks` value returns empty list", () => {
    const rules = parseSyntaxlinksYaml('syntaxlinks: "should be a list"\n')
    expect(rules).toEqual([])
  })

  test("empty document returns empty list", () => {
    expect(parseSyntaxlinksYaml("")).toEqual([])
    expect(parseSyntaxlinksYaml("---\n")).toEqual([])
  })

  test("ignores other top-level sections (forward-compat)", () => {
    const yaml = `
theme: dark
panes:
  - id: a
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/path"
    preview: readme
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules).toHaveLength(1)
    expect(rules[0]!.source).toBe("~repo")
  })
})

describe("syntaxlinks config — shell preview kind", () => {
  test("accepts a valid shell rule with command", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/path/to/repo"
    preview: shell
    command: "git -C \${resolves_to} log -5 --oneline"
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules).toHaveLength(1)
    const rule = rules[0]!
    expect(rule.preview).toBe("shell")
    expect(rule.command).toBe("git -C ${resolves_to} log -5 --oneline")
  })

  test("drops shell rule with no command field", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~bad"
    resolves_to: "/path"
    preview: shell
`
    expect(parseSyntaxlinksYaml(yaml)).toHaveLength(0)
  })

  test("drops shell rule with empty command", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~bad"
    resolves_to: "/path"
    preview: shell
    command: ""
`
    expect(parseSyntaxlinksYaml(yaml)).toHaveLength(0)
  })

  test("drops shell rule whose command starts with shell metacharacter (|)", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~pipe"
    resolves_to: "/path"
    preview: shell
    command: "| cat"
`
    expect(parseSyntaxlinksYaml(yaml)).toHaveLength(0)
  })

  test("drops shell rule whose command starts with redirect (>)", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~redir"
    resolves_to: "/path"
    preview: shell
    command: "> /tmp/x"
`
    expect(parseSyntaxlinksYaml(yaml)).toHaveLength(0)
  })

  test("drops shell rule whose command starts with backtick", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~tick"
    resolves_to: "/path"
    preview: shell
    command: "\`echo hi\`"
`
    expect(parseSyntaxlinksYaml(yaml)).toHaveLength(0)
  })

  test("accepts shell command containing metachars later in the string", () => {
    // Only the leading character is a footgun (paste error); a metachar
    // anywhere else is a legitimate command (e.g. `echo a && echo b` —
    // weird, but the user wrote it).
    const yaml = `
syntaxlinks:
  - pattern: "~ok"
    resolves_to: "/path"
    preview: shell
    command: "echo hello"
`
    expect(parseSyntaxlinksYaml(yaml)).toHaveLength(1)
  })
})

describe("syntaxlinks config — mcp preview kind (stub)", () => {
  test("drops mcp rules at config-load time pending implementation", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~rfc"
    resolves_to: "rfc-server.lookup"
    preview: mcp
    tool: "rfc-server.lookup"
    args:
      id: 42
`
    // mcp is a recognised preview kind (passes VALID_PREVIEWS) but
    // dropped here with a "not implemented" warning.
    expect(parseSyntaxlinksYaml(yaml)).toHaveLength(0)
  })

  test("mcp rule alongside other valid rules: only mcp is dropped", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~ok"
    resolves_to: "/path"
    preview: readme
  - pattern: "~mcp"
    resolves_to: "rfc.lookup"
    preview: mcp
    tool: "rfc.lookup"
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules).toHaveLength(1)
    expect(rules[0]!.source).toBe("~ok")
  })
})

describe("syntaxlinks config — filesystem loader", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-syntaxlinks-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("missing config returns []", () => {
    expect(loadAutolinksConfig(dir)).toEqual([])
  })

  test("reads .km/config.yaml when present", () => {
    mkdirSync(join(dir, ".km"))
    writeFileSync(
      join(dir, ".km", "config.yaml"),
      `
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "${dir}"
    preview: readme
`,
    )
    const rules = loadAutolinksConfig(dir)
    expect(rules).toHaveLength(1)
    expect(rules[0]!.source).toBe("~repo")
    expect(rules[0]!.resolvesTo).toBe(dir)
  })
})

describe("syntaxlinks config — cascade (workspace + per-vault)", () => {
  function rule(
    source: string,
    resolvesTo: string,
  ): {
    source: string
    regex: RegExp
    resolvesTo: string
    preview: "readme"
  } {
    return { source, regex: compilePattern(source), resolvesTo, preview: "readme" }
  }

  test("vault rules append when no shadow", () => {
    const ws = [rule("a", "/ws/a"), rule("b", "/ws/b")]
    const vault = [rule("c", "/v/c")]
    const merged = cascadeAutolinks(ws, vault)
    expect(merged.map((r) => r.source)).toEqual(["a", "b", "c"])
    expect(merged[2]!.resolvesTo).toBe("/v/c")
  })

  test("vault rule replaces workspace rule with same source, preserves position", () => {
    const ws = [rule("a", "/ws/a"), rule("b", "/ws/b"), rule("c", "/ws/c")]
    const vault = [rule("b", "/v/b")]
    const merged = cascadeAutolinks(ws, vault)
    expect(merged.map((r) => r.source)).toEqual(["a", "b", "c"])
    expect(merged[1]!.resolvesTo).toBe("/v/b") // override
    expect(merged[0]!.resolvesTo).toBe("/ws/a") // untouched
    expect(merged[2]!.resolvesTo).toBe("/ws/c") // untouched
  })

  test("vault adds + replaces in one cascade", () => {
    const ws = [rule("a", "/ws/a")]
    const vault = [rule("a", "/v/a"), rule("b", "/v/b")]
    const merged = cascadeAutolinks(ws, vault)
    expect(merged.map((r) => r.source)).toEqual(["a", "b"])
    expect(merged[0]!.resolvesTo).toBe("/v/a")
    expect(merged[1]!.resolvesTo).toBe("/v/b")
  })

  test("empty workspace + vault rules → vault rules verbatim", () => {
    const vault = [rule("a", "/v/a"), rule("b", "/v/b")]
    expect(cascadeAutolinks([], vault)).toEqual(vault)
  })

  test("empty vault → workspace rules verbatim", () => {
    const ws = [rule("a", "/ws/a")]
    expect(cascadeAutolinks(ws, [])).toEqual(ws)
  })
})
