import { createOsc52Backend } from "silvery"
import type { MessageEntry, MessageOp, SessionState } from "@km/agent-harness"
import type { SessionHandle } from "./controller.ts"

type Writable = Pick<NodeJS.WriteStream, "write">

type ClipboardWriter = (stdout: Writable, text: string) => void

let writerOverride: ClipboardWriter | null = null

export function setSessionClipboardWriterOverride(writer: ClipboardWriter | null): void {
  writerOverride = writer
}

function writeClipboard(stdout: Writable, text: string): void {
  if (writerOverride) {
    writerOverride(stdout, text)
    return
  }
  void createOsc52Backend(stdout).write({ text })
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatOp(op: MessageOp): string {
  switch (op.kind) {
    case "text":
      return op.text
    case "thinking":
      return `<thinking>\n${op.text}\n</thinking>`
    case "raw":
      return `<raw ${op.label}>\n${formatUnknown(op.raw)}\n</raw>`
    case "tool": {
      const chunks = [`<tool ${op.toolCall.name} id=${op.toolCall.id}>\n${formatUnknown(op.toolCall.input)}\n</tool>`]
      if (op.result) {
        chunks.push(
          `<tool_result id=${op.result.id}${op.result.is_error ? " error=true" : ""}>\n${formatUnknown(op.result.output)}\n</tool_result>`,
        )
      }
      return chunks.join("\n")
    }
  }
}

function formatMessage(message: MessageEntry): string {
  const body = message.ops
    .map(formatOp)
    .filter((part) => part.length > 0)
    .join("\n")
  const context = message.additionalContext
    ? `\n<additional_context>\n${message.additionalContext}\n</additional_context>`
    : ""
  return `## ${message.role}\n${body}${context}`.trimEnd()
}

export function serializeSessionTranscript(
  handle: SessionHandle,
  state: SessionState = handle.store.state.get(),
): string {
  const lines = [
    `# Session ${handle.session.sessionId}`,
    state.model ? `Model: ${state.model}` : null,
    state.cwd ? `CWD: ${state.cwd}` : null,
    `Status: ${state.status}`,
    "",
    ...state.messages.map(formatMessage),
  ].filter((line): line is string => line !== null)
  return lines.join("\n\n").trimEnd() + "\n"
}

export function copySessionTranscriptToClipboard(handle: SessionHandle, stdout: Writable): void {
  writeClipboard(stdout, serializeSessionTranscript(handle))
}
