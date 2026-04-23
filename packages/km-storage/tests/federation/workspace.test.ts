/**
 * Tests for the workspace registry (federation Phase A).
 *
 * Covers hub/km/storage-architecture.md §5.2:
 *   - Missing workspace.toml → empty workspace (no throw, no surprise).
 *   - [[mount]] + [mounts.<alias>] TOML shapes both accepted.
 *   - Alias + km:/ URI resolution.
 *   - Duplicate aliases keep the first + warn on second.
 *   - KM_WORKSPACE env override.
 *   - RepoId is lazy (only read when requested).
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  buildWorkspace,
  loadWorkspace,
  readMountsFromToml,
  resolveWorkspaceTomlPath,
  WORKSPACE_TOML_NAME,
} from "../../src/federation/workspace.ts"

let tempRoot: string
let workspaceToml: string
const envBackup: { KM_WORKSPACE: string | undefined } = { KM_WORKSPACE: undefined }

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "km-federation-workspace-"))
  workspaceToml = join(tempRoot, WORKSPACE_TOML_NAME)
  envBackup.KM_WORKSPACE = process.env.KM_WORKSPACE
  // Force a known-nonexistent default so accidental default-path reads don't
  // leak into these tests (avoids reading the dev's real `~/.km/workspace.toml`).
  process.env.KM_WORKSPACE = join(tempRoot, "default-miss", "workspace.toml")
})

afterEach(() => {
  if (envBackup.KM_WORKSPACE === undefined) delete process.env.KM_WORKSPACE
  else process.env.KM_WORKSPACE = envBackup.KM_WORKSPACE
  rmSync(tempRoot, { recursive: true, force: true })
})

describe("resolveWorkspaceTomlPath", () => {
  test("explicit workspacePath wins over env", () => {
    process.env.KM_WORKSPACE = "/some/env/path.toml"
    expect(resolveWorkspaceTomlPath({ workspacePath: "/explicit.toml" })).toBe("/explicit.toml")
  })

  test("KM_WORKSPACE env wins over default", () => {
    process.env.KM_WORKSPACE = "/env/workspace.toml"
    expect(resolveWorkspaceTomlPath()).toBe("/env/workspace.toml")
  })

  test("defaults to <home>/.km/workspace.toml when neither is set", () => {
    delete process.env.KM_WORKSPACE
    const resolved = resolveWorkspaceTomlPath({ home: "/fake/home" })
    expect(resolved).toBe("/fake/home/.km/workspace.toml")
  })
})

describe("loadWorkspace — empty / missing file", () => {
  test("missing workspace.toml yields an empty workspace (no throw)", () => {
    const ws = loadWorkspace({ workspacePath: workspaceToml })
    expect(ws.mounts).toEqual([])
    expect(ws.resolveAlias("anything")).toBeNull()
    expect(ws.resolveKmUri("km:/anything/foo")).toBeNull()
  })

  test("empty workspace.toml yields an empty workspace", () => {
    writeFileSync(workspaceToml, "", "utf-8")
    const ws = loadWorkspace({ workspacePath: workspaceToml })
    expect(ws.mounts).toEqual([])
  })

  test("malformed TOML logs + yields empty workspace (no throw)", () => {
    writeFileSync(workspaceToml, "[[this is not valid", "utf-8")
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const ws = loadWorkspace({ workspacePath: workspaceToml })
      expect(ws.mounts).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe("loadWorkspace — [[mount]] array-of-tables form", () => {
  test("parses multiple mounts + resolves aliases", () => {
    writeFileSync(
      workspaceToml,
      `[[mount]]
alias = "home"
path = "${tempRoot}/home"

[[mount]]
alias = "vault"
path = "${tempRoot}/vault"
`,
      "utf-8",
    )
    mkdirSync(join(tempRoot, "home"), { recursive: true })
    mkdirSync(join(tempRoot, "vault"), { recursive: true })

    const ws = loadWorkspace({ workspacePath: workspaceToml })
    expect(ws.mounts).toHaveLength(2)
    expect(ws.mounts.map((m) => m.alias)).toEqual(["home", "vault"])

    const home = ws.resolveAlias("home")
    expect(home?.path).toBe(join(tempRoot, "home"))

    expect(ws.resolveAlias("missing")).toBeNull()
  })

  test("resolves km: URIs via workspace", () => {
    writeFileSync(
      workspaceToml,
      `[[mount]]
alias = "vault"
path = "${tempRoot}/vault"
`,
      "utf-8",
    )
    mkdirSync(join(tempRoot, "vault"), { recursive: true })

    const ws = loadWorkspace({ workspacePath: workspaceToml })
    const resolved = ws.resolveKmUri("km:/vault/notes/foo.md#^abc")
    expect(resolved).not.toBeNull()
    expect(resolved?.mount.alias).toBe("vault")
    expect(resolved?.relPath).toBe("notes/foo.md")
    expect(resolved?.fragment).toBe("^abc")

    // Unknown alias.
    expect(ws.resolveKmUri("km:/unknown/foo")).toBeNull()
    // Same-repo form: not a cross-repo URI, workspace returns null.
    expect(ws.resolveKmUri("km:foo")).toBeNull()
    // Non-km URI.
    expect(ws.resolveKmUri("https://example.com")).toBeNull()
  })
})

describe("loadWorkspace — [mounts.<alias>] table form", () => {
  test("nested-table form produces the same mounts", () => {
    writeFileSync(
      workspaceToml,
      `[mounts.home]
path = "${tempRoot}/home"

[mounts.vault]
path = "${tempRoot}/vault"
`,
      "utf-8",
    )
    mkdirSync(join(tempRoot, "home"), { recursive: true })
    mkdirSync(join(tempRoot, "vault"), { recursive: true })

    const ws = loadWorkspace({ workspacePath: workspaceToml })
    expect(ws.mounts.map((m) => m.alias).sort()).toEqual(["home", "vault"])
    expect(ws.resolveAlias("home")?.path).toBe(join(tempRoot, "home"))
  })
})

describe("loadWorkspace — duplicates + malformed entries", () => {
  test("duplicate aliases keep the first entry", () => {
    writeFileSync(
      workspaceToml,
      `[[mount]]
alias = "home"
path = "${tempRoot}/first"

[[mount]]
alias = "home"
path = "${tempRoot}/second"
`,
      "utf-8",
    )
    mkdirSync(join(tempRoot, "first"), { recursive: true })
    mkdirSync(join(tempRoot, "second"), { recursive: true })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const ws = loadWorkspace({ workspacePath: workspaceToml })
      expect(ws.mounts).toHaveLength(1)
      expect(ws.resolveAlias("home")?.path).toBe(join(tempRoot, "first"))
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("mount missing `path` or `alias` is skipped (not fatal)", () => {
    writeFileSync(
      workspaceToml,
      `[[mount]]
alias = "ok"
path = "${tempRoot}/ok"

[[mount]]
alias = "broken"
# no path

[[mount]]
path = "${tempRoot}/no-alias"
`,
      "utf-8",
    )
    mkdirSync(join(tempRoot, "ok"), { recursive: true })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const ws = loadWorkspace({ workspacePath: workspaceToml })
      expect(ws.mounts.map((m) => m.alias)).toEqual(["ok"])
      expect(warnSpy).toHaveBeenCalledTimes(2)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe("loadWorkspace — KM_WORKSPACE env override", () => {
  test("env var points the loader at an alternate file", () => {
    const altPath = join(tempRoot, "alt-workspace.toml")
    writeFileSync(
      altPath,
      `[[mount]]
alias = "alt"
path = "${tempRoot}/alt"
`,
      "utf-8",
    )
    mkdirSync(join(tempRoot, "alt"), { recursive: true })
    process.env.KM_WORKSPACE = altPath

    // No explicit workspacePath → env takes over.
    const ws = loadWorkspace()
    expect(ws.mounts.map((m) => m.alias)).toEqual(["alt"])
  })
})

describe("WorkspaceMount.repoId() — lazy discovery", () => {
  test("repoId() mints + writes `.km/config.yaml` inside the mount on first call", () => {
    const mountPath = join(tempRoot, "myrepo")
    mkdirSync(join(mountPath, ".km"), { recursive: true })
    writeFileSync(
      workspaceToml,
      `[[mount]]
alias = "myrepo"
path = "${mountPath}"
`,
      "utf-8",
    )
    const ws = loadWorkspace({ workspacePath: workspaceToml })
    const mount = ws.resolveAlias("myrepo")
    expect(mount).not.toBeNull()

    // No config.yaml inside mount/.km yet — load must not have touched it.
    expect(existsSync(join(mountPath, ".km", "config.yaml"))).toBe(false)

    const id1 = mount!.repoId()
    expect(String(id1)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(existsSync(join(mountPath, ".km", "config.yaml"))).toBe(true)

    // Second call must return the cached id (and not remint).
    const id2 = mount!.repoId()
    expect(String(id2)).toBe(String(id1))
  })

  test("repoId() reads an existing repo.id without overwriting it", () => {
    const mountPath = join(tempRoot, "existing")
    mkdirSync(join(mountPath, ".km"), { recursive: true })
    writeFileSync(join(mountPath, ".km", "config.yaml"), `repo:\n  id: "01HKXB2W7K9M1X4Y2Z3ABCDEFG"\n`, "utf-8")

    writeFileSync(
      workspaceToml,
      `[[mount]]
alias = "existing"
path = "${mountPath}"
`,
      "utf-8",
    )
    const ws = loadWorkspace({ workspacePath: workspaceToml })
    const before = readFileSync(join(mountPath, ".km", "config.yaml"), "utf-8")
    const id = ws.resolveAlias("existing")!.repoId()
    expect(String(id)).toBe("01HKXB2W7K9M1X4Y2Z3ABCDEFG")
    // File contents not rewritten (idempotent read path).
    const after = readFileSync(join(mountPath, ".km", "config.yaml"), "utf-8")
    expect(after).toBe(before)
  })

  test("repoId() migrates a legacy .km/config.toml into .km/config.yaml", () => {
    const mountPath = join(tempRoot, "legacy")
    mkdirSync(join(mountPath, ".km"), { recursive: true })
    writeFileSync(join(mountPath, ".km", "config.toml"), `repo_id = "01HKXB2W7K9M1X4Y2Z3LEGACY99"\n`, "utf-8")

    writeFileSync(
      workspaceToml,
      `[[mount]]
alias = "legacy"
path = "${mountPath}"
`,
      "utf-8",
    )
    const ws = loadWorkspace({ workspacePath: workspaceToml })
    const id = ws.resolveAlias("legacy")!.repoId()
    expect(String(id)).toBe("01HKXB2W7K9M1X4Y2Z3LEGACY99")
    // Migration deleted the legacy toml.
    expect(existsSync(join(mountPath, ".km", "config.toml"))).toBe(false)
    // YAML now carries the id.
    const yaml = readFileSync(join(mountPath, ".km", "config.yaml"), "utf-8")
    expect(yaml).toContain("01HKXB2W7K9M1X4Y2Z3LEGACY99")
  })
})

describe("expandHome via ~/ prefix in path", () => {
  test("paths starting with ~/ are expanded under $HOME", () => {
    // We don't write to $HOME in tests — only check the resolved path shape.
    writeFileSync(
      workspaceToml,
      `[[mount]]
alias = "hometilde"
path = "~/some/where"
`,
      "utf-8",
    )
    const ws = loadWorkspace({ workspacePath: workspaceToml })
    const mount = ws.resolveAlias("hometilde")
    expect(mount).not.toBeNull()
    expect(mount!.path.startsWith("~")).toBe(false)
    expect(mount!.path.endsWith("/some/where")).toBe(true)
  })
})

describe("buildWorkspace + readMountsFromToml composability", () => {
  test("readMountsFromToml on missing file returns []", () => {
    expect(readMountsFromToml(workspaceToml)).toEqual([])
  })

  test("buildWorkspace composes from in-memory mounts (no FS)", () => {
    const ws = buildWorkspace([
      { alias: "a", path: "/tmp/a", repoId: () => "aaa" as never },
      { alias: "b", path: "/tmp/b", repoId: () => "bbb" as never },
    ])
    expect(ws.mounts).toHaveLength(2)
    expect(ws.resolveAlias("a")?.path).toBe("/tmp/a")
    expect(ws.resolveKmUri("km:/b/foo")?.mount.alias).toBe("b")
  })
})
