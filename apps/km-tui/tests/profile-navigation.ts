/**
 * Profile cursor navigation performance on a real vault with full React render
 *
 * Run with: DEBUG=km:perf bun apps/km-tui/tests/profile-navigation.ts /tmp/tstN
 */
import { testBoard } from "./helpers/real-board.ts"
import { createLogger } from "@beorn/logger"

const log = createLogger("km:perf")

async function main() {
  const vaultPath = process.argv[2] || "/tmp/tstN"
  console.log(`Loading vault: ${vaultPath}`)

  // Load board with full render
  const startLoad = performance.now()
  const board = await testBoard(vaultPath, { columns: 80, rows: 24 })
  const loadTime = performance.now() - startLoad
  console.log(`Board loaded in ${loadTime.toFixed(0)}ms`)
  console.log(`Repo: ${board._repo.stats.nodeCount} nodes`)

  // Get initial screenshot to verify it rendered
  console.log("\n=== Initial Screenshot ===")
  console.log(board.screenshot().slice(0, 200) + "...")

  // Profile cursor navigation (j key)
  console.log("\n=== Profiling j (down) navigation ===")
  const times: number[] = []

  for (let i = 0; i < 30; i++) {
    const start = performance.now()
    board.press("j")
    const duration = performance.now() - start
    times.push(duration)

    if (duration > 50) {
      console.log(`  j #${i + 1}: ${duration.toFixed(0)}ms ⚠️ SLOW`)
    } else if (i < 5 || i % 10 === 0) {
      console.log(`  j #${i + 1}: ${duration.toFixed(2)}ms`)
    }
  }

  // Stats
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const max = Math.max(...times)
  const min = Math.min(...times)
  const sortedTimes = [...times].sort((a, b) => a - b)
  const p95 = sortedTimes[Math.floor(times.length * 0.95)] || 0

  console.log(`\n=== Navigation Performance Summary ===`)
  console.log(`  Count: ${times.length}`)
  console.log(`  Min: ${min.toFixed(2)}ms`)
  console.log(`  Max: ${max.toFixed(2)}ms`)
  console.log(`  Avg: ${avg.toFixed(2)}ms`)
  console.log(`  P95: ${p95.toFixed(2)}ms`)

  // Check for the 1-2s issue
  if (max > 500) {
    console.log("\n🔴 SEVERE: Max time > 500ms - this is the bug!")
  } else if (max > 100) {
    console.log("\n🟡 WARNING: Max time > 100ms - noticeable lag")
  } else if (max > 50) {
    console.log("\n🟢 OK: Max time 50-100ms - acceptable")
  } else {
    console.log("\n🟢 GOOD: Max time < 50ms - snappy")
  }

  // Check column structure in depth
  console.log("\n=== Board Structure ===")
  const topLevel = board._repo.getChildren(null)
  console.log(`  Top-level children: ${topLevel.length}`)

  for (const node of topLevel.slice(0, 5)) {
    const children = board._repo.getChildren(node.id)
    console.log(
      `  ${node.name || node.title || node.id.slice(-8)}: ${children.length} items`,
    )
    // Check grandchildren
    let totalGrand = 0
    for (const child of children.slice(0, 5)) {
      const grandchildren = board._repo.getChildren(child.id)
      totalGrand += grandchildren.length
    }
    if (totalGrand > 0) {
      console.log(`    (first 5 have ${totalGrand} grandchildren total)`)
    }
  }

  // Test view mode switching
  console.log("\n=== View Mode Switching ===")
  for (let i = 0; i < 4; i++) {
    const start = performance.now()
    board.press("v")
    const duration = performance.now() - start
    const text = board.screenshot()
    const modeMatch = text.match(/(CARDS|COLUMNS|LIST|TABS) VIEW/)
    console.log(`  v → ${modeMatch?.[1] || "?"}: ${duration.toFixed(0)}ms`)
  }

  // Profile COLUMNS view specifically
  console.log("\n=== Profiling COLUMNS view navigation ===")
  while (!board.screenshot().includes("COLUMNS VIEW")) {
    board.press("v")
  }
  console.log("  Now in COLUMNS view")

  const colNavTimes: number[] = []
  for (let i = 0; i < 30; i++) {
    const start = performance.now()
    board.press("j")
    const duration = performance.now() - start
    colNavTimes.push(duration)
    if (i < 10 || duration > 100) {
      const marker = duration > 100 ? " ⚠️ SLOW" : ""
      console.log(`  j #${i + 1}: ${duration.toFixed(0)}ms${marker}`)
    }
  }
  const colNavAvg = colNavTimes.reduce((a, b) => a + b, 0) / colNavTimes.length
  const colNavMax = Math.max(...colNavTimes)
  const warmAvg =
    colNavTimes.slice(10).reduce((a, b) => a + b, 0) / (colNavTimes.length - 10)
  console.log(
    `  COLUMNS: avg=${colNavAvg.toFixed(0)}ms, max=${colNavMax.toFixed(0)}ms, warm=${warmAvg.toFixed(0)}ms`,
  )

  console.log("\nDone.")
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
