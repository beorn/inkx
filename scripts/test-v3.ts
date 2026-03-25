import { createBoardDriver } from "../apps/km-tui/src/driver.ts"
import { withDiagnostics } from "@silvery/create"
import { createFakeRepo } from "../packages/km-storage/src/testing/fake-repo.ts"
import { item } from "../apps/km-tui/tests/helpers/board-test.ts"

async function main() {
  // Match /tmp/v3 structure: two empty folders (columns with no cards)
  const nodes = item.root(
    "board",
    item.folder("a"),  // empty folder
    item.folder("b"),  // empty folder
  )

  const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "board", {
    rows: 20,
    columns: 80,
  })

  const driver = withDiagnostics(baseDriver, {
    checkIncremental: true,
    checkStability: false,
  })

  console.log("Initial:", driver.getState().cursor)
  console.log("Screen:")
  console.log(driver.text)

  // Press k once
  console.log("\npress('k')...")
  await driver.press("k")
  console.log("After k:", driver.getState().cursor)

  console.log("\nSUCCESS")
}

main().catch((e: unknown) => {
  console.error("CAUGHT:", e instanceof Error ? e.message : String(e))
  process.exit(1)
})
