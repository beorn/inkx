/**
 * Tests for `silvercode doctor autolinks`.
 *
 * Bead: km-silvercode.doctor
 *
 * Drives `runAutolinksChecker` and `runDoctor` directly through their
 * config-path test seam (`opts.autolinks.{workspaceConfigPath,
 * vaultConfigPath}`) so the user's real `~/.km/config.yaml` doesn't leak
 * into temp-dir scenarios.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { runAutolinksChecker } from "../../src/doctor/checkers/autolinks.ts"
import { runDoctor, severityToExitCode } from "../../src/doctor/index.ts"
import { _activeWatcherCount, disposeAllWatchers } from "../../src/autolinks/previews.ts"

describe("doctor autolinks — file presence + parse", () => {
  let dir: string
  let wsPath: string
  let vaultPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-doctor-"))
    // Two siblings under the same temp dir — neither inherits state from
    // the user's real `~/.km` because we redirect both via opts.
    wsPath = join(dir, "ws-config.yaml")
    vaultPath = join(dir, "vault-config.yaml")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("missing workspace + vault → all ok, exit 0", () => {
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("ok")
    // Watcher item is always emitted (count = 0 for a fresh CLI run).
    expect(section.items.some((i) => i.message.startsWith("workspace config — not present"))).toBe(true)
    expect(section.items.some((i) => i.message.startsWith("vault config — not present"))).toBe(true)
    const report = runDoctor({ cwd: dir, autolinks: { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath } })
    expect(severityToExitCode(report.severity)).toBe(0)
  })

  test("healthy vault config → ok with rule count", () => {
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "${dir}"
    preview: readme
`,
    )
    // Create the README so the path check passes.
    writeFileSync(join(dir, "README.md"), "# Test\nHello.\n")
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("ok")
    const fileItem = section.items.find((i) => i.message.includes("vault config —"))
    expect(fileItem?.message).toContain("(1 rule)")
  })

  test("malformed YAML → error", () => {
    writeFileSync(vaultPath, "syntaxlinks:\n  - this: is\n   bad: indent\n")
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("error")
    expect(section.items.some((i) => i.severity === "error" && i.message.includes("malformed YAML"))).toBe(true)
  })

  test("invalid syntaxlinks shape (not a list) → error", () => {
    writeFileSync(vaultPath, 'syntaxlinks: "should be a list"\n')
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("error")
    expect(section.items.some((i) => i.severity === "error" && /expected `syntaxlinks:` array/.test(i.message))).toBe(
      true,
    )
  })

  test("per-rule drop reason surfaces in items", () => {
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~bad"
    resolves_to: "/tmp"
    preview: not-a-real-kind
  - pattern: "~ok"
    resolves_to: "${dir}"
    preview: readme
`,
    )
    writeFileSync(join(dir, "README.md"), "# Test\n")
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("error")
    const dropItem = section.items.find((i) => i.severity === "error" && /rule dropped/.test(i.message))
    expect(dropItem).toBeDefined()
    expect(dropItem!.detail).toContain("invalid `preview`")
  })
})

describe("doctor autolinks — cascade introspection", () => {
  let dir: string
  let wsPath: string
  let vaultPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-doctor-"))
    wsPath = join(dir, "ws-config.yaml")
    vaultPath = join(dir, "vault-config.yaml")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("workspace + vault overlap → cascade flags WS→VAULT override", () => {
    // README directory used by both rules so path checks succeed.
    writeFileSync(join(dir, "README.md"), "# Test\n")
    writeFileSync(
      wsPath,
      `
syntaxlinks:
  - pattern: "~shared"
    resolves_to: "/ws/path"
    preview: readme
  - pattern: "~ws-only"
    resolves_to: "${dir}"
    preview: readme
`,
    )
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~shared"
    resolves_to: "${dir}"
    preview: readme
  - pattern: "~vault-only"
    resolves_to: "${dir}"
    preview: readme
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    const cascade = section.extras?.find((e) => e.kind === "autolinks-cascade")
    expect(cascade).toBeDefined()
    if (cascade?.kind !== "autolinks-cascade") return
    const byPattern = new Map(cascade.rows.map((r) => [r.pattern, r]))
    expect(byPattern.get("~shared")?.source).toBe("WS→VAULT")
    expect(byPattern.get("~ws-only")?.source).toBe("WORKSPACE")
    expect(byPattern.get("~vault-only")?.source).toBe("VAULT")
    // Override should resolve to the vault path, not the workspace one.
    expect(byPattern.get("~shared")?.resolvesTo).toBe(dir)
  })
})

describe("doctor autolinks — path issues", () => {
  let dir: string
  let wsPath: string
  let vaultPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-doctor-"))
    wsPath = join(dir, "ws-config.yaml")
    vaultPath = join(dir, "vault-config.yaml")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("dead resolves_to path → warn", () => {
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~dead"
    resolves_to: "${join(dir, "does-not-exist")}"
    preview: readme
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("warn")
    expect(section.items.some((i) => i.severity === "warn" && /readme target does not exist/.test(i.message))).toBe(
      true,
    )
  })

  test("directory without README.md → warn", () => {
    const subdir = join(dir, "no-readme-here")
    mkdirSync(subdir)
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~empty"
    resolves_to: "${subdir}"
    preview: readme
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("warn")
    expect(section.items.some((i) => i.severity === "warn" && /has no README\.md/.test(i.message))).toBe(true)
  })

  test("first-paragraph target exists → ok", () => {
    const file = join(dir, "AGENTS.md")
    writeFileSync(file, "# Title\n\nFirst para.\n")
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "AGENTS.md"
    resolves_to: "${file}"
    preview: first-paragraph
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("ok")
  })

  test("shell.exec not on PATH → error", () => {
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~bogus"
    resolves_to: "/tmp"
    preview: shell
    command:
      exec: this-command-definitely-does-not-exist-1234
      args: []
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("error")
    expect(section.items.some((i) => i.severity === "error" && /not found on PATH/.test(i.message))).toBe(true)
  })

  test("shell.exec absolute path that exists → ok", () => {
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~uname"
    resolves_to: "/"
    preview: shell
    command:
      exec: /bin/sh
      args: ["-c", "echo hi"]
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    // /bin/sh exists on every platform we support; should be ok.
    const shellItems = section.items.filter((i) => i.message.includes("~uname"))
    expect(shellItems.some((i) => i.severity === "ok")).toBe(true)
  })

  test("shell.exec absolute path that does not exist → error", () => {
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~missing"
    resolves_to: "/"
    preview: shell
    command:
      exec: /this/path/should/never/exist/1234567890
      args: []
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("error")
    expect(section.items.some((i) => i.severity === "error" && /shell\.exec missing/.test(i.message))).toBe(true)
  })
})

describe("doctor autolinks — mcp stub list", () => {
  let dir: string
  let wsPath: string
  let vaultPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-doctor-"))
    wsPath = join(dir, "ws-config.yaml")
    vaultPath = join(dir, "vault-config.yaml")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("mcp rules surface in mcp-stub extras + warn item", () => {
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~rfc"
    resolves_to: "rfc-server.lookup"
    preview: mcp
    tool: "rfc-server.lookup"
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("warn")
    const mcpExtra = section.extras?.find((e) => e.kind === "autolinks-mcp")
    expect(mcpExtra).toBeDefined()
    if (mcpExtra?.kind !== "autolinks-mcp") return
    expect(mcpExtra.rows).toEqual([{ pattern: "~rfc", resolvesTo: "rfc-server.lookup" }])
  })

  test("no mcp rules → no mcp extras, no warn", () => {
    writeFileSync(join(dir, "README.md"), "# Test\n")
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "${dir}"
    preview: readme
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    expect(section.severity).toBe("ok")
    expect(section.extras?.some((e) => e.kind === "autolinks-mcp")).toBeFalsy()
  })
})

describe("doctor autolinks — watcher count", () => {
  let dir: string
  let wsPath: string
  let vaultPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-doctor-"))
    wsPath = join(dir, "ws-config.yaml")
    vaultPath = join(dir, "vault-config.yaml")
    disposeAllWatchers()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    disposeAllWatchers()
  })

  test("watcher item is always emitted with current count", () => {
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    const watcherItem = section.items.find((i) => i.message.startsWith("watchers —"))
    expect(watcherItem).toBeDefined()
    expect(watcherItem!.message).toContain(`${_activeWatcherCount()} active`)
  })
})

describe("doctor autolinks — handler registry (URI pivot)", () => {
  let dir: string
  let wsPath: string
  let vaultPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-doctor-"))
    wsPath = join(dir, "ws-config.yaml")
    vaultPath = join(dir, "vault-config.yaml")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("autolinks-handlers extra lists v1 schemes (file, bd, shell, https, mcp)", () => {
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    const handlers = section.extras?.find((e) => e.kind === "autolinks-handlers")
    expect(handlers).toBeDefined()
    if (handlers?.kind !== "autolinks-handlers") return
    expect(handlers.schemes).toEqual(["file", "bd", "shell", "https", "mcp"])
  })

  test("each rule is bound to a handler — file: scheme inferred from /path", () => {
    writeFileSync(join(dir, "README.md"), "# Test\n")
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "${dir}"
    preview: readme
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    const handlers = section.extras?.find((e) => e.kind === "autolinks-handlers")
    expect(handlers?.kind).toBe("autolinks-handlers")
    if (handlers?.kind !== "autolinks-handlers") return
    const binding = handlers.bindings.find((b) => b.pattern === "~repo")
    expect(binding).toBeDefined()
    expect(binding!.inferredScheme).toBe("file")
    expect(binding!.status).toBe("ok")
  })

  test("bd-shaped resolves_to (bare scope.slug) → bd: scheme inferred", () => {
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "/\\\\+\\\\w+/"
    resolves_to: "km-silvercode.autolinks-uri-pivot"
    preview: bd-active
`,
    )
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    const handlers = section.extras?.find((e) => e.kind === "autolinks-handlers")
    if (handlers?.kind !== "autolinks-handlers") return
    const binding = handlers.bindings.find((b) => b.pattern.startsWith("/"))
    expect(binding?.inferredScheme).toBe("bd")
    expect(binding?.status).toBe("ok")
  })

  test("section emits an `ok` summary item listing the registered schemes", () => {
    const section = runAutolinksChecker(dir, { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath })
    const handlersItem = section.items.find((i) => i.message.startsWith("handlers —"))
    expect(handlersItem).toBeDefined()
    expect(handlersItem!.severity).toBe("ok")
    expect(handlersItem!.message).toContain("file, bd, shell, https, mcp")
  })
})

describe("doctor autolinks — exit code", () => {
  let dir: string
  let wsPath: string
  let vaultPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-doctor-"))
    wsPath = join(dir, "ws-config.yaml")
    vaultPath = join(dir, "vault-config.yaml")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("ok → 0, warn → 1, error → 2", () => {
    // ok: no configs.
    const ok = runDoctor({ cwd: dir, autolinks: { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath } })
    expect(severityToExitCode(ok.severity)).toBe(0)

    // warn: dead resolves_to.
    writeFileSync(
      vaultPath,
      `
syntaxlinks:
  - pattern: "~dead"
    resolves_to: "${join(dir, "does-not-exist")}"
    preview: readme
`,
    )
    const warn = runDoctor({ cwd: dir, autolinks: { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath } })
    expect(severityToExitCode(warn.severity)).toBe(1)

    // error: malformed YAML.
    writeFileSync(vaultPath, "syntaxlinks:\n  - this: is\n   bad: indent\n")
    const err = runDoctor({ cwd: dir, autolinks: { workspaceConfigPath: wsPath, vaultConfigPath: vaultPath } })
    expect(severityToExitCode(err.severity)).toBe(2)
  })
})
