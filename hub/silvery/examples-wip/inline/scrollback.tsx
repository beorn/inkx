/**
 * Scrollback Mode — REPL
 *
 * Interactive expression evaluator demonstrating ListView with cache.
 * Completed results are cached by ListView; the active prompt stays at bottom.
 *
 * Controls:
 *   Type expression + Enter  - Evaluate
 *   q (when input empty)     - Quit
 */

import React, { useState, useCallback } from "react"
import { Box, Text, Divider, ListView, useInput, type Key } from "../../src/index.js"
import { run, useExit } from "@silvery/ag-term/runtime"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Scrollback",
  description: "REPL with ListView cache for completed results",
  features: ["ListView", "cache", "inline mode"],
}

// =============================================================================
// Data
// =============================================================================

interface Result {
  id: number
  expr: string
  value: string
  done: boolean
}

let nextId = 0

function evaluate(expr: string): string {
  try {
    // eslint-disable-next-line no-eval
    return String(eval(expr))
  } catch (e: unknown) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}

// =============================================================================
// Component
// =============================================================================

export function Repl() {
  const exit = useExit()
  const [results, setResults] = useState<Result[]>([])
  const [input, setInput] = useState("")
  const [cursor, setCursor] = useState(0)

  const submit = useCallback(() => {
    const expr = input.trim()
    if (!expr) return

    const value = evaluate(expr)
    const id = nextId++

    // Mark all existing results as done, add new one as active
    setResults((prev) => [...prev.map((r) => ({ ...r, done: true })), { id, expr, value, done: false }])
    setInput("")
    setCursor(0)
  }, [input])

  useInput((ch: string, key: Key) => {
    if (key.return) {
      submit()
      return
    }
    if (key.escape || (ch === "q" && input === "")) {
      exit()
      return
    }
    if (key.backspace) {
      if (cursor > 0) {
        setInput((v) => v.slice(0, cursor - 1) + v.slice(cursor))
        setCursor((c) => c - 1)
      }
      return
    }
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1))
      return
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(input.length, c + 1))
      return
    }
    // Ctrl+A: beginning of line
    if (key.ctrl && ch === "a") {
      setCursor(0)
      return
    }
    // Ctrl+E: end of line
    if (key.ctrl && ch === "e") {
      setCursor(input.length)
      return
    }
    // Ctrl+U: clear line
    if (key.ctrl && ch === "u") {
      setInput("")
      setCursor(0)
      return
    }
    if (ch >= " ") {
      setInput((v) => v.slice(0, cursor) + ch + v.slice(cursor))
      setCursor((c) => c + 1)
    }
  })

  const beforeCursor = input.slice(0, cursor)
  const atCursor = input[cursor] ?? " "
  const afterCursor = input.slice(cursor + 1)

  return (
    <Box flexDirection="column">
      {/* Results via ListView with cache */}
      {results.length > 0 && (
        <ListView
          items={results}
          getKey={(r) => r.id}
          height={Math.min(results.length * 2, 20)}
          estimateHeight={2}
          scrollTo={results.length - 1}
          cache={{
            mode: "virtual",
            isCacheable: (r) => r.done,
          }}
          renderItem={(r) => (
            <Box key={r.id} flexDirection="column">
              <Text>
                <Text color="gray">{"$ "}</Text>
                <Text>{r.expr}</Text>
              </Text>
              <Text>
                <Text color="cyan">{"→ "}</Text>
                <Text>{r.value}</Text>
              </Text>
            </Box>
          )}
        />
      )}

      {/* Separator */}
      <Divider />

      {/* Input prompt */}
      <Text>
        <Text color="yellow">{"› "}</Text>
        <Text>{beforeCursor}</Text>
        <Text inverse>{atCursor}</Text>
        <Text>{afterCursor}</Text>
      </Text>

      {/* Status */}
      <Text dim>
        {results.length} result{results.length !== 1 ? "s" : ""} | Esc/q to quit
      </Text>
    </Box>
  )
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  await run(
    <ExampleBanner meta={meta} controls="Type expr + Enter  Esc/q quit">
      <Repl />
    </ExampleBanner>,
    { mode: "inline" },
  )
}

if (import.meta.main) {
  main().catch(console.error)
}
