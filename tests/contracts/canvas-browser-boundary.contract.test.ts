import { isAbsolute } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { rolldown } from "rolldown"

const canvasEntry = fileURLToPath(
  new URL("../../packages/ag-react/src/ui/canvas/index.ts", import.meta.url),
)

function isThirdPartyPackage(id: string): boolean {
  if (id === "silvery" || id.startsWith("@silvery/")) return false
  return !id.startsWith(".") && !isAbsolute(id)
}

describe("canvas browser boundary", () => {
  test("the canvas entry does not load terminal or Node-only modules", async () => {
    const bundle = await rolldown({
      input: canvasEntry,
      external: isThirdPartyPackage,
    })

    try {
      const result = await bundle.generate({ format: "esm" })
      const chunks = result.output.filter((item) => item.type === "chunk")
      const externalImports = chunks
        .flatMap((chunk) => [...chunk.imports, ...chunk.dynamicImports])
        .filter((id) => id.startsWith("node:") || id.startsWith("@termless/"))
        .sort()
      const generatedCode = chunks.map((chunk) => chunk.code).join("\n")
      const forbiddenReferences = [
        ...new Set(generatedCode.match(/(?:node:[\w/.-]+|@termless\/[\w.-]+)/g) ?? []),
      ].sort()

      expect(externalImports).toEqual([])
      expect(forbiddenReferences).toEqual([])
    } finally {
      await bundle.close()
    }
  })
})
