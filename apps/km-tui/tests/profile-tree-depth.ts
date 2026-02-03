/**
 * Profile tree depth and node counts to understand where the 45k nodes come from
 */
import { testBoard } from "./helpers/real-board.ts"

function countInkxNodesByDepth(node: any, depth = 0): Map<number, number> {
  const counts = new Map<number, number>()
  counts.set(depth, (counts.get(depth) || 0) + 1)

  for (const child of node.children || []) {
    const childCounts = countInkxNodesByDepth(child, depth + 1)
    for (const [d, c] of childCounts) {
      counts.set(d, (counts.get(d) || 0) + c)
    }
  }
  return counts
}

function countScrollContainers(node: any): number {
  let count = 0
  const props = node.props || {}
  if (props.overflow === "scroll") count++
  for (const child of node.children || []) {
    count += countScrollContainers(child)
  }
  return count
}

function getScrollState(node: any): any[] {
  const states: any[] = []
  if (node.scrollState) {
    const props = node.props || {}
    states.push({
      id: props.id || "?",
      children: node.children?.length || 0,
      first: node.scrollState.firstVisibleChild,
      last: node.scrollState.lastVisibleChild,
      hidden: node.scrollState.hiddenAbove + node.scrollState.hiddenBelow,
    })
  }
  for (const child of node.children || []) {
    states.push(...getScrollState(child))
  }
  return states
}

async function main() {
  const vaultPath = process.argv[2] || "/tmp/tstN"
  console.log(`Loading vault: ${vaultPath}`)

  const board = await testBoard(vaultPath, { columns: 80, rows: 24 })
  console.log(`Repo: ${board._repo.stats.nodeCount} nodes`)

  const app = board._result as any
  const getRoot = () => app.getContainer?.() || null

  // Switch to COLUMNS view
  while (!board.screenshot().includes("COLUMNS VIEW")) {
    board.press("v")
  }
  console.log("\n=== COLUMNS VIEW ===")

  const root = getRoot()
  if (!root) {
    console.log("Could not get root node")
    process.exit(1)
  }

  // Count nodes by depth
  const depthCounts = countInkxNodesByDepth(root)
  console.log("\nNodes by depth:")
  for (const [depth, count] of [...depthCounts.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    console.log(`  Depth ${depth}: ${count} nodes`)
  }

  // Count scroll containers
  console.log(`\nScroll containers: ${countScrollContainers(root)}`)

  // Show scroll state
  const scrollStates = getScrollState(root)
  console.log("\nScroll container states:")
  for (const state of scrollStates) {
    console.log(
      `  ${state.id}: ${state.children} children, visible: ${state.first}-${state.last}, hidden: ${state.hidden}`,
    )
  }

  // Total node count
  let totalNodes = 0
  for (const count of depthCounts.values()) totalNodes += count
  console.log(`\nTotal inkx nodes: ${totalNodes}`)

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
