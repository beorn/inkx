#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
// Utility script for inspecting metadata structure, loose typing acceptable
/**
 * Quick script to inspect the vitest metadata structure
 */

import { gunzipSync } from "bun"
import { readFileSync } from "fs"

const compressed = readFileSync("test-results/html.meta.json.gz")
const decompressed = gunzipSync(compressed)
const text = new TextDecoder().decode(decompressed)
const metadata = JSON.parse(text) as any[]

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
  const root: Record<string, unknown> = metadata[0] as Record<string, unknown>
  const filesIdx = parseInt(root.files as string)
  const filesArray = metadata[filesIdx] as any[]

  console.log(`\nFiles array at index ${filesIdx}:`, filesArray.slice(0, 5))

  // Get first file
  if (filesArray && Array.isArray(filesArray) && filesArray.length > 0) {
    const firstFileIdx = parseInt(filesArray[0] as string)
    const firstFile: Record<string, unknown> = metadata[firstFileIdx] as Record<
      string,
      unknown
    >
    console.log(`\nFirst file object at index ${firstFileIdx}:`)
    console.log(JSON.stringify(firstFile, null, 2))

    // Try to dereference the name
    if (firstFile?.name) {
      const nameIdx = parseInt(firstFile.name as string)
      const name = metadata[nameIdx]
      console.log(`\nFile name (dereferenced from ${nameIdx}):`, name)
    }

    // Check the result for duration
    if (firstFile?.result) {
      const resultIdx = parseInt(firstFile.result as string)
      const result = metadata[resultIdx]
      console.log(`\nResult object (dereferenced from ${resultIdx}):`)
      console.log(JSON.stringify(result, null, 2))
    }

    // Check tasks
    if (firstFile?.tasks) {
      const tasksIdx = parseInt(firstFile.tasks as string)
      const tasks = metadata[tasksIdx]
      console.log(`\nTasks array (dereferenced from ${tasksIdx}):`)
      if (Array.isArray(tasks)) {
        console.log(`  ${tasks.length} tasks`)
        if (tasks.length > 0) {
          const firstTaskIdx = parseInt(tasks[0] as string)
          const firstTask = metadata[firstTaskIdx]
          console.log(`\nFirst task (dereferenced from ${firstTaskIdx}):`)
          console.log(JSON.stringify(firstTask, null, 2))
        }
      }
    }
  }
}
