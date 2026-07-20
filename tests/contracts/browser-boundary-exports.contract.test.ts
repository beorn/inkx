import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const silveryRoot = join(import.meta.dirname, "../..")

interface PackageManifest {
  publishConfig?: { exports?: Record<string, unknown> }
  tsdown?: { entry?: string[] }
}

function readManifest(packageName: string): PackageManifest {
  return JSON.parse(
    readFileSync(join(silveryRoot, "packages", packageName, "package.json"), "utf8"),
  ) as PackageManifest
}

describe("browser boundary package entries", () => {
  test.each([
    ["ag-term", "./pipeline/adapter-pipeline", "src/pipeline/adapter-pipeline.ts"],
    ["create", "./runtime-chain", "src/runtime-chain.ts"],
  ])("@silvery/%s publishes and builds %s", (packageName, exportPath, entryPath) => {
    const manifest = readManifest(packageName)

    expect(manifest.publishConfig?.exports).toHaveProperty(exportPath)
    expect(manifest.tsdown?.entry).toContain(entryPath)
  })
})
