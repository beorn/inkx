/**
 * Profile whether React memoization is working
 *
 * If memo is working, MemoizedTreeCard should only render 2 cards per j press
 * (the old selected and new selected cards)
 */
import { testBoard } from "./helpers/real-board.ts"

// Access global render counter
const getCardRenderCount = () =>
  (globalThis as unknown as Record<string, number>)
    .__memoizedTreeCardRenderCount || 0
const resetCardRenderCount = () => {
  ;(
    globalThis as unknown as Record<string, number>
  ).__memoizedTreeCardRenderCount = 0
}

async function main() {
  const vaultPath = process.argv[2] || "/tmp/tstN"
  console.log(`Loading vault: ${vaultPath}`)

  const board = await testBoard(vaultPath, { columns: 80, rows: 24 })
  console.log(`Repo: ${board._repo.stats.nodeCount} nodes`)

  // Switch to COLUMNS view
  while (!board.screenshot().includes("COLUMNS VIEW")) {
    board.press("v")
  }
  console.log("Now in COLUMNS view")
  console.log(`Initial MemoizedTreeCard renders: ${getCardRenderCount()}`)

  // Reset counter and test navigation
  resetCardRenderCount()
  console.log("\n=== Pressing j 5 times (expected: ~2 renders each) ===")
  for (let i = 0; i < 5; i++) {
    const beforeCount = getCardRenderCount()
    const start = performance.now()
    board.press("j")
    const duration = performance.now() - start
    const renders = getCardRenderCount() - beforeCount
    console.log(
      `j #${i + 1}: ${renders} MemoizedTreeCard renders, ${duration.toFixed(0)}ms`,
    )
  }

  console.log(
    `\nTotal MemoizedTreeCard renders in 5 keypresses: ${getCardRenderCount()}`,
  )
  console.log(`Expected if memoization working: ~10 (2 per keypress)`)
  console.log(`If much higher, memoization is not working properly.`)

  console.log("\nDone.")
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
