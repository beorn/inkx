import { claudeSessionConfig } from "./configs/claude-session.ts"
import { genericJsonlConfig } from "./configs/generic-jsonl.ts"
import type { ViewConfig } from "./view-config.ts"

/** Ordered — first matching config wins. Put specific configs before fallbacks. */
export const builtInConfigs: ViewConfig[] = [claudeSessionConfig, genericJsonlConfig]

export function detectConfig(path: string, configs: ViewConfig[] = builtInConfigs): ViewConfig {
  for (const cfg of configs) {
    if (cfg.detect(path)) return cfg
  }
  // Last resort — always return generic-jsonl even if its detect returned false
  // (user pointed us at a file; best-effort render beats a crash).
  return genericJsonlConfig
}
