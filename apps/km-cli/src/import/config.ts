/**
 * Import Config — Load/save import credentials
 *
 * Stored at ~/.config/km/import.json (user-level, not repo-level).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { ImportConfig } from "./types.ts";

function configPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "km", "import.json");
}

export function loadConfig(): ImportConfig {
  const path = configPath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8")) as ImportConfig;
}

export function saveConfig(config: ImportConfig): void {
  const path = configPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
