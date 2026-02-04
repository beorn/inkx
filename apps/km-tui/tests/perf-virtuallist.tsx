/**
 * Performance comparison: VirtualList vs raw overflow="scroll"
 *
 * Measures:
 * 1. Initial render time with many items
 * 2. Navigation time (j/k keypresses)
 */
import React from "react"
import { createRenderer } from "inkx/testing"
import { Box, Text, VirtualList } from "inkx"

// Test parameters
const ITEM_COUNT = 1000
const ITERATIONS = 20

const items = Array.from({ length: ITEM_COUNT }, (_, i) => ({
  id: `item-${i}`,
  name: `Item ${i} - Some content here`,
}))

// Component using VirtualList
function WithVirtualList({ selectedIndex }: { selectedIndex: number }) {
  return (
    <VirtualList
      items={items}
      height={20}
      itemHeight={1}
      scrollTo={selectedIndex}
      renderItem={(item, index) => (
        <Text key={item.id} inverse={index === selectedIndex}>
          {item.name}
        </Text>
      )}
    />
  )
}

// Component using raw Box overflow="scroll" (no virtualization)
function WithoutVirtualization({ selectedIndex }: { selectedIndex: number }) {
  return (
    <Box
      height={20}
      overflow="scroll"
      scrollTo={selectedIndex}
      flexDirection="column"
    >
      {items.map((item, index) => (
        <Text key={item.id} inverse={index === selectedIndex}>
          {item.name}
        </Text>
      ))}
    </Box>
  )
}

async function benchmark(
  name: string,
  Component: React.ComponentType<{ selectedIndex: number }>,
) {
  const render = createRenderer({ cols: 80, rows: 24 })

  // Measure initial render
  const initStart = performance.now()
  let app = render(React.createElement(Component, { selectedIndex: 0 }))
  const initTime = performance.now() - initStart

  // Measure navigation (simulated by re-rendering with new index)
  const navTimes: number[] = []
  for (let i = 1; i <= ITERATIONS; i++) {
    const start = performance.now()
    app.rerender(React.createElement(Component, { selectedIndex: i }))
    navTimes.push(performance.now() - start)
  }

  const avgNavTime = navTimes.reduce((a, b) => a + b, 0) / navTimes.length
  const maxNavTime = Math.max(...navTimes)

  console.log(`\n${name} (${ITEM_COUNT} items):`)
  console.log(`  Initial render: ${initTime.toFixed(1)}ms`)
  console.log(`  Avg navigation: ${avgNavTime.toFixed(1)}ms`)
  console.log(`  Max navigation: ${maxNavTime.toFixed(1)}ms`)

  return { initTime, avgNavTime, maxNavTime }
}

async function main() {
  console.log("=== VirtualList Performance Benchmark ===")
  console.log(`Items: ${ITEM_COUNT}, Navigation iterations: ${ITERATIONS}`)

  const withVirt = await benchmark("VirtualList", WithVirtualList)
  const withoutVirt = await benchmark(
    "Box overflow=scroll",
    WithoutVirtualization,
  )

  console.log("\n=== Summary ===")
  console.log(
    `Initial render: ${(withoutVirt.initTime / withVirt.initTime).toFixed(1)}x slower without VirtualList`,
  )
  console.log(
    `Navigation: ${(withoutVirt.avgNavTime / withVirt.avgNavTime).toFixed(1)}x slower without VirtualList`,
  )
}

main().catch(console.error)
