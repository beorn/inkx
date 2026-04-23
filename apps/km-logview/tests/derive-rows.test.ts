import { describe, expect, test } from "vitest"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { genericJsonlConfig } from "../src/configs/generic-jsonl.ts"
import { detectConfig } from "../src/detect.ts"

const cfg = claudeSessionConfig

function derive(obj: unknown, lineNo = 1) {
  return cfg.deriveRows(obj, lineNo)
}

describe("claude-session deriveRows", () => {
  test("user string content → one 'user' row", () => {
    const rows = derive({
      type: "user",
      timestamp: "2026-04-23T05:11:28.000Z",
      message: { content: "hello world" },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe("user")
    expect(rows[0]!.fields.body).toBe("hello world")
    expect(rows[0]!.fields.time).toBe("05:11:28")
  })

  test("user text with system-reminder → 'inject' row", () => {
    const rows = derive({
      type: "user",
      timestamp: "2026-04-23T05:12:00.000Z",
      message: {
        content: [{ type: "text", text: "<system-reminder>blocked content</system-reminder>" }],
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe("inject")
  })

  test("assistant content array → one row per item (text, thinking, tool_use)", () => {
    const rows = derive({
      type: "assistant",
      timestamp: "2026-04-23T05:12:05.000Z",
      message: {
        content: [
          { type: "thinking", thinking: "let me think" },
          { type: "text", text: "answer" },
          {
            type: "tool_use",
            name: "Bash",
            input: { command: "ls /tmp" },
          },
        ],
      },
    })
    expect(rows).toHaveLength(3)
    expect(rows[0]!.kind).toBe("thinking")
    expect(rows[1]!.kind).toBe("assistant")
    expect(rows[2]!.kind).toBe("tool_use")
    expect(rows[2]!.fields.label).toBe("Bash")
    expect(rows[2]!.fields.body).toBe("ls /tmp")
  })

  test("tool_use Read formats path + offset + limit", () => {
    const rows = derive({
      type: "assistant",
      timestamp: "2026-04-23T05:12:06.000Z",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Read",
            input: { file_path: "/a/b.ts", offset: 100, limit: 50 },
          },
        ],
      },
    })
    expect(rows[0]!.fields.body).toBe("read /a/b.ts @100 limit=50")
  })

  test("attachment hook_success labels include command basename", () => {
    const rows = derive({
      type: "attachment",
      timestamp: "2026-04-23T05:13:25.000Z",
      attachment: {
        type: "hook_success",
        hookName: "PreToolUse:Bash",
        command: "/Users/beorn/.local/bin/dcg",
        stdout: "some output",
        exitCode: 0,
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe("hook")
    expect(rows[0]!.fields.label).toBe("PreToolUse:Bash (dcg)")
    expect(rows[0]!.fields.body).toBe("some output")
  })

  test("attachment with empty body and no command → skipped", () => {
    const rows = derive({
      type: "attachment",
      timestamp: "2026-04-23T05:13:25.000Z",
      attachment: {
        type: "hook_success",
        hookName: "UserPromptSubmit",
        content: "",
        stdout: "",
      },
    })
    expect(rows).toHaveLength(0)
  })

  test("queue-operation → skipped (not in rendered types)", () => {
    const rows = derive({
      type: "queue-operation",
      operation: "enqueue",
      content: "user said something",
    })
    expect(rows).toHaveLength(0)
  })

  test("permission-mode, last-prompt, file-history-snapshot → skipped", () => {
    for (const t of ["permission-mode", "last-prompt", "file-history-snapshot"]) {
      expect(derive({ type: t })).toHaveLength(0)
    }
  })

  test("tool_result emits with tool_use_id as label", () => {
    const rows = derive({
      type: "user",
      timestamp: "2026-04-23T05:13:30.000Z",
      message: {
        content: [{ type: "tool_result", tool_use_id: "toolu_xyz", content: "output text" }],
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe("tool_result")
    expect(rows[0]!.fields.label).toBe("toolu_xyz")
  })

  test("tool_result with image block → summarized, NOT raw base64", () => {
    // A realistic screenshot payload — ~130KB of base64 was being dumped into the body.
    const big = "A".repeat(130_000)
    const rows = derive({
      type: "user",
      timestamp: "2026-04-23T05:13:35.000Z",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_img",
            content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: big } }],
          },
        ],
      },
    })
    expect(rows).toHaveLength(1)
    const body = String(rows[0]!.fields.body)
    expect(body).not.toContain(big.slice(0, 100)) // no raw base64
    expect(body).toMatch(/^\[image\/png, \d+(\.\d+)?kB\]$/)
    expect(body.length).toBeLessThan(40) // compact summary
  })

  test("tool_result with mixed text + image blocks joins summaries", () => {
    const rows = derive({
      type: "user",
      timestamp: "2026-04-23T05:13:36.000Z",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_mix",
            content: [
              { type: "text", text: "here's the screenshot:" },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "B".repeat(4096) } },
            ],
          },
        ],
      },
    })
    const body = String(rows[0]!.fields.body)
    expect(body).toBe("here's the screenshot:\n[image/jpeg, 3.0kB]")
  })
})

describe("detectConfig", () => {
  test("Claude session path → claude-session", () => {
    expect(detectConfig("/Users/me/.claude/projects/-a-b/abc.jsonl").name).toBe("claude-session")
  })
  test(".jsonl elsewhere → generic-jsonl", () => {
    expect(detectConfig("/tmp/app.jsonl").name).toBe("generic-jsonl")
  })
  test(".log file → generic-jsonl", () => {
    expect(detectConfig("/var/log/foo.log").name).toBe("generic-jsonl")
  })
  test("unknown extension → generic-jsonl fallback (last resort)", () => {
    expect(detectConfig("/tmp/weirdfile").name).toBe("generic-jsonl")
  })
})

describe("generic-jsonl deriveRows", () => {
  test("extracts timestamp/level/msg and stringifies rest", () => {
    const [row] = genericJsonlConfig.deriveRows(
      {
        timestamp: "2026-04-23T05:12:00.000Z",
        level: "error",
        msg: "kaboom",
        extra: { code: 42 },
      },
      1,
    )
    expect(row!.fields.time).toBe("05:12:00")
    expect(row!.fields.level).toBe("error")
    expect(row!.fields.msg).toBe("kaboom")
    expect(row!.fields.rest).toBe('{"extra":{"code":42}}')
  })

  test("non-object JSON still renders", () => {
    const [row] = genericJsonlConfig.deriveRows(42, 1)
    expect(row!.fields.msg).toBe("42")
  })
})
