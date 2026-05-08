import { ACP_REGISTRY_IDS } from "@km/agent-harness"
import { BUILTIN_AGENTS } from "./config-schema.ts"

export const L5_PROVIDER_FEATURES = [
  "runtime",
  "turns",
  "streamingBlocks",
  "permissions",
  "plans",
  "tools",
  "configOptions",
  "contextMentions",
  "threadsSessions",
  "persistenceReplay",
  "backgroundJobs",
  "subagents",
  "trafficReplay",
] as const

export type L5ProviderFeature = (typeof L5_PROVIDER_FEATURES)[number]
export type ProviderFeatureStatus = "supported" | "partial" | "unsupported"

export type ProviderFeatureCell = {
  readonly status: ProviderFeatureStatus
  readonly evidence: readonly string[]
  readonly fallback?: string
}

export type ProviderConformanceRow = {
  readonly providerId: string
  readonly label: string
  readonly family: "fake" | "acp" | "spawn" | "sdk" | "planned"
  readonly features: Readonly<Record<L5ProviderFeature, ProviderFeatureCell>>
}

const FEATURE_LABELS = {
  runtime: "Runtime",
  turns: "Turns",
  streamingBlocks: "Streaming Blocks",
  permissions: "Permissions",
  plans: "Plans",
  tools: "Tools",
  configOptions: "Config Options",
  contextMentions: "Context Mentions",
  threadsSessions: "Threads/Sessions",
  persistenceReplay: "Persistence/Replay",
  backgroundJobs: "Background Jobs",
  subagents: "Subagents",
  trafficReplay: "Traffic Replay",
} satisfies Record<L5ProviderFeature, string>

function supported(...evidence: string[]): ProviderFeatureCell {
  return { status: "supported", evidence }
}

function partial(fallback: string, evidence: readonly string[] = []): ProviderFeatureCell {
  return { status: "partial", evidence, fallback }
}

function unsupported(fallback: string, evidence: readonly string[] = []): ProviderFeatureCell {
  return { status: "unsupported", evidence, fallback }
}

function features(
  cells: Partial<Record<L5ProviderFeature, ProviderFeatureCell>>,
  fallback: ProviderFeatureCell,
): Readonly<Record<L5ProviderFeature, ProviderFeatureCell>> {
  return Object.fromEntries(L5_PROVIDER_FEATURES.map((feature) => [feature, cells[feature] ?? fallback])) as Readonly<
    Record<L5ProviderFeature, ProviderFeatureCell>
  >
}

const fakeAcpFeatures = features(
  {
    runtime: supported("apps/silvercode/packages/agent-harness/tests/agent-backends.test.ts"),
    turns: supported("apps/silvercode/tests/turn-owner.test.ts"),
    streamingBlocks: supported(
      "apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts",
    ),
    permissions: supported("apps/silvercode/tests/acp-permission-queue.test.ts"),
    plans: supported("apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts"),
    tools: supported("apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts"),
    configOptions: supported("apps/silvercode/tests/backend-contracts/config-options.contract.test.ts"),
    contextMentions: partial(
      "Host prompt composition is covered separately; provider typed-context support is not universal.",
      ["apps/silvercode/tests/context-composition.test.ts"],
    ),
    threadsSessions: supported("apps/silvercode/packages/agent-harness/tests/fake-acp-server.test.ts"),
    persistenceReplay: partial(
      "Replay is host-side AgentEvent JSONL today; provider transcript reload remains provider-specific.",
      ["apps/silvercode/tests/traffic-log.test.ts"],
    ),
    backgroundJobs: partial("Host can model detached work; fake ACP has no native provider job ids yet.", [
      "apps/silvercode/tests/background-jobs.test.tsx",
    ]),
    subagents: partial(
      "Subagent runs are modeled in host notifications; fake ACP does not synthesize child session stores yet.",
      ["apps/silvercode/tests/subagent-activities.test.ts"],
    ),
    trafficReplay: supported("apps/silvercode/tests/traffic-log.test.ts", "apps/silvercode/tests/cli-smoke.test.ts"),
  },
  unsupported("No fake coverage declared."),
)

const acpCommonFeatures = features(
  {
    runtime: supported("apps/silvercode/tests/backend-contracts/prompt.contract.test.ts"),
    turns: supported("apps/silvercode/tests/turn-owner.test.ts"),
    streamingBlocks: supported(
      "apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts",
    ),
    permissions: partial("Backends without permission callbacks fall back to stable unsupported UI/log facts.", [
      "apps/silvercode/tests/acp-permission-queue.test.ts",
    ]),
    plans: partial("Plan updates are normalized when provider emits them; otherwise the Plan track remains empty.", [
      "apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts",
    ]),
    tools: supported("apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts"),
    configOptions: partial("Generic ACP config is supported when advertised; missing options hide local controls.", [
      "apps/silvercode/tests/backend-contracts/config-options.contract.test.ts",
    ]),
    contextMentions: partial(
      "Host can insert framed context text; typed provider context is per-backend capability work.",
    ),
    threadsSessions: supported("apps/silvercode/packages/agent-harness/tests/fake-acp-server.test.ts"),
    persistenceReplay: partial(
      "Session load is ACP-shaped; local transcript replay still has provider-specific adapters.",
    ),
    backgroundJobs: partial("Host Job model exists; native ACP provider job ids are not guaranteed."),
    subagents: partial("Host SubagentRun model exists; provider child-session discovery is backend-specific."),
    trafficReplay: supported("apps/silvercode/tests/traffic-log.test.ts"),
  },
  partial("Feature is backend-defined; Silvercode must surface unsupported capability facts."),
)

