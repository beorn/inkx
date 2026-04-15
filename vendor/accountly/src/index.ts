export type {
  AccountProvider,
  AccountConfig,
  Credential,
  QuotaWindow,
  QuotaInfo,
  QuotaProvider,
} from "./types.ts"

export { getProvider, getAllProviders } from "./providers/index.ts"

export {
  fetchClaudeProfile,
  refreshOAuthToken,
  ensureFreshOAuth,
  type ClaudeProfile,
} from "./providers/claude-oauth.ts"

export { discoverAccounts, type DiscoveredAccount } from "./discover.ts"

// Profile-based multi-account management — the primary accountly API.
// See src/profile.ts for the full architecture.
export {
  // profile discovery + layout
  profileRoot,
  profileDir,
  assertSafeProfileName,
  resolveProfileName,
  listProfiles,
  bootstrapProfile,
  // Keychain slot derivation + per-profile credential access
  keychainSlot,
  isLoggedIn,
  readKeychainForProfile,
  writeKeychainForProfile,
  // stock ~/.claude support (the unhashed slot used by plain `claude`)
  LEGACY_KEYCHAIN_SLOT,
  readLegacyKeychain,
  writeLegacyKeychain,
  getLegacyDefaultProfile,
  checkLegacyDefaultQuota,
  adoptStockProfile,
  type AdoptResult,
  // default profile (symlink in profileRoot)
  defaultLinkPath,
  getDefaultProfile,
  setDefaultProfile,
  clearDefaultProfile,
  // launchers
  runProfile,
  cmuxSpawn,
  // shell hook generation
  initShell,
  // cosmetic (used by --cmux workspace tag)
  profileEmoji,
  profileColor,
  // rename / migration helpers
  renameProfile,
  // quota checks
  checkProfileQuota,
  checkAllProfileQuotas,
  findBestProfile,
  // doctor
  diagnoseProfile,
  diagnoseAllProfiles,
  // account metadata
  fetchProfileEmail,
  type ProfileInfo,
  type ProfileQuotaResult,
  type MigrationStep,
  type HealthCheck,
} from "./profile.ts"
