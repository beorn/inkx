/**
 * Lifecycle-spike trace logger.
 *
 * Writes a timestamped event log to /tmp/tea-lifecycle-spike.log for
 * every key event, mount/unmount, focus transition, and dialog state
 * transition. Readable end-to-end after a test run so humans can verify
 * the key normalization shape, ordering, and cleanup.
 *
 * Format:
 *   === <label> === <ISO>
 *   [key]      input="p" ctrl=true escape=false return=false ...
 *   [mount]    App mounted at pass 0
 *   [unmount]  App unmounted at pass 0
 *   [focus]    enter scope="dialog"
 *   [dialog]   open -> true (query="")
 *   [render]   pass=1 open=false query=""
 *
 * This is the human-facing evidence channel. The `lifecycle-counters.ts`
 * module is the machine-facing one — tests assert on counter values,
 * read the trace when assertions fail.
 */

import { appendFileSync, writeFileSync } from "node:fs"

const TRACE_PATH = "/tmp/tea-lifecycle-spike.log"

export function resetTrace(label: string): void {
  writeFileSync(TRACE_PATH, `=== ${label} === ${new Date().toISOString()}\n`)
}

export function logKey(detail: {
  input: string
  ctrl: boolean
  escape: boolean
  return: boolean
  leftArrow: boolean
  rightArrow: boolean
  backspace: boolean
  shift: boolean
  eventType: string | undefined
}): void {
  const parts = [
    `input=${JSON.stringify(detail.input)}`,
    `ctrl=${detail.ctrl}`,
    `escape=${detail.escape}`,
    `return=${detail.return}`,
    `leftArrow=${detail.leftArrow}`,
    `rightArrow=${detail.rightArrow}`,
    `backspace=${detail.backspace}`,
    `shift=${detail.shift}`,
    `eventType=${detail.eventType ?? "undefined"}`,
  ].join(" ")
  appendFileSync(TRACE_PATH, `[key]      ${parts}\n`)
}

export function logMount(pass: number): void {
  appendFileSync(TRACE_PATH, `[mount]    App mounted at pass ${pass}\n`)
}

export function logUnmount(pass: number): void {
  appendFileSync(TRACE_PATH, `[unmount]  App unmounted at pass ${pass}\n`)
}

export function logFocus(direction: "enter" | "exit", scope: string): void {
  appendFileSync(TRACE_PATH, `[focus]    ${direction} scope=${JSON.stringify(scope)}\n`)
}

export function logDialog(open: boolean, query: string): void {
  appendFileSync(TRACE_PATH, `[dialog]   open=${open} query=${JSON.stringify(query)}\n`)
}

export function logRender(pass: number, open: boolean, query: string): void {
  appendFileSync(TRACE_PATH, `[render]   pass=${pass} open=${open} query=${JSON.stringify(query)}\n`)
}

export function logHandler(direction: "register" | "dispose", scope: string): void {
  appendFileSync(TRACE_PATH, `[handler]  ${direction} scope=${JSON.stringify(scope)}\n`)
}

export function logError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  appendFileSync(TRACE_PATH, `[error]    ${context}: ${msg}\n`)
}

export function tracePath(): string {
  return TRACE_PATH
}