const spawnCommonFeatures = features(
  {
    runtime: partial("Legacy spawn paths expose AgentEvent streams but do not use ACP capability negotiation.", [
      "apps/silvercode/tests/multi-backend-fakes.test.ts",
    ]),
    turns: supported("apps/silvercode/tests/turn-owner.test.ts"),
    streamingBlocks: partial("Streaming is parser-specific and covered by normalization tests.", [
      "apps/silvercode/tests/chat-agent-event-normalization.test.ts",
    ]),
    permissions: partial("Legacy permission events route through host queues when emitted.", [
      "apps/silvercode/tests/permission-flow.test.tsx",
    ]),
    plans: partial("Plan extraction is parser-specific and normalized into Chat Plan events.", [
      "apps/silvercode/tests/chat-agent-event-normalization.test.ts",
    ]),
    tools: partial("Tool calls are normalized when the parser can identify provider tool blocks.", [
      "apps/silvercode/tests/chat-agent-event-normalization.test.ts",
    ]),
    configOptions: unsupported("Legacy spawn paths have no ACP session config list; hide ACP config controls."),
    contextMentions: partial("Host can insert framed context text; typed provider context is unavailable."),
    threadsSessions: partial("Session identity exists, but thread/session capability discovery is not negotiated."),
    persistenceReplay: partial("Replay uses provider-specific transcript readers.", [
      "apps/silvercode/tests/chat-session-store.test.ts",
    ]),
    backgroundJobs: partial(
      "Host Job model can detach turns, but provider-native background handles are unavailable.",
      ["apps/silvercode/tests/background-jobs.test.tsx"],
    ),
    subagents: partial("Claude subagent discovery uses local transcript files; other spawn paths report unsupported.", [
      "apps/silvercode/tests/claude-subagent-sessions.test.ts",
    ]),
    trafficReplay: supported("apps/silvercode/tests/traffic-log.test.ts"),
  },
  partial("Legacy spawn fallback behavior must be explicit."),
)

const plannedOpencodeFeatures = features(
  {
    runtime: partial("Planned via opencode/Kilo compatibility beads; no registered backend yet."),
    turns: partial("Will map opencode steps/messages into Turn events."),
    streamingBlocks: partial("Will map text, reasoning, patch, and tool parts through stream normalization."),
    permissions: partial("Will map opencode permission rows when available; otherwise stable unsupported UI."),
    plans: partial("Will map todo rows into canonical Plan when available."),
    tools: partial("Will map opencode tool parts into canonical ToolCall events."),
    configOptions: unsupported("No ACP config option surface is registered yet."),
    contextMentions: partial("Host prompt composition can work before typed opencode context exists."),
    threadsSessions: partial("Expected to map opencode sessions to Thread/SessionBinding."),
    persistenceReplay: partial("Expected to replay opencode SQLite rows through AgentEvent normalization."),
    backgroundJobs: partial("Expected to map task/tool parts when durable provider handles exist."),
    subagents: partial("Expected to map opencode task parts when child runs are discoverable."),
    trafficReplay: partial("Traffic replay will work once an AgentEvent ledger adapter exists."),
  },
  partial("Planned opencode/Kilo support must expose an explicit fallback."),
)

function row(
  providerId: string,
  label: string,
  family: ProviderConformanceRow["family"],
  featureCells: ProviderConformanceRow["features"],
): ProviderConformanceRow {
  return { providerId, label, family, features: featureCells }
}

export const PROVIDER_CONFORMANCE_MATRIX: readonly ProviderConformanceRow[] = [
  row("fake-acp", "Fake ACP baseline", "fake", fakeAcpFeatures),
  ...ACP_REGISTRY_IDS.map((id) => row(id, `${id} ACP`, "acp", acpCommonFeatures)),
  row("claude-code-spawn", BUILTIN_AGENTS["claude-code-spawn"]!.description, "spawn", spawnCommonFeatures),
  row("claude-code-sdk", BUILTIN_AGENTS["claude-code-sdk"]!.description, "sdk", spawnCommonFeatures),
  row("codex-spawn", BUILTIN_AGENTS["codex-spawn"]!.description, "spawn", spawnCommonFeatures),
  row("opencode-kilo", "opencode/Kilo planned compatibility", "planned", plannedOpencodeFeatures),
].sort((a, b) => a.providerId.localeCompare(b.providerId))

export function providerConformanceRow(providerId: string): ProviderConformanceRow {
  const found = PROVIDER_CONFORMANCE_MATRIX.find((candidate) => candidate.providerId === providerId)
  if (!found) throw new Error(`unknown provider conformance row: ${providerId}`)
  return found
}

export function renderProviderConformanceMarkdown(
  rows: readonly ProviderConformanceRow[] = PROVIDER_CONFORMANCE_MATRIX,
): string {
  const headers = ["Provider", ...L5_PROVIDER_FEATURES.map((feature) => FEATURE_LABELS[feature])]
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`]
  for (const provider of rows) {
    lines.push(
      `| ${[provider.providerId, ...L5_PROVIDER_FEATURES.map((feature) => provider.features[feature].status)].join(" | ")} |`,
    )
  }
  return `${lines.join("\n")}\n`
}
