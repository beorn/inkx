#!/usr/bin/env bun
/**
 * Quick script to inspect the vitest metadata structure
 */

import { gunzipSync } from "bun"
import { readFileSync } from "fs"

const compressed = readFileSync("test-results/html.meta.json.gz")
const decompressed = gunzipSync(compressed)
const text = new TextDecoder().decode(decompressed)
const metadata = JSON.parse(text)

console.log(
  "Top-level type:",
  Array.isArray(metadata) ? "Array" : typeof metadata,
)
console.log(
  "Length/keys:",
  Array.isArray(metadata) ? metadata.length : Object.keys(metadata).length,
)

if (Array.isArray(metadata) && metadata.length > 0) {
  console.log("\nFirst element:", metadata[0])

  if (metadata[1]) {
    console.log("\nSecond element (file indices?):", metadata[1])
  }

  // Dereference using the index structure
  const root = metadata[0]
  const filesIdx = parseInt(root.files)
  const filesArray = metadata[filesIdx]

  console.log(`\nFiles array at index ${filesIdx}:`, filesArray.slice(0, 5))

  // Get first file
  if (filesArray && Array.isArray(filesArray) && filesArray.length > 0) {
    const firstFileIdx = parseInt(filesArray[0])
    const firstFile = metadata[firstFileIdx]
    console.log(`\nFirst file object at index ${firstFileIdx}:`)
    console.log(JSON.stringify(firstFile, null, 2))

    // Try to dereference the name
    if (firstFile && firstFile.name) {
      const nameIdx = parseInt(firstFile.name)
      const name = metadata[nameIdx]
      console.log(`\nFile name (dereferenced from ${nameIdx}):`, name)
    }

    // Check the result for duration
    if (firstFile && firstFile.result) {
      const resultIdx = parseInt(firstFile.result)
      const result = metadata[resultIdx]
      console.log(`\nResult object (dereferenced from ${resultIdx}):`)
      console.log(JSON.stringify(result, null, 2))
    }

    // Check tasks
    if (firstFile && firstFile.tasks) {
      const tasksIdx = parseInt(firstFile.tasks)
      const tasks = metadata[tasksIdx]
      console.log(`\nTasks array (dereferenced from ${tasksIdx}):`)
      if (Array.isArray(tasks)) {
        console.log(`  ${tasks.length} tasks`)
        if (tasks.length > 0) {
          const firstTaskIdx = parseInt(tasks[0])
          const firstTask = metadata[firstTaskIdx]
          console.log(`\nFirst task (dereferenced from ${firstTaskIdx}):`)
          console.log(JSON.stringify(firstTask, null, 2))
        }
      }
    }
  }
}
