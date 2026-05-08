#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

export type L5SuiteCategory =
  | "fakes"
  | "provider-contracts"
  | "replay"
  | "projection"
  | "queue-cancel"
  | "permissions"
  | "background-subagents"
  | "chunk-normalization"

export type L5SuiteGroup = {
  readonly category: L5SuiteCategory
  readonly files: readonly string[]
}

export const L5_SUITE: readonly L5SuiteGroup[] = [
  {
    category: "fakes",
    files: [
      "apps/silvercode/packages/agent-harness/tests/agent-backends.test.ts",
      "apps/silvercode/packages/agent-harness/tests/backend-spec-runner.test.ts",
      "apps/silvercode/packages/agent-harness/tests/chat-provider.test.ts",
      "apps/silvercode/packages/agent-harness/tests/fake-acp-server.test.ts",
      "apps/silvercode/packages/agent-harness/tests/fake.test.ts",
      "apps/silvercode/tests/multi-backend-fakes.test.ts",
    ],
  },
  {
    category: "provider-contracts",
    files: [
      "apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts",
      "apps/silvercode/tests/backend-contracts/config-options.contract.test.ts",
      "apps/silvercode/tests/backend-contracts/prompt.contract.test.ts",
      "apps/silvercode/tests/provider-conformance-matrix.test.ts",
    ],
  },
  {
    category: "replay",
    files: [
      "apps/silvercode/tests/traffic-log.test.ts",
      "apps/silvercode/tests/traffic-replay-viewer.test.tsx",
      "apps/silvercode/tests/cli-smoke.test.ts",
    ],
  },
  {
    category: "projection",
    files: [
      "apps/silvercode/tests/chat-event-handling.test.ts",
      "apps/silvercode/tests/chat-session-store.test.ts",
      "apps/silvercode/tests/chat-transcript-projection.test.ts",
      "apps/silvercode/tests/chat-agent-event-normalization.test.ts",
      "apps/silvercode/tests/chat-block-list.test.tsx",
    ],
  },
  {
    category: "queue-cancel",
    files: [
      "apps/silvercode/tests/turn-owner.test.ts",
      "apps/silvercode/tests/queue-batching.test.tsx",
      "apps/silvercode/tests/queue-focus-flush-guard.test.tsx",
      "apps/silvercode/tests/session-end-error-paths.test.tsx",
      "apps/silvercode/tests/esc-parity.test.tsx",
      "apps/silvercode/tests/resume-input-acceptance.test.tsx",
    ],
  },
  {
    category: "permissions",
    files: [
      "apps/silvercode/tests/acp-permission-queue.test.ts",
      "apps/silvercode/tests/inline-permission-prompt.test.tsx",
      "apps/silvercode/tests/permission-flow.test.tsx",
    ],
  },
  {
    category: "background-subagents",
    files: [
      "apps/silvercode/tests/background-amp-suffix.test.tsx",
      "apps/silvercode/tests/background-jobs.test.tsx",
      "apps/silvercode/tests/claude-subagent-sessions.test.ts",
      "apps/silvercode/tests/notification-adapters/subagent-smoke.test.ts",
      "apps/silvercode/tests/notification-adapters/subagent.test.ts",
      "apps/silvercode/tests/subagent-activities.test.ts",
    ],
  },
  {
    category: "chunk-normalization",
    files: [
      "apps/silvercode/tests/chat-agent-event-normalization.test.ts",
      "apps/silvercode/tests/chat-message-summary.test.tsx",
    ],
  },
]

export const L5_SUITE_FILES = [...new Set(L5_SUITE.flatMap((group) => group.files))]

export function l5SuiteCommandArgs(extraArgs: readonly string[] = []): string[] {
  return ["vitest", "run", ...L5_SUITE_FILES, ...extraArgs]
}

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
}

function printList(): void {
  for (const group of L5_SUITE) {
    process.stdout.write(`${group.category}\n`)
    for (const file of group.files) process.stdout.write(`  ${file}\n`)
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.includes("--list")) {
    printList()
    process.exit(0)
  }

  const result = spawnSync("bun", l5SuiteCommandArgs(args), {
    cwd: repoRoot(),
    stdio: "inherit",
    env: process.env,
  })

  if (result.error) {
    process.stderr.write(`test:silvercode:l5 failed to start: ${result.error.message}\n`)
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}
