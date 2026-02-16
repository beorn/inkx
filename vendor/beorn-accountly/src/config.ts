import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { AccountConfig, ConfigFile } from "./types.ts"

const CONFIG_DIR = join(homedir(), ".config", "accountly")
const CONFIG_FILE = join(CONFIG_DIR, "accounts.json")

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/** Read the config file, returning defaults if missing */
export function readConfig(): ConfigFile {
  if (!existsSync(CONFIG_FILE)) {
    return { accounts: [] }
  }
  const raw = readFileSync(CONFIG_FILE, "utf-8")
  return JSON.parse(raw) as ConfigFile
}

/** Write the config file */
export function writeConfig(config: ConfigFile): void {
  ensureConfigDir()
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8")
}

/** Get all accounts */
export function getAccounts(): AccountConfig[] {
  return readConfig().accounts
}

/** Get a single account by name */
export function getAccount(name: string): AccountConfig | undefined {
  return readConfig().accounts.find((a) => a.name === name)
}

/** Add or update an account */
export function upsertAccount(account: AccountConfig): void {
  const config = readConfig()
  const idx = config.accounts.findIndex((a) => a.name === account.name)
  if (idx >= 0) {
    config.accounts[idx] = account
  } else {
    config.accounts.push(account)
  }
  writeConfig(config)
}

/** Remove an account */
export function removeAccount(name: string): boolean {
  const config = readConfig()
  const idx = config.accounts.findIndex((a) => a.name === name)
  if (idx < 0) return false
  config.accounts.splice(idx, 1)
  if (config.activeAccount === name) {
    config.activeAccount = undefined
  }
  writeConfig(config)
  return true
}

/** Rename an account */
export function renameAccount(oldName: string, newName: string): boolean {
  const config = readConfig()
  const idx = config.accounts.findIndex((a) => a.name === oldName)
  if (idx < 0) return false
  config.accounts[idx]!.name = newName
  if (config.activeAccount === oldName) {
    config.activeAccount = newName
  }
  writeConfig(config)
  return true
}

/** Get the name of the currently active account */
export function getActiveAccount(): string | undefined {
  return readConfig().activeAccount
}

/** Set the active account name */
export function setActiveAccount(name: string): void {
  const config = readConfig()
  config.activeAccount = name
  writeConfig(config)
}

/** Get the config directory path (for testing) */
export function getConfigDir(): string {
  return CONFIG_DIR
}
