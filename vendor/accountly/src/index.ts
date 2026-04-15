export type {
  AccountProvider,
  AccountConfig,
  ConfigFile,
  Credential,
  QuotaWindow,
  QuotaInfo,
  QuotaProvider,
} from "./types.ts"

export {
  readConfig,
  writeConfig,
  getAccounts,
  getAccount,
  upsertAccount,
  removeAccount,
  renameAccount,
  getActiveAccount,
  setActiveAccount,
} from "./config.ts"

export { readCredential, writeCredential, deleteCredential, renameCredential, credentialExists } from "./credentials.ts"

export { readKeychainCredential, writeKeychainCredential, keychainCredentialExists } from "./keychain.ts"

export { getProvider, getAllProviders } from "./providers/index.ts"

export {
  fetchClaudeProfile,
  refreshOAuthToken,
  ensureFreshOAuth,
  type ClaudeProfile,
} from "./providers/claude-oauth.ts"

export { checkAccountQuota, checkAllQuotas, findBestAccount } from "./quota.ts"

export { discoverAccounts, getCredentialForAccount, type DiscoveredAccount } from "./discover.ts"

export { switchAccount } from "./switcher.ts"

export {
  profileRoot,
  profileDir,
  keychainSlot,
  isLoggedIn,
  listProfiles,
  bootstrapProfile,
  profileEmoji,
  profileColor,
  runProfile,
  cmuxSpawn,
  initShell,
  readKeychainForProfile,
  writeKeychainForProfile,
  checkProfileQuota,
  checkAllProfileQuotas,
  findBestProfile,
  fetchProfileEmail,
  renameProfile,
  resolveProfileName,
  type ProfileInfo,
  type ProfileQuotaResult,
  type MigrationStep,
} from "./profile.ts"
